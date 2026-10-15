/**
 * Diagram figures drawn by Thesisfic (docs/papers.md §9, D26): Gantt timelines, PRISMA 2020 flow diagrams and
 * concept maps. Pure types shared by the validator, the three layouts and the SVG renderer.
 * Every diagram is either written by the student in a form (origin "human") or proposed by the Research copilot from
 * what the student wrote (origin "ai"); the numbers and labels always come from the student.
 */

/** Writing languages the renderer knows (same values as `WritingLanguage` in `src/lib/papers/kinds.ts`). */
export type DiagramLang = "en" | "es" | "fr" | "de";

/** The three diagram classes (`spec.figure`). */
export type DiagramFigure = "gantt" | "prisma" | "conceptMap";

/** One row of a timeline. Dates are `YYYY-MM-DD` or `YYYY-MM` (a month: first day for `start`, last day for `end`). */
export interface GanttTask {
  label: string;
  start: string;
  end: string;
  group?: string;
  milestone?: boolean;
}

/** One reason for excluding reports at the eligibility step (PRISMA 2020 "Reports excluded: Reason 1 (n = )"). */
export interface PrismaReason {
  label: string;
  n: number;
}

export interface ConceptNode {
  id: string;
  label: string;
}

export interface ConceptEdge {
  from: string;
  to: string;
  label?: string;
}

/** §9.2: the union exactly as specified. `counts` keys are the `PrismaCountKey` values below. */
export type DiagramSpec =
  | { figure: "gantt"; unit: "week" | "month"; tasks: GanttTask[] }
  | { figure: "prisma"; counts: Record<string, number>; reasons?: PrismaReason[]; otherMethods?: boolean }
  | { figure: "conceptMap"; nodes: ConceptNode[]; edges: ConceptEdge[] };

export type GanttSpec = Extract<DiagramSpec, { figure: "gantt" }>;
export type PrismaSpec = Extract<DiagramSpec, { figure: "prisma" }>;
export type ConceptMapSpec = Extract<DiagramSpec, { figure: "conceptMap" }>;

/* ------------------------------------------------------------------------------------------------------------------
 * PRISMA 2020 flow diagram for new systematic reviews (databases and registers, optional "other methods" column).
 * ---------------------------------------------------------------------------------------------------------------- */

/** Identification (left column): records identified and records removed before screening. */
export const PRISMA_IDENTIFICATION_KEYS = ["databases", "registers", "duplicatesRemoved", "automationRemoved", "otherRemoved"] as const;
/** Screening (left column). `reportsExcluded` is the total of the eligibility exclusions (its breakdown is `reasons`). */
export const PRISMA_SCREENING_KEYS = [
  "screened",
  "screenedExcluded",
  "soughtForRetrieval",
  "notRetrieved",
  "assessedForEligibility",
  "reportsExcluded",
] as const;
/** Included (bottom box). */
export const PRISMA_INCLUDED_KEYS = ["studiesIncluded", "reportsIncluded"] as const;
/** Optional right column "Identification of studies via other methods". */
export const PRISMA_OTHER_KEYS = [
  "websites",
  "organisations",
  "citationSearching",
  "otherSought",
  "otherNotRetrieved",
  "otherAssessed",
  "otherExcluded",
] as const;
/** The records identified via other methods (summed as "otherIdentified" in the arithmetic checks). */
export const PRISMA_OTHER_IDENTIFIED_KEYS = ["websites", "organisations", "citationSearching"] as const;

export type PrismaCountKey =
  | (typeof PRISMA_IDENTIFICATION_KEYS)[number]
  | (typeof PRISMA_SCREENING_KEYS)[number]
  | (typeof PRISMA_INCLUDED_KEYS)[number]
  | (typeof PRISMA_OTHER_KEYS)[number];

/** Every count key in diagram order (identification → screening → included → other methods). */
export const PRISMA_COUNT_KEYS: PrismaCountKey[] = [
  ...PRISMA_IDENTIFICATION_KEYS,
  ...PRISMA_SCREENING_KEYS,
  ...PRISMA_INCLUDED_KEYS,
  ...PRISMA_OTHER_KEYS,
];

/** Typed view of `PrismaSpec.counts` after `sanitizeDiagram` (unknown keys are dropped there). */
export type PrismaCounts = Partial<Record<PrismaCountKey, number>>;

/**
 * i18n key of the label printed for each count (English base in `messages.ts`, `DIAGRAM_MESSAGES`).
 * The other-methods sought / not retrieved / assessed / excluded boxes reuse the left-column wording, as in PRISMA 2020.
 */
export const PRISMA_LABEL_KEYS: Record<PrismaCountKey, string> = {
  databases: "data.diagram.prisma.databases",
  registers: "data.diagram.prisma.registers",
  duplicatesRemoved: "data.diagram.prisma.duplicates",
  automationRemoved: "data.diagram.prisma.automation",
  otherRemoved: "data.diagram.prisma.removedOther",
  screened: "data.diagram.prisma.screened",
  screenedExcluded: "data.diagram.prisma.screenedExcluded",
  soughtForRetrieval: "data.diagram.prisma.sought",
  notRetrieved: "data.diagram.prisma.notRetrieved",
  assessedForEligibility: "data.diagram.prisma.assessed",
  reportsExcluded: "data.diagram.prisma.reportsExcluded",
  studiesIncluded: "data.diagram.prisma.studiesIncluded",
  reportsIncluded: "data.diagram.prisma.reportsIncluded",
  websites: "data.diagram.prisma.websites",
  organisations: "data.diagram.prisma.organisations",
  citationSearching: "data.diagram.prisma.citationSearching",
  otherSought: "data.diagram.prisma.sought",
  otherNotRetrieved: "data.diagram.prisma.notRetrieved",
  otherAssessed: "data.diagram.prisma.assessed",
  otherExcluded: "data.diagram.prisma.reportsExcluded",
};

/* ------------------------------------------------------------------------------------------------------------------
 * Validation results
 * ---------------------------------------------------------------------------------------------------------------- */

/** Blocking errors from `sanitizeDiagram` (message key: `data.diagram.error.<code>`). */
export type DiagramErrorCode =
  | "invalid"
  | "unknown_figure"
  | "no_tasks"
  | "too_many_tasks"
  | "task_label_missing"
  | "invalid_date"
  | "end_before_start"
  | "range_too_long"
  | "invalid_count"
  | "prisma_missing"
  | "too_many_reasons"
  | "reason_label_missing"
  | "too_few_nodes"
  | "too_many_nodes"
  | "too_many_edges"
  | "node_id_missing"
  | "node_label_missing"
  | "duplicate_id"
  | "edge_unknown_node";

/** Non-blocking notices (message key: `data.diagram.warn.<code>`). */
export type DiagramWarningCode =
  | "label_truncated"
  | "edge_self_loop"
  | "edge_duplicate"
  | "prisma_screened"
  | "prisma_sought"
  | "prisma_assessed"
  | "prisma_reasons"
  | "prisma_reports_included"
  | "prisma_studies_reports"
  | "prisma_studies_included"
  | "prisma_other_sought"
  | "prisma_other_assessed";

/**
 * A non-blocking notice. PRISMA arithmetic notices carry `expected` (what the flow implies) and `actual` (what the
 * student wrote); `vars` holds the raw interpolation values (numbers unformatted: format them with the writing
 * language, see `diagramWarningText`).
 */
export interface DiagramWarning {
  code: DiagramWarningCode;
  field?: string;
  expected?: number;
  actual?: number;
  vars?: Record<string, string | number>;
}

export type SanitizeResult =
  | { ok: true; spec: DiagramSpec; warnings: DiagramWarning[] }
  | { ok: false; code: string; field?: string };

/* ------------------------------------------------------------------------------------------------------------------
 * Rendering
 * ---------------------------------------------------------------------------------------------------------------- */

/** Same shape as `translator(locale)` from `src/lib/i18n/dictionary.ts` (and `useT()`'s `t`). */
export type DiagramTranslator = (key: string, vars?: Record<string, string | number>) => string;

export interface RenderDiagramOptions {
  /** Target width in px (default 640). The SVG is viewBox-based; a concept map wider than this keeps its own width. */
  width?: number;
  lang: DiagramLang;
  tr: DiagramTranslator;
  /** Accessible name (`<title>`) and description (`<desc>`), already in the writing language. */
  title: string;
  desc: string;
  /** Count formatter for PRISMA (default: `Intl.NumberFormat` of `lang`, integers with grouping). */
  formatNumber?: (n: number) => string;
}

export interface RenderedDiagram {
  svg: string;
  width: number;
  height: number;
}

/** A drawn diagram body (SVG elements without the `<svg>` root) and its size. */
export interface DiagramDrawing {
  width: number;
  height: number;
  body: string;
}

/** Axis-aligned box used by the layouts (x, y = top-left corner). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
