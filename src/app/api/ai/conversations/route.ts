import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, requireUser } from "@/lib/api";

export async function GET(request: NextRequest) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const thesisId = request.nextUrl.searchParams.get("thesisId") || undefined;
  const list = db.conversations.listByUser(r.user.id, thesisId).map((c) => ({ id: c.id, title: c.title, thesisId: c.thesisId, mode: c.messages[0]?.mode, messageCount: c.messages.length, updatedAt: c.updatedAt, createdAt: c.createdAt }));
  return json({ conversations: list });
}

export async function DELETE(request: NextRequest) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const id = request.nextUrl.searchParams.get("id");
  const c = id ? db.conversations.findById(id) : undefined;
  if (!c || c.userId !== r.user.id) return json({ success: false }, 404);
  db.conversations.remove(c.id);
  return json({ success: true });
}
