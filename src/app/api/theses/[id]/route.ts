import { NextRequest } from "next/server";
import { notifyUser } from "@/lib/notify";
import { translator } from "@/lib/i18n/dictionary";
import { db, ThesisStatus } from "@/lib/db";
import { canAccessThesis } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";
import { evaluatePolicyLimit, integrityBreakdown, refreshThesisMetrics, thesisMetrics } from "@/lib/integrity";
import { getT } from "@/lib/i18n/server";
import { paperKind, teacherLabel } from "@/lib/papers/kinds";
import { isCitationStyle, isHandedIn, isLockedStatus, isPaperLate, parseDeadline, parseTargetWords } from "@/lib/paperSections";

const STATUSES: ThesisStatus[] = ["draft", "in_progress", "under_review", "revision_requested", "approved", "submitted"];
/** Characters of the Final submission and of each working tab accepted by PUT. */
const MAX_CONTENT_CHARS = 2_000_000;

/** An error with a stable `code` and a message in the caller's interface language (contract changes in D20). */
function fail(code: string, key: string, status: number) {
  return json({ error: getT()(key), code }, status);
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error("Thesis not found", 404);

  const student = db.users.findById(thesis.studentId);
  const professor = thesis.professorId ? db.users.findById(thesis.professorId) : null;
  const policy = db.policies.get(student?.university || r.user.university);
  const flags = db.flags.listByThesis(thesis.id);
  // AI reviewer comments are signed "AI reviewer" (authorRole "ai"), never with the student's name.
  const t = getT();
  const comments = db.comments.list(thesis.id).map((c) => ({
    ...c,
    authorName: c.source === "ai" ? t("panelsReview.reviewer.author") : db.users.findById(c.authorId)?.name || "Unknown",
    authorRole: c.source === "ai" ? ("ai" as const) : db.users.findById(c.authorId)?.role,
    replies: c.replies.map((rp) => ({ ...rp, authorName: db.users.findById(rp.authorId)?.name || "Unknown" })),
  }));

  // Keep the stored score consistent with the ledger the client shows.
  refreshThesisMetrics(thesis.id);
  // The assignment the paper was started from: the same view for the student and the staff (principle 2).
  const asg = thesis.assignmentId ? db.assignments.findById(thesis.assignmentId) : undefined;
  return json({
    thesis: {
      ...thesis,
      studentName: student?.name || "Unknown",
      professorName: professor?.name || "Unassigned",
      university: student?.university,
      kind: paperKind(thesis),
      assignment: asg ? db.assignments.view(asg) : undefined,
      teacherLabel: teacherLabel(thesis),
      late: isPaperLate(thesis),
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
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error("Thesis not found", 404);
  const body = await request.json().catch(() => null);
  if (!body) return error("Invalid body");

  const patch: Record<string, unknown> = {};
  const isOwner = r.user.id === thesis.studentId;
  const requested: ThesisStatus | undefined = body.status && STATUSES.includes(body.status) ? body.status : undefined;
  // The same cap as one working tab: the server counters parse the whole document on every save.
  if (typeof body.content === "string" && body.content.length > MAX_CONTENT_CHARS) return fail("too_large", "api.paper.tooLarge", 413);

  // Approved or submitted papers are frozen for their owner: no content, tabs, references, title or description, and
  // no way back to draft, in progress or review (409 locked, D20). Checked before anything is written.
  if (isOwner && isLockedStatus(thesis.status)) {
    const renames = (typeof body.title === "string" && body.title.trim() !== "" && body.title.trim() !== thesis.title) || (typeof body.description === "string" && body.description !== thesis.description);
    const writesContent = typeof body.content === "string" || Array.isArray(body.tabs) || Array.isArray(body.references) || renames;
    const movesBack = !!requested && requested !== thesis.status && (requested === "draft" || requested === "in_progress" || requested === "under_review");
    if (writesContent || movesBack) return fail("locked", "api.paper.locked", 409);
  }
  // Sending for review needs someone to review it: a paper without a teacher cannot be submitted (409 no_teacher, D9).
  const submitting = isOwner && requested === "under_review" && thesis.status !== "under_review";
  if (submitting && !thesis.professorId) return fail("no_teacher", "api.paper.noTeacher", 409);

  if (typeof body.content === "string" && isOwner) patch.content = body.content;
  if (typeof body.title === "string" && body.title.trim() && isOwner) patch.title = body.title.trim();
  if (typeof body.description === "string" && isOwner) patch.description = body.description;
  if (Array.isArray(body.references) && isOwner) patch.references = body.references;
  if (Array.isArray(body.tabs) && isOwner) {
    if (body.tabs.length > 20) return error("A thesis can have at most 20 working tabs");
    const tabs = [];
    for (const t of body.tabs) {
      if (!t || typeof t.id !== "string" || typeof t.content !== "string") return error("Invalid tab");
      if (t.content.length > MAX_CONTENT_CHARS) return error("Tab content is too large");
      const prev = (thesis.tabs || []).find((x) => x.id === t.id);
      tabs.push({ id: t.id.slice(0, 40), title: String(t.title || "Untitled").trim().slice(0, 80) || "Untitled", content: t.content, updatedAt: prev && prev.content === t.content && prev.title === t.title ? prev.updatedAt : new Date().toISOString() });
    }
    patch.tabs = tabs;
  }
  if (body.pageSetup && typeof body.pageSetup === "object" && isOwner) {
    const ps = { ...thesis.pageSetup, ...body.pageSetup };
    // Header / footer texts are plain text of at most 200 characters; page numbering is one of four positions.
    ps.headerText = typeof ps.headerText === "string" ? ps.headerText.slice(0, 200) : undefined;
    ps.footerText = typeof ps.footerText === "string" ? ps.footerText.slice(0, 200) : undefined;
    if (!["none", "footerCenter", "footerRight", "headerRight"].includes(String(ps.pageNumbers))) ps.pageNumbers = "none";
    ps.numberHeadings = ps.numberHeadings === true;
    patch.pageSetup = ps;
  }
  // Due date, word target and citation style of a paper started from an assignment are set by the teacher (D7): the
  // owner's values are ignored and the response carries the effective ones. Invalid values are ignored too. Once a
  // paper is handed in (or approved/submitted) they no longer change either, so "Submitted late" cannot be undone
  // afterwards. `kind` is not accepted by PUT in v1.
  if (isOwner && !thesis.assignmentId && !isHandedIn(thesis) && !isLockedStatus(thesis.status)) {
    if (body.citationStyle && isCitationStyle(body.citationStyle)) patch.citationStyle = body.citationStyle;
    if (body.targetWords) {
      const n = parseTargetWords(body.targetWords);
      if (n !== null) patch.targetWords = n;
    }
    if (body.deadline !== undefined) {
      const d = parseDeadline(body.deadline);
      if (d.ok) patch.deadline = d.value;
    }
  }
  if (requested) {
    // Students can move draft -> in_progress -> under_review; staff can set anything.
    const studentAllowed: ThesisStatus[] = ["draft", "in_progress", "under_review"];
    if (!isOwner || studentAllowed.includes(requested)) patch.status = requested;
    if (submitting) {
      patch.submittedAt = new Date().toISOString();
      notifyUser(thesis.professorId!, "notif.submitted", { name: db.users.findById(thesis.studentId)?.name || "", title: thesis.title }, { type: "info", link: `/admin/theses/${thesis.id}` });
    }
    // A review decision recorded by the staff.
    if (!isOwner && requested !== thesis.status) patch.reviewedAt = new Date().toISOString();
    if ((body.status === "revision_requested" || body.status === "approved") && !isOwner) {
      notifyUser(thesis.studentId, body.status === "approved" ? "notif.approved" : "notif.revision", { note: body.reviewNote || translator((db.users.findById(thesis.studentId)?.preferences.language as "en") || "en")("notif.statusUpdated.message", { name: r.user.name, title: thesis.title }) }, { type: body.status === "approved" ? "success" : "warning", link: `/dashboard/editor/${thesis.id}` });
    }
  }

  const updated = db.theses.update(thesis.id, patch);
  if (!updated) return error("Thesis not found", 404);
  const newFlags = [];
  const openBefore = db.flags.listByThesis(thesis.id).filter((f) => !f.resolved).map((f) => f.id);

  if (patch.content !== undefined) {
    const last = db.versions.list(thesis.id)[0];
    const changed = !last || last.content !== patch.content;
    const kind = body.versionKind === "manual" ? "manual" : "autosave";
    // Autosave snapshots at most every 2 minutes; manual snapshots always.
    if (changed && (kind === "manual" || !last || Date.now() - new Date(last.createdAt).getTime() > 2 * 60 * 1000)) {
      db.versions.create({ thesisId: thesis.id, authorId: r.user.id, content: updated.content, wordCount: updated.wordCount, kind, label: body.versionLabel });
    }
    const session = typeof body.sessionId === "string" ? db.sessions.findById(body.sessionId) : undefined;
    if (session && session.userId === r.user.id && !session.endedAt) {
      db.sessions.addEvent(session.id, "save", { wordCount: updated.wordCount });
      // The AI-limit notice follows the saved document (pastes declared as AI, assistant insertions), never a stale count.
      newFlags.push(...evaluatePolicyLimit(session, db.policies.get(r.user.university)));
    }
  }

  // The pill and the ledger read these same numbers: the response carries them after every save.
  const metrics = thesisMetrics(thesis.id);
  return json({ thesis: { ...updated, content: undefined, sessions: undefined, tabs: undefined, integrityScore: metrics?.integrityScore ?? updated.integrityScore, aiUsagePercent: metrics?.aiUsagePercent ?? updated.aiUsagePercent, kind: paperKind(updated), teacherLabel: teacherLabel(updated), late: isPaperLate(updated) }, integrityBreakdown: metrics?.integrityBreakdown, flags: newFlags, resolvedFlagIds: openBefore.filter((id) => db.flags.listByThesis(thesis.id).some((f) => f.id === id && f.resolved)) });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error("Thesis not found", 404);
  if (r.user.role === "student" && thesis.studentId !== r.user.id) return error("Forbidden", 403);
  // A paper started from an assignment stays in the student's papers (409 assigned, D20).
  if (thesis.studentId === r.user.id && thesis.assignmentId) return fail("assigned", "api.paper.assigned", 409);
  db.theses.remove(thesis.id);
  return json({ success: true });
}
