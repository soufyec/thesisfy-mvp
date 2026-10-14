/**
 * Shared by the assignment routes (docs/papers.md §3.2): the staff view with its roster, body validation for create
 * and edit, and the notifications sent to students. Not a route (only `route.ts` files are).
 */
import { Assignment, db, User } from "@/lib/db";
import { json } from "@/lib/api";
import { getT } from "@/lib/i18n/server";
import { notifyUser } from "@/lib/notify";
import { isPaperKind, type PaperKind } from "@/lib/papers/kinds";
import { templateById, templateFor } from "@/lib/papers/templates";
import type { AssignmentStatus, CitationStyle, StaffAssignmentView } from "@/lib/papers/views";
import { isCitationStyle, MAX_ASSIGNMENT_STUDENTS, MAX_ASSIGNMENT_TITLE, MAX_BRIEF, parseDeadline, parseTargetWords, rosterCounts, rosterRow } from "@/lib/paperSections";

/** An error with a stable `code` and a message in the caller's interface language. */
export function fail(code: string, key: string, status = 400) {
  return json({ error: getT()(key), code }, status);
}

/** The assignment as its creator or the university admin sees it: every stored field, the creator's name, the roster and its totals. */
export function staffView(a: Assignment): StaffAssignmentView & { templateId?: string } {
  const now = Date.now();
  const roster = a.studentIds.map((sid) => rosterRow(a, sid, db.users.findById(sid), db.assignments.paperFor(a.id, sid), now));
  return { ...a, ...db.assignments.view(a), roster, counts: rosterCounts(roster) };
}

/** Whether a student may see this assignment: one of its recipients, or they already started a paper from it. */
export function isRecipient(a: Assignment, userId: string): boolean {
  return a.studentIds.indexOf(userId) !== -1 || !!db.assignments.paperFor(a.id, userId);
}

export interface AssignmentFields {
  title?: string;
  brief?: string;
  kind?: PaperKind;
  templateId?: string;
  /** `null` clears the due date (edit only). */
  deadline?: string | null;
  targetWords?: number;
  citationStyle?: CitationStyle;
  status?: AssignmentStatus;
  studentIds?: string[];
}

type Validation = { ok: true; fields: AssignmentFields } | { ok: false; code: string; key: string };
const bad = (code: string, key: string): Validation => ({ ok: false, code, key });
const given = (v: unknown) => v !== undefined;

/**
 * Validates recipients: 1–`MAX_ASSIGNMENT_STUDENTS` distinct ids, each an existing student of `university`.
 * `existing` are already recipients (edit): they count towards the maximum and are not checked again.
 */
function validateStudents(v: unknown, university: string, existing: string[] = []): { ok: true; ids: string[] } | { ok: false; code: string; key: string } {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) return { ok: false, code: "invalid_students", key: "api.assignment.invalidStudents" };
  const ids = Array.from(new Set((v as string[]).map((s) => s.trim()).filter(Boolean))).filter((id) => existing.indexOf(id) === -1);
  if (!ids.length && !existing.length) return { ok: false, code: "no_students", key: "api.assignment.noStudents" };
  if (ids.length + existing.length > MAX_ASSIGNMENT_STUDENTS) return { ok: false, code: "too_many_students", key: "api.assignment.tooManyStudents" };
  for (const id of ids) {
    const u = db.users.findById(id);
    if (!u || u.role !== "student" || u.university !== university) return { ok: false, code: "invalid_students", key: "api.assignment.invalidStudents" };
  }
  return { ok: true, ids };
}

/**
 * Body of `POST /api/assignments`: `title` (required, ≤ 200), `brief` (≤ 8000), `kind` (default "thesis"),
 * `templateId` (equal to the kind in v1), `studentIds` (1–300 students of the creator's university), `deadline`
 * (normalised to noon UTC), `targetWords` (100–200000, default the kind's), `citationStyle` (default APA).
 */
export function validateCreate(body: Record<string, unknown> | null, creator: User): Validation {
  if (!body || typeof body !== "object") return bad("invalid_body", "api.assignment.invalidBody");
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return bad("title_required", "api.assignment.titleRequired");
  if (title.length > MAX_ASSIGNMENT_TITLE) return bad("title_too_long", "api.assignment.titleTooLong");
  if (given(body.brief) && body.brief !== null && typeof body.brief !== "string") return bad("invalid_body", "api.assignment.invalidBody");
  const brief = typeof body.brief === "string" ? body.brief.trim() : "";
  if (brief.length > MAX_BRIEF) return bad("brief_too_long", "api.assignment.briefTooLong");

  let kind: PaperKind = "thesis";
  if (given(body.kind) && body.kind !== null && body.kind !== "") {
    if (!isPaperKind(body.kind)) return bad("invalid_kind", "api.paper.invalidKind");
    kind = body.kind;
  }
  let templateId: string = kind;
  if (given(body.templateId) && body.templateId !== null && body.templateId !== "") {
    const tpl = templateById(body.templateId);
    if (!tpl || tpl.kind !== kind) return bad("invalid_template", "api.paper.invalidTemplate");
    templateId = tpl.id;
  }

  const students = validateStudents(body.studentIds, creator.university);
  if (!students.ok) return students;

  const fields: AssignmentFields = { title, brief, kind, templateId, studentIds: students.ids, targetWords: templateFor(kind).targetWords, citationStyle: "APA" };
  if (given(body.deadline)) {
    const d = parseDeadline(body.deadline);
    if (!d.ok) return bad("invalid_deadline", "api.paper.invalidDeadline");
    if (d.value) fields.deadline = d.value;
  }
  if (given(body.targetWords) && body.targetWords !== null && body.targetWords !== "") {
    const n = parseTargetWords(body.targetWords);
    if (n === null) return bad("invalid_target", "api.paper.invalidTarget");
    fields.targetWords = n;
  }
  if (given(body.citationStyle) && body.citationStyle !== null && body.citationStyle !== "") {
    if (!isCitationStyle(body.citationStyle)) return bad("invalid_citation_style", "api.paper.invalidCitationStyle");
    fields.citationStyle = body.citationStyle;
  }
  return { ok: true, fields };
}

/**
 * Body of `PATCH /api/assignments/[id]`, whitelisted: `title`, `brief`, `deadline` (null or "" clears it),
 * `targetWords`, `citationStyle`, `status` ("open" | "closed") and `studentIds` (students to add; recipients are never
 * removed). Every other key is ignored, so `kind`, `university`, `createdBy` or ids cannot change.
 */
export function validatePatch(body: Record<string, unknown> | null, a: Assignment): Validation {
  if (!body || typeof body !== "object") return bad("invalid_body", "api.assignment.invalidBody");
  const fields: AssignmentFields = {};
  if (given(body.title)) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return bad("title_required", "api.assignment.titleRequired");
    if (title.length > MAX_ASSIGNMENT_TITLE) return bad("title_too_long", "api.assignment.titleTooLong");
    fields.title = title;
  }
  if (given(body.brief)) {
    if (body.brief !== null && typeof body.brief !== "string") return bad("invalid_body", "api.assignment.invalidBody");
    const brief = typeof body.brief === "string" ? body.brief.trim() : "";
    if (brief.length > MAX_BRIEF) return bad("brief_too_long", "api.assignment.briefTooLong");
    fields.brief = brief;
  }
  if (given(body.deadline)) {
    const d = parseDeadline(body.deadline);
    if (!d.ok) return bad("invalid_deadline", "api.paper.invalidDeadline");
    fields.deadline = d.value ?? null;
  }
  if (given(body.targetWords)) {
    const n = parseTargetWords(body.targetWords);
    if (n === null) return bad("invalid_target", "api.paper.invalidTarget");
    fields.targetWords = n;
  }
  if (given(body.citationStyle)) {
    if (!isCitationStyle(body.citationStyle)) return bad("invalid_citation_style", "api.paper.invalidCitationStyle");
    fields.citationStyle = body.citationStyle;
  }
  if (given(body.status)) {
    if (body.status !== "open" && body.status !== "closed") return bad("invalid_status", "api.assignment.invalidStatus");
    fields.status = body.status;
  }
  if (given(body.studentIds)) {
    const students = validateStudents(body.studentIds, a.university, a.studentIds);
    if (!students.ok) return students;
    if (students.ids.length) fields.studentIds = students.ids;
  }
  return { ok: true, fields };
}

/** `link` of every assignment notification: My papers opens the assignment, or the student's paper once started. */
export const assignmentLink = (a: Pick<Assignment, "id">) => `/dashboard/papers?assignment=${encodeURIComponent(a.id)}`;

/** `notif.assigned` to each student, in their own language, with the due date when there is one. */
export function notifyAssigned(a: Assignment, studentIds: string[], by: Pick<User, "name">) {
  for (const sid of studentIds) {
    notifyUser(sid, "notif.assigned", { name: by.name, title: a.title }, { type: "info", link: assignmentLink(a), messageKey: a.deadline ? "notif.assigned.messageDue" : undefined, dates: { date: a.deadline } });
  }
}

/**
 * `notif.assignmentUpdated` after the brief or the due date changed, to the students who can see the assignment (it is
 * open, or they started it). Students added in the same edit get `notif.assigned` instead (pass them in `skip`).
 */
export function notifyUpdated(a: Assignment, change: { brief: boolean; deadline: boolean }, by: Pick<User, "name">, skip: string[] = []) {
  if (!change.brief && !change.deadline) return;
  const messageKey = change.brief && change.deadline
    ? a.deadline ? "notif.assignmentUpdated.messageBriefDue" : "notif.assignmentUpdated.messageBriefNoDue"
    : change.deadline
      ? a.deadline ? "notif.assignmentUpdated.messageDue" : "notif.assignmentUpdated.messageNoDue"
      : "notif.assignmentUpdated.message";
  for (const sid of a.studentIds) {
    if (skip.indexOf(sid) !== -1) continue;
    if (a.status !== "open" && !db.assignments.paperFor(a.id, sid)) continue;
    notifyUser(sid, "notif.assignmentUpdated", { name: by.name, title: a.title }, { type: "info", link: assignmentLink(a), messageKey, dates: { date: a.deadline } });
  }
}
