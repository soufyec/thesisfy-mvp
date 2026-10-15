/**
 * Paper kinds. A paper is still a `Thesis` record (ids `thesis_…`, `/api/theses`); `kind` says what
 * the student is writing. Absent `kind` means "thesis" (records created before kinds existed).
 * Pure module: safe to import from client components and from the server.
 */

export type PaperKind =
  | "thesis"
  | "doctoral_thesis"
  | "essay"
  | "reflective_essay"
  | "report"
  | "lab_report"
  | "literature_review"
  | "research_proposal"
  | "case_study"
  | "article"
  | "annotated_bibliography"
  | "blank";

export const PAPER_KINDS: PaperKind[] = [
  "thesis",
  "doctoral_thesis",
  "essay",
  "reflective_essay",
  "report",
  "lab_report",
  "literature_review",
  "research_proposal",
  "case_study",
  "article",
  "annotated_bibliography",
  "blank",
];

/** Kinds supervised by an advisor; they keep the automatic advisor assignment on free creation. */
export const THESIS_KINDS: PaperKind[] = ["thesis", "doctoral_thesis"];

export type PaperGroup = "theses" | "essays" | "reports" | "research" | "blank";

export const PAPER_GROUPS: PaperGroup[] = ["theses", "essays", "reports", "research", "blank"];

export const KIND_GROUP: Record<PaperKind, PaperGroup> = {
  thesis: "theses",
  doctoral_thesis: "theses",
  essay: "essays",
  reflective_essay: "essays",
  report: "reports",
  lab_report: "reports",
  case_study: "reports",
  literature_review: "research",
  research_proposal: "research",
  article: "research",
  annotated_bibliography: "research",
  blank: "blank",
};

/** Shown first in the template gallery. */
export const FEATURED_KINDS: PaperKind[] = ["thesis", "essay", "report", "lab_report", "literature_review", "blank"];

export const paperKind = (t: { kind?: PaperKind | null }): PaperKind => t.kind ?? "thesis";

export const isPaperKind = (v: unknown): v is PaperKind => typeof v === "string" && (PAPER_KINDS as string[]).includes(v);

export const isThesisKind = (k: PaperKind): boolean => THESIS_KINDS.includes(k);

/** Language the paper itself is written in (headings, artifact titles, chart labels, number format). */
export type WritingLanguage = "en" | "es" | "fr" | "de";

export const WRITING_LANGUAGES: WritingLanguage[] = ["en", "es", "fr", "de"];

export const isWritingLanguage = (v: unknown): v is WritingLanguage => typeof v === "string" && (WRITING_LANGUAGES as string[]).includes(v);

/** Who reviews the paper, as shown to the student and the staff. */
export type TeacherLabel = "advisor" | "teacher" | "none";

export function teacherLabel(t: { kind?: PaperKind | null; professorId?: string | null }): TeacherLabel {
  if (!t.professorId) return "none";
  return isThesisKind(paperKind(t)) ? "advisor" : "teacher";
}
