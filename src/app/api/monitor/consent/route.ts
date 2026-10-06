import { NextRequest } from "next/server";
import { ConsentScopes, db } from "@/lib/db";
import { error, json, requireUser } from "@/lib/api";

const CONSENT_VERSION = "2026-03";

export async function GET(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  return json({ consent: db.consents.latest(r.user.id) || null, history: db.consents.list(r.user.id), version: CONSENT_VERSION, policy: db.policies.get(r.user.university) });
}

export async function POST(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const body = await request.json().catch(() => null);
  const s = body?.scopes || {};
  const policy = db.policies.get(r.user.university);
  const scopes: ConsentScopes = {
    keystrokes: !!s.keystrokes && policy.monitoring.keystrokes,
    paste: !!s.paste && policy.monitoring.paste,
    aiInteractions: !!s.aiInteractions && policy.monitoring.aiInteractions,
    tabActivity: !!s.tabActivity && policy.monitoring.tabActivity,
  };
  if (policy.requireConsent && !scopes.aiInteractions) return error("AI interaction logging is required by your institution's policy to use the assistant.", 422);
  const consent = db.consents.grant({ userId: r.user.id, thesisId: body?.thesisId, version: CONSENT_VERSION, scopes, userAgent: request.headers.get("user-agent") || undefined });
  return json({ consent }, 201);
}

export async function DELETE(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  db.consents.revoke(r.user.id);
  // End any active sessions: monitoring stops immediately.
  db.sessions.active().filter((s) => s.userId === r.user.id).forEach((s) => db.sessions.end(s.id));
  return json({ success: true });
}
