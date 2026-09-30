import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { canAccessThesis } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";

export async function PATCH(request: NextRequest, { params }: { params: { id: string; commentId: string } }) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  if (!canAccessThesis(r.user, params.id)) return error("Thesis not found", 404);
  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.resolved === "boolean") patch.resolved = body.resolved;
  if (typeof body.text === "string" && body.text.trim()) patch.text = body.text.trim();
  const c = db.comments.update(params.commentId, patch);
  if (!c) return error("Comment not found", 404);
  return json({ comment: c });
}

export async function POST(request: NextRequest, { params }: { params: { id: string; commentId: string } }) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  if (!canAccessThesis(r.user, params.id)) return error("Thesis not found", 404);
  const body = await request.json().catch(() => ({}));
  if (!body.text?.trim()) return error("text is required");
  const c = db.comments.reply(params.commentId, r.user.id, body.text.trim());
  if (!c) return error("Comment not found", 404);
  return json({ comment: { ...c, replies: c.replies.map((rp) => ({ ...rp, authorName: db.users.findById(rp.authorId)?.name })) } });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string; commentId: string } }) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  if (!canAccessThesis(r.user, params.id)) return error("Thesis not found", 404);
  const c = db.comments.findById(params.commentId);
  if (!c) return error("Comment not found", 404);
  if (c.authorId !== r.user.id && r.user.role === "student") return error("Forbidden", 403);
  db.comments.remove(params.commentId);
  return json({ success: true });
}
