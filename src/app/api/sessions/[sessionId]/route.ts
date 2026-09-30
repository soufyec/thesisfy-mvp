import { NextRequest } from "next/server";
import { db, SessionEventType } from "@/lib/db";
import { error, json, requireUser } from "@/lib/api";
import { evaluateEvent, refreshThesisMetrics } from "@/lib/integrity";
import { textFingerprint } from "@/lib/crypto";

const ALLOWED: SessionEventType[] = ["typing", "paste", "ai_prompt", "ai_insert", "ai_suggestion_rejected", "tab_hidden", "tab_visible", "save"];

/** Batched session events from the editor. Scopes the student did not consent to are dropped server-side too. */
export async function POST(request: NextRequest, { params }: { params: { sessionId: string } }) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const session = db.sessions.findById(params.sessionId);
  if (!session || session.userId !== r.user.id) return error("Session not found", 404);
  if (session.endedAt) return error("Session already ended", 410);

  const body = await request.json().catch(() => null);
  const events: { type: SessionEventType; data?: Record<string, unknown> }[] = Array.isArray(body?.events) ? body.events : [];
  const consent = session.consentId ? db.consents.list(r.user.id).find((c) => c.id === session.consentId) : undefined;
  const scopes = consent?.scopes;
  const policy = db.policies.get(r.user.university);

  const created = [];
  for (const ev of events.slice(0, 200)) {
    if (!ALLOWED.includes(ev.type)) continue;
    const data = { ...(ev.data || {}) };
    if (ev.type === "typing" && scopes && !scopes.keystrokes) continue;
    if (ev.type === "paste" && scopes && !scopes.paste) continue;
    if ((ev.type === "tab_hidden" || ev.type === "tab_visible") && scopes && !scopes.tabActivity) continue;
    if ((ev.type === "ai_prompt" || ev.type === "ai_insert") && scopes && !scopes.aiInteractions) continue;

    if (ev.type === "paste") {
      // Never store pasted text. Fingerprint it and match against copies reported by the extension.
      const text = typeof data.text === "string" ? (data.text as string) : "";
      delete data.text;
      const fp = data.fingerprint || (text ? textFingerprint(text) : undefined);
      data.fingerprint = fp;
      const cutoff = Date.now() - 30 * 60 * 1000;
      const match = session.events.find((e) => e.type === "external_ai_copy" && e.data.fingerprint === fp && new Date(e.timestamp).getTime() > cutoff);
      if (match) data.matchedExternal = { provider: match.data.provider, host: match.data.host };
    }

    db.sessions.addEvent(session.id, ev.type, data);
    created.push(...evaluateEvent(session, ev.type, data, policy));
  }

  const refreshed = db.sessions.findById(session.id)!;
  return json({
    ok: true,
    flags: created,
    session: { id: refreshed.id, keystrokes: refreshed.keystrokes, wordsWritten: refreshed.wordsWritten, aiAssists: refreshed.aiAssists, pasteEvents: refreshed.pasteEvents, tabSwitches: refreshed.tabSwitches, externalAiVisits: refreshed.externalAiVisits },
    matches: events.filter((e) => e.type === "paste").length ? refreshed.events.slice(-events.length).filter((e) => e.type === "paste" && e.data.matchedExternal).map((e) => e.data) : [],
  });
}

export async function PATCH(request: NextRequest, { params }: { params: { sessionId: string } }) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const session = db.sessions.findById(params.sessionId);
  if (!session || session.userId !== r.user.id) return error("Session not found", 404);
  const body = await request.json().catch(() => ({}));
  if (body.action === "end") {
    const ended = db.sessions.end(session.id);
    refreshThesisMetrics(session.thesisId);
    return json({ session: ended });
  }
  db.sessions.update(session.id, {});
  return json({ ok: true });
}

export async function GET(request: NextRequest, { params }: { params: { sessionId: string } }) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const session = db.sessions.findById(params.sessionId);
  if (!session) return error("Session not found", 404);
  if (session.userId !== r.user.id && r.user.role === "student") return error("Forbidden", 403);
  return json({ session });
}
