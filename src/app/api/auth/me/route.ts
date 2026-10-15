import { NextRequest } from "next/server";
import { db, publicUser } from "@/lib/db";
import { error, json, requireUser } from "@/lib/api";

export async function GET(request: NextRequest) {
  const r = await requireUser(request);
  // Public pages ask who is signed in; "nobody" is an answer, not an error.
  if ("response" in r) return json({ user: null });
  const user = r.user;
  return json({
    user: publicUser(user),
    unreadNotifications: db.notifications.getUnreadCount(user.id),
    consent: db.consents.latest(user.id) || null,
    policy: db.policies.get(user.university),
    connections: db.connections.listByUser(user.id).map(({ encryptedSecret: _s, ...c }) => c),
  });
}

export async function PATCH(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const body = await request.json().catch(() => null);
  if (!body) return error("Invalid body");
  const patch: Record<string, unknown> = {};
  // A display name is one line of at most 120 characters: no control or line/paragraph separator characters (it is
  // shown to staff and sent to the assistant, where a multi-line name could pose as an instruction).
  if (typeof body.name === "string" && body.name.trim()) {
    const name = body.name.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
    if (name) patch.name = name;
  }
  if (body.preferences && typeof body.preferences === "object") patch.preferences = body.preferences;
  // The onboarding can only be marked as seen, never un-seen: replaying it is a client-side choice.
  if (body.onboarded === true && !r.user.onboardedAt) patch.onboardedAt = new Date().toISOString();
  const updated = db.users.update(r.user.id, patch);
  return json({ user: updated ? publicUser(updated) : null });
}
