import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { canAccessThesis } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";

const withNames = (c: ReturnType<typeof db.comments.list>[number]) => ({
  ...c,
  authorName: db.users.findById(c.authorId)?.name || "Unknown",
  authorRole: db.users.findById(c.authorId)?.role,
  replies: c.replies.map((rp) => ({ ...rp, authorName: db.users.findById(rp.authorId)?.name || "Unknown" })),
});

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  if (!canAccessThesis(r.user, params.id)) return error("Thesis not found", 404);
  return json({ comments: db.comments.list(params.id).map(withNames) });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error("Thesis not found", 404);
  const body = await request.json().catch(() => null);
  if (!body?.text?.trim() || !body.anchorId) return error("text and anchorId are required");
  const ai = body.source === "ai";
  const c = db.comments.create({
    thesisId: thesis.id,
    authorId: r.user.id,
    anchorId: body.anchorId,
    quote: body.quote || "",
    text: body.text.trim(),
    ...(ai ? { source: "ai" as const, category: body.category, severity: body.severity } : {}),
  });
  // AI reviewer comments are the student's own request: no notification to the advisor until the student shares them.
  if (ai) return json({ comment: withNames(c) }, 201);
  const target = r.user.id === thesis.studentId ? thesis.professorId : thesis.studentId;
  if (target) db.notifications.create({ userId: target, title: "New comment", message: `${r.user.name}: ${c.text.slice(0, 80)}`, type: "comment", link: r.user.id === thesis.studentId ? `/admin/theses/${thesis.id}` : `/dashboard/editor/${thesis.id}` });
  return json({ comment: withNames(c) }, 201);
}
