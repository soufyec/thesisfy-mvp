import { NextRequest } from "next/server";
import { Assignment, db } from "@/lib/db";
import { canManageAssignment } from "@/lib/auth";
import { json, requireUser } from "@/lib/api";
import { fail, isRecipient, notifyAssigned, notifyUpdated, staffView, validatePatch } from "../shared";

/**
 * One assignment. Its creator and the admins of its university get the staff view with the roster; a student it was
 * sent to (or who started it) gets their view, with `paperId` once started. Anyone else: 404.
 */
export async function GET(request: NextRequest, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const a = db.assignments.findById(params.id);
  if (!a) return fail("not_found", "api.assignment.notFound", 404);
  if (canManageAssignment(r.user, a)) return json({ assignment: staffView(a) });
  if (r.user.role === "student" && isRecipient(a, r.user.id)) return json({ assignment: db.assignments.studentView(a, r.user.id) });
  return fail("not_found", "api.assignment.notFound", 404);
}

/**
 * Edits an assignment (its creator or an admin of its university). Whitelisted fields only (see `validatePatch`):
 * title, brief, due date, word target, citation style, status, and students to add. Due date, target and style are
 * written into every paper already started (D7). A changed brief or due date notifies the students
 * (`notif.assignmentUpdated`); added students get `notif.assigned` while the assignment is open.
 */
export async function PATCH(request: NextRequest, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const a = db.assignments.findById(params.id);
  if (!a || !canManageAssignment(r.user, a)) return fail("not_found", "api.assignment.notFound", 404);
  const body = await request.json().catch(() => null);
  const v = validatePatch(body, a);
  if (!v.ok) return fail(v.code, v.key);
  const f = v.fields;

  const before = { brief: a.brief, deadline: a.deadline };
  const added = f.studentIds || [];
  const patch: Partial<Assignment> = {};
  if (f.title !== undefined) patch.title = f.title;
  if (f.brief !== undefined) patch.brief = f.brief;
  if (f.deadline !== undefined) patch.deadline = f.deadline || undefined;
  if (f.targetWords !== undefined) patch.targetWords = f.targetWords;
  if (f.citationStyle !== undefined) patch.citationStyle = f.citationStyle;
  if (f.status !== undefined) patch.status = f.status;
  if (added.length) patch.studentIds = [...a.studentIds, ...added];

  const updated = db.assignments.update(a.id, patch);
  if (!updated) return fail("not_found", "api.assignment.notFound", 404);
  const change = { brief: f.brief !== undefined && updated.brief !== before.brief, deadline: f.deadline !== undefined && updated.deadline !== before.deadline };
  notifyUpdated(updated, change, r.user, added);
  if (added.length && updated.status === "open") notifyAssigned(updated, added, r.user);
  return json({ assignment: staffView(updated) });
}

/** Deletes an assignment nobody has started (its creator or an admin of its university); otherwise 409 `started`. */
export async function DELETE(request: NextRequest, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const a = db.assignments.findById(params.id);
  if (!a || !canManageAssignment(r.user, a)) return fail("not_found", "api.assignment.notFound", 404);
  if (db.assignments.papers(a.id).length) return fail("started", "api.assignment.started", 409);
  if (!db.assignments.remove(a.id)) return fail("started", "api.assignment.started", 409);
  return json({ success: true });
}
