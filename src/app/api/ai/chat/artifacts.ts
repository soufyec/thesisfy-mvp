import { fullRange } from "@/lib/data/workspace";
/**
 * The artifact pipeline of the Research copilot (docs/papers.md §3.5, D11, D12): blocks the model wrote (or specs
 * the demo planner chose) → validated against the attached datasets → computed by Thesisfic. Pure: no data-layer
 * access, so it runs the same in the route and in tests. The route sets `interactionId` on every artifact before it
 * stores or emits it; an artifact without one is never sent.
 */
import type { Artifact, ArtifactRef, ConversationMessage, Dataset, WritingLanguage } from "@/lib/db";
import { extractArtifactBlocks } from "@/lib/data/blocks";
import { artifactDigest, MAX_ARTIFACTS, planFromRequest, SPEC_ERROR_CODES, tryRunAnalysis, validateSpec } from "@/lib/data/analysis";
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
 * - `equation_numbers`: an equation block with numbers that are neither in the student's messages nor in a result
 *   Thesisfic computed in this conversation (`missing`, D11: the copilot never invents a coefficient);
 * - inference codes from the tests (`too_few`, `constant`, `collinear`…), passed through from the analysis engine.
 */
export type ArtifactErrorCode = SpecErrorCode | "no_sheet" | "diagram_invalid" | "prisma_numbers" | "latex_invalid" | "equation_numbers" | InferenceErrorCode;

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
  /** prisma_numbers / equation_numbers: the numbers that appear in none of the student's messages (nor, for an equation, in a computed result). */
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
  /**
   * Artifacts computed earlier in this conversation: an equation block may use their numbers (a regression's
   * coefficients, a test statistic), besides the student's (D11). Equations the model proposed never count.
   */
  priorArtifacts?: Artifact[];
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
    // The engine's own errors keep their column (the group with too few values, the unknown level…), so the card
    // can name it; anything unexpected becomes `invalid_spec`.
    const ran = tryRunAnalysis(result.spec, sheet.dataset, { sourceId: sheet.sourceId, fileName: sheet.fileName, interactionId: opts.interactionId ?? "", lang: opts.lang, index, id: opts.newId(), now: opts.now }, opts.tr);
    if (ran.ok) {
      const sh = sheet.dataset.sheets.find(s => s.name === ran.artifact.sheet) || sheet.dataset.sheets[0];
      ran.artifact.dataSelection = { sheet: sheet.dataset.selection?.sheet ?? sheet.dataset.sheets.indexOf(sh), range: sheet.dataset.selection?.range || fullRange(sh), output: "analysis", title: ran.artifact.title, chartType: ran.artifact.chart?.type || "bar", x: result.spec.x || result.spec.by || result.spec.column || "", ys: result.spec.columns || [result.spec.value || result.spec.y || result.spec.column || ""].filter(Boolean), analysis: result.spec };
      artifacts.push(ran.artifact);
    }
    else {
      const e: ArtifactError = { code: KNOWN_CODES.has(ran.code) ? (ran.code as ArtifactErrorCode) : "invalid_spec", available: ran.available, file: sheet.fileName };
      if (ran.column !== undefined) e.column = ran.column;
      errors.push(e);
    }
  });
  checkEquationNumbers(artifacts, errors, opts);
  return { artifacts, errors };
}

// ---------- Numbers of proposed equations (D11) ----------

/**
 * Numbers of an equation that need a source: decimals, and integers of 3 digits or more. Indices, exponents and
 * small constants (x², i = 1, ½, 2π) do not. LaTeX's decimal comma `{,}` reads as a decimal point.
 */
export function equationNumbers(latex: string): string[] {
  const out: string[] = [];
  const re = /\d+(?:(?:\.|\{,\})\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(latex))) {
    const s = m[0].replace("{,}", ".");
    if (s.indexOf(".") === -1 && s.replace(/^0+/, "").length < 3) continue;
    if (out.indexOf(s) === -1) out.push(s);
  }
  return out;
}

/** Every number written in `text`, read with a decimal point, a decimal comma and as thousands groups. */
function readNumbers(text: string, into: number[]) {
  const re = /\d+(?:(?:\.|,|\{,\})\d+)*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const parts = m[0].replace(/\{,\}/g, ",").split(/[.,]/);
    if (parts.length === 1) into.push(Number(parts[0]));
    else {
      into.push(Number(parts.slice(0, -1).join("") + "." + parts[parts.length - 1]));
      into.push(Number(parts.join("")));
    }
  }
}

/** The numbers of an artifact Thesisfic computed: table cells, the test's statistics and line, a fitted equation. */
function artifactNumbers(a: Artifact, into: number[]) {
  into.push(a.n);
  for (const row of a.table?.rows || []) {
    for (const c of row) {
      if (typeof c === "number") into.push(c);
      else if (typeof c === "string") readNumbers(c, into);
    }
  }
  if (a.test) {
    into.push(a.test.statistic.value, a.test.p);
    const df = a.test.statistic.df;
    if (Array.isArray(df)) into.push(df[0], df[1]);
    else if (typeof df === "number") into.push(df);
    if (a.test.effect) into.push(a.test.effect.value);
    if (a.test.ci) into.push(a.test.ci[0], a.test.ci[1]);
    readNumbers(a.test.line || "", into);
  }
  if (a.equation && a.spec.op !== "equation") readNumbers(a.equation.latex, into);
}

/** A written number matches a known one when it is that number to the precision it is written with. */
function sourced(written: string, known: number[]): boolean {
  const e = Number(written);
  const decimals = (written.split(".")[1] || "").length;
  const unit = Math.pow(10, -decimals);
  return known.some((v) => typeof v === "number" && isFinite(v) && Math.abs(Math.abs(v) - e) < unit - 1e-12);
}

/**
 * Proposed equations whose numbers are neither the student's nor computed (in this answer or earlier in the
 * conversation) are refused with `equation_numbers`: the copilot may write a model's form, never its coefficients.
 */
function checkEquationNumbers(artifacts: Artifact[], errors: ArtifactError[], opts: ArtifactRunOptions) {
  const proposed = artifacts.filter((a) => a.kind === "equation" && a.spec.op === "equation" && a.equation && equationNumbers(a.equation.latex).length);
  if (!proposed.length) return;
  const known: number[] = [];
  for (const t of opts.studentTexts || []) if (typeof t === "string") readNumbers(t, known);
  for (const a of (opts.priorArtifacts || []).concat(artifacts)) if (a.spec?.op !== "equation") artifactNumbers(a, known);
  for (const a of proposed) {
    const missing = equationNumbers((a.equation as { latex: string }).latex).filter((x) => !sourced(x, known));
    if (!missing.length) continue;
    artifacts.splice(artifacts.indexOf(a), 1);
    errors.push({ code: "equation_numbers", kind: "equation", missing: missing.slice(0, 30) });
  }
}

/** Codes passed through to the error card: the engine's (`SPEC_ERROR_CODES`, the inferential tests' included). */
const KNOWN_CODES = new Set<string>(SPEC_ERROR_CODES);

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
