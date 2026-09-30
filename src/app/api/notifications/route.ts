import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, requireUser } from "@/lib/api";

export async function GET(request: NextRequest) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  return json({ notifications: db.notifications.getByUser(r.user.id), unread: db.notifications.getUnreadCount(r.user.id) });
}

export async function PATCH(request: NextRequest) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const body = await request.json().catch(() => ({}));
  db.notifications.markRead(r.user.id, body.id);
  return json({ unread: db.notifications.getUnreadCount(r.user.id) });
}
