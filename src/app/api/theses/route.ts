import { NextRequest } from "next/server";
import { db, Thesis, User } from "@/lib/db";
import { error, json, requireUser } from "@/lib/api";
import { translate } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { isLocale } from "@/lib/i18n";
import { isPaperKind, isThesisKind, isWritingLanguage, paperKind, teacherLabel, type PaperKind, type WritingLanguage } from "@/lib/papers/kinds";
import { buildTemplateHtml, templateById, templateFor } from "@/lib/papers/templates";
import type { PaperAssignmentInfo, StudentAssignmentView } from "@/lib/papers/views";
import { isCitationStyle, isPaperLate, lastWorkedAt, paperOverview, parseDeadline, parseTargetWords } from "@/lib/paperSections";

/** An error with a stable `code` and a message in the caller's interface language. */
function fail(code: string, key: string, status = 400) {
  return json({ error: getT()(key), code }, status);
}

/**
 * Papers the caller may open (decision D8: `db.theses.visibleTo`), newest activity information included.
 * Each item keeps its previous shape and gains optional fields (docs/papers.md §3.1): `kind` (filled with
 * `paperKind`), `assignment`, `lastWorkedAt`, `figures`, `late`, `teacherLabel` and `sections` (top-level h2 of the
 * Final submission with their words). For a student, the root object also carries `assignments`: the assignments
 * sent to them that they have not started yet. The response is an object, so the extra root key is compatible with
 * every caller (they read `theses`).
 */
export async function GET(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const user = r.user;

  const theses = db.theses.visibleTo(user);
  const assignmentInfo = new Map<string, PaperAssignmentInfo | null>();
  const infoFor = (id: string): PaperAssignmentInfo | undefined => {
    if (!assignmentInfo.has(id)) {
      const a = db.assignments.findById(id);
      if (!a) assignmentInfo.set(id, null);
      else {
        const v = db.assignments.view(a);
        const info: PaperAssignmentInfo = { id: v.id, title: v.title, createdByName: v.createdByName };
        if (v.deadline) info.deadline = v.deadline;
        assignmentInfo.set(id, info);
      }
    }
    return assignmentInfo.get(id) || undefined;
  };

  const enriched = theses.map((t) => {
    // Sections and figures are parsed once per saved version of the content, not on every list call.
    const overview = paperOverview(t);
    const student = db.users.findById(t.studentId);
    const professor = t.professorId ? db.users.findById(t.professorId) : null;
    const flags = db.flags.listByThesis(t.id);
    return {
      ...t,
      content: undefined,
      sessions: undefined,
      tabs: undefined,
      tabCount: (t.tabs || []).length,
      sessionCount: t.sessions.length,
      // Items of the student's library linked to this thesis (the library page and the theses cards show them).
      sourceCount: db.sources.list(t.id).length,
      referenceCount: Array.isArray(t.references) ? t.references.length : 0,
      openFlags: flags.filter((f) => !f.resolved).length,
      studentName: student?.name || "Unknown",
      professorName: professor?.name || "Unassigned",
      kind: paperKind(t),
      assignment: t.assignmentId ? infoFor(t.assignmentId) : undefined,
      lastWorkedAt: lastWorkedAt(t),
      figures: overview.figures,
      late: isPaperLate(t),
      teacherLabel: teacherLabel(t),
      sections: overview.sections,
    };
  });

  if (user.role !== "student") return json({ theses: enriched });
  const assignments: StudentAssignmentView[] = db.assignments
    .listForStudent(user.id)
    .filter((a) => !db.assignments.paperFor(a.id, user.id))
    .map((a) => db.assignments.studentView(a, user.id));
  return json({ theses: enriched, assignments });
}

/** The language a student reads the interface in (their saved preference), for the notes tab title. */
function uiLanguage(u: User | undefined): WritingLanguage {
  const l = u?.preferences?.language;
  return isLocale(l) ? l : "en";
}

/**
 * Creates a free paper (docs/papers.md §3.1). Optional `kind` (default "thesis"), `templateId` (equal to the kind in
 * v1), `writingLanguage` (default: the student's language). The document is always the kind's template with the
 * headings in the writing language; any `content` sent by the client is ignored. `targetWords` defaults to the kind's
 * template and must be 100–200000; `citationStyle` must be one of the five styles. Advisor (D9): thesis kinds keep the
 * automatic assignment (a professor creating it supervises it; otherwise `professorId` if it names a professor of the
 * student's university, else the first professor of that university); every other kind starts without a teacher,
 * unless a professor creates it for a student. Staff may create papers only for students of their own university
 * (assignments are the normal path).
 */
export async function POST(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const user = r.user;
  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 200) : "";
  if (!title) return fail("title_required", "api.paper.titleRequired");

  // Student: themself. Staff: a student of their own university.
  const student = user.role === "student" ? user : typeof body.studentId === "string" ? db.users.findById(body.studentId) : undefined;
  if (!student || student.role !== "student" || student.university !== user.university) return fail("student_not_found", "api.paper.studentNotFound");

  // Kind and template (templateId = kind in v1).
  let kind: PaperKind = "thesis";
  if (body.kind !== undefined && body.kind !== null && body.kind !== "") {
    if (!isPaperKind(body.kind)) return fail("invalid_kind", "api.paper.invalidKind");
    kind = body.kind;
  }
  let templateId: string = kind;
  if (body.templateId !== undefined && body.templateId !== null && body.templateId !== "") {
    const tpl = templateById(body.templateId);
    if (!tpl) return fail("invalid_template", "api.paper.invalidTemplate");
    if (body.kind !== undefined && body.kind !== null && body.kind !== "" && tpl.kind !== kind) return fail("invalid_template", "api.paper.invalidTemplate");
    kind = tpl.kind;
    templateId = tpl.id;
  }
  const template = templateFor(kind);

  let writingLanguage: WritingLanguage = uiLanguage(student);
  if (body.writingLanguage !== undefined && body.writingLanguage !== null && body.writingLanguage !== "") {
    if (!isWritingLanguage(body.writingLanguage)) return fail("invalid_language", "api.paper.invalidLanguage");
    writingLanguage = body.writingLanguage;
  }

  let targetWords = template.targetWords;
  if (body.targetWords !== undefined && body.targetWords !== null && body.targetWords !== "") {
    const n = parseTargetWords(body.targetWords);
    if (n === null) return fail("invalid_target", "api.paper.invalidTarget");
    targetWords = n;
  }
  let citationStyle: Thesis["citationStyle"] = "APA";
  if (body.citationStyle !== undefined && body.citationStyle !== null && body.citationStyle !== "") {
    if (!isCitationStyle(body.citationStyle)) return fail("invalid_citation_style", "api.paper.invalidCitationStyle");
    citationStyle = body.citationStyle;
  }
  let deadline: string | undefined;
  if (body.deadline !== undefined) {
    const d = parseDeadline(body.deadline);
    if (!d.ok) return fail("invalid_deadline", "api.paper.invalidDeadline");
    deadline = d.value;
  }

  // Teacher (D9).
  const universityProfessors = db.users.getByUniversity(student.university).filter((u) => u.role === "professor");
  let professorId: string | undefined;
  if (typeof body.professorId === "string" && body.professorId) {
    if (!universityProfessors.some((u) => u.id === body.professorId)) return fail("teacher_not_found", "api.paper.teacherNotFound");
  }
  if (user.role === "professor") professorId = user.id;
  else if (isThesisKind(kind)) professorId = (typeof body.professorId === "string" && body.professorId) || universityProfessors[0]?.id;

  const thesis = db.theses.create({
    title,
    description: typeof body.description === "string" ? body.description.trim().slice(0, 8000) : "",
    studentId: student.id,
    professorId,
    deadline,
    targetWords,
    citationStyle,
    kind,
    templateId,
    writingLanguage,
    // Headings in the paper's writing language; the hints under them stay keys (shown in the interface language).
    content: buildTemplateHtml(template, title, (k) => translate(writingLanguage, k)),
    // The notes tab is the student's workspace: it follows their interface language.
    notesTitle: translate(uiLanguage(student), "editor.notesTab"),
  });
  db.versions.create({ thesisId: thesis.id, authorId: user.id, content: thesis.content, wordCount: thesis.wordCount, kind: "milestone", label: "Created" });
  return json({ thesis }, 201);
}
