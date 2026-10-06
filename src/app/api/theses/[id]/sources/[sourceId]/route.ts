import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { canAccessThesis } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";
import { maybeAlertBudget } from "@/lib/ai/funding";
import { buildSystemPrompt } from "@/lib/ai/prompts";
import { checkPolicy, detectLang } from "@/lib/ai/policy";
import { costOf, resolveProvider, streamCompletion } from "@/lib/ai/providers";
import { splitSentences } from "@/lib/sources/chunk";
import { publicSource } from "@/lib/sources/retrieve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUMMARY_WORDS = 3000;

async function load(request: NextRequest, params: { id: string; sourceId: string }) {
  const r = await requireUser(request);
  if ("response" in r) return { response: r.response };
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return { response: error("Thesis not found", 404) };
  const source = db.sources.findById(params.sourceId);
  if (!source || source.thesisId !== thesis.id) return { response: error("Source not found", 404) };
  return { user: r.user, thesis, source };
}

/** GET → the source (without text) and its chunks, for the chunk viewer and quote highlighting. */
export async function GET(request: NextRequest, { params }: { params: { id: string; sourceId: string } }) {
  const l = await load(request, params);
  if ("response" in l) return l.response;
  const chunks = db.sourceChunks.listBySource(l.source.id).map((c) => ({ id: c.id, index: c.index, page: c.page, section: c.section, text: c.text }));
  return json({ source: publicSource(l.source), chunks });
}

/** DELETE → removes the source and its chunks. */
export async function DELETE(request: NextRequest, { params }: { params: { id: string; sourceId: string } }) {
  const l = await load(request, params);
  if ("response" in l) return l.response;
  db.sourceChunks.removeForSource(l.source.id);
  db.sources.remove(l.source.id);
  return json({ ok: true });
}

/** POST { action: "summarize" } → a short summary of the source's first ~3000 words, logged as a "summarize" interaction. */
export async function POST(request: NextRequest, { params }: { params: { id: string; sourceId: string } }) {
  const l = await load(request, params);
  if ("response" in l) return l.response;
  const { user, thesis, source } = l;
  const body = (await request.json().catch(() => null)) as { action?: string; sessionId?: string; provider?: string } | null;
  if (body?.action !== "summarize") return error("Unknown action. Use { action: \"summarize\" }.");

  const text = (source.text || source.abstract || "").trim();
  if (!text) return error("This source has no indexed text to summarize.", 409);

  const policy = db.policies.get(user.university);
  const consent = db.consents.latest(user.id);
  if (user.role === "student" && policy.requireConsent && !consent?.scopes.aiInteractions) {
    return json({ error: "Please review and accept the monitoring consent before using the assistant.", code: "consent_required" }, 428);
  }
  const lang = user.preferences.language !== "en" ? user.preferences.language : detectLang(text.slice(0, 2000));
  const check = checkPolicy(policy, "summarize", "Summarize this source", lang);
  if (!check.allowed) return json({ error: check.message, reason: check.reason }, 403);

  const excerpt = text.split(/\s+/).slice(0, SUMMARY_WORDS).join(" ");
  const cfg = resolveProvider(user, policy, body?.provider || null);
  const meta = { provider: cfg.provider, model: cfg.model, label: cfg.label, billedTo: cfg.billedTo, institutionModelId: cfg.institutionModel?.id, notice: cfg.notice, demo: cfg.provider === "demo" };

  let summary = "";
  let usage = { inputTokens: 0, outputTokens: 0 };
  if (cfg.provider === "demo") {
    const sentences = splitSentences(excerpt).slice(0, 5);
    summary = `Opening sentences of the source (demo mode, no model call):\n\n${sentences.map((s) => `- ${s}`).join("\n")}\n\n_Connect a model in AI connections, or ask your university to provide one, for a real summary._`;
  } else {
    const system = buildSystemPrompt({ mode: "summarize", policy, thesis, studentName: user.name, provider: cfg.label });
    const head = `${source.title}${source.authors ? ` — ${source.authors}` : ""}${source.year ? ` (${source.year})` : ""}`;
    const prompt = `Summarize this source from my reading list in 4-6 bullets: research question, method, main findings, limitations. Quote one key sentence verbatim. Do not add anything the text does not say.\n\nSource: ${head}\n\n"""\n${excerpt}\n"""`;
    let err: string | undefined;
    for await (const chunk of streamCompletion(cfg, system, [{ role: "user", content: prompt }], 900)) {
      if (chunk.type === "delta") summary += chunk.text;
      else if (chunk.type === "usage") usage = { inputTokens: chunk.inputTokens, outputTokens: chunk.outputTokens };
      else if (chunk.type === "error") err = chunk.message;
    }
    if (err && !summary) return json({ error: err, meta }, 502);
  }

  const interaction = db.interactions.create({
    userId: user.id,
    thesisId: thesis.id,
    sessionId: body?.sessionId,
    provider: cfg.provider,
    model: cfg.model,
    mode: "summarize",
    source: "thesisfic",
    connectionId: cfg.connectionId,
    promptPreview: `Summarize source: ${source.title}`.slice(0, 200),
    responsePreview: summary.slice(0, 200),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    insertedWords: 0,
    blockedByPolicy: false,
    billedTo: cfg.billedTo,
    costUsd: costOf(cfg, usage),
    institutionModelId: cfg.institutionModel?.id,
  });
  if (body?.sessionId) db.sessions.addEvent(body.sessionId, "ai_prompt", { mode: "summarize", provider: cfg.provider, model: cfg.model, blocked: false, promptPreview: `Summarize source: ${source.title}`.slice(0, 120), interactionId: interaction.id });
  if (cfg.connectionId) db.connections.update(cfg.connectionId, { lastUsedAt: new Date().toISOString() });
  if (cfg.billedTo === "institution") maybeAlertBudget(user.university);
  db.sources.update(source.id, { lastUsedAt: new Date().toISOString() });

  return json({ summary, meta, interactionId: interaction.id, usage });
}
