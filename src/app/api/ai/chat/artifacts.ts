/**
 * The artifact pipeline of the Research copilot (docs/papers.md §3.5, D11, D12): blocks the model wrote (or specs
 * the demo planner chose) → validated against the attached datasets → computed by Thesisfic. Pure: no data-layer
 * access, so it runs the same in the route and in tests. The route sets `interactionId` on every artifact before it
 * stores or emits it; an artifact without one is never sent.
 */
import type { Artifact, ArtifactRef, ConversationMessage, Dataset, WritingLanguage } from "@/lib/db";
import { extractArtifactBlocks } from "@/lib/data/blocks";
import { artifactDigest, MAX_ARTIFACTS, planFromRequest, runAnalysis, SPEC_ERROR_CODES, validateSpec } from "@/lib/data/analysis";
import type { SpecErrorCode, ValidateResult } from "@/lib/data/analysis";
import type { Translate } from "@/lib/data/labels";
import { dataCard, sanitizeForPrompt } from "@/lib/data/summarize";
import { numbersAppearIn, sanitizeDiagram } from "@/lib/diagrams/validate";
import type { DiagramSpec } from "@/lib/diagrams/types";
import { parseLatex, supportedCommands } from "@/lib/math/latex";

/** A spreadsheet attached to the message: the source it came from and its parsed dataset. */
export interface SheetAttachment {
  sourceId: string;
  /** File name as the student sees it (`source.file.name`, else the source title). */
  fileName: string;
  dataset: Dataset;
}

/**
 * Codes of `event: artifact_error` beyond the analysis ones (UI key `data.error.<code>`):
 * - `no_sheet`: an analysis block with no spreadsheet attached;
 * - `diagram_invalid`: a diagram block `sanitizeDiagram` refused (`detail` = its code, UI key `data.diagram.error.<detail>`);
 * - `prisma_numbers`: a PRISMA block with numbers the student never wrote in the conversation (`missing`);
 * - `latex_invalid`: an equation block outside the LaTeX subset (`command` = the culprit, `reason` = the parser's code);
 * - inference codes from the tests (`too_few`, `constant`, `collinear`…), passed through from the analysis engine.
 */
export type ArtifactErrorCode = SpecErrorCode | "no_sheet" | "diagram_invalid" | "prisma_numbers" | "latex_invalid" | InferenceErrorCode;

/** Errors the inferential tests may raise (src/lib/data/inference: `InferenceError.code`). */
type InferenceErrorCode = "too_few" | "too_few_groups" | "length_mismatch" | "constant" | "invalid_table" | "too_many_predictors" | "too_many_levels" | "collinear" | "perfect_fit";

/** Body of `event: artifact_error`. Fields after `file` are optional additions for diagram and equation blocks. */
export interface ArtifactError {
  code: ArtifactErrorCode;
  column?: string;
  available?: string[];
  file?: string;
  /** Which kind of block failed, when it was a diagram or an equation. */
  kind?: "diagram" | "equation";
  /** diagram_invalid: the validation code (`data.diagram.error.<detail>`) and the field it concerns. */
  detail?: string;
  field?: string;
  /** prisma_numbers: the counts (digits) that appear in none of the student's messages. */
  missing?: string[];
  /** latex_invalid: the command or character Thesisfic does not draw ("\\href", "%", "&"…), and the parser's code. */
  command?: string;
  reason?: string;
}

export interface ArtifactRunOptions {
  /** The paper's writing language: titles, headers, notes and number formats. */
  lang: WritingLanguage;
  /** Translator of `lang`. */
  tr: Translate;
  /** New artifact id (`uid("art")` in the route). */
  newId: () => string;
  /** Set by the route once the interaction exists; "" until then. */
  interactionId?: string;
  now?: string;
  /**
   * Diagram and equation blocks are accepted (Research copilot only, docs/papers.md §9.3). Without it they are
   * refused with `unsupported_op`.
   */
  allowDiagrams?: boolean;
  /**
   * What the student wrote in this conversation (their messages, the current one included): every number of a
   * PRISMA block must appear in it (D26), else `prisma_numbers`.
   */
  studentTexts?: string[];
}

export interface ArtifactRun {
  artifacts: Artifact[];
  errors: ArtifactError[];
}

/** Data cards sent to the model in one turn: at most this many attached sheets, and this many characters in all. */
export const MAX_SHEETS_IN_PROMPT = 4;
export const MAX_DATA_CARDS_CHARS = 60000;

const norm = (s: string) => sanitizeForPrompt(s, 160).toLowerCase();
const stem = (s: string) => norm(s).replace(/\.[a-z0-9]{1,5}$/, "");

/**
 * The attachment a block refers to: its "file" field (the name in the data card), then the sheet name when only one
 * attachment has that sheet, then the first attachment the spec validates against. Returns the validation against
 * the chosen attachment (or, if none fits, against the first candidate, for the error card).
 */
export function pickSheetFor(raw: unknown, sheets: SheetAttachment[]): { sheet: SheetAttachment; result: ValidateResult } | null {
  if (!sheets.length) return null;
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  let candidates = sheets;
  const fileRef = typeof r.file === "string" ? r.file : typeof r.source === "string" ? r.source : "";
  if (fileRef.trim()) {
    const byName = sheets.filter((s) => norm(s.fileName) === norm(fileRef) || stem(s.fileName) === stem(fileRef));
    if (byName.length) candidates = byName;
  }
  if (candidates.length > 1 && typeof r.sheet === "string" && r.sheet.trim()) {
    const want = norm(r.sheet);
    const bySheet = candidates.filter((s) => s.dataset.sheets.some((sh) => norm(sh.name) === want));
    if (bySheet.length) candidates = bySheet;
  }
  let first: { sheet: SheetAttachment; result: ValidateResult } | null = null;
  for (const sheet of candidates) {
    const result = validateSpec(raw, sheet.dataset, 0);
    if (result.ok) return { sheet, result };
    if (!first) first = { sheet, result };
  }
  return first;
}

// ---------- Diagrams and equations (docs/papers.md §9.3, D26, D27) ----------

type BlockKind = "analysis" | "diagram" | "equation";
const FIGURES = ["gantt", "prisma", "conceptMap"];

/**
 * What a block asks for: `{"kind":"diagram",…DiagramSpec}`, `{"kind":"equation","latex":…}`, or an analysis spec.
 * Lenient with the obvious variants a model writes: `op` "diagram"/"equation", a bare `figure`, a bare `latex`, and
 * `{"op":"gantt","tasks":[…]}` (a timeline written in the conversation, not one computed from a sheet).
 */
export function blockKindOf(raw: unknown): BlockKind {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "analysis";
  const r = raw as Record<string, unknown>;
  if (r.kind === "diagram" || r.op === "diagram") return "diagram";
  if (r.kind === "equation" || r.op === "equation") return "equation";
  if (r.op === undefined && typeof r.figure === "string" && FIGURES.indexOf(r.figure) !== -1) return "diagram";
  if (r.op === undefined && typeof r.latex === "string") return "equation";
  if (r.op === "gantt" && Array.isArray(r.tasks)) return "diagram";
  return "analysis";
}

const TITLE_KEYS: Record<DiagramSpec["figure"] | "equation", string> = {
  gantt: "api.copilot.title.gantt",
  prisma: "api.copilot.title.prisma",
  conceptMap: "api.copilot.title.conceptMap",
  equation: "api.copilot.title.equation",
};

/** A diagram or equation artifact: no data source (D12 artifacts always carry their interaction, set by the route). */
function proposedArtifact(kind: "diagram" | "equation", title: string, opts: ArtifactRunOptions): Artifact {
  return {
    id: opts.newId(),
    interactionId: opts.interactionId ?? "",
    kind,
    title,
    spec: { op: kind },
    sourceId: "",
    fileName: "",
    sheet: "",
    datasetSha256: "",
    n: 0,
    lang: opts.lang,
    table: { columns: [], rows: [], precision: [] },
    computedAt: opts.now ?? new Date().toISOString(),
  };
}

/**
 * A diagram block: sanitised and checked (`sanitizeDiagram`, with the PRISMA arithmetic as notices). A PRISMA
 * diagram is refused unless every number in it appears in what the student wrote in the conversation: the copilot
 * never invents or derives a count (D26).
 */
export function diagramArtifact(raw: unknown, opts: ArtifactRunOptions): { artifact: Artifact } | { error: ArtifactError } {
  const input: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  delete input.kind;
  if (input.op === "gantt" && input.figure === undefined) input.figure = "gantt";
  delete input.op;
  const r = sanitizeDiagram(input);
  if (!r.ok) return { error: { code: "diagram_invalid", kind: "diagram", detail: r.code, ...(r.field ? { field: r.field } : {}) } };
  if (r.spec.figure === "prisma") {
    const missing = numbersAppearIn(r.spec, opts.studentTexts || []);
    if (missing.length) return { error: { code: "prisma_numbers", kind: "diagram", missing: missing.slice(0, 30) } };
  }
  const artifact = proposedArtifact("diagram", opts.tr(TITLE_KEYS[r.spec.figure]), opts);
  artifact.diagram = r.spec;
  if (r.warnings.length) artifact.warnings = r.warnings;
  return { artifact };
}

const SUPPORTED = new Set(supportedCommands());
/** JSON escapes a model may have written for a single backslash: "\\frac" sent as "\frac" arrives as form feed + "rac". */
const JSON_ESCAPED: Record<string, string> = { "\b": "b", "\f": "f", "\n": "n", "\r": "r", "\t": "t" };

/**
 * Undoes the JSON escapes a model produces when it writes one backslash before a LaTeX command: a backspace, form
 * feed, line feed, carriage return or tab directly followed by letters becomes the backslash command, but only when
 * that command exists in the subset ("\\theta", "\\frac", "\\neq", "\\right"); any other character is left as it is.
 */
export function repairJsonEscapes(latex: string): string {
  return latex.replace(/([\b\f\n\r\t])([A-Za-z]+)/g, (all, ctrl: string, letters: string) => {
    const name = JSON_ESCAPED[ctrl] + letters;
    return SUPPORTED.has(name) ? `\\${name}` : all;
  });
}

/** An equation block: LaTeX within the subset (`parseLatex`), else `latex_invalid` with the culprit command. */
export function equationArtifact(raw: unknown, opts: ArtifactRunOptions): { artifact: Artifact } | { error: ArtifactError } {
  const r = raw as Record<string, unknown>;
  const latex = repairJsonEscapes(typeof r.latex === "string" ? r.latex : "").trim();
  const parsed = parseLatex(latex);
  if (!parsed.ok) {
    const e: ArtifactError = { code: "latex_invalid", kind: "equation", reason: parsed.error.code };
    if (parsed.error.command) e.command = sanitizeForPrompt(parsed.error.command, 40);
    return { error: e };
  }
  const artifact = proposedArtifact("equation", opts.tr(TITLE_KEYS.equation), opts);
  artifact.equation = { latex, display: r.display !== false };
  return { artifact };
}

/** Validates and computes up to 4 specs. Invalid ones become errors; nothing throws. */
export function computeArtifacts(specs: unknown[], sheets: SheetAttachment[], opts: ArtifactRunOptions): ArtifactRun {
  const artifacts: Artifact[] = [];
  const errors: ArtifactError[] = [];
  specs.forEach((raw, index) => {
    if (artifacts.length >= MAX_ARTIFACTS) {
      errors.push({ code: "invalid_spec" });
      return;
    }
    const blockKind = blockKindOf(raw);
    if (blockKind !== "analysis") {
      if (!opts.allowDiagrams) {
        errors.push({ code: "unsupported_op", kind: blockKind });
        return;
      }
      const made = blockKind === "diagram" ? diagramArtifact(raw, opts) : equationArtifact(raw, opts);
      if ("error" in made) errors.push(made.error);
      else artifacts.push(made.artifact);
      return;
    }
    const pick = pickSheetFor(raw, sheets);
    if (!pick) {
      errors.push({ code: "no_sheet" });
      return;
    }
    const { sheet, result } = pick;
    if (!result.ok) {
      const e: ArtifactError = { code: result.code, available: result.available, file: sheet.fileName };
      if (result.column !== undefined) e.column = result.column;
      errors.push(e);
      return;
    }
    try {
      artifacts.push(
        runAnalysis(result.spec, sheet.dataset, { sourceId: sheet.sourceId, fileName: sheet.fileName, interactionId: opts.interactionId ?? "", lang: opts.lang, index, id: opts.newId(), now: opts.now }, opts.tr)
      );
    } catch (err) {
      // The engine throws `Error(code)`; the inferential tests may throw an `InferenceError` with a `code`.
      const e = err as { code?: unknown; message?: unknown } | null;
      const code = typeof e?.code === "string" ? e.code : typeof e?.message === "string" ? e.message : "";
      errors.push({ code: KNOWN_CODES.has(code) ? (code as ArtifactErrorCode) : "invalid_spec", file: sheet.fileName });
    }
  });
  return { artifacts, errors };
}

/** Codes passed through to the error card: the engine's (`SPEC_ERROR_CODES`) and the inferential tests'. */
const KNOWN_CODES = new Set<string>([...SPEC_ERROR_CODES, "too_few", "too_few_groups", "length_mismatch", "constant", "invalid_table", "too_many_predictors", "too_many_levels", "collinear", "perfect_fit"]);

/**
 * A finished model answer: its ```thesisfic-artifact blocks taken out (≤ 4 of ≤ 4 KB), validated and computed.
 * `text` is the answer without its blocks (what is stored, fingerprinted and previewed). Unreadable blocks become
 * `invalid_spec` errors; blocks with no sheet attached become `no_sheet` errors.
 */
export function artifactsFromAnswer(text: string, sheets: SheetAttachment[], opts: ArtifactRunOptions): ArtifactRun & { text: string } {
  const extracted = extractArtifactBlocks(text);
  const run = computeArtifacts(extracted.specs, sheets, opts);
  for (let i = 0; i < extracted.invalid; i++) run.errors.push({ code: "invalid_spec" });
  return { text: extracted.text, artifacts: run.artifacts, errors: run.errors };
}

/**
 * Demo mode (no model) with sheets attached: the planner reads the request in plain words (`planFromRequest`) and
 * Thesisfic computes what it chose, from the first attachment that yields a plan.
 */
export function demoArtifacts(request: string, sheets: SheetAttachment[], opts: ArtifactRunOptions & { planTr: Translate }): ArtifactRun & { sheet?: SheetAttachment } {
  for (const sheet of sheets) {
    const specs = planFromRequest(request, sheet.dataset, opts.planTr);
    if (specs.length) return { sheet, ...computeArtifacts(specs.slice(0, MAX_ARTIFACTS), [sheet], opts) };
  }
  return { sheet: sheets[0], artifacts: [], errors: [] };
}

/** Data cards (D11: no rows) of the attached sheets, within the prompt budget. */
export function dataCards(sheets: SheetAttachment[]): string[] {
  const out: string[] = [];
  let used = 0;
  for (const s of sheets.slice(0, MAX_SHEETS_IN_PROMPT)) {
    let card = dataCard(s.dataset, s.fileName);
    if (used + card.length > MAX_DATA_CARDS_CHARS) card = card.slice(0, Math.max(0, MAX_DATA_CARDS_CHARS - used)) + "\n… (data card cut at the prompt size limit)";
    out.push(card);
    used += card.length;
    if (used >= MAX_DATA_CARDS_CHARS) break;
  }
  return out;
}

/**
 * Model-facing digests (aggregates only) of the last `k` artifacts of a conversation, oldest first. Only artifacts
 * computed from a sheet attached to this turn count (a file removed or not attached is not sent again), and their
 * category labels follow D11 against that sheet's columns (`artifactDigest`). `trFor` gives the translator of an
 * artifact's language, so "Total", "Other", "Yes" and "No" stay readable.
 */
export function lastArtifactDigests(messages: Pick<ConversationMessage, "artifacts">[], sheets: SheetAttachment[], k = 3, trFor?: (lang: WritingLanguage) => Translate): string[] {
  const bySource = new Map(sheets.map((s) => [s.sourceId, s]));
  const all: Artifact[] = [];
  for (const m of messages) {
    for (const a of m.artifacts || []) {
      if (!a || a.kind === "equation") continue; // equations: nothing to summarise, the model wrote the notation
      if (a.kind === "diagram" && !a.sourceId) all.push(a); // drawn from the conversation: no file to be attached
      else if (bySource.has(a.sourceId)) all.push(a);
    }
  }
  return all.slice(-k).map((a) => {
    if (a.kind === "diagram") return diagramDigest(a);
    if (a.kind === "test") return testDigest(a);
    const sheet = (bySource.get(a.sourceId) as SheetAttachment).dataset.sheets.find((s) => s.name === a.sheet);
    return artifactDigest(a, { columns: sheet ? sheet.columns : [], tr: trFor ? trFor(a.lang) : undefined });
  });
}

/** A diagram for the model: its class and its counts only (no labels, no PRISMA numbers). */
export function diagramDigest(a: Pick<Artifact, "diagram">): string {
  const d = a.diagram;
  if (!d) return "Diagram (no content).";
  if (d.figure === "gantt") {
    const groups = new Set(d.tasks.map((t) => t.group).filter(Boolean)).size;
    const milestones = d.tasks.filter((t) => t.milestone).length;
    return `Diagram: timeline (Gantt) with ${d.tasks.length} tasks${groups ? ` in ${groups} groups` : ""}${milestones ? `, ${milestones} milestones` : ""}, by ${d.unit}.`;
  }
  if (d.figure === "prisma") {
    const counts = Object.keys(d.counts || {}).length;
    return `Diagram: PRISMA 2020 flow diagram with ${counts} counts${d.reasons && d.reasons.length ? ` and ${d.reasons.length} exclusion reasons` : ""}${d.otherMethods ? ", other methods included" : ""}.`;
  }
  return `Diagram: concept map with ${d.nodes.length} concepts and ${d.edges.length} links.`;
}

/**
 * A test result for the model: the operation, its column names, n and the statistic line ("Welch's t(37.2) = 2.31,
 * p = .026, d = 0.71"). No title and no group labels (they may be labels the data card does not show).
 */
export function testDigest(a: Pick<Artifact, "spec" | "n" | "fileName" | "sheet" | "test">): string {
  const sp = a.spec;
  const cols = [sp.value, sp.by, sp.x, sp.y, sp.row, sp.col, ...(sp.columns || []), ...(sp.predictors || [])].filter((c): c is string => typeof c === "string" && !!c);
  const fields = cols.length ? ` of ${cols.map((c) => sanitizeForPrompt(c, 60)).join(", ")}` : "";
  const line = a.test?.line ? sanitizeForPrompt(a.test.line, 300) : "(no statistic)";
  return `Test (${sp.op}${fields}, n = ${a.n}, ${sanitizeForPrompt(a.fileName, 80)} · ${sanitizeForPrompt(a.sheet, 60)}): ${line}`;
}

/** What an `AIInteraction` records of the artifacts of its answer. */
export function artifactRefs(artifacts: Artifact[]): ArtifactRef[] {
  return artifacts.map((a) => ({ id: a.id, kind: a.kind, title: a.title, sourceId: a.sourceId }));
}

/** `responsePreview` of an answer whose text may be empty once its blocks are taken out. */
export function previewOf(text: string, artifacts: Artifact[]): string {
  const t = text.trim();
  if (t) return t.slice(0, 200);
  return artifacts.map((a) => a.title).join(" · ").slice(0, 200);
}
