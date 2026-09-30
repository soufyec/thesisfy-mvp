import { NextRequest } from "next/server";
import { db, Provider } from "@/lib/db";
import { error, json, requireUser } from "@/lib/api";
import { preflight, withCors } from "@/lib/cors";
import { evaluateEvent } from "@/lib/integrity";

export const OPTIONS = () => preflight();

const HOST_PROVIDER: Record<string, Provider> = {
  "chatgpt.com": "openai",
  "chat.openai.com": "openai",
  "claude.ai": "anthropic",
  "gemini.google.com": "google",
  "chat.mistral.ai": "mistral",
};

interface ExtEvent {
  type: "external_ai_visit" | "external_ai_copy" | "external_ai_prompt";
  host: string;
  durationSec?: number;
  fingerprint?: string;
  length?: number;
  promptText?: string;
  promptLength?: number;
  ts?: string;
}

/** Events reported by the browser extension. Only accepted while a writing session is active and consented. */
export async function POST(request: NextRequest) {
  const r = requireUser(request);
  if ("response" in r) return withCors(r.response);
  const user = r.user;
  const body = await request.json().catch(() => null);
  const events: ExtEvent[] = Array.isArray(body?.events) ? body.events : [];
  if (!events.length) return withCors(error("events required"));

  const consent = db.consents.latest(user.id);
  if (!consent?.scopes.extensionActivity) return withCors(json({ accepted: 0, reason: "no_consent" }));
  const session = db.sessions.active().find((s) => s.userId === user.id);
  if (!session) return withCors(json({ accepted: 0, reason: "no_active_session" }));
  const policy = db.policies.get(user.university);

  let accepted = 0;
  for (const ev of events.slice(0, 100)) {
    const host = String(ev.host || "").toLowerCase();
    const provider = HOST_PROVIDER[host] || (Object.keys(HOST_PROVIDER).find((h) => host.endsWith(h)) ? HOST_PROVIDER[Object.keys(HOST_PROVIDER).find((h) => host.endsWith(h))!] : undefined);
    if (!provider) continue;
    const data: Record<string, unknown> = { host, provider, reportedAt: ev.ts };

    if (ev.type === "external_ai_visit") {
      data.durationSec = Number(ev.durationSec || 0);
    } else if (ev.type === "external_ai_copy") {
      if (!ev.fingerprint) continue;
      data.fingerprint = ev.fingerprint;
      data.length = Number(ev.length || 0);
    } else if (ev.type === "external_ai_prompt") {
      data.promptLength = Number(ev.promptLength || 0);
      const shareText = consent.scopes.extensionPromptText && typeof ev.promptText === "string";
      data.promptPreview = shareText ? ev.promptText!.slice(0, 300) : "(prompt text not shared — consent scope off)";
      db.interactions.create({
        userId: user.id,
        thesisId: session.thesisId,
        sessionId: session.id,
        provider,
        model: host,
        mode: "chat",
        source: "extension",
        promptPreview: data.promptPreview as string,
        responsePreview: "",
        inputTokens: 0,
        outputTokens: 0,
        insertedWords: 0,
        blockedByPolicy: !policy.allowExternalAi,
      });
    } else continue;

    db.sessions.addEvent(session.id, ev.type, data);
    evaluateEvent(session, ev.type, data, policy);
    accepted++;
  }
  return withCors(json({ accepted, sessionId: session.id }));
}
