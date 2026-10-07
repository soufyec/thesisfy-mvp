import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { canAccessThesis } from "@/lib/auth";
import { deviceFromUA, error, json, requireUser } from "@/lib/api";
import { isEmptySession } from "@/lib/integrity";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error("Thesis not found", 404);
  return json({ sessions: [...thesis.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)) });
}

/** Starts a monitored writing session. Requires a valid consent when the policy demands it. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error("Thesis not found", 404);
  if (thesis.studentId !== r.user.id) return error("Only the author can start a writing session", 403);

  const policy = db.policies.get(r.user.university);
  const consent = db.consents.latest(r.user.id);
  if (policy.requireConsent && !consent) return error("Consent required before monitoring can start", 428);

  // Open sessions left behind without any activity (an editor that was closed again) are dropped, not kept as 0-minute rows.
  thesis.sessions.filter((s) => s.userId === r.user.id && !s.endedAt && isEmptySession(s)).forEach((s) => db.sessions.remove(s.id));
  const session = db.sessions.start({ thesisId: thesis.id, userId: r.user.id, consentId: consent?.id, device: deviceFromUA(request.headers.get("user-agent")) });
  if (thesis.status === "draft") db.theses.update(thesis.id, { status: "in_progress" });
  return json({ session, consent, policy }, 201);
}
