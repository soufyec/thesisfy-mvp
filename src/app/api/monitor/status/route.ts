import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { error, json, requireUser } from "@/lib/api";
import { preflight, withCors } from "@/lib/cors";

export const OPTIONS = () => preflight();

/** Extension polls this to learn whether a monitored writing session is active and which scopes were consented. */
export async function GET(request: NextRequest) {
  const r = requireUser(request);
  if ("response" in r) return withCors(r.response);
  const user = r.user;
  const active = db.sessions.active().find((s) => s.userId === user.id);
  const consent = db.consents.latest(user.id);
  const policy = db.policies.get(user.university);
  if (!consent?.scopes.extensionActivity) {
    return withCors(json({ user: { name: user.name }, monitoring: false, reason: "Extension activity is not enabled in your consent settings.", activeSession: null }));
  }
  return withCors(
    json({
      user: { name: user.name, university: user.university },
      monitoring: !!active,
      activeSession: active ? { id: active.id, thesisTitle: db.theses.findById(active.thesisId)?.title, startedAt: active.startedAt } : null,
      scopes: { activity: consent.scopes.extensionActivity, promptText: consent.scopes.extensionPromptText },
      policy: { allowExternalAi: policy.allowExternalAi, university: policy.university },
    })
  );
}
