import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { canAccessThesis } from "@/lib/auth";
import { deviceFromUA, error, json, requireUser } from "@/lib/api";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error("Thesis not found", 404);
  return json({ sessions: [...thesis.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)) });
}

/** Starts a monitored writing session. Requires a valid consent when the policy demands it. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error("Thesis not found", 404);
  if (thesis.studentId !== r.user.id) return error("Only the author can start a writing session", 403);

  const policy = db.policies.get(r.user.university);
  const consent = db.consents.latest(r.user.id);
  if (policy.requireConsent && !consent) return error("Consent required before monitoring can start", 428);

  const session = db.sessions.start({ thesisId: thesis.id, userId: r.user.id, consentId: consent?.id, device: deviceFromUA(request.headers.get("user-agent")) });
  if (thesis.status === "draft") db.theses.update(thesis.id, { status: "in_progress" });
  return json({ session, consent, policy }, 201);
}
