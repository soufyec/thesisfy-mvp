import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, requireUser } from "@/lib/api";
import { isLocale } from "@/lib/i18n";
import { translate } from "@/lib/i18n/dictionary";
import { isWritingLanguage, type WritingLanguage } from "@/lib/papers/kinds";
import { buildTemplateHtml, templateById, templateFor } from "@/lib/papers/templates";
import { fail, isRecipient } from "../../shared";

/**
 * A student starts their paper from an assignment (docs/papers.md §3.2, lazy creation D6). Idempotent: when the
 * paper exists it is returned (`created: false`), even if the assignment has been closed since. Otherwise a closed
 * assignment answers 409 `closed`. Optional body `{ writingLanguage }` (default: the student's language). The paper
 * takes the assignment's title, kind and template (headings in the writing language), its due date, word target and
 * citation style, `professorId` = the assignment's creator and `assignmentId`.
 */
export async function POST(request: NextRequest, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const user = r.user;
  if (user.role !== "student") return fail("students_only", "api.assignment.studentsOnly", 403);
  const body = await request.json().catch(() => null);
  const a = db.assignments.findById(params.id);
  if (!a || !isRecipient(a, user.id)) return fail("not_found", "api.assignment.notFound", 404);

  // Everything from here to the creation is synchronous, so a double click cannot create two papers.
  const existing = db.assignments.paperFor(a.id, user.id);
  if (existing) return json({ thesis: existing, created: false });
  if (a.status !== "open") return fail("closed", "api.assignment.closed", 409);

  const uiLang: WritingLanguage = isLocale(user.preferences?.language) ? user.preferences.language : "en";
  let writingLanguage: WritingLanguage = uiLang;
  const requested = body && typeof body === "object" ? (body as Record<string, unknown>).writingLanguage : undefined;
  if (requested !== undefined && requested !== null && requested !== "") {
    if (!isWritingLanguage(requested)) return fail("invalid_language", "api.paper.invalidLanguage");
    writingLanguage = requested;
  }

  const template = templateById(a.templateId) && templateById(a.templateId)!.kind === a.kind ? templateById(a.templateId)! : templateFor(a.kind);
  const thesis = db.theses.create({
    title: a.title,
    description: "",
    studentId: user.id,
    professorId: a.createdBy,
    assignmentId: a.id,
    kind: a.kind,
    templateId: template.id,
    writingLanguage,
    deadline: a.deadline,
    targetWords: a.targetWords || template.targetWords,
    citationStyle: a.citationStyle || "APA",
    content: buildTemplateHtml(template, a.title, (k) => translate(writingLanguage, k)),
    notesTitle: translate(uiLang, "editor.notesTab"),
  });
  db.versions.create({ thesisId: thesis.id, authorId: user.id, content: thesis.content, wordCount: thesis.wordCount, kind: "milestone", label: "Created" });
  return json({ thesis, created: true }, 201);
}
