/**
 * The analysis engine of the Research copilot (docs/papers.md §1.4, §3.4, §9, D11, D13, D24–D26). Pure and
 * client-safe: `import type` from the app, relative runtime imports only, translations through a `Translate` parameter.
 *
 * The model (or the demo planner) only proposes an `AnalysisSpec`; `validateSpec` checks it against the dataset and
 * `runAnalysis` computes every number from the student's data. Titles, headers and notes are written with the
 * translator of the paper's writing language; chips (`suggestions`) with the translator of the interface language.
 *
 * Limits: categories > 30 → top 29 + "Other"; chart series > 4 (bars, lines) or > 3 (scatter) → the largest groups +
 * "Other" (`other: true`); crosstab tables ≤ 6 category columns (top 5 + "Other"); tables ≤ 200 rows; scatter
 * charts ≤ 500 points (deterministic even sampling); correlation and scatter need n ≥ 3.
 *
 * Extension (§9): pie charts (≤ 12 unordered categories, the 4 largest + "Other" as slices: D17 allows four series
 * colours), box plots (Tukey, ≤ 12 groups), inferential tests (artifact kind "test": an APA results table, the
 * statistic line in `test.line`, n ≥ 3 per group), the fitted regression equation (`artifact.equation`) and timelines
 * from task/start/end columns (artifact kind "diagram"). Test notes: `test.notes` holds every note of the test (what
 * the card shows); `table.notes` holds the ones a reader of the inserted table needs (missing values, approximations,
 * reference levels, compared groups, a cut file). Definitions of the effect size (which d) stay in the card only.
 */
import type { AnalysisOp, AnalysisSpec, Artifact, ArtifactTable, ChartData, Dataset, DatasetCell, DatasetColumn, DatasetSheet, WritingLanguage } from "@/lib/db";
import * as S from "./stats";
import { capFirst, formatNumber, inSentence, listJoin } from "./labels";
import type { Translate } from "./labels";
import { cellText, dateMs, isoDate, sanitizeForPrompt } from "./summarize";
import { artifactCellPrecision } from "./artifactHtml";
import {
  chiSquareIndependence,
  coefficientTable,
  isInferenceError,
  kruskalWallis,
  mannWhitneyU,
  noteText,
  oneWayAnova,
  olsRegression,
  pairedTTest,
  pearsonTest,
  spearmanTest,
  stripLeadingZero,
  toTestResult,
  welchTTest,
  MAX_LEVELS as MAX_PREDICTOR_LEVELS,
  MAX_PREDICTORS,
  MIN_N,
} from "./inference";
import type { InferenceNote, InferenceResult, Predictor, RegressionResult, TestResult } from "./inference";
import { GANTT_MAX_TASKS, sanitizeDiagram } from "../diagrams/validate";
import type { DiagramSpec, DiagramWarning } from "../diagrams/types";
import { parseLatex } from "../math/latex";

export const ANALYSIS_OPS: AnalysisOp[] = [
  "describe",
  "frequencies",
  "crosstab",
  "groupSummary",
  "correlation",
  "distribution",
  "trend",
  "scatter",
  "ttest",
  "pairedTtest",
  "anova",
  "chisquare",
  "correlationTest",
  "mannWhitney",
  "kruskal",
  "regression",
  "gantt",
];
/** Operations whose artifact is an inferential test (kind "test"). */
export const TEST_OPS: AnalysisOp[] = ["ttest", "pairedTtest", "anova", "chisquare", "correlationTest", "mannWhitney", "kruskal", "regression"];
const CHART_TYPES = ["bar", "groupedBar", "line", "scatter", "histogram", "pie", "box", "none"] as const;
const STATS = ["mean", "median", "sum", "count"] as const;

/** Categories kept before folding the rest into "Other" (29 + Other). */
export const MAX_CATEGORIES = 30;
/** Series drawn in bar and line charts before "Other". */
export const MAX_BAR_SERIES = 4;
/** Series drawn in scatter charts before "Other". */
export const MAX_SCATTER_SERIES = 3;
/** Category columns of a crosstab table (5 + Other) when it has no chart. */
export const MAX_CROSSTAB_COLUMNS = 6;
export const MAX_TABLE_ROWS = 200;
export const MAX_SCATTER_POINTS = 500;
export const MAX_DESCRIBE_COLUMNS = 12;
export const MAX_CORRELATION_COLUMNS = 7;
/** Specs per copilot answer. */
export const MAX_ARTIFACTS = 4;
/**
 * Slices of a pie chart: the 4 largest categories (the four series colours, D17) + a grey "Other". D25 asked for
 * 5 + "Other"; the palette has four validated series colours, so the fifth largest category joins "Other".
 */
export const MAX_PIE_SLICES = 5;
/** A pie chart is drawn for 2 to 12 unordered categories; with more, the shares are shown as bars (D25). */
export const MAX_PIE_CATEGORIES = 12;
/** Boxes of a box plot (D25): the 11 largest groups + "Other" beyond 12. */
export const MAX_BOX_GROUPS = 12;
/** Outliers kept per box (the most extreme first); the table and the note count all of them. */
export const MAX_BOX_OUTLIERS = 100;
/** Groups of a k-group test (ANOVA, Kruskal–Wallis) and levels of each variable of a chi-square test. */
export const MAX_TEST_GROUPS = 12;
/** Category columns of a chi-square table (the variable with fewer levels goes across): ≤ 8 columns in all. */
export const MAX_CHISQUARE_COLUMNS = 6;
/** Tasks of a timeline built from a sheet (the first ones, in sheet order). */
export const MAX_GANTT_TASKS = GANTT_MAX_TASKS;

// ---------- Columns ----------

/** The columns of a sheet by what they can be used for (docs/papers.md §3.4). */
export interface ColumnClasses {
  /** Number columns that are neither identifiers nor time: columns with decimals first, then the larger coefficient of variation. */
  measures: DatasetColumn[];
  /** Category columns with 2–12 distinct values (what chips and the planner group by), in column order. */
  categories: DatasetColumn[];
  /** Category columns with 2–30 distinct values (what a table can group by), in column order. */
  tableCategories: DatasetColumn[];
  /** Dates, and whole-number year columns. */
  time: DatasetColumn[];
  identifiers: DatasetColumn[];
  freeText: DatasetColumn[];
}

export function classifyColumns(sheet: Pick<DatasetSheet, "columns">): ColumnClasses {
  const cols = sheet.columns;
  const cv = (c: DatasetColumn) => (c.sd !== undefined && c.mean ? Math.abs(c.sd / c.mean) : 0);
  const measures = cols
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.role === "measure" && c.type === "number")
    .sort((a, b) => Number((b.c.precision ?? 0) > 0) - Number((a.c.precision ?? 0) > 0) || cv(b.c) - cv(a.c) || a.i - b.i)
    .map(({ c }) => c);
  const cat = cols.filter((c) => c.role === "category");
  return {
    measures,
    categories: cat.filter((c) => c.distinct >= 2 && c.distinct <= 12),
    tableCategories: cat.filter((c) => c.distinct >= 2 && c.distinct <= 30),
    time: cols.filter((c) => c.role === "time"),
    identifiers: cols.filter((c) => c.role === "identifier"),
    freeText: cols.filter((c) => c.role === "freeText"),
  };
}

const isNumericCol = (c: DatasetColumn) => c.type === "number" && c.role !== "identifier" && c.role !== "empty";
/** A column a table can group by: categories, booleans, time, and number columns with at most 30 distinct values. */
const isGroupable = (c: DatasetColumn) =>
  c.role === "category" || c.role === "time" || (c.type === "number" && c.role === "measure" && c.distinct <= MAX_CATEGORIES);

function plain(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
function normKey(s: string): string {
  return plain(String(s ?? "")).replace(/[^a-z0-9]+/g, " ").trim();
}

/** Index of the column a spec names: exact name, then name or label ignoring case, then ignoring punctuation. −1 if none. */
export function resolveColumn(sheet: Pick<DatasetSheet, "columns">, ref: unknown): number {
  if (typeof ref !== "string" || !ref.trim()) return -1;
  const r = ref.trim();
  const cols = sheet.columns;
  let i = cols.findIndex((c) => c.name === r);
  if (i !== -1) return i;
  const low = r.toLowerCase();
  i = cols.findIndex((c) => c.name.toLowerCase() === low || c.label.toLowerCase() === low);
  if (i !== -1) return i;
  const k = normKey(r);
  if (!k) return -1;
  return cols.findIndex((c) => normKey(c.name) === k || normKey(c.label) === k);
}

function sheetIndexOf(dataset: Pick<Dataset, "sheets">, sheet: unknown, fallback = 0): number {
  if (typeof sheet === "string" && sheet.trim()) {
    const s = sheet.trim();
    let i = dataset.sheets.findIndex((x) => x.name === s);
    if (i === -1) i = dataset.sheets.findIndex((x) => normKey(x.name) === normKey(s));
    return i;
  }
  if (fallback >= 0 && fallback < dataset.sheets.length) return fallback;
  return dataset.sheets.length ? 0 : -1;
}

// ---------- Validation ----------

export type SpecErrorCode =
  | "invalid_spec"
  | "unsupported_op"
  | "unknown_sheet"
  | "unknown_column"
  | "missing_column"
  | "not_numeric"
  | "not_categorical"
  | "no_numeric"
  | "no_data"
  // Inferential tests, box plots and timelines (§9).
  | "unknown_level"
  | "too_few"
  | "too_few_groups"
  | "too_many_levels"
  | "too_many_predictors"
  | "constant"
  | "collinear"
  | "perfect_fit"
  | "not_date"
  | "range_too_long";

/** Every code `validateSpec`, `runAnalysis` and `tryRunAnalysis` can return (UI copy: `data.error.<code>`). */
export const SPEC_ERROR_CODES: SpecErrorCode[] = [
  "invalid_spec",
  "unsupported_op",
  "unknown_sheet",
  "unknown_column",
  "missing_column",
  "not_numeric",
  "not_categorical",
  "no_numeric",
  "no_data",
  "unknown_level",
  "too_few",
  "too_few_groups",
  "too_many_levels",
  "too_many_predictors",
  "constant",
  "collinear",
  "perfect_fit",
  "not_date",
  "range_too_long",
];

export type ValidateResult = { ok: true; spec: AnalysisSpec } | { ok: false; code: SpecErrorCode; column?: string; available: string[] };

/** An invalid spec, or data a test cannot use. `message` is the code, so `new Error(code)` callers keep working. */
class SpecError extends Error {
  constructor(public code: SpecErrorCode, public column?: string, public available: string[] = []) {
    super(code);
    this.name = "SpecError";
    Object.setPrototypeOf(this, SpecError.prototype); // es5 target: keep instanceof working
  }
}

const isSpecError = (e: unknown): e is SpecError => !!e && typeof e === "object" && (e as { name?: unknown }).name === "SpecError";

function failure(e: SpecError): { ok: false; code: SpecErrorCode; column?: string; available: string[] } {
  const out: { ok: false; code: SpecErrorCode; column?: string; available: string[] } = { ok: false, code: e.code, available: e.available.slice(0, 60) };
  if (e.column !== undefined) out.column = sanitizeForPrompt(e.column, 80);
  return out;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/**
 * Checks a spec proposed by the model (or the planner) against the dataset and returns it normalised: canonical
 * sheet and column names, only the fields its operation uses, defaults filled in. A frequency request on a number
 * column with more than 30 values becomes a distribution, and a distribution of a category becomes frequencies; a
 * distribution with `by` or `chart: "box"` is a box plot. Two-group tests get their two `levels` (the two largest
 * groups unless named). Errors carry the offending column and the columns that would fit (`available`) for the
 * "could not compute" card. Diagram and equation specs are not computed from data: they are `unsupported_op` here.
 */
export function validateSpec(spec: unknown, dataset: Pick<Dataset, "sheets">, sheetIndex = 0): ValidateResult {
  try {
    return { ok: true, spec: normalizeSpec(spec, dataset, sheetIndex) };
  } catch (e) {
    if (isSpecError(e)) return failure(e);
    return { ok: false, code: "invalid_spec", available: [] };
  }
}

/** Names that say a date column is the start or the end of a task (en/es/fr/de). */
const START_NAME = /(^|[^a-z])(start\w*|begin\w*|from|inicio|comienzo|desde|debut|depart|beginn\w*|anfang|von)([^a-z]|$)/;
const END_NAME = /(^|[^a-z])(end\w*|finish\w*|to|until|due|fin|final|hasta|termino|echeance|ende|bis|frist)([^a-z]|$)/;

function normalizeSpec(raw: unknown, dataset: Pick<Dataset, "sheets">, sheetIndex: number): AnalysisSpec {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SpecError("invalid_spec");
  const r = raw as Record<string, unknown>;
  const op = str(r.op);
  if (!op) throw new SpecError("invalid_spec");
  if ((ANALYSIS_OPS as string[]).indexOf(op) === -1) throw new SpecError("unsupported_op", op);
  const si = sheetIndexOf(dataset, r.sheet, sheetIndex);
  if (si === -1) throw new SpecError("unknown_sheet", str(r.sheet) ?? "", dataset.sheets.map((s) => s.name));
  const sheet = dataset.sheets[si];
  const cols = sheet.columns;
  const names = (pred: (c: DatasetColumn) => boolean) => cols.filter(pred).map((c) => c.name);
  const all = names((c) => c.role !== "empty");
  const numericNames = names(isNumericCol);
  const groupNames = names(isGroupable);
  const dateNames = names((c) => c.type === "date");
  const chart = typeof r.chart === "string" && (CHART_TYPES as readonly string[]).indexOf(r.chart) !== -1 ? (r.chart as AnalysisSpec["chart"]) : undefined;
  const stat = typeof r.stat === "string" && (STATS as readonly string[]).indexOf(r.stat) !== -1 ? (r.stat as AnalysisSpec["stat"]) : undefined;
  const columnsField = Array.isArray(r.columns) ? r.columns.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 24) : [];

  const find = (ref: string | undefined): number => {
    if (ref === undefined) return -1;
    const i = resolveColumn(sheet, ref);
    if (i === -1) throw new SpecError("unknown_column", ref, all);
    return i;
  };
  /** First of the candidate fields that names a column. */
  const pick = (...refs: (string | undefined)[]): number => {
    for (const ref of refs) if (ref !== undefined) return find(ref);
    return -1;
  };
  const needNumeric = (i: number) => {
    const c = cols[i];
    if (c.role === "empty" || c.n === 0) throw new SpecError("no_data", c.name, numericNames);
    if (!isNumericCol(c)) throw new SpecError("not_numeric", c.name, numericNames);
  };
  const needGroup = (i: number) => {
    const c = cols[i];
    if (c.role === "empty" || c.n === 0) throw new SpecError("no_data", c.name, groupNames);
    if (c.role === "identifier" || c.role === "freeText" || c.type === "empty") throw new SpecError("not_categorical", c.name, groupNames);
    // Measured numbers with many values cannot be groups (they would make 30 meaningless bars).
    if (c.type === "number" && c.role === "measure" && c.distinct > MAX_CATEGORIES) throw new SpecError("not_categorical", c.name, groupNames);
  };
  const out: AnalysisSpec = { op: op as AnalysisOp, sheet: sheet.name };
  const classes = classifyColumns(sheet);
  const c0 = columnsField[0];
  const c1 = columnsField[1];
  /** Group keys of `gi` that have a number in `vi` (or any key when `vi` is −1), with their counts. */
  const groupCounts = (gi: number, vi: number): Map<string, number> => {
    const ctx = bareCtx(sheet);
    const keys = keysOf(ctx, gi);
    const vals = vi === -1 ? null : numbersOf(ctx, vi);
    return countMap(keys.map((k, row) => (k !== null && (!vals || vals[row] !== null) ? k : null)));
  };

  switch (op as AnalysisOp) {
    case "describe": {
      const refs = columnsField.length ? columnsField : str(r.column) ? [str(r.column) as string] : [];
      let idx = refs.map((x) => find(x));
      if (!idx.length) {
        idx = (classes.measures.length ? classes.measures : cols.filter(isNumericCol)).map((c) => cols.indexOf(c));
        idx.sort((a, b) => a - b);
      }
      if (!idx.length) throw new SpecError("no_numeric", undefined, all);
      idx.forEach(needNumeric);
      out.columns = uniq(idx).slice(0, MAX_DESCRIBE_COLUMNS).map((i) => cols[i].name);
      break;
    }
    case "frequencies":
    case "distribution": {
      let i = pick(str(r.column), c0, str(r.value), str(r.x), str(r.row), op === "frequencies" ? str(r.by) : undefined);
      if (i === -1) {
        const fallback = op === "frequencies" ? classes.categories[0] ?? classes.tableCategories[0] : classes.measures[0];
        if (!fallback) throw new SpecError("missing_column", undefined, op === "frequencies" ? groupNames : numericNames);
        i = cols.indexOf(fallback);
      }
      const c = cols[i];
      if (c.role === "empty" || c.n === 0) throw new SpecError("no_data", c.name, all);
      // Numbers with many values are a distribution; categories are frequencies.
      let target: AnalysisOp = op as AnalysisOp;
      if (op === "frequencies" && c.type === "number" && c.role !== "identifier" && c.distinct > MAX_CATEGORIES) target = "distribution";
      if (op === "distribution" && !isNumericCol(c)) target = "frequencies";
      if (target === "frequencies") needGroup(i);
      else needNumeric(i);
      out.op = target;
      out.column = c.name;
      if (target === "frequencies") {
        if (r.asShare === true) out.asShare = true;
        // A pie request is kept as asked; runAnalysis draws the pie, or bars with a note when the column does not fit one.
        out.chart = chart === "none" ? "none" : chart === "pie" ? "pie" : "bar";
      } else {
        // A distribution by group (or asked as a box plot) is a box plot (D25): one box per group of `by`.
        const byRef = op === "distribution" ? str(r.by) ?? str(r.group) : undefined;
        let by = byRef !== undefined ? find(byRef) : -1;
        if (by === i) by = -1;
        if (by !== -1) needGroup(by);
        if (chart === "box" || by !== -1) {
          out.chart = "box";
          if (by !== -1) out.by = cols[by].name;
        } else {
          const bins = typeof r.bins === "number" && Number.isFinite(r.bins) ? Math.round(r.bins) : undefined;
          if (bins !== undefined) out.bins = Math.max(2, Math.min(1000, bins));
          out.chart = chart === "none" ? "none" : "histogram";
        }
      }
      break;
    }
    case "crosstab": {
      const a = pick(str(r.row), c0, str(r.x), str(r.by));
      const b = pick(str(r.col), c1, str(r.y), str(r.column));
      if (a === -1 || b === -1) throw new SpecError("missing_column", undefined, groupNames);
      needGroup(a);
      needGroup(b);
      if (a === b) throw new SpecError("missing_column", cols[a].name, groupNames);
      out.row = cols[a].name;
      out.col = cols[b].name;
      out.chart = chart === "none" ? "none" : "groupedBar";
      break;
    }
    case "groupSummary": {
      const s = stat ?? "mean";
      const v = pick(str(r.value), str(r.y), str(r.column), c0);
      const g = pick(str(r.by), str(r.x), str(r.row), str(r.col), c1);
      if (g === -1) throw new SpecError("missing_column", undefined, groupNames);
      needGroup(g);
      if (v === -1 && s !== "count") throw new SpecError("missing_column", undefined, numericNames);
      if (v !== -1) needNumeric(v);
      if (v !== -1 && v === g) throw new SpecError("missing_column", cols[g].name, numericNames);
      if (v !== -1) out.value = cols[v].name;
      out.by = cols[g].name;
      out.stat = s;
      out.chart = chart === "none" ? "none" : chart === "line" && cols[g].role === "time" ? "line" : "bar";
      break;
    }
    case "correlation": {
      const refs = columnsField.length ? columnsField : [str(r.x), str(r.y)].filter((x): x is string => !!x);
      let idx = refs.map((x) => find(x));
      if (!idx.length) idx = classes.measures.slice(0, MAX_CORRELATION_COLUMNS).map((c) => cols.indexOf(c)).sort((a, b) => a - b);
      idx = uniq(idx);
      idx.forEach(needNumeric);
      if (idx.length < 2) throw new SpecError(idx.length ? "missing_column" : "no_numeric", undefined, numericNames);
      out.columns = idx.slice(0, MAX_CORRELATION_COLUMNS).map((i) => cols[i].name);
      out.chart = out.columns.length === 2 && chart !== "none" ? "scatter" : "none";
      break;
    }
    case "trend": {
      const s = stat ?? "mean";
      const y = pick(str(r.y), str(r.value), str(r.column), c0);
      let x = pick(str(r.x), c1);
      let by = str(r.by) !== undefined ? find(str(r.by)) : -1;
      // `by` naming the time column is a common way to say "over time".
      if (x === -1 && by !== -1 && cols[by].role === "time") {
        x = by;
        by = -1;
      }
      if (x === -1 && classes.time[0]) x = cols.indexOf(classes.time[0]);
      if (x === -1) throw new SpecError("missing_column", undefined, names((c) => c.role === "time"));
      if (y === -1 && s !== "count") throw new SpecError("missing_column", undefined, numericNames);
      const xc = cols[x];
      if (xc.role === "empty" || xc.n === 0) throw new SpecError("no_data", xc.name, all);
      if (!(xc.role === "time" || xc.type === "date" || isNumericCol(xc))) throw new SpecError("not_numeric", xc.name, names((c) => c.role === "time" || isNumericCol(c)));
      if (y !== -1) needNumeric(y);
      if (y !== -1 && y === x) throw new SpecError("missing_column", xc.name, numericNames);
      if (by !== -1) {
        needGroup(by);
        if (by === x || by === y) by = -1;
      }
      if (y !== -1) out.y = cols[y].name;
      out.x = xc.name;
      if (by !== -1) out.by = cols[by].name;
      out.stat = s;
      out.chart = chart === "none" ? "none" : "line";
      break;
    }
    case "scatter": {
      const y = pick(str(r.y), str(r.value), c0);
      const x = pick(str(r.x), str(r.column), c1);
      if (x === -1 || y === -1) throw new SpecError("missing_column", undefined, numericNames);
      needNumeric(x);
      needNumeric(y);
      if (x === y) throw new SpecError("missing_column", cols[x].name, numericNames);
      let by = str(r.by) !== undefined ? find(str(r.by)) : -1;
      if (by !== -1) {
        needGroup(by);
        if (by === x || by === y) by = -1;
      }
      out.x = cols[x].name;
      out.y = cols[y].name;
      if (by !== -1) out.by = cols[by].name;
      out.chart = chart === "none" ? "none" : "scatter";
      break;
    }
    case "ttest":
    case "mannWhitney":
    case "anova":
    case "kruskal": {
      const v = pick(str(r.value), str(r.y), str(r.column), c0);
      const g = pick(str(r.by), str(r.group), str(r.x), str(r.row), str(r.col), c1);
      if (v === -1) throw new SpecError("missing_column", undefined, numericNames);
      if (g === -1) throw new SpecError("missing_column", undefined, groupNames);
      needNumeric(v);
      needGroup(g);
      if (v === g) throw new SpecError("missing_column", cols[g].name, groupNames);
      const counts = groupCounts(g, v);
      if (counts.size < 2) throw new SpecError("too_few_groups", cols[g].name, groupNames);
      out.value = cols[v].name;
      out.by = cols[g].name;
      if (op === "ttest" || op === "mannWhitney") {
        out.levels = twoLevels(sheet, g, counts, r.levels);
      } else if (counts.size > MAX_TEST_GROUPS) {
        throw new SpecError("too_many_levels", cols[g].name, groupNames.filter((n) => groupCounts(resolveColumn(sheet, n), v).size <= MAX_TEST_GROUPS));
      }
      out.chart = "none";
      break;
    }
    case "pairedTtest":
    case "correlationTest": {
      const refs = columnsField.length >= 2 ? columnsField.slice(0, 2) : [str(r.x) ?? c0, str(r.y) ?? c1].filter((x): x is string => !!x);
      const idx = uniq(refs.map((x) => find(x)));
      idx.forEach(needNumeric);
      if (idx.length < 2) throw new SpecError(numericNames.length ? "missing_column" : "no_numeric", undefined, numericNames);
      if (op === "pairedTtest") out.columns = [cols[idx[0]].name, cols[idx[1]].name];
      else {
        out.x = cols[idx[0]].name;
        out.y = cols[idx[1]].name;
        out.method = r.method === "spearman" ? "spearman" : "pearson";
      }
      out.chart = "none";
      break;
    }
    case "chisquare": {
      const a = pick(str(r.row), c0, str(r.x), str(r.by));
      const b = pick(str(r.col), c1, str(r.y), str(r.column), str(r.group));
      if (a === -1 || b === -1) throw new SpecError("missing_column", undefined, groupNames);
      needGroup(a);
      needGroup(b);
      if (a === b) throw new SpecError("missing_column", cols[a].name, groupNames);
      const ka = groupCounts(a, -1).size;
      const kb = groupCounts(b, -1).size;
      if (ka < 2) throw new SpecError("too_few_groups", cols[a].name, groupNames);
      if (kb < 2) throw new SpecError("too_few_groups", cols[b].name, groupNames);
      const fits = (k: number) => k <= MAX_TEST_GROUPS;
      if (!fits(ka) || Math.min(ka, kb) > MAX_CHISQUARE_COLUMNS) throw new SpecError("too_many_levels", cols[a].name, groupNames);
      if (!fits(kb)) throw new SpecError("too_many_levels", cols[b].name, groupNames);
      out.row = cols[a].name;
      out.col = cols[b].name;
      out.chart = "none";
      break;
    }
    case "regression": {
      let y = pick(str(r.y), str(r.value), str(r.column));
      let refs: string[] = Array.isArray(r.predictors) ? r.predictors.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];
      if (!refs.length && str(r.x)) refs = [str(r.x) as string];
      if (y === -1 && columnsField.length) {
        y = find(c0);
        if (!refs.length) refs = columnsField.slice(1);
      } else if (!refs.length) refs = columnsField;
      if (y === -1) throw new SpecError("missing_column", undefined, numericNames);
      needNumeric(y);
      const predictorNames = names((c) => c.role !== "empty" && c.role !== "identifier" && c.role !== "freeText" && c.type !== "date" && c.name !== cols[y].name);
      const idx = uniq(refs.map((x) => find(x))).filter((i) => i !== y);
      if (!idx.length) throw new SpecError("missing_column", undefined, predictorNames);
      if (idx.length > MAX_PREDICTORS) throw new SpecError("too_many_predictors", undefined, predictorNames);
      for (const i of idx) {
        const c = cols[i];
        if (c.role === "empty" || c.n === 0) throw new SpecError("no_data", c.name, predictorNames);
        if (c.type === "date") throw new SpecError("not_numeric", c.name, predictorNames);
        if (isNumericCol(c)) continue;
        needGroup(i);
        if (groupCounts(i, -1).size > MAX_PREDICTOR_LEVELS) throw new SpecError("too_many_levels", c.name, predictorNames);
      }
      out.y = cols[y].name;
      out.predictors = idx.map((i) => cols[i].name);
      out.chart = "none";
      break;
    }
    case "gantt": {
      let label = pick(str(r.label), str(r.column), str(r.task), c0);
      let start = pick(str(r.start), c1);
      let end = pick(str(r.end), columnsField[2]);
      const group = str(r.group) ?? str(r.by);
      let gi = group !== undefined ? find(group) : -1;
      const dates = cols.map((c, i) => ({ c, i })).filter(({ c }) => c.type === "date" && c.n > 0);
      const byName = (re: RegExp, not: number) => dates.find(({ c, i }) => i !== not && (re.test(normKey(c.name)) || re.test(normKey(c.label))));
      if (start === -1) start = (byName(START_NAME, end) ?? dates.find(({ i }) => i !== end))?.i ?? -1;
      if (end === -1) end = (byName(END_NAME, start) ?? dates.find(({ i }) => i !== start))?.i ?? -1;
      if (start === -1 || end === -1) throw new SpecError("missing_column", undefined, dateNames);
      for (const i of [start, end]) {
        if (cols[i].type !== "date") throw new SpecError("not_date", cols[i].name, dateNames);
        if (cols[i].n === 0) throw new SpecError("no_data", cols[i].name, dateNames);
      }
      if (start === end) throw new SpecError("missing_column", cols[end].name, dateNames);
      if (label === -1) {
        const text = cols.findIndex((c, i) => i !== gi && c.type === "text" && c.n > 0 && c.role !== "empty");
        if (text === -1) throw new SpecError("missing_column", undefined, names((c) => c.type === "text"));
        label = text;
      }
      if (cols[label].role === "empty" || cols[label].n === 0) throw new SpecError("no_data", cols[label].name, all);
      if (label === start || label === end) throw new SpecError("missing_column", cols[label].name, names((c) => c.type === "text"));
      if (gi === label || gi === start || gi === end) gi = -1;
      if (gi !== -1) needGroup(gi);
      out.label = cols[label].name;
      out.start = cols[start].name;
      out.end = cols[end].name;
      if (gi !== -1) out.group = cols[gi].name;
      out.chart = "none";
      break;
    }
  }
  return out;
}

/**
 * The two groups a two-group test compares: the `levels` named in the spec (matched on the value, its printed form or
 * ignoring case and accents), else the two largest groups (ties in natural order). Throws `unknown_level`.
 */
function twoLevels(sheet: DatasetSheet, gi: number, counts: Map<string, number>, raw: unknown): [string, string] {
  const ctx = bareCtx(sheet);
  const keys = orderKeys(ctx, gi, Array.from(counts.keys()));
  const shown = keys.map((k) => showKey(ctx, gi, k));
  const wanted = Array.isArray(raw) ? raw.filter((x): x is string | number | boolean => typeof x === "string" || typeof x === "number" || typeof x === "boolean").map((x) => String(x).trim()).filter(Boolean) : [];
  if (wanted.length >= 2) {
    const match = (w: string): string => {
      let j = keys.indexOf(w);
      if (j === -1) j = shown.indexOf(w);
      if (j === -1) j = keys.findIndex((k, n) => normKey(k) === normKey(w) || normKey(shown[n]) === normKey(w));
      if (j === -1) throw new SpecError("unknown_level", w, shown);
      return keys[j];
    };
    const a = match(wanted[0]);
    const b = match(wanted[1]);
    if (a === b) throw new SpecError("unknown_level", wanted[1], shown);
    return [a, b];
  }
  const bySize = keys.slice().sort((a, b) => (counts.get(b) as number) - (counts.get(a) as number) || keys.indexOf(a) - keys.indexOf(b));
  const two = bySize.slice(0, 2).sort((a, b) => keys.indexOf(a) - keys.indexOf(b));
  return [two[0], two[1]];
}

function uniq<T>(xs: T[]): T[] {
  return xs.filter((x, i) => xs.indexOf(x) === i);
}

// ---------- Running ----------

export interface RunMeta {
  sourceId: string;
  fileName: string;
  interactionId: string;
  /** The paper's writing language: titles, headers, notes and number formats. `tr` must translate into it. */
  lang: WritingLanguage;
  /** Sheet used when the spec names none (default 0). */
  sheetIndex?: number;
  /** Position of the artifact in its answer (keeps ids distinct when a spec repeats). */
  index?: number;
  /** Fixed id and time (tests, re-runs). */
  id?: string;
  now?: string;
}

interface Ctx {
  sheet: DatasetSheet;
  cols: DatasetColumn[];
  lang: WritingLanguage;
  tr: Translate;
  notes: string[];
}

type Cell = string | number | null;

const BARE_WORDS: Record<string, string> = { "data.value.yes": "Yes", "data.value.no": "No", "data.value.other": "Other" };

/** A context for reading a sheet outside a run (validation): English words for Yes/No/Other, no notes. */
function bareCtx(sheet: DatasetSheet): Ctx {
  return { sheet, cols: sheet.columns, lang: "en", tr: (k) => BARE_WORDS[k] ?? k, notes: [] };
}

interface Built {
  title: string;
  columns: string[];
  rows: Cell[][];
  precision: number[];
  /** Per-cell decimals when a column mixes variables (describe, scatter, paired tests). */
  cellPrecision?: (number | null)[][];
  chart?: ChartData;
  n: number;
  /** Default: "chart" with a chart, else "table". */
  kind?: Artifact["kind"];
  /** kind "test": the result; its `notes` are every note of the test (the card). */
  test?: TestResult;
  diagram?: DiagramSpec;
  warnings?: DiagramWarning[];
  equation?: { latex: string; display: boolean };
}

/**
 * Computes an artifact from a spec. The spec is validated (and normalised) first: an invalid spec, or data a test
 * cannot use (`too_few`, `constant`, `collinear`…), throws an Error whose message is the `SpecErrorCode`. Callers
 * that want the code and the column without try/catch use `tryRunAnalysis`.
 */
export function runAnalysis(spec: AnalysisSpec, dataset: Dataset, meta: RunMeta, tr: Translate): Artifact {
  const v = validateSpec(spec, dataset, meta.sheetIndex ?? 0);
  if (!v.ok) throw new SpecError(v.code, v.column, v.available);
  const s = v.spec;
  const si = Math.max(0, sheetIndexOf(dataset, s.sheet, meta.sheetIndex ?? 0));
  const sheet = dataset.sheets[si];
  const ctx: Ctx = { sheet, cols: sheet.columns, lang: meta.lang, tr, notes: [] };
  const col = (name: string | undefined) => (name === undefined ? -1 : resolveColumn(sheet, name));
  let built: Built;
  switch (s.op) {
    case "describe":
      built = runDescribe(ctx, (s.columns || []).map(col));
      break;
    case "frequencies":
      built = runFrequencies(ctx, col(s.column), !!s.asShare, s.chart === "none" ? "none" : s.chart === "pie" ? "pie" : "bar");
      break;
    case "crosstab":
      built = runCrosstab(ctx, col(s.row), col(s.col), s.chart !== "none");
      break;
    case "groupSummary":
      built = runGroupSummary(ctx, col(s.value), col(s.by), s.stat || "mean", s.chart === "none" ? "none" : s.chart === "line" ? "line" : "bar");
      break;
    case "correlation":
      built = runCorrelation(ctx, (s.columns || []).map(col), s.chart === "scatter");
      break;
    case "distribution":
      built = s.chart === "box" ? runBox(ctx, col(s.column), col(s.by)) : runDistribution(ctx, col(s.column), s.bins, s.chart !== "none");
      break;
    case "trend":
      built = runTrend(ctx, col(s.y), col(s.x), col(s.by), s.stat || "mean", s.chart !== "none");
      break;
    case "ttest":
    case "mannWhitney":
      built = runTwoGroups(ctx, s.op, col(s.value), col(s.by), s.levels as [string, string]);
      break;
    case "anova":
    case "kruskal":
      built = runGroups(ctx, s.op, col(s.value), col(s.by));
      break;
    case "pairedTtest":
      built = runPaired(ctx, col((s.columns || [])[0]), col((s.columns || [])[1]));
      break;
    case "correlationTest":
      built = runCorrelationTest(ctx, col(s.x), col(s.y), s.method === "spearman" ? "spearman" : "pearson");
      break;
    case "chisquare":
      built = runChiSquare(ctx, col(s.row), col(s.col));
      break;
    case "regression":
      built = runRegression(ctx, col(s.y), (s.predictors || []).map(col));
      break;
    case "gantt":
      built = runGantt(ctx, col(s.label), col(s.start), col(s.end), col(s.group));
      break;
    case "scatter":
    default:
      built = runScatter(ctx, col(s.x), col(s.y), col(s.by), s.chart !== "none");
      break;
  }
  if (built.rows.length > MAX_TABLE_ROWS) {
    built.rows = built.rows.slice(0, MAX_TABLE_ROWS);
    if (built.cellPrecision) built.cellPrecision = built.cellPrecision.slice(0, MAX_TABLE_ROWS);
    ctx.notes.push(tr("data.note.rowsCut", { n: MAX_TABLE_ROWS }));
  }
  if (sheet.truncated) ctx.notes.push(tr("data.note.truncated", { n: sheet.rowCount, cells: dataset.cells }));
  const table: ArtifactTable = { columns: built.columns, rows: built.rows, precision: built.precision };
  if (built.cellPrecision && built.cellPrecision.some((row) => row.some((p) => p !== null))) table.cellPrecision = built.cellPrecision;
  if (ctx.notes.length) table.notes = uniq(ctx.notes);
  const computedAt = meta.now || new Date().toISOString();
  const artifact: Artifact = {
    id: meta.id || `art_${hashId([meta.interactionId, String(meta.index ?? 0), sheet.name, JSON.stringify(s), dataset.sha256, computedAt].join("|"))}`,
    interactionId: meta.interactionId,
    kind: built.kind ?? (built.chart ? "chart" : "table"),
    title: built.title,
    spec: s,
    sourceId: meta.sourceId,
    fileName: meta.fileName,
    sheet: sheet.name,
    datasetSha256: dataset.sha256,
    n: built.n,
    lang: meta.lang,
    table,
    computedAt,
  };
  if (built.chart) artifact.chart = built.chart;
  if (built.test) {
    // The card shows every note of the test; the inserted table carries `table.notes` (see the module comment).
    const notes = uniq((built.test.notes || []).concat(table.notes || []));
    const test: TestResult = { ...built.test };
    if (notes.length) test.notes = notes;
    else delete test.notes;
    artifact.test = test;
  }
  if (built.diagram) artifact.diagram = built.diagram;
  if (built.warnings && built.warnings.length) artifact.warnings = built.warnings;
  if (built.equation) artifact.equation = built.equation;
  return artifact;
}

export type RunResult = { ok: true; artifact: Artifact } | { ok: false; code: SpecErrorCode; column?: string; available: string[] };

/**
 * `runAnalysis` without exceptions: the artifact, or the code (and the column or group, and what would fit) for the
 * "could not compute" card. Codes are `SPEC_ERROR_CODES`.
 */
export function tryRunAnalysis(spec: AnalysisSpec, dataset: Dataset, meta: RunMeta, tr: Translate): RunResult {
  try {
    return { ok: true, artifact: runAnalysis(spec, dataset, meta, tr) };
  } catch (e) {
    if (isSpecError(e)) return failure(e);
    return { ok: false, code: "invalid_spec", available: [] };
  }
}

/** FNV-1a, twice with different seeds: a short deterministic id without Node's crypto. */
function hashId(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9dc5811c;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x01000193) ^ (h2 >>> 13);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

// ---------- Helpers ----------

const label = (ctx: Ctx, i: number) => ctx.cols[i].label || ctx.cols[i].name;
const mid = (ctx: Ctx, i: number) => inSentence(label(ctx, i), ctx.lang);
const title = (ctx: Ctx, key: string, vars?: Record<string, string | number>) => capFirst(ctx.tr(key, vars));
const colPrecision = (ctx: Ctx, i: number) => Math.min(3, ctx.cols[i].precision ?? 0);

function numbersOf(ctx: Ctx, i: number): (number | null)[] {
  const c = ctx.cols[i];
  return ctx.sheet.data[i].map((v) => (c.type === "number" ? S.toNumber(v) : c.type === "date" ? dateMs(v) : null));
}

type Bucket = "day" | "month" | "year";

/** How a date column is grouped: by day up to 30 days, by month up to 60 months, else by year. */
function dateBucket(values: DatasetCell[]): Bucket {
  const days = new Set<string>();
  const months = new Set<string>();
  for (const v of values) {
    const t = dateMs(v);
    if (t === null) continue;
    const iso = isoDate(t);
    days.add(iso.slice(0, 10));
    months.add(iso.slice(0, 7));
  }
  return days.size <= 30 ? "day" : months.size <= 60 ? "month" : "year";
}

/** Group key of every row (null when missing): text as written, "true"/"false", numbers as printed, dates by bucket. */
function keysOf(ctx: Ctx, i: number): (string | null)[] {
  const c = ctx.cols[i];
  const data = ctx.sheet.data[i];
  if (c.type === "date") {
    const b = dateBucket(data);
    const len = b === "day" ? 10 : b === "month" ? 7 : 4;
    return data.map((v) => {
      const t = dateMs(v);
      return t === null ? null : isoDate(t).slice(0, len);
    });
  }
  return data.map((v) => cellText(v));
}

/** Natural order of group keys: numbers numerically, dates chronologically, "true" before "false", text naturally. */
function orderKeys(ctx: Ctx, i: number, keys: string[]): string[] {
  const c = ctx.cols[i];
  if (c.type === "number") return keys.slice().sort((a, b) => Number(a) - Number(b));
  if (c.type === "boolean") return keys.slice().sort((a, b) => (a === b ? 0 : a === "true" ? -1 : 1));
  if (c.type === "date") return keys.slice().sort();
  return keys.slice().sort(S.compareText);
}

/** How a group key is printed in the writing language. */
function showKey(ctx: Ctx, i: number, key: string): string {
  const c = ctx.cols[i];
  if (key === OTHER) return ctx.tr("data.value.other");
  if (c.type === "number") {
    const v = Number(key);
    return formatNumber(v, ctx.lang, S.decimalsOf(v, 4));
  }
  if (c.type === "boolean") return ctx.tr(key === "true" ? "data.value.yes" : "data.value.no");
  return key;
}

const OTHER = "\u0000other";

/**
 * Keeps the `limit − 1` largest groups and folds the rest into "Other" when there are more than `limit` groups.
 * Returns the kept keys in natural order, with OTHER last when used.
 */
function foldGroups(ctx: Ctx, i: number, counts: Map<string, number>, limit: number): { keys: string[]; folded: Set<string> } {
  const all = Array.from(counts.keys());
  if (all.length <= limit) return { keys: orderKeys(ctx, i, all), folded: new Set() };
  const bySize = all.slice().sort((a, b) => (counts.get(b) as number) - (counts.get(a) as number) || S.compareText(a, b));
  const keep = bySize.slice(0, limit - 1);
  const folded = new Set(bySize.slice(limit - 1));
  ctx.notes.push(ctx.tr("data.note.other", { k: folded.size }));
  return { keys: orderKeys(ctx, i, keep).concat(OTHER), folded };
}

function pushTo<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const arr = m.get(k);
  if (arr) arr.push(v);
  else m.set(k, [v]);
}

function countMap(keys: (string | null)[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of keys) if (k !== null) m.set(k, (m.get(k) || 0) + 1);
  return m;
}

function noteMissing(ctx: Ctx, left: number) {
  if (left > 0) ctx.notes.push(ctx.tr("data.note.missing", { n: left }));
}

/** Presentation decimals of a set of statistics with the column's own precision `p`. */
function meanPrecision(p: number): number {
  return Math.max(2, Math.min(3, p + 1));
}
function medianPrecision(p: number, values: (number | null)[]): number {
  const f = Math.pow(10, p);
  const needsMore = values.some((v) => v !== null && Math.abs(v * f - Math.round(v * f)) > 1e-6);
  return Math.min(3, p + (needsMore ? 1 : 0));
}

function stat(xs: number[], which: "mean" | "median" | "sum" | "count"): number | null {
  if (which === "count") return xs.length;
  if (!xs.length) return null;
  if (which === "sum") return S.sum(xs);
  if (which === "median") return S.median(xs);
  return S.mean(xs);
}

function statPrecision(which: "mean" | "median" | "sum" | "count", p: number, values: (number | null)[]): number {
  return which === "count" ? 0 : which === "sum" ? p : which === "median" ? medianPrecision(p, values) : meanPrecision(p);
}

function axisLabel(ctx: Ctx, which: "mean" | "median" | "sum" | "count", vi: number): string {
  if (which === "count" || vi === -1) return ctx.tr("data.col.count");
  return capFirst(ctx.tr(`data.axis.${which}`, { a: mid(ctx, vi) }));
}

// ---------- Operations ----------

function runDescribe(ctx: Ctx, idx: number[]): Built {
  const tr = ctx.tr;
  const stats = idx.map((i) => {
    const xs = numbersOf(ctx, i).filter((v): v is number => v !== null);
    return { i, d: S.describe(xs), missing: ctx.sheet.rowCount - xs.length };
  });
  // Each row keeps its own variable's decimals (`cellPrecision`); `precision` (the most precise variable) is the fallback.
  const pv = stats.reduce((m, s) => Math.max(m, colPrecision(ctx, s.i)), 0);
  const pm = meanPrecision(pv);
  const pmed = medianPrecision(pv, stats.map((s) => s.d.median));
  const rows: Cell[][] = stats.map((s) => [label(ctx, s.i), s.d.n, s.missing, s.d.mean, s.d.sd, s.d.min, s.d.median, s.d.max]);
  const cellPrecision = stats.map((s) => {
    const p = colPrecision(ctx, s.i);
    return [null, 0, 0, meanPrecision(p), meanPrecision(p), p, medianPrecision(p, [s.d.median]), p];
  });
  return {
    title: idx.length === 1 ? title(ctx, "data.title.describeOne", { a: mid(ctx, idx[0]) }) : title(ctx, "data.title.describe"),
    columns: [tr("data.col.variable"), tr("data.col.n"), tr("data.col.missing"), tr("data.col.mean"), tr("data.col.sd"), tr("data.col.min"), tr("data.col.median"), tr("data.col.max")],
    rows,
    precision: [0, 0, 0, pm, pm, pv, pmed, pv],
    cellPrecision,
    n: ctx.sheet.rowCount,
  };
}

function runFrequencies(ctx: Ctx, i: number, asShare: boolean, chartType: "bar" | "pie" | "none"): Built {
  const tr = ctx.tr;
  const keys = keysOf(ctx, i);
  const counts = countMap(keys);
  const valid = keys.length - keys.filter((k) => k === null).length;
  const c = ctx.cols[i];
  // Text categories read best from the most frequent; numbers, dates and booleans keep their natural order.
  let ordered: string[];
  let folded = new Set<string>();
  if (counts.size > MAX_CATEGORIES) {
    const f = foldGroups(ctx, i, counts, MAX_CATEGORIES);
    ordered = f.keys;
    folded = f.folded;
  } else ordered = orderKeys(ctx, i, Array.from(counts.keys()));
  if (c.type === "text") {
    ordered = ordered
      .filter((k) => k !== OTHER)
      .sort((a, b) => (counts.get(b) as number) - (counts.get(a) as number) || S.compareText(a, b))
      .concat(folded.size ? [OTHER] : []);
  }
  const otherN = Array.from(folded).reduce((s, k) => s + (counts.get(k) as number), 0);
  const nOf = (k: string) => (k === OTHER ? otherN : (counts.get(k) as number));
  const pct = (n: number) => (valid ? (n / valid) * 100 : null);
  const rows: Cell[][] = ordered.map((k) => [showKey(ctx, i, k), nOf(k), pct(nOf(k))]);
  rows.push([tr("data.value.total"), valid, valid ? 100 : null]);
  noteMissing(ctx, keys.length - valid);
  // A pie (D25) needs 2–12 unordered categories (text or yes/no); otherwise the shares are drawn as bars, with a note.
  const pie = chartType === "pie" && (c.type === "text" || c.type === "boolean") && counts.size >= 2 && counts.size <= MAX_PIE_CATEGORIES;
  if (chartType === "pie" && !pie && valid) ctx.notes.unshift(tr("data.note.pie"));
  const shares = asShare || chartType === "pie";
  const built: Built = {
    title: title(ctx, shares ? "data.title.shares" : "data.title.frequencies", { a: mid(ctx, i) }),
    columns: [label(ctx, i), tr("data.col.frequency"), tr("data.col.percent")],
    rows,
    precision: [0, 0, 1],
    n: valid,
  };
  if (pie && valid) {
    built.chart = pieChart(ctx, i, counts);
  } else if (chartType !== "none" && valid) {
    built.chart = {
      type: "bar",
      xLabel: label(ctx, i),
      yLabel: shares ? tr("data.axis.percent") : tr("data.col.frequency"),
      categories: ordered.map((k) => showKey(ctx, i, k)),
      series: [{ name: shares ? tr("data.col.percent") : tr("data.col.frequency"), values: ordered.map((k) => (shares ? (pct(nOf(k)) as number) : nOf(k))) }],
    };
    if (shares) built.chart.percent = true;
  }
  return built;
}

/**
 * Pie of the frequencies of column `i` (D25): one series per slice (`values: [count]`), largest first, the 4 largest
 * named and the rest folded into a last "Other" slice (`other: true`) when there are more than 5 categories.
 */
function pieChart(ctx: Ctx, i: number, counts: Map<string, number>): ChartData {
  const bySize = Array.from(counts.keys()).sort((a, b) => (counts.get(b) as number) - (counts.get(a) as number) || S.compareText(a, b));
  const fold = bySize.length > MAX_PIE_SLICES;
  const named = fold ? bySize.slice(0, MAX_PIE_SLICES - 1) : bySize;
  const series: ChartData["series"] = named.map((k) => ({ name: showKey(ctx, i, k), values: [counts.get(k) as number] }));
  if (fold) {
    const rest = bySize.slice(MAX_PIE_SLICES - 1);
    series.push({ name: ctx.tr("data.value.other"), values: [rest.reduce((s, k) => s + (counts.get(k) as number), 0)], other: true });
    ctx.notes.push(ctx.tr("data.note.pieOther", { k: rest.length }));
  }
  return { type: "pie", xLabel: label(ctx, i), yLabel: ctx.tr("data.col.frequency"), series };
}

function runCrosstab(ctx: Ctx, ri: number, ci: number, withChart: boolean): Built {
  const tr = ctx.tr;
  const rk = keysOf(ctx, ri);
  const ck = keysOf(ctx, ci);
  const pairs: [string, string][] = [];
  for (let r = 0; r < rk.length; r++) if (rk[r] !== null && ck[r] !== null) pairs.push([rk[r] as string, ck[r] as string]);
  noteMissing(ctx, rk.length - pairs.length);
  const rows = foldGroups(ctx, ri, countMap(pairs.map((p) => p[0])), MAX_CATEGORIES);
  // One grouping for the table and the chart, so "Other" means the same in both.
  const colLimit = withChart ? MAX_BAR_SERIES + 1 : MAX_CROSSTAB_COLUMNS;
  const colsG = foldGroups(ctx, ci, countMap(pairs.map((p) => p[1])), colLimit);
  const rowKey = (k: string) => (rows.folded.has(k) ? OTHER : k);
  const colKey = (k: string) => (colsG.folded.has(k) ? OTHER : k);
  const cell = new Map<string, number>();
  for (const [a, b] of pairs) {
    const key = rowKey(a) + "\u0001" + colKey(b);
    cell.set(key, (cell.get(key) || 0) + 1);
  }
  const get = (a: string, b: string) => cell.get(a + "\u0001" + b) || 0;
  const tableRows: Cell[][] = rows.keys.map((a) => {
    const vals = colsG.keys.map((b) => get(a, b));
    return [showKey(ctx, ri, a), ...vals, vals.reduce((s, x) => s + x, 0)];
  });
  const colTotals = colsG.keys.map((b) => rows.keys.reduce((s, a) => s + get(a, b), 0));
  tableRows.push([tr("data.value.total"), ...colTotals, pairs.length]);
  const built: Built = {
    title: title(ctx, "data.title.crosstab", { a: mid(ctx, ri), b: mid(ctx, ci) }),
    columns: [label(ctx, ri), ...colsG.keys.map((b) => showKey(ctx, ci, b)), tr("data.value.total")],
    rows: tableRows,
    precision: [0, ...colsG.keys.map(() => 0), 0],
    n: pairs.length,
  };
  if (withChart && pairs.length) {
    built.chart = {
      type: "groupedBar",
      xLabel: label(ctx, ri),
      yLabel: tr("data.col.frequency"),
      categories: rows.keys.map((a) => showKey(ctx, ri, a)),
      series: colsG.keys.map((b) => {
        const s: ChartData["series"][number] = { name: showKey(ctx, ci, b), values: rows.keys.map((a) => get(a, b)) };
        if (b === OTHER) s.other = true;
        return s;
      }),
    };
  }
  return built;
}

function runGroupSummary(ctx: Ctx, vi: number, gi: number, which: "mean" | "median" | "sum" | "count", chartType: "bar" | "line" | "none"): Built {
  const tr = ctx.tr;
  const keys = keysOf(ctx, gi);
  const vals = vi === -1 ? keys.map(() => 0) : numbersOf(ctx, vi);
  const pairs: [string, number][] = [];
  for (let r = 0; r < keys.length; r++) if (keys[r] !== null && vals[r] !== null) pairs.push([keys[r] as string, vals[r] as number]);
  noteMissing(ctx, keys.length - pairs.length);
  const g = foldGroups(ctx, gi, countMap(pairs.map((p) => p[0])), MAX_CATEGORIES);
  const groups = new Map<string, number[]>();
  for (const k of g.keys) groups.set(k, []);
  for (const [k, v] of pairs) (groups.get(g.folded.has(k) ? OTHER : k) as number[]).push(v);
  const all = pairs.map((p) => p[1]);
  const p = vi === -1 ? 0 : colPrecision(ctx, vi);
  const groupLabel = label(ctx, gi);
  let columns: string[];
  let rows: Cell[][];
  let precision: number[];
  if (which === "count" || vi === -1) {
    columns = [groupLabel, tr("data.col.n")];
    rows = g.keys.map((k) => [showKey(ctx, gi, k), (groups.get(k) as number[]).length]);
    rows.push([tr("data.value.total"), all.length]);
    precision = [0, 0];
  } else if (which === "sum") {
    columns = [groupLabel, tr("data.col.n"), tr("data.col.sum"), tr("data.col.mean")];
    rows = g.keys.map((k) => {
      const xs = groups.get(k) as number[];
      return [showKey(ctx, gi, k), xs.length, S.sum(xs), S.mean(xs)];
    });
    rows.push([tr("data.value.total"), all.length, S.sum(all), S.mean(all)]);
    precision = [0, 0, p, meanPrecision(p)];
  } else {
    columns = [groupLabel, tr("data.col.n"), tr("data.col.mean"), tr("data.col.sd"), tr("data.col.median"), tr("data.col.min"), tr("data.col.max")];
    const ds = g.keys.map((k) => S.describe(groups.get(k) as number[]));
    const dAll = S.describe(all);
    rows = g.keys.map((k, j) => [showKey(ctx, gi, k), ds[j].n, ds[j].mean, ds[j].sd, ds[j].median, ds[j].min, ds[j].max]);
    rows.push([tr("data.value.total"), dAll.n, dAll.mean, dAll.sd, dAll.median, dAll.min, dAll.max]);
    precision = [0, 0, meanPrecision(p), meanPrecision(p), medianPrecision(p, ds.map((d) => d.median).concat(dAll.median)), p, p];
  }
  const statKey = vi === -1 ? "count" : which;
  const built: Built = {
    title:
      statKey === "count"
        ? title(ctx, "data.title.group.count", { b: mid(ctx, gi) })
        : title(ctx, `data.title.group.${statKey}`, { a: mid(ctx, vi), b: mid(ctx, gi) }),
    columns,
    rows,
    precision,
    n: pairs.length,
  };
  if (chartType !== "none" && pairs.length) {
    const yLabel = axisLabel(ctx, statKey, vi);
    built.chart = {
      type: chartType,
      xLabel: groupLabel,
      yLabel,
      categories: g.keys.map((k) => showKey(ctx, gi, k)),
      series: [{ name: yLabel, values: g.keys.map((k) => stat(groups.get(k) as number[], statKey) as number) }],
    };
  }
  return built;
}

/** Complete rows of several number columns (listwise). */
function completeRows(ctx: Ctx, idx: number[]): { rows: number[][]; dropped: number } {
  const cols = idx.map((i) => numbersOf(ctx, i));
  const out: number[][] = [];
  const total = ctx.sheet.rowCount;
  for (let r = 0; r < total; r++) {
    const row = cols.map((c) => c[r]);
    if (row.every((v) => v !== null)) out.push(row as number[]);
  }
  return { rows: out, dropped: total - out.length };
}

function runCorrelation(ctx: Ctx, idx: number[], withChart: boolean): Built {
  const tr = ctx.tr;
  const { rows: data, dropped } = completeRows(ctx, idx);
  const n = data.length;
  const k = idx.length;
  const series = idx.map((_, j) => data.map((row) => row[j]));
  const rows: Cell[][] = idx.map((i, a) => {
    const row: Cell[] = [label(ctx, i)];
    for (let b = 0; b < k; b++) row.push(b < a ? S.pearson(series[a], series[b]) : b === a ? "—" : null);
    return row;
  });
  if (n < 3) ctx.notes.push(tr("data.note.minN", { n }));
  else {
    ctx.notes.push(tr("data.note.correlation", { n }));
    idx.forEach((i, j) => {
      if (S.sd(series[j]) === 0) ctx.notes.push(tr("data.note.constant", { a: label(ctx, i) }));
    });
  }
  noteMissing(ctx, dropped);
  const built: Built = {
    title: k === 2 ? title(ctx, "data.title.correlationPair", { a: mid(ctx, idx[0]), b: mid(ctx, idx[1]) }) : title(ctx, "data.title.correlation", { list: listJoin(idx.map((i) => mid(ctx, i)), tr) }),
    columns: [tr("data.col.variable"), ...idx.map((i) => label(ctx, i))],
    rows,
    precision: [0, ...idx.map(() => 2)],
    n,
  };
  if (withChart && k === 2 && n >= 1) {
    built.chart = scatterChart(ctx, idx[0], idx[1], data.map((r) => [r[0], r[1]] as [number, number]));
  }
  return built;
}

function binLabel(ctx: Ctx, lo: number, hi: number, d: number, discrete: boolean, width: number): string {
  if (discrete) {
    const last = hi - 1;
    return width <= 1 ? formatNumber(lo, ctx.lang, 0) : `${formatNumber(lo, ctx.lang, 0)}–${formatNumber(last, ctx.lang, 0)}`;
  }
  return `${formatNumber(lo, ctx.lang, d)}–${formatNumber(hi, ctx.lang, d)}`;
}

function runDistribution(ctx: Ctx, i: number, bins: number | undefined, withChart: boolean): Built {
  const tr = ctx.tr;
  const all = numbersOf(ctx, i);
  const xs = all.filter((v): v is number => v !== null);
  noteMissing(ctx, all.length - xs.length);
  const b = S.histogramBins(xs, bins);
  const discrete = xs.length > 0 && xs.every((x) => Number.isInteger(x)) && b.rule !== "single";
  const d = b.rule === "single" ? colPrecision(ctx, i) : Math.max(S.stepDecimals(b.width), 0);
  const labels = b.counts.map((_, j) =>
    b.rule === "single" ? formatNumber(b.edges[0], ctx.lang, d) : binLabel(ctx, b.edges[j], b.edges[j + 1], d, discrete, b.width),
  );
  const n = xs.length;
  const rows: Cell[][] = b.counts.map((cnt, j) => [labels[j], cnt, n ? (cnt / n) * 100 : null]);
  rows.push([tr("data.value.total"), n, n ? 100 : null]);
  if (b.rule !== "single" && !discrete) ctx.notes.push(tr("data.note.bins"));
  const built: Built = {
    title: title(ctx, "data.title.distribution", { a: mid(ctx, i) }),
    columns: [label(ctx, i), tr("data.col.frequency"), tr("data.col.percent")],
    rows,
    precision: [0, 0, 1],
    n,
  };
  if (withChart && n) {
    built.chart = {
      type: "histogram",
      xLabel: label(ctx, i),
      yLabel: tr("data.col.frequency"),
      categories: labels,
      // Histogram convention: `points[j]` is [lower edge, upper edge] of bin j; `values[j]` its count.
      series: [{ name: tr("data.col.frequency"), values: b.counts, points: b.counts.map((_, j) => [b.edges[j], b.edges[j + 1]] as [number, number]) }],
    };
  }
  return built;
}

function runTrend(ctx: Ctx, yi: number, xi: number, gi: number, which: "mean" | "median" | "sum" | "count", withChart: boolean): Built {
  const tr = ctx.tr;
  const xk = keysOf(ctx, xi);
  const ys = yi === -1 ? xk.map(() => 0) : numbersOf(ctx, yi);
  const gk = gi === -1 ? null : keysOf(ctx, gi);
  const recs: { x: string; y: number; g: string }[] = [];
  for (let r = 0; r < xk.length; r++) {
    if (xk[r] === null || ys[r] === null) continue;
    if (gk && gk[r] === null) continue;
    recs.push({ x: xk[r] as string, y: ys[r] as number, g: gk ? (gk[r] as string) : "" });
  }
  noteMissing(ctx, xk.length - recs.length);
  const xs = orderKeys(ctx, xi, Array.from(new Set(recs.map((r) => r.x))));
  const statKey = yi === -1 ? "count" : which;
  const p = yi === -1 ? 0 : colPrecision(ctx, yi);
  const yLabel = axisLabel(ctx, statKey, yi);
  const xLabel = label(ctx, xi);
  const xShown = xs.map((k) => showKey(ctx, xi, k));
  let columns: string[];
  let rows: Cell[][];
  let precision: number[];
  let series: ChartData["series"];
  if (!gk) {
    const byX = new Map<string, number[]>();
    for (const r of recs) pushTo(byX, r.x, r.y);
    const values = xs.map((k) => stat(byX.get(k) as number[], statKey));
    columns = [xLabel, tr("data.col.n"), yLabel];
    rows = xs.map((k, j) => [xShown[j], (byX.get(k) as number[]).length, values[j]]);
    precision = [0, 0, statPrecision(statKey, p, values)];
    series = [{ name: yLabel, values: values.map((v) => (v === null ? NaN : v)) }];
  } else {
    const g = foldGroups(ctx, gi, countMap(recs.map((r) => r.g)), MAX_BAR_SERIES + 1);
    const cells = new Map<string, number[]>();
    for (const r of recs) {
      pushTo(cells, r.x + "\u0001" + (g.folded.has(r.g) ? OTHER : r.g), r.y);
    }
    const valueAt = (x: string, gKey: string) => {
      const arr = cells.get(x + "\u0001" + gKey);
      return arr && arr.length ? stat(arr, statKey) : null;
    };
    columns = [xLabel, ...g.keys.map((k) => showKey(ctx, gi, k))];
    rows = xs.map((x, j) => [xShown[j], ...g.keys.map((k) => valueAt(x, k))]);
    const flat = rows.flatMap((r) => r.slice(1) as (number | null)[]);
    precision = [0, ...g.keys.map(() => statPrecision(statKey, p, flat))];
    series = g.keys.map((k) => {
      const s: ChartData["series"][number] = { name: showKey(ctx, gi, k), values: xs.map((x) => {
        const v = valueAt(x, k);
        return v === null ? NaN : v;
      }) };
      if (k === OTHER) s.other = true;
      return s;
    });
    ctx.notes.unshift(tr(`data.note.trendStat.${statKey}`));
  }
  const vars = { a: yi === -1 ? inSentence(tr("data.col.count"), ctx.lang) : mid(ctx, yi), b: mid(ctx, xi), c: gi === -1 ? "" : mid(ctx, gi) };
  const built: Built = {
    title: title(ctx, gi === -1 ? "data.title.trend" : "data.title.trendBy", vars),
    columns,
    rows,
    precision,
    n: recs.length,
  };
  if (withChart && recs.length) built.chart = { type: "line", xLabel, yLabel, categories: xShown, series };
  return built;
}

/** Scatter chart of complete pairs [x, y] with its least-squares line; ≤ 500 points kept by even sampling. */
function scatterChart(ctx: Ctx, xi: number, yi: number, pairs: [number, number][]): ChartData {
  const keep = S.evenSample(pairs.length, MAX_SCATTER_POINTS);
  const chart: ChartData = { type: "scatter", xLabel: label(ctx, xi), yLabel: label(ctx, yi), series: [{ name: label(ctx, yi), points: keep.map((j) => pairs[j]) }] };
  const reg = S.linearRegression(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
  if (reg) chart.fit = { slope: reg.slope, intercept: reg.intercept, r: reg.r, n: reg.n };
  if (keep.length < pairs.length) ctx.notes.push(ctx.tr("data.note.sample", { shown: keep.length, n: pairs.length }));
  return chart;
}

/** Scatter chart by group: the 3 largest groups + "Other"; no fitted line (one line across groups would mislead). */
function scatterByGroup(ctx: Ctx, xi: number, yi: number, gi: number, pairs: [number, number][], groups: string[]): ChartData {
  const keep = S.evenSample(pairs.length, MAX_SCATTER_POINTS);
  const g = foldGroups(ctx, gi, countMap(groups), MAX_SCATTER_SERIES + 1);
  const series: ChartData["series"] = g.keys.map((k) => {
    const s: ChartData["series"][number] = {
      name: showKey(ctx, gi, k),
      points: keep.filter((j) => (g.folded.has(groups[j]) ? OTHER : groups[j]) === k).map((j) => pairs[j]),
    };
    if (k === OTHER) s.other = true;
    return s;
  });
  if (keep.length < pairs.length) ctx.notes.push(ctx.tr("data.note.sample", { shown: keep.length, n: pairs.length }));
  return { type: "scatter", xLabel: label(ctx, xi), yLabel: label(ctx, yi), series };
}

function runScatter(ctx: Ctx, xi: number, yi: number, gi: number, withChart: boolean): Built {
  const tr = ctx.tr;
  const xs = numbersOf(ctx, xi);
  const ys = numbersOf(ctx, yi);
  const gk = gi === -1 ? null : keysOf(ctx, gi);
  const pairs: [number, number][] = [];
  const groups: string[] = [];
  for (let r = 0; r < xs.length; r++) {
    if (xs[r] === null || ys[r] === null || (gk && gk[r] === null)) continue;
    pairs.push([xs[r] as number, ys[r] as number]);
    if (gk) groups.push(gk[r] as string);
  }
  noteMissing(ctx, xs.length - pairs.length);
  const n = pairs.length;
  const dx = S.describe(pairs.map((p) => p[0]));
  const dy = S.describe(pairs.map((p) => p[1]));
  const pv = Math.max(colPrecision(ctx, xi), colPrecision(ctx, yi));
  const reg = S.linearRegression(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
  if (n < 3) ctx.notes.push(tr("data.note.minN", { n }));
  else if (!reg) ctx.notes.push(tr("data.note.constant", { a: dx.sd === 0 ? label(ctx, xi) : label(ctx, yi) }));
  else
    ctx.notes.unshift(
      tr("data.note.fit", {
        // APA style, as in the test lines: r has no leading zero (r = .63).
        r: stripLeadingZero(formatNumber(reg.r, ctx.lang, 2)),
        n,
        y: label(ctx, yi),
        x: label(ctx, xi),
        a: formatNumber(reg.intercept, ctx.lang, meanPrecision(pv)),
        sign: reg.slope < 0 ? "−" : "+",
        b: formatNumber(Math.abs(reg.slope), ctx.lang, Math.max(meanPrecision(pv), significantDecimals(reg.slope))),
      }),
    );
  const built: Built = {
    title: title(ctx, "data.title.scatter", { a: mid(ctx, xi), b: mid(ctx, yi) }),
    columns: [tr("data.col.variable"), tr("data.col.n"), tr("data.col.mean"), tr("data.col.sd"), tr("data.col.min"), tr("data.col.max")],
    rows: [
      [label(ctx, xi), dx.n, dx.mean, dx.sd, dx.min, dx.max],
      [label(ctx, yi), dy.n, dy.mean, dy.sd, dy.min, dy.max],
    ],
    precision: [0, 0, meanPrecision(pv), meanPrecision(pv), pv, pv],
    cellPrecision: [xi, yi].map((i) => {
      const p = colPrecision(ctx, i);
      return [null, 0, meanPrecision(p), meanPrecision(p), p, p];
    }),
    n,
  };
  if (withChart && n) built.chart = gk ? scatterByGroup(ctx, xi, yi, gi, pairs, groups) : scatterChart(ctx, xi, yi, pairs);
  return built;
}

/** Decimals that show at least two significant digits of a small number (0.0123 → 4). */
function significantDecimals(v: number): number {
  const a = Math.abs(v);
  if (!a || a >= 1) return 0;
  return Math.min(6, Math.ceil(-Math.log10(a)) + 1);
}

// ---------- Box plots (D25) ----------

/** Tukey summary of one group: quartiles of type 7, whiskers to the most extreme values within 1.5 × IQR. */
function tukey(xs: number[]): { n: number; min: number; q1: number; median: number; q3: number; max: number; whiskerLow: number; whiskerHigh: number; outliers: number[] } {
  const v = S.sorted(xs);
  const q = (p: number) => S.quantileSorted(v, p) as number; // groups are never empty here
  const q1 = q(0.25);
  const median = q(0.5);
  const q3 = q(0.75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const inside = v.filter((x) => x >= lo && x <= hi);
  const outliers = v.filter((x) => x < lo || x > hi);
  return {
    n: v.length,
    min: v[0],
    q1,
    median,
    q3,
    max: v[v.length - 1],
    whiskerLow: inside.length ? inside[0] : q1,
    whiskerHigh: inside.length ? inside[inside.length - 1] : q3,
    outliers,
  };
}

/** The `MAX_BOX_OUTLIERS` most extreme outliers of a box (by distance from the median), in ascending order. */
function keepOutliers(outliers: number[], median: number): number[] {
  if (outliers.length <= MAX_BOX_OUTLIERS) return outliers;
  return outliers
    .map((x, i) => ({ x, i, d: Math.abs(x - median) }))
    .sort((a, b) => b.d - a.d || a.i - b.i)
    .slice(0, MAX_BOX_OUTLIERS)
    .map((o) => o.x)
    .sort((a, b) => a - b);
}

function runBox(ctx: Ctx, vi: number, gi: number): Built {
  const tr = ctx.tr;
  const vals = numbersOf(ctx, vi);
  const keys = gi === -1 ? vals.map(() => "") : keysOf(ctx, gi);
  const pairs: [string, number][] = [];
  for (let r = 0; r < vals.length; r++) if (vals[r] !== null && keys[r] !== null) pairs.push([keys[r] as string, vals[r] as number]);
  noteMissing(ctx, vals.length - pairs.length);
  let order = [""];
  let folded = new Set<string>();
  if (gi !== -1) {
    const g = foldGroups(ctx, gi, countMap(pairs.map((p) => p[0])), MAX_BOX_GROUPS);
    order = g.keys;
    folded = g.folded;
  }
  const groups = new Map<string, number[]>();
  for (const k of order) groups.set(k, []);
  for (const [k, v] of pairs) (groups.get(folded.has(k) ? OTHER : k) as number[]).push(v);
  const used = order.filter((k) => (groups.get(k) as number[]).length > 0);
  const p = colPrecision(ctx, vi);
  const name = (k: string) => (gi === -1 ? label(ctx, vi) : showKey(ctx, gi, k));
  const sums = used.map((k) => tukey(groups.get(k) as number[]));
  const qp = medianPrecision(p, sums.flatMap((b) => [b.q1, b.median, b.q3]));
  const outlierCount = sums.reduce((s, b) => s + b.outliers.length, 0);
  ctx.notes.push(tr("data.note.box"));
  if (outlierCount) ctx.notes.push(tr("data.note.outliers", { k: outlierCount }));
  const built: Built = {
    title: gi === -1 ? title(ctx, "data.title.distribution", { a: mid(ctx, vi) }) : title(ctx, "data.title.box", { a: mid(ctx, vi), b: mid(ctx, gi) }),
    columns: [gi === -1 ? tr("data.col.variable") : label(ctx, gi), tr("data.col.n"), tr("data.col.min"), tr("data.col.q1"), tr("data.col.median"), tr("data.col.q3"), tr("data.col.max")],
    rows: used.map((k, j) => [name(k), sums[j].n, sums[j].min, sums[j].q1, sums[j].median, sums[j].q3, sums[j].max]),
    precision: [0, 0, p, qp, qp, qp, p],
    n: pairs.length,
  };
  if (pairs.length) {
    built.chart = {
      type: "box",
      xLabel: gi === -1 ? "" : label(ctx, gi),
      yLabel: label(ctx, vi),
      categories: used.map(name),
      series: [{ name: label(ctx, vi) }],
      boxes: used.map((k, j) => {
        const b = sums[j];
        return { label: name(k), n: b.n, min: b.min, q1: b.q1, median: b.median, q3: b.q3, max: b.max, whiskerLow: b.whiskerLow, whiskerHigh: b.whiskerHigh, outliers: keepOutliers(b.outliers, b.median) };
      }),
    };
  }
  return built;
}

// ---------- Inferential tests (D24) ----------

/** Notes that define an effect size: shown in the card (`test.notes`), left out of the inserted table. */
const CARD_ONLY_NOTES: Record<string, true> = { dPooled: true, dPaired: true };

/** Runs a test; an `InferenceError` becomes the matching `SpecError` (its detail, a column name, read as the column's label). */
function infer<T>(ctx: Ctx, fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (!isInferenceError(e)) throw e;
    const code = e.code === "length_mismatch" || e.code === "invalid_table" ? "invalid_spec" : e.code;
    const ci = e.detail ? resolveColumn(ctx.sheet, e.detail) : -1;
    throw new SpecError(code, ci !== -1 ? label(ctx, ci) : undefined);
  }
}

/** Fills `built.test` from a result: every note goes to the card; the ones a reader of the table needs also go to `table.notes`. */
function withTest(ctx: Ctx, built: Built, result: InferenceResult): Built {
  const fmt = formatNumber;
  // Notes name predictors by column name; the paper reads their labels ("Reference level of Region: Coast.").
  const notes: InferenceNote[] = (result.notes || []).map((n) => {
    const p = n.values && typeof n.values.predictor === "string" ? resolveColumn(ctx.sheet, n.values.predictor) : -1;
    return p === -1 ? n : { ...n, values: { ...n.values, predictor: label(ctx, p) } };
  });
  result = { ...result, notes } as InferenceResult;
  const test = toTestResult(result, ctx.lang, fmt, ctx.tr);
  for (const n of notes) if (!CARD_ONLY_NOTES[n.code]) ctx.notes.push(noteText(n, ctx.lang, fmt, ctx.tr));
  built.kind = "test";
  built.test = test;
  return built;
}

/** Numbers of `vi` grouped by the keys of `gi` (rows with both values); groups in natural order. */
function groupedValues(ctx: Ctx, vi: number, gi: number): { keys: string[]; groups: Map<string, number[]>; used: number } {
  const vals = numbersOf(ctx, vi);
  const keys = keysOf(ctx, gi);
  const groups = new Map<string, number[]>();
  let used = 0;
  for (let r = 0; r < vals.length; r++) {
    if (vals[r] === null || keys[r] === null) continue;
    pushTo(groups, keys[r] as string, vals[r] as number);
    used++;
  }
  noteMissing(ctx, vals.length - used);
  return { keys: orderKeys(ctx, gi, Array.from(groups.keys())), groups, used };
}

function requireGroupN(ctx: Ctx, gi: number, key: string, xs: number[] | undefined) {
  if (!xs || xs.length < MIN_N) throw new SpecError("too_few", showKey(ctx, gi, key));
}

const testTitle = (ctx: Ctx, id: string, vars: Record<string, string | number>) => title(ctx, `data.title.test.${id}`, vars);

/** Welch's t-test or the Mann–Whitney U test between the two `levels` of `gi`. */
function runTwoGroups(ctx: Ctx, op: "ttest" | "mannWhitney", vi: number, gi: number, levels: [string, string]): Built {
  const tr = ctx.tr;
  const { keys, groups } = groupedValues(ctx, vi, gi);
  const [ka, kb] = levels;
  requireGroupN(ctx, gi, ka, groups.get(ka));
  requireGroupN(ctx, gi, kb, groups.get(kb));
  const a = groups.get(ka) as number[];
  const b = groups.get(kb) as number[];
  if (keys.length > 2) ctx.notes.push(tr("data.note.twoGroups", { a: showKey(ctx, gi, ka), b: showKey(ctx, gi, kb), c: mid(ctx, gi) }));
  const p = colPrecision(ctx, vi);
  const id = op === "ttest" ? "welch" : "mannWhitney";
  const built: Built = { title: testTitle(ctx, id, { a: mid(ctx, vi), b: mid(ctx, gi) }), columns: [], rows: [], precision: [], n: a.length + b.length };
  if (op === "ttest") {
    const res = infer(ctx, () => welchTTest(a, b));
    built.columns = [label(ctx, gi), tr("data.col.n"), tr("data.col.mean"), tr("data.col.sd")];
    built.rows = [ka, kb].map((k, j) => [showKey(ctx, gi, k), res.groups[j].n, res.groups[j].mean, res.groups[j].sd]);
    built.precision = [0, 0, meanPrecision(p), meanPrecision(p)];
    return withTest(ctx, built, res);
  }
  const res = infer(ctx, () => mannWhitneyU(a, b));
  const medians = [S.median(a), S.median(b)];
  built.columns = [label(ctx, gi), tr("data.col.n"), tr("data.col.median"), tr("data.col.meanRank")];
  built.rows = [ka, kb].map((k, j) => [showKey(ctx, gi, k), res.groupN[j], medians[j], res.meanRanks[j]]);
  built.precision = [0, 0, medianPrecision(p, medians), 2];
  return withTest(ctx, built, res);
}

/** One-way ANOVA or the Kruskal–Wallis test across the groups of `gi` (2–12 groups, n ≥ 3 each). */
function runGroups(ctx: Ctx, op: "anova" | "kruskal", vi: number, gi: number): Built {
  const tr = ctx.tr;
  const { keys, groups } = groupedValues(ctx, vi, gi);
  if (keys.length < 2) throw new SpecError("too_few_groups", label(ctx, gi));
  if (keys.length > MAX_TEST_GROUPS) throw new SpecError("too_many_levels", label(ctx, gi));
  for (const k of keys) requireGroupN(ctx, gi, k, groups.get(k));
  const data = keys.map((k) => groups.get(k) as number[]);
  const p = colPrecision(ctx, vi);
  const id = op === "anova" ? "anova" : "kruskal";
  const n = data.reduce((s, xs) => s + xs.length, 0);
  const built: Built = { title: testTitle(ctx, id, { a: mid(ctx, vi), b: mid(ctx, gi) }), columns: [], rows: [], precision: [], n };
  if (op === "anova") {
    const res = infer(ctx, () => oneWayAnova(data));
    const all = data.reduce<number[]>((acc, xs) => acc.concat(xs), []);
    built.columns = [label(ctx, gi), tr("data.col.n"), tr("data.col.mean"), tr("data.col.sd")];
    built.rows = keys.map((k, j) => [showKey(ctx, gi, k), res.groups[j].n, res.groups[j].mean, res.groups[j].sd] as Cell[]).concat([[tr("data.value.total"), all.length, S.mean(all), S.sd(all)]]);
    built.precision = [0, 0, meanPrecision(p), meanPrecision(p)];
    return withTest(ctx, built, res);
  }
  const res = infer(ctx, () => kruskalWallis(data));
  const medians = data.map((xs) => S.median(xs));
  built.columns = [label(ctx, gi), tr("data.col.n"), tr("data.col.median"), tr("data.col.meanRank")];
  built.rows = keys.map((k, j) => [showKey(ctx, gi, k), res.groupN[j], medians[j], res.meanRanks[j]]);
  built.precision = [0, 0, medianPrecision(p, medians), 2];
  return withTest(ctx, built, res);
}

/** Complete pairs of two number columns. */
function completePairs(ctx: Ctx, xi: number, yi: number): { xs: number[]; ys: number[] } {
  const a = numbersOf(ctx, xi);
  const b = numbersOf(ctx, yi);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let r = 0; r < a.length; r++) {
    if (a[r] === null || b[r] === null) continue;
    xs.push(a[r] as number);
    ys.push(b[r] as number);
  }
  noteMissing(ctx, a.length - xs.length);
  if (xs.length < MIN_N) throw new SpecError("too_few", undefined);
  return { xs, ys };
}

/** Paired t-test of `ai` − `bi` over complete pairs; the table shows both variables and their difference. */
function runPaired(ctx: Ctx, ai: number, bi: number): Built {
  const tr = ctx.tr;
  const { xs, ys } = completePairs(ctx, ai, bi);
  const res = infer(ctx, () => pairedTTest(xs, ys));
  const pa = colPrecision(ctx, ai);
  const pb = colPrecision(ctx, bi);
  const pd = Math.max(pa, pb);
  const built: Built = {
    title: testTitle(ctx, "pairedT", { a: mid(ctx, ai), b: mid(ctx, bi) }),
    columns: [tr("data.col.variable"), tr("data.col.n"), tr("data.col.mean"), tr("data.col.sd")],
    rows: [
      [label(ctx, ai), xs.length, S.mean(xs), S.sd(xs)],
      [label(ctx, bi), ys.length, S.mean(ys), S.sd(ys)],
      [tr("data.test.row.difference", { a: label(ctx, ai), b: label(ctx, bi) }), res.n, res.meanDifference, res.sdDifference],
    ],
    precision: [0, 0, meanPrecision(pd), meanPrecision(pd)],
    cellPrecision: [pa, pb, pd].map((p) => [null, 0, meanPrecision(p), meanPrecision(p)]),
    n: res.n,
  };
  return withTest(ctx, built, res);
}

/** Pearson (with its 95 % CI) or Spearman correlation test of two number columns; the table describes both. */
function runCorrelationTest(ctx: Ctx, xi: number, yi: number, method: "pearson" | "spearman"): Built {
  const tr = ctx.tr;
  const { xs, ys } = completePairs(ctx, xi, yi);
  const res = infer(ctx, () => (method === "spearman" ? spearmanTest(xs, ys) : pearsonTest(xs, ys)));
  const dx = S.describe(xs);
  const dy = S.describe(ys);
  const built: Built = {
    title: testTitle(ctx, method, { a: mid(ctx, xi), b: mid(ctx, yi) }),
    columns: [tr("data.col.variable"), tr("data.col.n"), tr("data.col.mean"), tr("data.col.sd"), tr("data.col.median"), tr("data.col.min"), tr("data.col.max")],
    rows: [
      [label(ctx, xi), dx.n, dx.mean, dx.sd, dx.median, dx.min, dx.max],
      [label(ctx, yi), dy.n, dy.mean, dy.sd, dy.median, dy.min, dy.max],
    ],
    precision: [0, 0, 2, 2, 2, 0, 0],
    cellPrecision: [
      { i: xi, m: dx.median },
      { i: yi, m: dy.median },
    ].map(({ i, m }) => {
      const p = colPrecision(ctx, i);
      return [null, 0, meanPrecision(p), meanPrecision(p), medianPrecision(p, [m]), p, p];
    }),
    n: res.n,
  };
  return withTest(ctx, built, res);
}

/** χ² test of independence of two category columns; the table is the observed crosstab with totals. */
function runChiSquare(ctx: Ctx, ri: number, ci: number): Built {
  const tr = ctx.tr;
  const rk = keysOf(ctx, ri);
  const ck = keysOf(ctx, ci);
  const pairs: [string, string][] = [];
  for (let r = 0; r < rk.length; r++) if (rk[r] !== null && ck[r] !== null) pairs.push([rk[r] as string, ck[r] as string]);
  noteMissing(ctx, rk.length - pairs.length);
  if (pairs.length < MIN_N) throw new SpecError("too_few", undefined);
  let rowsK = orderKeys(ctx, ri, Array.from(new Set(pairs.map((p) => p[0]))));
  let colsK = orderKeys(ctx, ci, Array.from(new Set(pairs.map((p) => p[1]))));
  if (rowsK.length < 2) throw new SpecError("too_few_groups", label(ctx, ri));
  if (colsK.length < 2) throw new SpecError("too_few_groups", label(ctx, ci));
  // The variable with fewer levels goes across, so the table stays within 8 columns.
  let across = ci;
  let down = ri;
  let flip = false;
  if (colsK.length > MAX_CHISQUARE_COLUMNS && rowsK.length < colsK.length) {
    flip = true;
    across = ri;
    down = ci;
    const t = rowsK;
    rowsK = colsK;
    colsK = t;
  }
  if (colsK.length > MAX_CHISQUARE_COLUMNS || rowsK.length > MAX_TEST_GROUPS) throw new SpecError("too_many_levels", label(ctx, rowsK.length > MAX_TEST_GROUPS ? down : across));
  const cell = new Map<string, number>();
  for (const [a, b] of pairs) {
    const key = flip ? b + "\u0001" + a : a + "\u0001" + b;
    cell.set(key, (cell.get(key) || 0) + 1);
  }
  const get = (a: string, b: string) => cell.get(a + "\u0001" + b) || 0;
  const observed = rowsK.map((a) => colsK.map((b) => get(a, b)));
  const res = infer(ctx, () => chiSquareIndependence(observed));
  const rows: Cell[][] = rowsK.map((a, i) => [showKey(ctx, down, a), ...observed[i], observed[i].reduce((s, x) => s + x, 0)]);
  rows.push([tr("data.value.total"), ...colsK.map((_, j) => observed.reduce((s, r) => s + r[j], 0)), pairs.length]);
  const built: Built = {
    title: testTitle(ctx, "chiSquare", { a: mid(ctx, ri), b: mid(ctx, ci) }),
    columns: [label(ctx, down), ...colsK.map((b) => showKey(ctx, across, b)), tr("data.value.total")],
    rows,
    precision: [0, ...colsK.map(() => 0), 0],
    n: res.n,
  };
  return withTest(ctx, built, res);
}

/** OLS regression of `yi` on up to 6 predictors (numbers as they are, categories dummy coded, first level as reference). */
function runRegression(ctx: Ctx, yi: number, pis: number[]): Built {
  const tr = ctx.tr;
  const y = numbersOf(ctx, yi);
  const preds: Predictor[] = pis.map((pi) => {
    const c = ctx.cols[pi];
    if (isNumericCol(c)) return { name: c.name, values: numbersOf(ctx, pi), kind: "numeric" };
    const keys = keysOf(ctx, pi);
    const levels = orderKeys(ctx, pi, Array.from(new Set(keys.filter((k): k is string => k !== null))));
    return { name: c.name, values: keys.map((k) => (k === null ? null : showKey(ctx, pi, k))), kind: "categorical", levels: levels.map((k) => showKey(ctx, pi, k)) };
  });
  const res = infer(ctx, () => olsRegression(y, preds, { response: ctx.cols[yi].name }));
  const nameLabel = (name: string) => {
    const i = resolveColumn(ctx.sheet, name);
    return i === -1 ? name : label(ctx, i);
  };
  const table = coefficientTable(res, ctx.lang, formatNumber, tr, nameLabel);
  ctx.notes.push(tr("data.note.adjR2", { v: formatEffectValue(res.adjR2, ctx.lang), n: res.n }));
  const built: Built = {
    title: testTitle(ctx, "regression", { a: mid(ctx, yi), list: listJoin(pis.map((pi) => mid(ctx, pi)), tr) }),
    columns: table.columns,
    rows: table.rows,
    precision: table.precision,
    n: res.n,
  };
  withTest(ctx, built, res);
  const latex = regressionLatex(res, table.precision[1], ctx.lang, nameLabel);
  if (latex) built.equation = { latex, display: true };
  return built;
}

/** A value that cannot exceed 1 (R², r) as APA prints it: two decimals, no leading zero. */
function formatEffectValue(v: number, lang: WritingLanguage): string {
  return formatNumber(v, lang, 2).replace(/^(-?)0(?=[.,])/, "$1");
}

/**
 * Text of a name inside `\mathrm{…}` of the math module's LaTeX subset: letters and digits as they are, spaces as
 * "\ ", a few safe signs, ², ³ as superscripts, everything else as a space. Null when nothing readable is left.
 */
function latexName(s: string): string | null {
  let out = "";
  for (const ch of String(s).slice(0, 80)) {
    if (/[0-9]/.test(ch) || ch.toLowerCase() !== ch.toUpperCase()) out += ch;
    else if (ch === "²") out += "^{2}";
    else if (ch === "³") out += "^{3}";
    else if ("().,/:[]°".indexOf(ch) !== -1) out += ch;
    else if (ch === "-" || ch === "–") out += "\\text{-}";
    else if (ch === "%") out += "\\%";
    else if (ch === "&") out += "\\&";
    else out += "\\ ";
  }
  out = out.replace(/(\\ )+/g, "\\ ").replace(/^(\\ )+|(\\ )+$/g, "");
  return out ? `\\mathrm{${out}}` : null;
}

/**
 * The fitted equation as LaTeX (D24), e.g. `\hat{y} = 812.40 + 0.53\,\mathrm{Elevation\ (m)} - 2.10\,\mathrm{Region}_{\mathrm{North}}`,
 * with the coefficients' decimals of the table and the writing language's decimal mark. Every name is checked with
 * the math parser; a name it refuses becomes x₁, x₂… Null when the whole equation does not parse.
 */
function regressionLatex(res: RegressionResult, decimals: number, lang: WritingLanguage, nameLabel: (name: string) => string): string | null {
  const eq = res.equation;
  const num = (v: number) => formatNumber(Math.abs(v), lang, decimals);
  const safe = (latex: string | null, fallback: string) => (latex && parseLatex(latex).ok ? latex : fallback);
  const order: string[] = [];
  let out = `\\hat{y} = ${eq.intercept < 0 ? "-" : ""}${num(eq.intercept)}`;
  for (const t of eq.terms) {
    if (order.indexOf(t.predictor) === -1) order.push(t.predictor);
    const name = safe(latexName(nameLabel(t.predictor)), `x_{${order.indexOf(t.predictor) + 1}}`);
    const term = t.level !== undefined ? `${name}_{${safe(latexName(t.level), `\\mathrm{${order.indexOf(t.predictor) + 1}}`)}}` : name;
    out += ` ${t.coefficient < 0 ? "-" : "+"} ${num(t.coefficient)}\\,${term}`;
  }
  return parseLatex(out).ok ? out : null;
}

// ---------- Timelines from a sheet (D26) ----------

/** A timeline from task, start, end (and group) columns: the first 30 complete tasks in sheet order, as a diagram. */
function runGantt(ctx: Ctx, li: number, si: number, ei: number, gi: number): Built {
  const tr = ctx.tr;
  const labels = ctx.sheet.data[li].map((v) => cellText(v));
  const day = (v: DatasetCell) => {
    const t = dateMs(v);
    return t === null ? null : isoDate(t).slice(0, 10);
  };
  const starts = ctx.sheet.data[si].map(day);
  const ends = ctx.sheet.data[ei].map(day);
  const groups = gi === -1 ? null : keysOf(ctx, gi);
  const tasks: { label: string; start: string; end: string; group?: string; milestone?: boolean }[] = [];
  let missing = 0;
  let reversed = 0;
  let complete = 0;
  for (let r = 0; r < ctx.sheet.rowCount; r++) {
    const l = labels[r];
    const a = starts[r];
    const b = ends[r];
    if (l === null || a === null || b === null) {
      if (l !== null || a !== null || b !== null) missing++;
      continue;
    }
    if (b < a) {
      reversed++;
      continue;
    }
    complete++;
    if (tasks.length >= MAX_GANTT_TASKS) continue;
    const task: { label: string; start: string; end: string; group?: string; milestone?: boolean } = { label: l, start: a, end: b };
    const g = groups ? groups[r] : null;
    if (g !== null) task.group = showKey(ctx, gi, g);
    if (a === b) task.milestone = true;
    tasks.push(task);
  }
  if (!tasks.length) throw new SpecError("no_data", label(ctx, si));
  if (missing) ctx.notes.push(tr("data.note.missing", { n: missing }));
  if (reversed) ctx.notes.push(tr("data.note.ganttReversed", { n: reversed }));
  if (complete > tasks.length) ctx.notes.push(tr("data.note.ganttCut", { n: tasks.length, total: complete }));
  const sanitized = sanitizeDiagram({ figure: "gantt", tasks });
  if (!sanitized.ok) throw new SpecError(sanitized.code === "range_too_long" ? "range_too_long" : "invalid_spec", label(ctx, si));
  const diagram = sanitized.spec;
  const shown = diagram.figure === "gantt" ? diagram.tasks : [];
  const columns = [label(ctx, li), label(ctx, si), label(ctx, ei)].concat(gi === -1 ? [] : [label(ctx, gi)]);
  const built: Built = {
    title: gi === -1 ? title(ctx, "data.title.gantt") : title(ctx, "data.title.ganttBy", { c: mid(ctx, gi) }),
    columns,
    rows: shown.map((t) => [t.label, t.start, t.end].concat(gi === -1 ? [] : [t.group ?? ""]) as Cell[]),
    precision: columns.map(() => 0),
    n: shown.length,
    kind: "diagram",
    diagram,
  };
  if (sanitized.warnings.length) built.warnings = sanitized.warnings;
  return built;
}

// ---------- Chips and the demo planner ----------

export interface Suggestion {
  /** Chip text, in the interface language. */
  label: string;
  /** What the chip sends as the student's message (the same words, so the planner reads it back). */
  prompt: string;
  /** What the chip asks Thesisfic to compute. */
  spec: AnalysisSpec;
}

function langOf(tr: Translate, lang?: WritingLanguage): WritingLanguage {
  if (lang) return lang;
  const l = tr("data.lang");
  return l === "es" || l === "fr" || l === "de" ? l : "en";
}

function firstUsableSheet(dataset: Pick<Dataset, "sheets">): number {
  const i = dataset.sheets.findIndex((s) => s.columns.some((c) => c.role === "measure") && s.rowCount > 0);
  if (i !== -1) return i;
  const j = dataset.sheets.findIndex((s) => s.rowCount > 0);
  return j === -1 ? 0 : j;
}

/**
 * Up to 4 chips for an attached sheet (docs/papers.md §3.4, §4.5, §9.3), in this order of preference: "Describe the
 * data", "{measure} by {category}", "Compare {measure} across {category}" (a t-test with two groups, an ANOVA with
 * more), "Trend of {measure} over {time}", "Frequency of {category}"; "Relationship between …" and "Distribution of …"
 * fill in when a sheet has no category or no time column. Identifiers and free text are never picked. Chip texts name
 * analyses, never "write" or "for me" (they must pass the generation policy).
 */
export function suggestions(dataset: Pick<Dataset, "sheets">, tr: Translate, lang?: WritingLanguage): Suggestion[] {
  if (!dataset.sheets.length) return [];
  const l = langOf(tr, lang);
  const si = firstUsableSheet(dataset);
  const sheet = dataset.sheets[si];
  const cls = classifyColumns(sheet);
  const m = (c: DatasetColumn) => inSentence(c.label || c.name, l);
  const out: Suggestion[] = [];
  const add = (text: string, spec: AnalysisSpec) => {
    if (out.length >= 4) return;
    const v = validateSpec(spec, dataset, si);
    const t = capFirst(text);
    if (v.ok) out.push({ label: t, prompt: t, spec: v.spec });
  };
  const measure = cls.measures[0];
  const cat = cls.categories[0];
  const time = cls.time[0];
  if (measure) add(tr("data.chip.describe"), { op: "describe", sheet: sheet.name });
  if (measure && cat) add(tr("data.chip.groupBy", { a: m(measure), b: m(cat) }), { op: "groupSummary", sheet: sheet.name, value: measure.name, by: cat.name, stat: "mean" });
  if (measure && cat) add(tr("data.chip.compare", { a: m(measure), b: m(cat) }), { op: cat.distinct <= 2 ? "ttest" : "anova", sheet: sheet.name, value: measure.name, by: cat.name });
  if (measure && time) add(tr("data.chip.trend", { a: m(measure), b: m(time) }), { op: "trend", sheet: sheet.name, y: measure.name, x: time.name });
  if (cat) add(tr("data.chip.frequency", { a: m(cat) }), { op: "frequencies", sheet: sheet.name, column: cat.name });
  if (cls.measures.length >= 2) add(tr("data.chip.scatter", { a: m(cls.measures[1]), b: m(cls.measures[0]) }), { op: "scatter", sheet: sheet.name, x: cls.measures[1].name, y: cls.measures[0].name });
  if (measure) add(tr("data.chip.distribution", { a: m(measure) }), { op: "distribution", sheet: sheet.name, column: measure.name });
  if (!out.length && cls.tableCategories[0]) add(tr("data.chip.frequency", { a: m(cls.tableCategories[0]) }), { op: "frequencies", sheet: sheet.name, column: cls.tableCategories[0].name });
  return out;
}

/** Normalised request text: lower case, no accents, words separated by single spaces, padded with spaces. */
function normText(s: string): string {
  return " " + plain(String(s || "")).replace(/[^a-z0-9]+/g, " ").trim() + " ";
}

const KW = {
  pie: /\b(pie|pies|piechart|tarta|tartas|pastel|quesitos?|circular|sectores|camemberts?|secteurs|diagramme circulaire|kreis\w*|torte\w*)\b/,
  box: /\b(box ?plots?|boxplots?|box and whiskers?|box whiskers?|caja y bigotes|cajas y bigotes|diagramas? de cajas?|bigotes|boites? a moustaches|moustaches|kastengrafik\w*|boxplot\w*)\b/,
  gantt: /\b(gantt\w*|timelines?|time lines?|cronogramas?|calendrier\w*|planning|zeitplan\w*|zeitleiste\w*|terminplan\w*|chronogramme\w*)\b/,
  paired: /\b(paired|pareadas?|pareados?|relacionadas|emparejad\w*|appariee?s?|apparie\w*|abhangig\w*|gepaart\w*|verbunden\w*|before and after|before after|pre post|pre and post|antes y despues|avant et apres|avant apres|vorher nachher|vorher und nachher)\b/,
  anova: /\b(anova|analysis of variance|analisis de (la )?varianza|analyse de (la )?variance|varianzanalyse\w*)\b/,
  kruskal: /\b(kruskal\w*|wallis)\b/,
  mannWhitney: /\b(mann ?whitney|wilcoxon rank sum|u test|test u|prueba u|u de mann|rangsumm\w*|non ?parametric\w*|no parametric\w*|non parametrique\w*|nicht ?parametrisch\w*|parameterfrei\w*)\b/,
  /** The Mann–Whitney test by name (not "non-parametric"): two groups even when the column has more. */
  mannWhitneyName: /\b(mann ?whitney|wilcoxon rank sum|u test|test u|prueba u|u de mann|rangsumm\w*)\b/,
  ttest: /\b(t ?tests?|t de student|student s t|welch\w*|prueba t|test t|zweistichproben\w*)\b/,
  compare: /\b(compare|compares|comparing|comparison|comparar|compara|comparacion\w*|comparer|comparez|comparaison\w*|vergleich\w*|difference\w*|diferencias?|unterschied\w*|differ|differs|different\w*|diferentes?|distint[oa]s?)\b/,
  /** "between A and B": with two named groups, a comparison of those two. */
  between: /\b(between|entre|zwischen)\b/,
  chisquare: /\b(chi ?2|chi ?squared?|chi cuadrad[oa]|khi ?2|khi deux|chi quadrat\w*|independence|independencia|independance|unabhangigkeit\w*)\b/,
  significance: /\b(signific\w*|signifikan\w*|p ?values?|valor(es)? p|valeurs? p|p ?wert\w*|tests?|tested|testing|pruebas?|contraste\w*|tester|testen)\b/,
  spearman: /\b(spearman\w*|rank correlation|correlacion de rangos|correlation de rangs|rangkorrelation\w*)\b/,
  pearson: /\b(pearson\w*)\b/,
  regression: /\b(regress\w*|regresion\w*|predict\w*|predecir|predic\w*|predire|prediction\w*|vorhersag\w*|prognos\w*|linear model|modelo lineal|modele lineaire|lineares modell)\b/,
  unsupported: /\b(logistic|logistica|logistique|logistisch\w*|factor analysis|analisis factorial|analyse factorielle|faktorenanalyse|cluster\w*|conglomerados|manova|ancova|two way anova|anova de dos factores|anova a deux facteurs|zweifaktoriell\w*|repeated measures|medidas repetidas|mesures repetees|messwiederholung\w*|post ?hoc|tukey hsd|bonferroni|shapiro\w*|levene|fisher exact|exacta de fisher|exact de fisher|exakte test nach fisher|wilcoxon signed|signed rank|rangos con signo|rangs signes|vorzeichen\w*|arima|forecast\w*|pronostic\w*|previsions?|mixed models?|multilevel|modelos mixtos|modeles mixtes|gemischte modelle|structural equation|ecuaciones estructurales|equations structurelles|strukturgleichung\w*|survival|supervivencia|survie|uberlebenszeit\w*|qualitative coding|codificacion cualitativa|codage qualitatif|qualitative kodierung|ocr)\b/,
  crosstab: /\b(cross ?tab\w*|crosstab\w*|contingenc\w*|tabla cruzada|tablas cruzadas|tabla de contingencia|tableau croise|tableaux croises|tri croise|kreuztabelle\w*|kontingenz\w*)\b/,
  correlation: /\b(correl\w*|korrel\w*|relationship\w*|relation\w*|relacion\w*|associat\w*|asociacion\w*|lien\w*|zusammenhang\w*|beziehung\w*)\b/,
  scatter: /\b(scatter\w*|dispersion|nube de puntos|nuage de points|streu\w*|against|versus|vs|frente a|en funcion de|en fonction de|gegen|gegenuber)\b/,
  /** "y against x": the outcome is named first. */
  versus: /\b(against|versus|vs|frente a|en funcion de|en fonction de|gegen|gegenuber)\b/,
  distribution: /\b(histogram\w*|histograma\w*|distribution\w*|distribucion\w*|repartition\w*|verteilung\w*|spread)\b/,
  trend: /\b(trends?|tendencias?|tendances?|over time|over the years|evolution|evolucion|a lo largo|au fil|verlauf\w*|entwicklung\w*|zeitverlauf\w*|zeitreihe\w*|time series|serie temporal|serie chronologique|over)\b/,
  describe: /\b(describ\w*|descript\w*|summar\w*|overview|resumen\w*|resum\w*|decri\w*|synthese|beschreib\w*|deskriptiv\w*|uberblick|zusammenfass\w*|kennzahl\w*|kennwert\w*|statistics|statistic|estadistic\w*|statistiques?|statistik\w*)\b/,
  frequencies: /\b(frequenc\w*|frecuencias?|frequences?|haufigkeit\w*|counts?|counting|how many|recuentos?|conteos?|cuantos|cuantas|effectifs?|combien|anzahl|wie viele|number of|numero de|nombre de)\b/,
  mean: /\b(means?|averages?|media|medias|promedios?|moyennes?|mittelwert\w*|durchschnitt\w*)\b/,
  median: /\b(medians?|medianas?|mediane)\b/,
  sum: /\b(sums?|totals?|suma|sumas|sommes?|summe\w*|gesamt\w*)\b/,
  by: /\b(by|per|across|for each|por|segun|par|selon|nach|pro|je)\b/,
};

/**
 * Requests for analyses Thesisfic does not compute (logistic regression, factor analysis, post hoc tests, forecasts,
 * qualitative coding…): answer with `data.unsupported`. Pie and box plots, the tests of D24 and timelines are computed.
 */
export function isUnsupportedRequest(text: string): boolean {
  return KW.unsupported.test(normText(text));
}

/** A request asking for a pie chart (D25): frequencies with `chart: "pie"` (bars with a note when a pie does not fit). */
export function isPieRequest(text: string): boolean {
  return KW.pie.test(normText(text));
}

const STOP = new Set(["data", "value", "values", "number", "count", "total", "mean", "average", "median", "rate", "level", "type", "group", "column", "score", "year", "time", "date", "with", "from", "the", "and", "for"]);

/** Columns named in a request, in order of appearance: full names and labels first, then words only one column has. */
function mentions(text: string, sheet: DatasetSheet): number[] {
  const t = normText(text);
  const claimed: [number, number][] = [];
  const found: { ci: number; pos: number }[] = [];
  const free = (a: number, b: number) => claimed.every(([x, y]) => b <= x || a >= y);
  const phrases: { ci: number; p: string }[] = [];
  sheet.columns.forEach((c, ci) => {
    if (c.role === "empty") return;
    const set = new Set([normKey(c.name), normKey(c.label), normKey(c.label.replace(/\s*\([^)]*\)\s*$/, ""))]);
    set.forEach((p) => p && phrases.push({ ci, p }));
  });
  phrases.sort((a, b) => b.p.length - a.p.length);
  for (const { ci, p } of phrases) {
    // The name as written, then its plural ("years", "regions").
    for (const form of p.slice(-1) === "s" ? [p] : [p, p + "s"]) {
      if (found.some((f) => f.ci === ci)) break;
      let from = 0;
      while (from < t.length) {
        const pos = t.indexOf(" " + form + " ", from);
        if (pos === -1) break;
        // Spans exclude the surrounding spaces, so neighbouring mentions ("rainfall elevation") both count.
        if (free(pos + 1, pos + 1 + form.length)) {
          claimed.push([pos + 1, pos + 1 + form.length]);
          found.push({ ci, pos });
          break;
        }
        from = pos + 1;
      }
    }
  }
  // Distinctive single words ("rainfall" for annual_rainfall_mm), when only one column has them.
  const owners = new Map<string, number[]>();
  sheet.columns.forEach((c, ci) => {
    if (c.role === "empty") return;
    const words = new Set(normKey(c.label.replace(/\s*\([^)]*\)\s*$/, "")).split(" ").concat(normKey(c.name).split(" ")));
    words.forEach((w) => {
      if (w.length < 4 || STOP.has(w)) return;
      owners.set(w, (owners.get(w) || []).concat(ci));
    });
  });
  owners.forEach((cis, w) => {
    if (cis.length !== 1 || found.some((f) => f.ci === cis[0])) return;
    for (const form of [w, w + "s", w + "es"]) {
      const pos = t.indexOf(" " + form + " ");
      if (pos !== -1 && free(pos + 1, pos + 1 + form.length)) {
        claimed.push([pos + 1, pos + 1 + form.length]);
        found.push({ ci: cis[0], pos });
        break;
      }
    }
  });
  return found.sort((a, b) => a.pos - b.pos).map((f) => f.ci);
}

/** The request without the names of the sheet's columns, so a column called "test_score" or "trend" reads as data, not as a keyword. */
function withoutColumnNames(t: string, sheet: DatasetSheet): string {
  const phrases: string[] = [];
  for (const c of sheet.columns) {
    if (c.role === "empty") continue;
    for (const p of [normKey(c.name), normKey(c.label), normKey(c.label.replace(/\s*\([^)]*\)\s*$/, ""))]) if (p && phrases.indexOf(p) === -1) phrases.push(p);
  }
  phrases.sort((a, b) => b.length - a.length);
  let out = t;
  for (const p of phrases) out = out.split(" " + p + " ").join("  ").split(" " + p + "s ").join("  ");
  return out.replace(/ +/g, " ");
}

/**
 * Specs for a request in plain words (demo mode and chips), by keyword rules in en/es/fr/de and the columns the text
 * names (keywords are read with the column names taken out). Timelines, box plots, pie charts and the tests of D24
 * (t-test, paired t-test, ANOVA, Mann–Whitney, Kruskal–Wallis, chi-square, correlation tests, regression) come
 * first; "compare … across …" is a t-test with two groups and an ANOVA with more; anything unclear becomes
 * `describe`. Every spec returned is validated and normalised. At most 4.
 */
export function planFromRequest(text: string, dataset: Pick<Dataset, "sheets">, tr: Translate): AnalysisSpec[] {
  void tr;
  if (!dataset.sheets.length) return [];
  const full = normText(text);
  // The sheet whose columns the request names most, else the first usable one.
  let si = firstUsableSheet(dataset);
  let bestCount = -1;
  dataset.sheets.forEach((s, i) => {
    const k = mentions(text, s).length;
    if (k > bestCount && k > 0) {
      bestCount = k;
      si = i;
    }
  });
  if (dataset.sheets.length > 1) {
    const named = dataset.sheets.findIndex((s) => normKey(s.name) && full.indexOf(" " + normKey(s.name) + " ") !== -1);
    if (named !== -1) si = named;
  }
  const sheet = dataset.sheets[si];
  const t = withoutColumnNames(full, sheet);
  const cols = sheet.columns;
  const cls = classifyColumns(sheet);
  const ment = mentions(text, sheet);
  const role = (ci: number) => cols[ci].role;
  const num = ment.filter((ci) => role(ci) === "measure" && isNumericCol(cols[ci]));
  const time = ment.filter((ci) => role(ci) === "time");
  const cat = ment.filter((ci) => role(ci) === "category");
  const idx = (c: DatasetColumn | undefined) => (c ? cols.indexOf(c) : -1);
  const name = (ci: number) => cols[ci].name;
  const statOf = (): AnalysisSpec["stat"] => (KW.median.test(t) ? "median" : KW.sum.test(t) ? "sum" : KW.mean.test(t) ? "mean" : undefined);
  const base = { sheet: sheet.name };
  const specs: AnalysisSpec[] = [];
  const push = (s: AnalysisSpec) => {
    const v = validateSpec(s, dataset, si);
    if (v.ok && specs.length < MAX_ARTIFACTS) specs.push(v.spec);
    return v.ok;
  };
  const bestMeasure = () => (num[0] ?? idx(cls.measures[0]));
  const firstCat = () => (cat[0] ?? idx(cls.categories[0]) ?? -1);
  const catOr = (ci: number) => (ci === -1 ? idx(cls.tableCategories[0]) : ci);

  /** A column to group by: the first category or time column named, else the first category of the sheet. */
  const groupCol = () => (cat[0] !== undefined ? cat[0] : time[0] !== undefined ? time[0] : idx(cls.categories[0]));
  /** Two number columns: the ones named, filled with the sheet's measures. */
  const twoNums = () => num.concat(cls.measures.map((c) => cols.indexOf(c)).filter((ci) => num.indexOf(ci) === -1)).slice(0, 2);
  /** A test comparing `m` across the groups of `g`: two groups → t-test (or Mann–Whitney), more → ANOVA (or Kruskal–Wallis). */
  const compareSpec = (m: number, g: number, rank: boolean): AnalysisSpec => {
    const two = cols[g].distinct <= 2;
    return { ...base, op: two ? (rank ? "mannWhitney" : "ttest") : rank ? "kruskal" : "anova", value: name(m), by: name(g) };
  };
  /**
   * The groups the request names ("between North and South"): the first group column (named ones first) whose values
   * appear in the text — matched on the value ignoring case and accents, as validateSpec matches `levels` — with
   * exactly two of them named. Yes/No columns, dates and short numbers are never matched (too ambiguous in prose).
   */
  const namedPair = ((): { g: number; levels: [string, string] } | null => {
    const ctx = bareCtx(sheet);
    const pool = uniq(cat.concat(time, cls.categories.map((c) => cols.indexOf(c)), cls.time.map((c) => cols.indexOf(c)))).filter((ci) => ci !== -1);
    for (const gi of pool) {
      const c = cols[gi];
      if (c.type === "boolean" || c.type === "date" || c.distinct > MAX_TEST_GROUPS * 4) continue;
      const keys = Array.from(new Set(keysOf(ctx, gi).filter((k): k is string => k !== null)));
      const forms = keys
        .map((k) => ({ k, p: normKey(k) }))
        .filter(({ p }) => p.length >= (c.type === "number" ? 3 : 2))
        .sort((a, b) => b.p.length - a.p.length);
      const claimed: [number, number][] = [];
      const hits: { k: string; pos: number }[] = [];
      for (const { k, p } of forms) {
        let from = 0;
        while (from < full.length) {
          const pos = full.indexOf(" " + p + " ", from);
          if (pos === -1) break;
          const a = pos + 1;
          const b = a + p.length;
          if (claimed.every(([x, y]) => b <= x || a >= y)) {
            claimed.push([a, b]);
            if (!hits.some((h) => h.k === k)) hits.push({ k, pos });
            break;
          }
          from = pos + 1;
        }
      }
      if (hits.length === 2) {
        hits.sort((x, y) => x.pos - y.pos);
        return { g: gi, levels: [hits[0].k, hits[1].k] };
      }
      if (hits.length > 2) return null;
    }
    return null;
  })();
  /** A two-group test of the named pair (Welch's t, or Mann–Whitney when ranks are asked for). */
  const pairSpec = (m: number, rank: boolean): AnalysisSpec | null =>
    namedPair && m !== -1 && m !== namedPair.g ? { ...base, op: rank ? "mannWhitney" : "ttest", value: name(m), by: name(namedPair.g), levels: namedPair.levels } : null;

  const plan = (): boolean => {
    // Timelines: a sheet with task start and end dates.
    if (KW.gantt.test(t) && cols.filter((c) => c.type === "date").length >= 2) {
      if (push({ ...base, op: "gantt" })) return true;
    }
    if (KW.box.test(t)) {
      const m = bestMeasure();
      const g = cat[0] ?? time[0];
      if (m !== -1 && push({ ...base, op: "distribution", column: name(m), chart: "box", ...(g !== undefined ? { by: name(g) } : {}) })) return true;
    }
    if (KW.pie.test(t)) {
      const c = cat[0] ?? time[0] ?? catOr(idx(cls.categories[0]));
      if (c !== -1 && push({ ...base, op: "frequencies", column: name(c), chart: "pie" })) return true;
    }
    if (KW.paired.test(t)) {
      const pair = twoNums();
      if (pair.length === 2 && push({ ...base, op: "pairedTtest", columns: pair.map(name) })) return true;
    }
    const rank = KW.mannWhitney.test(t) || KW.kruskal.test(t);
    if (rank || KW.anova.test(t) || KW.ttest.test(t)) {
      const m = bestMeasure();
      // Two groups named in the request ("t-test … between North and South"): those two, whatever the column holds.
      const pair = KW.anova.test(t) || KW.kruskal.test(t) ? null : pairSpec(m, KW.mannWhitney.test(t));
      if (pair && push(pair)) return true;
      const g = groupCol();
      if (m !== -1 && g !== -1) {
        const spec = compareSpec(m, g, rank);
        // An explicit test name wins over the number of groups when it can run (a t-test or Mann–Whitney test of the
        // two largest groups).
        if (KW.kruskal.test(t)) spec.op = "kruskal";
        else if (KW.anova.test(t)) spec.op = "anova";
        else if (KW.mannWhitneyName.test(t)) spec.op = "mannWhitney";
        else if (KW.ttest.test(t) && !rank) spec.op = "ttest";
        if (push(spec)) return true;
      }
    }
    const catLike = ment.filter((ci) => role(ci) === "category" || role(ci) === "time");
    if (KW.chisquare.test(t) || (KW.correlation.test(t) && KW.significance.test(t) && catLike.length >= 2 && !num.length)) {
      const a = catLike[0] ?? idx(cls.categories[0]);
      const b = catLike.slice(1).concat(cls.categories.map((c) => cols.indexOf(c))).find((ci) => ci !== a && ci !== -1);
      if (a !== -1 && b !== undefined && push({ ...base, op: "chisquare", row: name(a), col: name(b) })) return true;
    }
    if (KW.regression.test(t)) {
      const y = bestMeasure();
      const named = ment.filter((ci) => ci !== y && cols[ci].role !== "identifier" && cols[ci].role !== "freeText" && cols[ci].type !== "date");
      const fallback = cls.measures.map((c) => cols.indexOf(c)).filter((ci) => ci !== y).slice(0, 1);
      const preds = named.length ? named : fallback.length ? fallback : [groupCol()].filter((ci) => ci !== -1);
      if (y !== -1 && preds.length && push({ ...base, op: "regression", y: name(y), predictors: preds.slice(0, 6).map(name) })) return true;
    }
    if ((KW.correlation.test(t) || KW.spearman.test(t) || KW.pearson.test(t)) && (KW.significance.test(t) || KW.spearman.test(t) || KW.pearson.test(t))) {
      const pair = twoNums();
      if (pair.length === 2 && push({ ...base, op: "correlationTest", x: name(pair[0]), y: name(pair[1]), method: KW.spearman.test(t) ? "spearman" : "pearson" })) return true;
    }
    // "Compare rainfall between North and South", "rainfall in North vs South": the two groups named.
    // Two years named in a trend request ("trend between 2010 and 2020") are a range, not two groups.
    const pairIsRange = !!namedPair && cols[namedPair.g].role === "time" && KW.trend.test(t) && !KW.compare.test(t);
    if (namedPair && !pairIsRange && (KW.compare.test(t) || KW.between.test(t) || KW.versus.test(t) || KW.significance.test(t))) {
      const pair = pairSpec(bestMeasure(), false);
      if (pair && push(pair)) return true;
    }
    // "Compare a and b" with two number columns and no group: the same rows measured twice (paired).
    if (KW.compare.test(t) && num.length >= 2 && !cat.length && !time.length) {
      if (push({ ...base, op: "pairedTtest", columns: num.slice(0, 2).map(name) })) return true;
    }
    if (KW.compare.test(t) || (KW.significance.test(t) && num.length && (cat.length || time.length))) {
      const m = bestMeasure();
      const g = groupCol();
      if (m !== -1 && g !== -1 && push(compareSpec(m, g, false))) return true;
    }
    if (KW.crosstab.test(t)) {
      const a = cat[0] ?? catOr(idx(cls.categories[0]));
      const others = cat.slice(1).concat(time, cls.categories.map((c) => cols.indexOf(c))).filter((ci) => ci !== a);
      if (a !== -1 && others.length && push({ ...base, op: "crosstab", row: name(a), col: name(others[0]) })) return true;
    }
    if (KW.correlation.test(t) || KW.scatter.test(t)) {
      const nums = num.length ? num : [];
      const fill = cls.measures.map((c) => cols.indexOf(c)).filter((ci) => nums.indexOf(ci) === -1);
      const pool = nums.concat(fill);
      if (KW.scatter.test(t) || (KW.correlation.test(t) && nums.length === 2)) {
        // "y against x", "y vs x" name the outcome first; "correlation between a and b", "a and b" keep the order of
        // mention (x first), so the fitted line predicts the second variable from the first.
        if (pool.length >= 2) {
          const by = cat[0];
          const yFirst = KW.versus.test(t);
          const x = name(yFirst ? pool[1] : pool[0]);
          const y = name(yFirst ? pool[0] : pool[1]);
          if (push({ ...base, op: "scatter", x, y, ...(by !== undefined ? { by: name(by) } : {}) })) {
            // "Correlation between a and b" names two number columns: the scatter, then the test of r (D24).
            if (KW.correlation.test(t) && nums.length === 2) push({ ...base, op: "correlationTest", x, y, method: "pearson" });
            return true;
          }
        }
      }
      const corr = nums.length >= 2 ? nums : pool;
      if (corr.length >= 2 && push({ ...base, op: "correlation", columns: corr.slice(0, MAX_CORRELATION_COLUMNS).map(name) })) return true;
    }
    if (KW.distribution.test(t) && !KW.trend.test(t)) {
      if (num[0] !== undefined && push({ ...base, op: "distribution", column: name(num[0]) })) return true;
      if (cat[0] !== undefined && push({ ...base, op: "frequencies", column: name(cat[0]) })) return true;
      const m = bestMeasure();
      if (m !== -1 && push({ ...base, op: "distribution", column: name(m) })) return true;
    }
    if (KW.trend.test(t) || (time.length && num.length && !cat.length)) {
      const y = bestMeasure();
      const x = time[0] ?? idx(cls.time[0]);
      if (y !== -1 && x !== -1) {
        const st = statOf();
        if (push({ ...base, op: "trend", y: name(y), x: name(x), ...(cat[0] !== undefined ? { by: name(cat[0]) } : {}), ...(st && st !== "count" ? { stat: st } : {}) })) return true;
      }
    }
    if (KW.describe.test(t)) {
      if (push({ ...base, op: "describe", ...(num.length ? { columns: num.map(name) } : {}) })) return true;
    }
    if (KW.frequencies.test(t) && !(num.length && (cat.length || time.length))) {
      const c = cat[0] ?? time[0] ?? num[0] ?? catOr(idx(cls.categories[0]));
      if (c !== -1 && push({ ...base, op: "frequencies", column: name(c) })) return true;
    }
    if (num.length && (cat.length || time.length)) {
      const st = statOf() ?? "mean";
      const g = cat[0] ?? time[0];
      if (push({ ...base, op: "groupSummary", value: name(num[0]), by: name(g), stat: st })) return true;
    }
    if (cat.length >= 2 && push({ ...base, op: "crosstab", row: name(cat[0]), col: name(cat[1]) })) return true;
    if (num.length >= 2 && push({ ...base, op: "scatter", y: name(num[0]), x: name(num[1]) })) return true;
    if (cat.length === 1 && push({ ...base, op: "frequencies", column: name(cat[0]) })) return true;
    if (num.length === 1 && push({ ...base, op: "describe", columns: [name(num[0])] })) return true;
    if (push({ ...base, op: "describe" })) return true;
    const c = firstCat();
    return c !== -1 && push({ ...base, op: "frequencies", column: name(c) });
  };
  plan();
  return specs;
}

// ---------- Model-facing digest ----------

/** A label printed from a number or date column: a number in any writing language, or an ISO date (bucket). */
const NON_TEXT_LABEL = /^(?:[-−+]?\d[\d.,]*|\d{4}(?:-\d{2}){0,2}(?:T[\d:]+)?)$/;

/** What a digest writes instead of a category label the data card does not expose (D11). */
export const HIDDEN_LABEL = "(label hidden)";

/** What `artifactDigest` needs to apply D11 to the labels of an artifact. */
export interface DigestOptions {
  /** Columns of the sheet the artifact was computed from, as they are now (roles and exposed categories). */
  columns?: Pick<DatasetColumn, "name" | "type" | "role" | "categories">[];
  /** Translator of the artifact's language: "Total", "Other", "Yes" and "No" are kept as they are. */
  tr?: Translate;
}

/**
 * A compact, model-facing summary of an artifact (English number format, aggregates only, ≤ 12 rows): what the
 * chat route adds for the last artifacts of a conversation so the model can talk about them without new numbers.
 * A test adds its statistic line (numbers only).
 *
 * D11 holds here too: a label of a text column (the first column of frequencies, crosstab, group summaries, tests by
 * group, box plots and timelines, the crosstab, chi-square and trend headers, timeline groups and the levels of
 * regression terms) is kept only when the data card exposes it (`column.categories`), else it reads "(label hidden)".
 * Without `columns` every such label is hidden. The artifact the student sees is not changed.
 */
export function artifactDigest(
  a: Pick<Artifact, "title" | "spec" | "n" | "fileName" | "sheet" | "table"> & { test?: Pick<TestResult, "line"> },
  opts: DigestOptions = {},
): string {
  const t = a.table;
  const fixed = new Set<string>();
  if (opts.tr) for (const k of ["data.value.total", "data.value.other", "data.value.yes", "data.value.no"]) fixed.add(opts.tr(k));
  const shown = new Map<string, (label: string) => boolean>();
  /** Whether a label of column `name` may reach the model. */
  const allowed = (name: string | undefined) => {
    const key = name ?? "";
    let f = shown.get(key);
    if (!f) {
      const c = name === undefined ? undefined : (opts.columns || []).find((x) => x.name === name);
      // Labels of number, date and yes/no columns are numbers, dates or Yes/No: only those pass through such a
      // column, so a text label of another column of the same table (chi-square, regression) cannot slip through it.
      if (c && c.type !== "text" && c.role !== "identifier" && c.role !== "freeText") f = (label: string) => NON_TEXT_LABEL.test(label) || fixed.has(label);
      else {
        const exposed = new Set(c && c.role === "category" ? (c.categories || []).map((k) => k.value) : []);
        f = (label: string) => exposed.has(label);
      }
      shown.set(key, f);
    }
    return f;
  };
  /** A label of any of `names` (a chi-square table may be transposed, so either of its columns). */
  const keepOf = (names: (string | undefined)[], label: string) => (fixed.has(label) || names.some((n) => n !== undefined && allowed(n)(label)) ? label : HIDDEN_LABEL);
  const spec = a.spec;
  const op = spec.op;
  /** Columns whose labels fill the first cell of each row (the last row of most tables is the Total row). */
  const rowLabels: (string | undefined)[] | null =
    op === "frequencies"
      ? [spec.column]
      : op === "crosstab"
        ? [spec.row]
        : op === "groupSummary" || op === "ttest" || op === "mannWhitney" || op === "anova" || op === "kruskal" || (op === "distribution" && spec.chart === "box" && spec.by)
          ? [spec.by]
          : op === "chisquare"
            ? [spec.row, spec.col]
            : op === "gantt"
              ? [spec.label]
              : null;
  /** Header cells that are labels of a column: crosstab and chi-square (all but the first and the Total), trend by group (all but the first). */
  const headerOf = (j: number): (string | undefined)[] | null => {
    if (op === "crosstab" && j > 0 && j < t.columns.length - 1) return [spec.col];
    if (op === "chisquare" && j > 0 && j < t.columns.length - 1) return [spec.row, spec.col];
    if (op === "trend" && spec.by && j > 0) return [spec.by];
    return null;
  };
  /** Regression terms read "Label: level": the level is a category label. */
  const term = (text: string) => {
    const k = text.lastIndexOf(": ");
    if (k === -1) return text;
    return `${text.slice(0, k)}: ${keepOf(spec.predictors || [], text.slice(k + 2))}`;
  };
  const head = `"${sanitizeForPrompt(a.title, 120)}" (${op}, n = ${a.n}, ${sanitizeForPrompt(a.fileName, 80)} · ${sanitizeForPrompt(a.sheet, 60)})`;
  const cols = t.columns
    .map((c, j) => {
      const of = headerOf(j);
      return sanitizeForPrompt(of === null ? c : keepOf(of, c), 40);
    })
    .join(" | ");
  const lastRow = t.rows.length - 1;
  const hasTotalRow = op === "frequencies" || op === "crosstab" || op === "groupSummary" || op === "anova" || op === "chisquare";
  const rows = t.rows.slice(0, 12).map((r, i) =>
    r
      .map((v, j) => {
        if (typeof v === "number") return formatNumber(v, "en", artifactCellPrecision(t, i, j));
        if (v === null) return "";
        const text = String(v);
        // The last row is the Total row; with a translator "Total" is recognised by its text instead.
        if (j === 0 && rowLabels && (!hasTotalRow || opts.tr || i !== lastRow)) return sanitizeForPrompt(keepOf(rowLabels, text), 40);
        if (j === 0 && op === "regression") return sanitizeForPrompt(term(text), 40);
        if (op === "gantt" && spec.group && j === 3) return sanitizeForPrompt(keepOf([spec.group], text), 40);
        return sanitizeForPrompt(text, 40);
      })
      .join(" | "),
  );
  const more = t.rows.length > 12 ? [`… ${t.rows.length - 12} more rows`] : [];
  const line = a.test && a.test.line ? [`Result: ${sanitizeForPrompt(a.test.line, 200)}`] : [];
  return [head, cols, ...rows, ...more, ...line].join("\n");
}
