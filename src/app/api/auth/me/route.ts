import { NextRequest } from "next/server";
import { db, publicUser } from "@/lib/db";
import { error, json, requireUser } from "@/lib/api";

export async function GET(request: NextRequest) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
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
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const body = await request.json().catch(() => null);
  if (!body) return error("Invalid body");
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (body.preferences && typeof body.preferences === "object") patch.preferences = body.preferences;
  const updated = db.users.update(r.user.id, patch);
  return json({ user: updated ? publicUser(updated) : null });
}
