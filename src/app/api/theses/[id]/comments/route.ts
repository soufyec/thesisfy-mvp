import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { canAccessThesis } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";
import { getT } from "@/lib/i18n/server";

/**
 * AI reviewer comments (`source: "ai"`) are shown as "AI reviewer" with `authorRole: "ai"`, not under the student's
 * name: the student requested them but did not write them. `authorId` still records who ran the reviewer.
 */
const withNames = (c: ReturnType<typeof db.comments.list>[number]) => {
  const ai = c.source === "ai";
  const author = db.users.findById(c.authorId);
  return {
    ...c,
    authorName: ai ? getT()("panelsReview.reviewer.author") : author?.name || "Unknown",
    authorRole: ai ? ("ai" as const) : author?.role,
    replies: c.replies.map((rp) => ({ ...rp, authorName: db.users.findById(rp.authorId)?.name || "Unknown" })),
  };
};

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  if (!canAccessThesis(r.user, params.id)) return error("Thesis not found", 404);
  return json({ comments: db.comments.list(params.id).map(withNames) });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await requireUser(request);
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
