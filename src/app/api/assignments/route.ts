import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, requireStaff, requireUser } from "@/lib/api";
import { fail, notifyAssigned, staffView, validateCreate } from "./shared";

/**
 * Assignments (docs/papers.md §3.2). A professor lists the ones they created; an admin those of their university;
 * a student those sent to them that are open or that they already started (`{ assignments: StudentAssignmentView[] }`,
 * with `paperId` once started). Staff items are the stored assignment plus `createdByName`, `roster` and `counts`.
 */
export async function GET(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const user = r.user;
  if (user.role === "student") {
    return json({ assignments: db.assignments.listForStudent(user.id).map((a) => db.assignments.studentView(a, user.id)) });
  }
  const list = user.role === "admin" ? db.assignments.listByUniversity(user.university) : db.assignments.listByCreator(user.id);
  return json({ assignments: list.map(staffView) });
}

/**
 * Creates an open assignment (staff). Recipients must be students of the creator's university. Each student is
 * notified in their own language with a link to the assignment in their papers. Papers are created when a student
 * presses Start (`POST /api/assignments/[id]/start`).
 */
export async function POST(request: NextRequest) {
  const r = await requireStaff(request);
  if ("response" in r) return r.response;
  const user = r.user;
  const body = await request.json().catch(() => null);
  const v = validateCreate(body, user);
  if (!v.ok) return fail(v.code, v.key);
  const f = v.fields;
  const a = db.assignments.create({
    university: user.university,
    createdBy: user.id,
    title: f.title!,
    brief: f.brief || "",
    kind: f.kind!,
    templateId: f.templateId,
    studentIds: f.studentIds!,
    deadline: f.deadline || undefined,
    targetWords: f.targetWords,
    citationStyle: f.citationStyle,
  });
  notifyAssigned(a, a.studentIds, user);
  return json({ assignment: staffView(a) }, 201);
}
