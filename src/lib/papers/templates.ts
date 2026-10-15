/**
 * Paper templates (docs/papers.md §2). One template per kind (`templateId = kind`). A template writes only headings:
 * the title as h1 and one h2 per section, in the paper's writing language. Under each h2 sits an empty paragraph whose
 * `data-hint` holds the i18n key of the section's guidance; the editor shows it as a placeholder in the interface
 * language, and it is never part of the text (not counted, not exported, not shown in review mode).
 * Pure module: safe to import from client components and from the server.
 */
import { FEATURED_KINDS, KIND_GROUP, paperKind, teacherLabel, type PaperGroup, type PaperKind } from "./kinds";

export { FEATURED_KINDS };

/** Structural motif drawn in the gallery thumbnail. */
export type TemplateMotif = "titlePage" | "paragraphs" | "summaryBox" | "tableFigure" | "twoColumn" | "hangingEntries" | "timeline" | "reflective" | "caseBlocks" | "blank";

/** `key` is the i18n key of the heading (`papers.section.*`), `hint` the key of its guidance (`papers.hint.*`). */
export interface TemplateSection {
  key: string;
  hint: string;
}

export interface PaperTemplate {
  id: string;
  kind: PaperKind;
  group: PaperGroup;
  /** lucide-react component name, resolved by `KindIcon` in `src/components/ui.tsx`. */
  icon: string;
  /** Default word target for a paper of this kind. */
  targetWords: number;
  sections: TemplateSection[];
  motif: TemplateMotif;
}

/** Section with the hint of the same name: `s("methodology")` → papers.section.methodology + papers.hint.methodology. */
const s = (name: string, hint: string = name): TemplateSection => ({ key: `papers.section.${name}`, hint: `papers.hint.${hint}` });

const tpl = (kind: PaperKind, icon: string, targetWords: number, motif: TemplateMotif, sections: TemplateSection[]): PaperTemplate => ({
  id: kind,
  kind,
  group: KIND_GROUP[kind],
  icon,
  targetWords,
  sections,
  motif,
});

export const PAPER_TEMPLATES: PaperTemplate[] = [
  tpl("thesis", "GraduationCap", 20000, "titlePage", [
    s("abstract"),
    s("introduction"),
    s("literatureReview"),
    s("methodology"),
    s("results"),
    s("discussion"),
    s("conclusion"),
    s("references"),
    s("appendices"),
  ]),
  tpl("doctoral_thesis", "BookOpen", 80000, "titlePage", [
    s("abstract"),
    s("acknowledgements"),
    s("introduction"),
    s("literatureReview"),
    s("theoreticalFramework"),
    s("methodology"),
    s("results"),
    s("discussion"),
    s("conclusion"),
    s("references"),
    s("appendices"),
  ]),
  tpl("essay", "PenLine", 2000, "paragraphs", [
    s("introduction"),
    s("firstArgument"),
    s("secondArgument"),
    s("thirdArgument"),
    s("counterarguments"),
    s("conclusion"),
    s("references"),
  ]),
  tpl("reflective_essay", "NotebookPen", 1500, "reflective", [
    s("description"),
    s("feelings"),
    s("evaluation"),
    s("analysis"),
    s("conclusion"),
    s("actionPlan"),
    s("references"),
  ]),
  tpl("report", "FileBarChart", 4000, "summaryBox", [
    s("executiveSummary"),
    s("introduction"),
    s("methods"),
    s("findings"),
    s("discussion"),
    s("recommendations"),
    s("references"),
    s("appendices"),
  ]),
  tpl("lab_report", "FlaskConical", 2500, "tableFigure", [
    s("abstract"),
    s("introduction"),
    s("materialsMethods"),
    s("results"),
    s("discussion"),
    s("conclusion"),
    s("references"),
    s("appendixRawData"),
  ]),
  tpl("case_study", "Briefcase", 3000, "caseBlocks", [
    s("executiveSummary"),
    s("background"),
    s("problemStatement"),
    s("analysis"),
    s("alternatives"),
    s("recommendation"),
    s("implementationPlan"),
    s("references"),
  ]),
  tpl("literature_review", "LibraryBig", 5000, "hangingEntries", [
    s("introduction"),
    s("scopeSearch"),
    s("theme1", "theme"),
    s("theme2", "theme"),
    s("theme3", "theme"),
    s("gapsFuture"),
    s("conclusion"),
    s("references"),
  ]),
  tpl("research_proposal", "Lightbulb", 3000, "timeline", [
    s("summary"),
    s("backgroundRationale"),
    s("researchQuestions"),
    s("literatureReview"),
    s("methodology"),
    s("timeline"),
    s("ethics"),
    s("expectedOutcomes"),
    s("references"),
  ]),
  tpl("article", "Newspaper", 7000, "twoColumn", [
    s("abstract"),
    s("keywords"),
    s("introduction"),
    s("methods"),
    s("results"),
    s("discussion"),
    s("conclusion"),
    s("references"),
  ]),
  tpl("annotated_bibliography", "ListChecks", 2500, "hangingEntries", [s("introduction"), s("annotatedSources")]),
  tpl("blank", "FileText", 3000, "blank", []),
];

const BY_KIND = new Map<PaperKind, PaperTemplate>(PAPER_TEMPLATES.map((t) => [t.kind, t]));

/** The template of a kind. An unknown value (old or hand-edited data) falls back to the thesis template. */
export function templateFor(kind: PaperKind): PaperTemplate {
  return BY_KIND.get(kind) ?? (BY_KIND.get("thesis") as PaperTemplate);
}

/** Looks a `templateId` up (ids equal kinds in v1). */
export function templateById(id: unknown): PaperTemplate | undefined {
  return typeof id === "string" ? PAPER_TEMPLATES.find((t) => t.id === id) : undefined;
}

/**
 * i18n key of the label for the paper's description field: essays ask for the question or prompt, the reflective essay
 * for the experience, reports for the aim, theses and research for the research question, blank for a description.
 */
export function descLabelKey(kind: PaperKind): string {
  return kind === "reflective_essay" ? "papers.descLabel.reflective" : `papers.descLabel.${KIND_GROUP[kind]}`;
}

/**
 * i18n key of the reviewer's role for a paper (decision D5), for the session bar, the submit dialog and paper cards:
 * "papers.teacher.none" without `professorId`; "papers.teacher.advisorDoctoral" for a doctoral thesis (fr «Directeur de
 * thèse», es «Director de tesis»); "papers.teacher.advisor" for a thesis (fr «Directeur de mémoire»);
 * "papers.teacher.teacher" for every other kind. Same rule as `teacherLabel` in ./kinds.
 */
export function teacherRoleKey(t: { kind?: PaperKind | null; professorId?: string | null }): string {
  const label = teacherLabel(t);
  if (label === "none") return "papers.teacher.none";
  if (label === "teacher") return "papers.teacher.teacher";
  return paperKind(t) === "doctoral_thesis" ? "papers.teacher.advisorDoctoral" : "papers.teacher.advisor";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Initial HTML of a paper: `<h1>title</h1>` then, per section, `<h2>heading</h2><p data-hint="papers.hint.x"></p>`.
 * `tr` translates a key into the paper's writing language (not the interface language). Blank: `<h1>title</h1><p></p>`.
 */
export function buildTemplateHtml(template: PaperTemplate, title: string, tr: (key: string) => string): string {
  const head = `<h1>${escapeHtml(title.trim())}</h1>`;
  if (!template.sections.length) return `${head}<p></p>`;
  return head + template.sections.map((sec) => `<h2>${escapeHtml(tr(sec.key))}</h2><p data-hint="${escapeHtml(sec.hint)}"></p>`).join("");
}
