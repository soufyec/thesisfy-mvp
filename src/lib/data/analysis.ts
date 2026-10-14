/**
 * The analysis engine of the Research copilot (docs/papers.md §1.4, §3.4, D11, D13). Pure and client-safe:
 * `import type` from the app, relative runtime imports only, translations through a `Translate` parameter.
 *
 * The model (or the demo planner) only proposes an `AnalysisSpec`; `validateSpec` checks it against the dataset and
 * `runAnalysis` computes every number from the student's data. Titles, headers and notes are written with the
 * translator of the paper's writing language; chips (`suggestions`) with the translator of the interface language.
 *
 * Limits: categories > 30 → top 29 + "Other"; chart series > 4 (bars, lines) or > 3 (scatter) → the largest groups +
 * "Other" (`other: true`); crosstab tables ≤ 6 category columns (top 5 + "Other"); tables ≤ 200 rows; scatter
 * charts ≤ 500 points (deterministic even sampling); correlation and scatter need n ≥ 3.
 */
import type { AnalysisOp, AnalysisSpec, Artifact, ArtifactTable, ChartData, Dataset, DatasetCell, DatasetColumn, DatasetSheet, WritingLanguage } from "@/lib/db";
import * as S from "./stats";
import { capFirst, formatNumber, inSentence, listJoin } from "./labels";
import type { Translate } from "./labels";
import { cellText, dateMs, isoDate, sanitizeForPrompt } from "./summarize";

export const ANALYSIS_OPS: AnalysisOp[] = ["describe", "frequencies", "crosstab", "groupSummary", "correlation", "distribution", "trend", "scatter"];
const CHART_TYPES = ["bar", "groupedBar", "line", "scatter", "histogram", "none"] as const;
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
  | "no_data";

export type ValidateResult = { ok: true; spec: AnalysisSpec } | { ok: false; code: SpecErrorCode; column?: string; available: string[] };

class SpecError extends Error {
  constructor(public code: SpecErrorCode, public column?: string, public available: string[] = []) {
    super(code);
  }
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/**
 * Checks a spec proposed by the model (or the planner) against the dataset and returns it normalised: canonical
 * sheet and column names, only the fields its operation uses, defaults filled in. A frequency request on a number
 * column with more than 30 values becomes a distribution, and a distribution of a category becomes frequencies.
 * Errors carry the offending column and the columns that would fit (`available`) for the "could not compute" card.
 */
export function validateSpec(spec: unknown, dataset: Pick<Dataset, "sheets">, sheetIndex = 0): ValidateResult {
  try {
    return { ok: true, spec: normalizeSpec(spec, dataset, sheetIndex) };
  } catch (e) {
    if (e instanceof SpecError) {
      const out: ValidateResult = { ok: false, code: e.code, available: e.available.slice(0, 60) };
      if (e.column !== undefined) out.column = sanitizeForPrompt(e.column, 80);
      return out;
    }
    return { ok: false, code: "invalid_spec", available: [] };
  }
}

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
      let i = pick(str(r.column), c0, str(r.value), str(r.x), str(r.row), str(r.by));
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
        out.chart = chart === "none" ? "none" : "bar";
      } else {
        const bins = typeof r.bins === "number" && Number.isFinite(r.bins) ? Math.round(r.bins) : undefined;
        if (bins !== undefined) out.bins = Math.max(2, Math.min(50, bins));
        out.chart = chart === "none" ? "none" : "histogram";
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
  }
  return out;
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

interface Built {
  title: string;
  columns: string[];
  rows: Cell[][];
  precision: number[];
  chart?: ChartData;
  n: number;
}

/**
 * Computes an artifact from a spec. The spec is validated (and normalised) first: an invalid spec throws an Error
 * whose message is the `SpecErrorCode`, so callers run `validateSpec` themselves to report errors.
 */
export function runAnalysis(spec: AnalysisSpec, dataset: Dataset, meta: RunMeta, tr: Translate): Artifact {
  const v = validateSpec(spec, dataset, meta.sheetIndex ?? 0);
  if (!v.ok) throw new Error(v.code);
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
      built = runFrequencies(ctx, col(s.column), !!s.asShare, s.chart !== "none");
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
      built = runDistribution(ctx, col(s.column), s.bins, s.chart !== "none");
      break;
    case "trend":
      built = runTrend(ctx, col(s.y), col(s.x), col(s.by), s.stat || "mean", s.chart !== "none");
      break;
    case "scatter":
    default:
      built = runScatter(ctx, col(s.x), col(s.y), col(s.by), s.chart !== "none");
      break;
  }
  if (built.rows.length > MAX_TABLE_ROWS) {
    built.rows = built.rows.slice(0, MAX_TABLE_ROWS);
    ctx.notes.push(tr("data.note.rowsCut", { n: MAX_TABLE_ROWS }));
  }
  if (sheet.truncated) ctx.notes.push(tr("data.note.truncated", { n: sheet.rowCount, cells: dataset.cells }));
  const table: ArtifactTable = { columns: built.columns, rows: built.rows, precision: built.precision };
  if (ctx.notes.length) table.notes = uniq(ctx.notes);
  const computedAt = meta.now || new Date().toISOString();
  const artifact: Artifact = {
    id: meta.id || `art_${hashId([meta.interactionId, String(meta.index ?? 0), sheet.name, JSON.stringify(s), dataset.sha256, computedAt].join("|"))}`,
    interactionId: meta.interactionId,
    kind: built.chart ? "chart" : "table",
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
  return artifact;
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
  const pv = stats.reduce((m, s) => Math.max(m, colPrecision(ctx, s.i)), 0);
  const pm = meanPrecision(pv);
  const pmed = medianPrecision(pv, stats.map((s) => s.d.median));
  const rows: Cell[][] = stats.map((s) => [label(ctx, s.i), s.d.n, s.missing, s.d.mean, s.d.sd, s.d.min, s.d.median, s.d.max]);
  return {
    title: idx.length === 1 ? title(ctx, "data.title.describeOne", { a: mid(ctx, idx[0]) }) : title(ctx, "data.title.describe"),
    columns: [tr("data.col.variable"), tr("data.col.n"), tr("data.col.missing"), tr("data.col.mean"), tr("data.col.sd"), tr("data.col.min"), tr("data.col.median"), tr("data.col.max")],
    rows,
    precision: [0, 0, 0, pm, pm, pv, pmed, pv],
    n: ctx.sheet.rowCount,
  };
}

function runFrequencies(ctx: Ctx, i: number, asShare: boolean, withChart: boolean): Built {
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
  if (asShare) ctx.notes.unshift(tr("data.note.pie"));
  const built: Built = {
    title: title(ctx, asShare ? "data.title.shares" : "data.title.frequencies", { a: mid(ctx, i) }),
    columns: [label(ctx, i), tr("data.col.frequency"), tr("data.col.percent")],
    rows,
    precision: [0, 0, 1],
    n: valid,
  };
  if (withChart && valid) {
    built.chart = {
      type: "bar",
      xLabel: label(ctx, i),
      yLabel: asShare ? tr("data.axis.percent") : tr("data.col.frequency"),
      categories: ordered.map((k) => showKey(ctx, i, k)),
      series: [{ name: asShare ? tr("data.col.percent") : tr("data.col.frequency"), values: ordered.map((k) => (asShare ? (pct(nOf(k)) as number) : nOf(k))) }],
    };
    if (asShare) built.chart.percent = true;
  }
  return built;
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
        r: formatNumber(reg.r, ctx.lang, 2),
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
 * Up to 4 chips for an attached sheet: "Describe the data", "Frequency of {category}", "{measure} by {category}",
 * "Trend of {measure} over {time}" (docs/papers.md §3.4, §4.5); "Relationship between …" and "Distribution of …"
 * fill in when a sheet has no category or no time column. Identifiers and free text are never picked.
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
  if (cat) add(tr("data.chip.frequency", { a: m(cat) }), { op: "frequencies", sheet: sheet.name, column: cat.name });
  if (measure && cat) add(tr("data.chip.groupBy", { a: m(measure), b: m(cat) }), { op: "groupSummary", sheet: sheet.name, value: measure.name, by: cat.name, stat: "mean" });
  if (measure && time) add(tr("data.chip.trend", { a: m(measure), b: m(time) }), { op: "trend", sheet: sheet.name, y: measure.name, x: time.name });
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
  pie: /\b(pie|pies|piechart|tarta|tartas|pastel|quesitos?|circular|sectores|camemberts?|secteurs|kreis\w*|torte\w*)\b/,
  unsupported: /\b(box ?plots?|boxplots?|bigotes|diagrama de caja|moustaches|t ?tests?|prueba t|test t|chi ?2|chi ?squared?|chi cuadrado|khi ?2|khi deux|anova|multiple regression|regresion multiple|regression multiple|multiple regression|p ?values?|valor p|valeur p|p ?wert\w*|signifi\w*|gantt|prisma|concept maps?|mapa conceptual|carte conceptuelle|mindmap)\b/,
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

/** Requests for things v1 does not compute (box plots, tests, p-values, Gantt, PRISMA, concept maps): answer with `data.unsupported`. */
export function isUnsupportedRequest(text: string): boolean {
  return KW.unsupported.test(normText(text));
}

/** A request asking for a pie chart: computed as a bar chart of shares with a note (D13). */
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
    if (found.some((f) => f.ci === ci)) continue;
    let from = 0;
    while (from < t.length) {
      const pos = t.indexOf(" " + p + " ", from);
      if (pos === -1) break;
      // Spans exclude the surrounding spaces, so neighbouring mentions ("rainfall elevation") both count.
      if (free(pos + 1, pos + 1 + p.length)) {
        claimed.push([pos + 1, pos + 1 + p.length]);
        found.push({ ci, pos });
        break;
      }
      from = pos + 1;
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

/**
 * Specs for a request in plain words (demo mode and chips), by keyword rules in en/es/fr/de and the columns the text
 * names. Pie charts become frequencies with `asShare`; requests for things v1 does not compute get the closest
 * computable view (a box plot → medians by group); anything unclear becomes `describe`. Every spec returned is
 * validated and normalised. At most 4.
 */
export function planFromRequest(text: string, dataset: Pick<Dataset, "sheets">, tr: Translate): AnalysisSpec[] {
  void tr;
  if (!dataset.sheets.length) return [];
  const t = normText(text);
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
    const named = dataset.sheets.findIndex((s) => normKey(s.name) && t.indexOf(" " + normKey(s.name) + " ") !== -1);
    if (named !== -1) si = named;
  }
  const sheet = dataset.sheets[si];
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

  const plan = (): boolean => {
    if (KW.pie.test(t)) {
      const c = cat[0] ?? time[0] ?? catOr(idx(cls.categories[0]));
      if (c !== -1 && push({ ...base, op: "frequencies", column: name(c), asShare: true, chart: "bar" })) return true;
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
          if (push({ ...base, op: "scatter", x: name(yFirst ? pool[1] : pool[0]), y: name(yFirst ? pool[0] : pool[1]), ...(by !== undefined ? { by: name(by) } : {}) })) return true;
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
    if (KW.unsupported.test(t) && num.length && (cat.length || time.length)) {
      // Box plots and group tests: the closest computable view is the summary by group.
      if (push({ ...base, op: "groupSummary", value: name(num[0]), by: name(cat[0] ?? time[0]), stat: "median" })) return true;
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
 *
 * D11 holds here too: a label of a text column (the first column of frequencies, crosstab and group summaries, the
 * crosstab and trend headers) is kept only when the data card exposes it (`column.categories`), else it reads
 * "(label hidden)". Without `columns` every such label is hidden. The artifact the student sees is not changed.
 */
export function artifactDigest(a: Pick<Artifact, "title" | "spec" | "n" | "fileName" | "sheet" | "table">, opts: DigestOptions = {}): string {
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
      if (c && c.type !== "text" && c.role !== "identifier" && c.role !== "freeText") f = () => true;
      else {
        const exposed = new Set(c && c.role === "category" ? (c.categories || []).map((k) => k.value) : []);
        f = (label: string) => exposed.has(label);
      }
      shown.set(key, f);
    }
    return f;
  };
  const keep = (name: string | undefined, label: string) => (fixed.has(label) || allowed(name)(label) ? label : HIDDEN_LABEL);
  const spec = a.spec;
  /** Column whose labels fill the first cell of each row (the last row is the Total row). */
  const rowLabels = spec.op === "frequencies" ? spec.column : spec.op === "crosstab" ? spec.row : spec.op === "groupSummary" ? spec.by : undefined;
  const hasRowLabels = spec.op === "frequencies" || spec.op === "crosstab" || spec.op === "groupSummary";
  /** Header cells that are labels of a column: crosstab (all but the first and the Total), trend by group (all but the first). */
  const headerOf = (j: number): string | undefined | null => {
    if (spec.op === "crosstab" && j > 0 && j < t.columns.length - 1) return spec.col;
    if (spec.op === "trend" && spec.by && j > 0) return spec.by;
    return null;
  };
  const head = `"${sanitizeForPrompt(a.title, 120)}" (${spec.op}, n = ${a.n}, ${sanitizeForPrompt(a.fileName, 80)} · ${sanitizeForPrompt(a.sheet, 60)})`;
  const cols = t.columns
    .map((c, j) => {
      const of = headerOf(j);
      return sanitizeForPrompt(of === null ? c : keep(of, c), 40);
    })
    .join(" | ");
  const lastRow = t.rows.length - 1;
  const rows = t.rows.slice(0, 12).map((r, i) =>
    r
      .map((v, j) => {
        if (typeof v === "number") return formatNumber(v, "en", t.precision[j] ?? 2);
        if (v === null) return "";
        const text = String(v);
        // The last row is the Total row; with a translator "Total" is recognised by its text instead.
        if (j === 0 && hasRowLabels && (opts.tr || i !== lastRow)) return sanitizeForPrompt(keep(rowLabels, text), 40);
        return sanitizeForPrompt(text, 40);
      })
      .join(" | "),
  );
  const more = t.rows.length > 12 ? [`… ${t.rows.length - 12} more rows`] : [];
  return [head, cols, ...rows, ...more].join("\n");
}
