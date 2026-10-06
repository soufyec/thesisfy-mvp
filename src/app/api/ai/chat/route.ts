import { NextRequest, NextResponse } from "next/server";
import { AIMode, db, Provider } from "@/lib/db";
import { maybeAlertBudget } from "@/lib/ai/funding";
import { passageFingerprints } from "@/lib/crypto";
import { canAccessThesis } from "@/lib/auth";
import { error, requireUser } from "@/lib/api";
import { buildSystemPrompt, MODES } from "@/lib/ai/prompts";
import { checkPolicy, detectLang } from "@/lib/ai/policy";
import { demoResponse } from "@/lib/ai/demo";
import { ChatMessage, costOf, resolveProvider, streamCompletion } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  messages: ChatMessage[];
  mode?: AIMode;
  thesisId?: string;
  sessionId?: string;
  provider?: Provider | string | null; // provider id, or an institution model id ("im_…")
  conversationId?: string;
  selection?: string;
  stream?: boolean;
}

export async function POST(request: NextRequest) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const user = r.user;
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || !Array.isArray(body.messages) || !body.messages.length) return error("messages are required");

  const mode: AIMode = MODES.some((m) => m.id === body.mode) ? (body.mode as AIMode) : "chat";
  const policy = db.policies.get(user.university);
  const consent = db.consents.latest(user.id);
  if (user.role === "student" && policy.requireConsent && !consent?.scopes.aiInteractions) {
    return NextResponse.json({ error: "Please review and accept the monitoring consent before using the assistant.", code: "consent_required" }, { status: 428 });
  }
  const thesis = body.thesisId ? canAccessThesis(user, body.thesisId) : null;
  if (body.thesisId && !thesis) return error("Thesis not found", 404);

  const messages: ChatMessage[] = body.messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-30)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 20000) }));
  if (body.selection && messages.length) {
    const last = messages[messages.length - 1];
    last.content = `Selected passage from my thesis:\n"""\n${body.selection.slice(0, 12000)}\n"""\n\n${last.content}`;
  }
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  const lang = user.preferences.language !== "en" ? user.preferences.language : detectLang(lastUser);

  // Conversation persistence
  let conversation = body.conversationId ? db.conversations.findById(body.conversationId) : undefined;
  if (conversation && conversation.userId !== user.id) conversation = undefined;
  if (!conversation) conversation = db.conversations.create(user.id, thesis?.id, lastUser.slice(0, 60) || "New conversation");
  db.conversations.append(conversation.id, { role: "user", content: lastUser, mode });

  const cfg = resolveProvider(user, policy, typeof body.provider === "string" ? body.provider : null);
  const meta = { provider: cfg.provider, model: cfg.model, source: cfg.source, label: cfg.label, billedTo: cfg.billedTo, institutionModelId: cfg.institutionModel?.id, notice: cfg.notice, mode, conversationId: conversation.id, demo: cfg.provider === "demo", lang };

  const finish = (text: string, usage: { inputTokens: number; outputTokens: number }, blocked: boolean) => {
    const interaction = db.interactions.create({
      userId: user.id,
      thesisId: thesis?.id,
      sessionId: body.sessionId,
      provider: cfg.provider,
      model: cfg.model,
      mode,
      source: "thesisfic",
      connectionId: cfg.connectionId,
      promptPreview: lastUser.slice(0, 200),
      responsePreview: text.slice(0, 200),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      insertedWords: 0,
      blockedByPolicy: blocked,
      billedTo: cfg.billedTo,
      costUsd: costOf(cfg, usage),
      institutionModelId: cfg.institutionModel?.id,
      responseFingerprints: blocked ? [] : passageFingerprints(text),
    });
    db.conversations.append(conversation!.id, { role: "assistant", content: text, mode, provider: cfg.provider, model: cfg.model });
    if (body.sessionId) db.sessions.addEvent(body.sessionId, "ai_prompt", { mode, provider: cfg.provider, model: cfg.model, blocked, promptPreview: lastUser.slice(0, 120), interactionId: interaction.id });
    if (cfg.connectionId) db.connections.update(cfg.connectionId, { lastUsedAt: new Date().toISOString() });
    if (cfg.billedTo === "institution") maybeAlertBudget(user.university);
    return interaction.id;
  };

  // Policy guardrails run before any provider call.
  const check = checkPolicy(policy, mode, lastUser, lang);
  if (!check.allowed) {
    const text = check.message!;
    const interactionId = finish(text, { inputTokens: 0, outputTokens: 0 }, true);
    if (body.stream === false) return NextResponse.json({ message: text, blocked: true, reason: check.reason, meta, interactionId });
    return sse(async (send) => {
      send("meta", { ...meta, blocked: true, reason: check.reason });
      for (const chunk of chunkText(text)) {
        send("delta", { text: chunk });
        await new Promise((res) => setTimeout(res, 12));
      }
      send("done", { interactionId, usage: { inputTokens: 0, outputTokens: 0 }, blocked: true });
    });
  }

  const system = buildSystemPrompt({ mode, policy, thesis, studentName: user.name, provider: cfg.label });

  if (cfg.provider === "demo") {
    const text = cfg.notice && cfg.source === "demo" && cfg.label === "Allowance used up" ? cfg.notice : demoResponse(mode, messages, lang);
    const interactionId = finish(text, { inputTokens: 0, outputTokens: 0 }, false);
    if (body.stream === false) return NextResponse.json({ message: text, meta, interactionId, usage: { inputTokens: 0, outputTokens: 0 } });
    return sse(async (send) => {
      send("meta", meta);
      for (const chunk of chunkText(text)) {
        send("delta", { text: chunk });
        await new Promise((res) => setTimeout(res, 15));
      }
      send("done", { interactionId, usage: { inputTokens: 0, outputTokens: 0 } });
    });
  }

  if (body.stream === false) {
    let text = "";
    let usage = { inputTokens: 0, outputTokens: 0 };
    let err: string | undefined;
    for await (const chunk of streamCompletion(cfg, system, messages)) {
      if (chunk.type === "delta") text += chunk.text;
      else if (chunk.type === "usage") usage = { inputTokens: chunk.inputTokens, outputTokens: chunk.outputTokens };
      else if (chunk.type === "error") err = chunk.message;
    }
    if (err && !text) return NextResponse.json({ error: err, meta }, { status: 502 });
    const interactionId = finish(text, usage, false);
    return NextResponse.json({ message: text, meta, interactionId, usage });
  }

  return sse(async (send) => {
    send("meta", meta);
    let text = "";
    let usage = { inputTokens: 0, outputTokens: 0 };
    for await (const chunk of streamCompletion(cfg, system, messages)) {
      if (chunk.type === "delta") {
        text += chunk.text;
        send("delta", { text: chunk.text });
      } else if (chunk.type === "usage") usage = { inputTokens: chunk.inputTokens, outputTokens: chunk.outputTokens };
      else if (chunk.type === "error") send("error", { message: chunk.message, code: chunk.code });
    }
    const interactionId = text ? finish(text, usage, false) : undefined;
    send("done", { interactionId, usage });
  });
}

function chunkText(text: string, size = 24) {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

function sse(run: (send: (event: string, data: unknown) => void) => Promise<void>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* stream closed */
        }
      };
      try {
        await run(send);
      } catch (e) {
        send("error", { message: (e as Error).message || "Unexpected error" });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
