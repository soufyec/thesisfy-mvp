import { NextRequest } from "next/server";
import { db, ThesisStatus } from "@/lib/db";
import { canAccessThesis } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";
import { integrityBreakdown, refreshThesisMetrics } from "@/lib/integrity";

const STATUSES: ThesisStatus[] = ["draft", "in_progress", "under_review", "revision_requested", "approved", "submitted"];

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error("Thesis not found", 404);

  const student = db.users.findById(thesis.studentId);
  const professor = thesis.professorId ? db.users.findById(thesis.professorId) : null;
  const policy = db.policies.get(student?.university || r.user.university);
  const flags = db.flags.listByThesis(thesis.id);
  const comments = db.comments.list(thesis.id).map((c) => ({
    ...c,
    authorName: db.users.findById(c.authorId)?.name || "Unknown",
    replies: c.replies.map((rp) => ({ ...rp, authorName: db.users.findById(rp.authorId)?.name || "Unknown" })),
  }));

  return json({
    thesis: {
      ...thesis,
      studentName: student?.name || "Unknown",
      professorName: professor?.name || "Unassigned",
      university: student?.university,
    },
    comments,
    flags,
    versionCount: db.versions.list(thesis.id).length,
    policy,
    interactions: db.interactions.listByThesis(thesis.id).slice(0, 50),
    integrityBreakdown: integrityBreakdown(thesis, policy, flags),
  });
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error("Thesis not found", 404);
  const body = await request.json().catch(() => null);
  if (!body) return error("Invalid body");

  const patch: Record<string, unknown> = {};
  const isOwner = r.user.id === thesis.studentId;

  if (typeof body.content === "string" && isOwner) patch.content = body.content;
  if (typeof body.title === "string" && body.title.trim() && isOwner) patch.title = body.title.trim();
  if (typeof body.description === "string" && isOwner) patch.description = body.description;
  if (Array.isArray(body.references) && isOwner) patch.references = body.references;
  if (Array.isArray(body.tabs) && isOwner) {
    if (body.tabs.length > 20) return error("A thesis can have at most 20 working tabs");
    const tabs = [];
    for (const t of body.tabs) {
      if (!t || typeof t.id !== "string" || typeof t.content !== "string") return error("Invalid tab");
      if (t.content.length > 2_000_000) return error("Tab content is too large");
      const prev = (thesis.tabs || []).find((x) => x.id === t.id);
      tabs.push({ id: t.id.slice(0, 40), title: String(t.title || "Untitled").trim().slice(0, 80) || "Untitled", content: t.content, updatedAt: prev && prev.content === t.content && prev.title === t.title ? prev.updatedAt : new Date().toISOString() });
    }
    patch.tabs = tabs;
  }
  if (body.pageSetup && typeof body.pageSetup === "object" && isOwner) patch.pageSetup = { ...thesis.pageSetup, ...body.pageSetup };
  if (body.citationStyle && isOwner) patch.citationStyle = body.citationStyle;
  if (body.targetWords && isOwner) patch.targetWords = Number(body.targetWords);
  if (body.deadline !== undefined && isOwner) patch.deadline = body.deadline || undefined;
  if (body.status && STATUSES.includes(body.status)) {
    // Students can move draft -> in_progress -> under_review; staff can set anything.
    const studentAllowed: ThesisStatus[] = ["draft", "in_progress", "under_review"];
    if (!isOwner || studentAllowed.includes(body.status)) patch.status = body.status;
    if (body.status === "under_review" && thesis.professorId) {
      db.notifications.create({ userId: thesis.professorId, title: "Thesis submitted for review", message: `${db.users.findById(thesis.studentId)?.name} submitted "${thesis.title}" for review.`, type: "info", link: `/admin/theses/${thesis.id}` });
    }
    if ((body.status === "revision_requested" || body.status === "approved") && !isOwner) {
      db.notifications.create({ userId: thesis.studentId, title: body.status === "approved" ? "Thesis approved" : "Revision requested", message: body.reviewNote || `${r.user.name} updated the status of "${thesis.title}".`, type: body.status === "approved" ? "success" : "warning", link: `/dashboard/editor/${thesis.id}` });
    }
  }

  const updated = db.theses.update(thesis.id, patch);
  if (!updated) return error("Thesis not found", 404);

  if (patch.content !== undefined) {
    const last = db.versions.list(thesis.id)[0];
    const changed = !last || last.content !== patch.content;
    const kind = body.versionKind === "manual" ? "manual" : "autosave";
    // Autosave snapshots at most every 2 minutes; manual snapshots always.
    if (changed && (kind === "manual" || !last || Date.now() - new Date(last.createdAt).getTime() > 2 * 60 * 1000)) {
      db.versions.create({ thesisId: thesis.id, authorId: r.user.id, content: updated.content, wordCount: updated.wordCount, kind, label: body.versionLabel });
    }
    if (body.sessionId) db.sessions.addEvent(body.sessionId, "save", { wordCount: updated.wordCount });
    refreshThesisMetrics(thesis.id);
  }

  return json({ thesis: { ...updated, content: undefined, sessions: undefined, tabs: undefined } });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error("Thesis not found", 404);
  if (r.user.role === "student" && thesis.studentId !== r.user.id) return error("Forbidden", 403);
  db.theses.remove(thesis.id);
  return json({ success: true });
}
