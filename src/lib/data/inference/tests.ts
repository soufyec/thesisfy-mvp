/**
 * Inferential tests computed by Thesisfic (docs/papers.md §9, D24). Pure functions over plain arrays: the caller
 * (analysis.ts) picks the columns and groups; nothing here knows about datasets, specs or languages.
 *
 * Conventions, all validated against scipy 1.17 / statsmodels 0.15 (relative error < 1e-6, see the module report):
 * - Missing values (null, undefined, NaN, ±Infinity) are left out; paired tests and correlations drop the whole
 *   pair. The count is reported in a `missingExcluded` note.
 * - Every p-value is two-sided. Minimum sizes: n ≥ 3 per group, n ≥ 3 pairs; otherwise `InferenceError("too_few")`.
 * - Welch: d uses the pooled SD (d_s) — the usual Cohen's d — even though the test does not pool variances.
 * - χ²: no Yates continuity correction, also for 2 × 2 tables (scipy `correction=False`).
 * - Mann–Whitney: normal approximation with tie and continuity correction (scipy `method="asymptotic"`,
 *   `use_continuity=True`); U is the first group's U (scipy's statistic); z from max(U1, U2); r = z / √N.
 * - OLS: Householder QR on column-scaled X; dummy coding with the first level (code-point order) as reference.
 */

import { chiSquareSf, fSf, normalQuantile, normalSf, tQuantile, tTwoSided } from "./distributions";
import type {
  AnovaResult,
  ChiSquareResult,
  Coefficient,
  CorrelationResult,
  GroupSummary,
  InferenceErrorCode,
  InferenceNote,
  KruskalResult,
  MannWhitneyResult,
  PairedResult,
  Predictor,
  RegressionResult,
  WelchResult,
} from "./types";

/** Numbers as they come out of a dataset column: missing cells are null/undefined. */
export type NumLike = number | null | undefined;

/** Minimum observations per group (and pairs) for every test (D24). */
export const MIN_N = 3;
/** Most predictors (variables, not dummy columns) of a regression (D24). */
export const MAX_PREDICTORS = 6;
/** Most levels of a categorical predictor (D24). */
export const MAX_LEVELS = 6;
/** Below this group size the rank tests carry a `smallSampleApprox` note. */
export const SMALL_RANK_N = 8;

/** Typed error of the tests (`code` maps to an `artifact_error`; `detail` names the group or predictor). */
export class InferenceError extends Error {
  code: InferenceErrorCode;
  detail?: string;
  constructor(code: InferenceErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "InferenceError";
    this.code = code;
    if (detail !== undefined) this.detail = detail;
    Object.setPrototypeOf(this, InferenceError.prototype); // es5 target: keep instanceof working
  }
}

/** True for an `InferenceError` (also across bundles, by name and code). */
export function isInferenceError(e: unknown): e is InferenceError {
  return !!e && typeof e === "object" && (e as { name?: unknown }).name === "InferenceError" && typeof (e as { code?: unknown }).code === "string";
}

/** Runs a test and returns `{ ok: true, result }` or `{ ok: false, code, detail }`; other errors are rethrown. */
export function attempt<T>(fn: () => T): { ok: true; result: T } | { ok: false; code: InferenceErrorCode; detail?: string } {
  try {
    return { ok: true, result: fn() };
  } catch (e) {
    if (isInferenceError(e)) return e.detail === undefined ? { ok: false, code: e.code } : { ok: false, code: e.code, detail: e.detail };
    throw e;
  }
}

// ── helpers ────────────────────────────────────────────────────────────────────────────────────────────────────

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Finite values of `xs` and how many were left out. */
function clean(xs: NumLike[]): { values: number[]; dropped: number } {
  const values: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    const v = xs[i];
    if (isNum(v)) values.push(v);
  }
  return { values, dropped: xs.length - values.length };
}

/** Complete pairs of two equally long arrays. */
function cleanPairs(x: NumLike[], y: NumLike[]): { xs: number[]; ys: number[]; dropped: number } {
  if (x.length !== y.length) throw new InferenceError("length_mismatch");
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < x.length; i++) {
    const a = x[i];
    const b = y[i];
    if (isNum(a) && isNum(b)) {
      xs.push(a);
      ys.push(b);
    }
  }
  return { xs, ys, dropped: x.length - xs.length };
}

function sumOf(xs: number[]): number {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return s;
}

/** Mean and sample variance (two-pass). */
function meanVar(xs: number[]): { mean: number; variance: number } {
  const n = xs.length;
  const mean = sumOf(xs) / n;
  let ss = 0;
  let comp = 0;
  for (let i = 0; i < n; i++) {
    const d = xs[i] - mean;
    ss += d * d;
    comp += d;
  }
  // Corrected two-pass formula (Chan, Golub & LeVeque): removes the rounding error of the mean.
  const variance = n > 1 ? (ss - (comp * comp) / n) / (n - 1) : NaN;
  return { mean, variance: variance < 0 ? 0 : variance };
}

function summary(xs: number[]): GroupSummary {
  const { mean, variance } = meanVar(xs);
  return { n: xs.length, mean, sd: Math.sqrt(variance) };
}

function missingNote(dropped: number): InferenceNote[] {
  return dropped > 0 ? [{ code: "missingExcluded", values: { count: dropped } }] : [];
}

function requireN(n: number, detail: string): void {
  if (n < MIN_N) throw new InferenceError("too_few", detail);
}

/** Average ranks (1-based, ties share the mean rank) and the tie sizes t of every tied block (t ≥ 2). */
export function averageRanks(values: number[]): { ranks: number[]; ties: number[] } {
  const n = values.length;
  const order: number[] = [];
  for (let i = 0; i < n; i++) order.push(i);
  order.sort((i, j) => values[i] - values[j] || i - j);
  const ranks = new Array<number>(n);
  const ties: number[] = [];
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && values[order[j + 1]] === values[order[i]]) j++;
    const r = (i + j + 2) / 2; // mean of ranks i+1 … j+1
    for (let k = i; k <= j; k++) ranks[order[k]] = r;
    if (j > i) ties.push(j - i + 1);
    i = j + 1;
  }
  return { ranks, ties };
}

/** Σ (t³ − t) over tie blocks. */
function tieSum(ties: number[]): number {
  let s = 0;
  for (let i = 0; i < ties.length; i++) s += ties[i] * ties[i] * ties[i] - ties[i];
  return s;
}

/** Pearson r of two complete, equally long arrays (centred sums); NaN when one of them is constant. */
function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = sumOf(xs) / n;
  const my = sumOf(ys) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return NaN;
  const r = sxy / Math.sqrt(sxx * syy);
  return Math.max(-1, Math.min(1, r));
}

const Z975 = normalQuantile(0.975);

// ── two groups ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Welch's t-test for two independent groups (unequal variances), with Cohen's d (pooled SD) and the 95 % CI of the mean difference. */
export function welchTTest(a: NumLike[], b: NumLike[]): WelchResult {
  const ca = clean(a);
  const cb = clean(b);
  requireN(ca.values.length, "group 1");
  requireN(cb.values.length, "group 2");
  const n1 = ca.values.length;
  const n2 = cb.values.length;
  const s1 = meanVar(ca.values);
  const s2 = meanVar(cb.values);
  const q1 = s1.variance / n1;
  const q2 = s2.variance / n2;
  const se2 = q1 + q2;
  if (!(se2 > 0)) throw new InferenceError("constant");
  const se = Math.sqrt(se2);
  const diff = s1.mean - s2.mean;
  const t = diff / se;
  const df = (se2 * se2) / ((q1 * q1) / (n1 - 1) + (q2 * q2) / (n2 - 1));
  const p = tTwoSided(t, df);
  const half = tQuantile(0.975, df) * se;
  const pooledSd = Math.sqrt(((n1 - 1) * s1.variance + (n2 - 1) * s2.variance) / (n1 + n2 - 2));
  const d = pooledSd > 0 ? diff / pooledSd : 0;
  const notes = missingNote(ca.dropped + cb.dropped);
  notes.push({ code: "dPooled" });
  return {
    name: "welch",
    statistic: { symbol: "t", value: t, df },
    p,
    effect: { name: "d", value: d },
    ci: [diff - half, diff + half],
    ciTarget: "meanDifference",
    n: n1 + n2,
    notes,
    groups: [
      { n: n1, mean: s1.mean, sd: Math.sqrt(s1.variance) },
      { n: n2, mean: s2.mean, sd: Math.sqrt(s2.variance) },
    ],
    meanDifference: diff,
    se,
    df,
    d,
    pooledSd,
  };
}

/** Paired t-test on complete pairs (x − y), with d_z and the 95 % CI of the mean difference. */
export function pairedTTest(x: NumLike[], y: NumLike[]): PairedResult {
  const { xs, ys, dropped } = cleanPairs(x, y);
  requireN(xs.length, "pairs");
  const n = xs.length;
  const diffs: number[] = [];
  for (let i = 0; i < n; i++) diffs.push(xs[i] - ys[i]);
  const s = meanVar(diffs);
  const sd = Math.sqrt(s.variance);
  if (!(sd > 0)) throw new InferenceError("constant");
  const se = sd / Math.sqrt(n);
  const t = s.mean / se;
  const df = n - 1;
  const half = tQuantile(0.975, df) * se;
  const d = s.mean / sd;
  const notes = missingNote(dropped);
  notes.push({ code: "dPaired" });
  return {
    name: "pairedT",
    statistic: { symbol: "t", value: t, df },
    p: tTwoSided(t, df),
    effect: { name: "d", value: d },
    ci: [s.mean - half, s.mean + half],
    ciTarget: "meanDifference",
    n,
    notes,
    meanDifference: s.mean,
    sdDifference: sd,
    se,
    df,
    d,
    means: [sumOf(xs) / n, sumOf(ys) / n],
  };
}

/** Mann–Whitney U test (normal approximation with tie and continuity correction), with r = z/√N. */
export function mannWhitneyU(a: NumLike[], b: NumLike[]): MannWhitneyResult {
  const ca = clean(a);
  const cb = clean(b);
  requireN(ca.values.length, "group 1");
  requireN(cb.values.length, "group 2");
  const n1 = ca.values.length;
  const n2 = cb.values.length;
  const n = n1 + n2;
  const { ranks, ties } = averageRanks(ca.values.concat(cb.values));
  let r1 = 0;
  for (let i = 0; i < n1; i++) r1 += ranks[i];
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  const mu = (n1 * n2) / 2;
  const varTerm = ((n1 * n2) / 12) * (n + 1 - tieSum(ties) / (n * (n - 1)));
  if (!(varTerm > 0)) throw new InferenceError("constant");
  const s = Math.sqrt(varTerm);
  const z = (Math.max(u1, u2) - mu - 0.5) / s;
  const p = Math.min(1, Math.max(0, 2 * normalSf(z)));
  const r = z / Math.sqrt(n);
  const notes = missingNote(ca.dropped + cb.dropped);
  if (Math.min(n1, n2) <= SMALL_RANK_N) notes.push({ code: "smallSampleApprox" });
  return {
    name: "mannWhitney",
    statistic: { symbol: "U", value: u1 },
    p,
    effect: { name: "r", value: r },
    n,
    extra: [{ symbol: "z", value: z }],
    notes,
    u1,
    u2,
    uMin: Math.min(u1, u2),
    z,
    r,
    meanRanks: [r1 / n1, (n * (n + 1)) / 2 / n2 - r1 / n2],
    groupN: [n1, n2],
  };
}

// ── k groups ───────────────────────────────────────────────────────────────────────────────────────────────────

function cleanGroups(groups: NumLike[][]): { values: number[][]; dropped: number } {
  if (groups.length < 2) throw new InferenceError("too_few_groups");
  let dropped = 0;
  const values = groups.map((g, i) => {
    const c = clean(g);
    dropped += c.dropped;
    requireN(c.values.length, `group ${i + 1}`);
    return c.values;
  });
  return { values, dropped };
}

/** One-way ANOVA (equal variances, as scipy's f_oneway) with η² = SS_between / SS_total. */
export function oneWayAnova(groups: NumLike[][]): AnovaResult {
  const { values, dropped } = cleanGroups(groups);
  const k = values.length;
  let total = 0;
  let n = 0;
  for (let i = 0; i < k; i++) {
    total += sumOf(values[i]);
    n += values[i].length;
  }
  const grand = total / n;
  let ssB = 0;
  let ssW = 0;
  const summaries: GroupSummary[] = [];
  for (let i = 0; i < k; i++) {
    const s = meanVar(values[i]);
    const ni = values[i].length;
    ssB += ni * (s.mean - grand) * (s.mean - grand);
    ssW += s.variance * (ni - 1);
    summaries.push({ n: ni, mean: s.mean, sd: Math.sqrt(s.variance) });
  }
  if (!(ssW > 0)) throw new InferenceError("constant");
  const df1 = k - 1;
  const df2 = n - k;
  const msB = ssB / df1;
  const msW = ssW / df2;
  const F = msB / msW;
  const eta = ssB / (ssB + ssW);
  return {
    name: "anova",
    statistic: { symbol: "F", value: F, df: [df1, df2] },
    p: fSf(F, df1, df2),
    effect: { name: "η²", value: eta },
    n,
    notes: missingNote(dropped),
    groups: summaries,
    ssBetween: ssB,
    ssWithin: ssW,
    msBetween: msB,
    msWithin: msW,
    df1,
    df2,
    etaSquared: eta,
  };
}

/** Kruskal–Wallis H test with tie correction, df = k − 1 and ε² = H / (N − 1). */
export function kruskalWallis(groups: NumLike[][]): KruskalResult {
  const { values, dropped } = cleanGroups(groups);
  const k = values.length;
  const pooled: number[] = [];
  for (let i = 0; i < k; i++) for (let j = 0; j < values[i].length; j++) pooled.push(values[i][j]);
  const n = pooled.length;
  const { ranks, ties } = averageRanks(pooled);
  const correction = 1 - tieSum(ties) / (n * n * n - n);
  if (!(correction > 0)) throw new InferenceError("constant");
  let offset = 0;
  let acc = 0;
  const meanRanks: number[] = [];
  const groupN: number[] = [];
  for (let i = 0; i < k; i++) {
    const ni = values[i].length;
    let ri = 0;
    for (let j = 0; j < ni; j++) ri += ranks[offset + j];
    offset += ni;
    acc += (ri * ri) / ni;
    meanRanks.push(ri / ni);
    groupN.push(ni);
  }
  const h = ((12 / (n * (n + 1))) * acc - 3 * (n + 1)) / correction;
  const df = k - 1;
  const eps = h / (n - 1);
  const notes = missingNote(dropped);
  if (Math.min.apply(null, groupN) <= SMALL_RANK_N) notes.push({ code: "smallSampleApprox" });
  return {
    name: "kruskal",
    statistic: { symbol: "H", value: h, df },
    p: chiSquareSf(h, df),
    effect: { name: "ε²", value: eps },
    n,
    notes,
    h,
    df,
    epsilonSquared: eps,
    meanRanks,
    groupN,
    tieCorrection: correction,
  };
}

// ── contingency table ──────────────────────────────────────────────────────────────────────────────────────────

/** χ² test of independence on an r × c table of counts (no Yates correction), with Cramér's V and the share of expected counts below 5. */
export function chiSquareIndependence(table: number[][]): ChiSquareResult {
  if (!table.length) throw new InferenceError("too_few_groups");
  const cols = table[0].length;
  for (let i = 0; i < table.length; i++) {
    if (table[i].length !== cols) throw new InferenceError("invalid_table");
    for (let j = 0; j < cols; j++) {
      const v = table[i][j];
      if (!isNum(v) || v < 0) throw new InferenceError("invalid_table");
    }
  }
  const rowSum = table.map((row) => sumOf(row));
  const colSum: number[] = [];
  for (let j = 0; j < cols; j++) {
    let s = 0;
    for (let i = 0; i < table.length; i++) s += table[i][j];
    colSum.push(s);
  }
  const rowsKept: number[] = [];
  const colsKept: number[] = [];
  for (let i = 0; i < rowSum.length; i++) if (rowSum[i] > 0) rowsKept.push(i);
  for (let j = 0; j < colSum.length; j++) if (colSum[j] > 0) colsKept.push(j);
  const emptyDropped = rowSum.length - rowsKept.length + (colSum.length - colsKept.length);
  if (rowsKept.length < 2 || colsKept.length < 2) throw new InferenceError("too_few_groups");
  const observed = rowsKept.map((i) => colsKept.map((j) => table[i][j]));
  const rs = rowsKept.map((i) => rowSum[i]);
  const cs = colsKept.map((j) => colSum[j]);
  const n = sumOf(rs);
  if (n < MIN_N) throw new InferenceError("too_few");
  let chi = 0;
  let below5 = 0;
  let minExpected = Infinity;
  const expected = observed.map((row, i) =>
    row.map((o, j) => {
      const e = (rs[i] * cs[j]) / n;
      const d = o - e;
      chi += (d * d) / e;
      if (e < 5) below5++;
      if (e < minExpected) minExpected = e;
      return e;
    })
  );
  const r = observed.length;
  const c = observed[0].length;
  const df = (r - 1) * (c - 1);
  const share = below5 / (r * c);
  const v = Math.sqrt(chi / (n * (Math.min(r, c) - 1)));
  const notes: InferenceNote[] = [];
  if (emptyDropped > 0) notes.push({ code: "emptyDropped", values: { count: emptyDropped } });
  if (share > 0.2) notes.push({ code: "expectedLow", values: { share: Math.round(share * 1000) / 10 } });
  if (minExpected < 1) notes.push({ code: "expectedBelowOne" });
  return {
    name: "chiSquare",
    statistic: { symbol: "χ²", value: chi, df },
    p: chiSquareSf(chi, df),
    effect: { name: "V", value: v },
    n,
    notes,
    observed,
    expected,
    rowsKept,
    colsKept,
    df,
    cramersV: v,
    expectedBelow5Share: share,
    minExpected,
    yates: false,
  };
}

// ── correlations ───────────────────────────────────────────────────────────────────────────────────────────────

function correlationResult(name: "pearson" | "spearman", r: number, n: number, dropped: number, withCi: boolean): CorrelationResult {
  if (Number.isNaN(r)) throw new InferenceError("constant");
  const df = n - 2;
  const t = Math.abs(r) === 1 ? (r > 0 ? Infinity : -Infinity) : r * Math.sqrt(df / ((1 - r) * (1 + r)));
  const p = Math.abs(r) === 1 ? 0 : tTwoSided(t, df);
  const out: CorrelationResult = {
    name,
    statistic: { symbol: name === "pearson" ? "r" : "ρ", value: r, df },
    p,
    n,
    notes: missingNote(dropped),
    r,
    t,
    df,
  };
  if (withCi) {
    // Fisher z: atanh(r) ± z₀.₉₇₅ / √(n − 3); n = 3 gives the whole interval [−1, 1].
    const zr = Math.atanh(r);
    const se = n > 3 ? 1 / Math.sqrt(n - 3) : Infinity;
    const lo = Math.tanh(zr - Z975 * se);
    const hi = Math.tanh(zr + Z975 * se);
    out.ci = [Number.isNaN(lo) ? -1 : lo, Number.isNaN(hi) ? 1 : hi];
    out.ciTarget = "r";
  }
  return out;
}

/** Pearson correlation test on complete pairs: r, t, df = n − 2, two-sided p and the 95 % CI of r (Fisher z). */
export function pearsonTest(x: NumLike[], y: NumLike[]): CorrelationResult {
  const { xs, ys, dropped } = cleanPairs(x, y);
  requireN(xs.length, "pairs");
  return correlationResult("pearson", pearsonR(xs, ys), xs.length, dropped, true);
}

/** Spearman rank correlation on complete pairs (average ranks for ties), p from the t approximation with n − 2 df. */
export function spearmanTest(x: NumLike[], y: NumLike[]): CorrelationResult {
  const { xs, ys, dropped } = cleanPairs(x, y);
  requireN(xs.length, "pairs");
  const rx = averageRanks(xs).ranks;
  const ry = averageRanks(ys).ranks;
  return correlationResult("spearman", pearsonR(rx, ry), xs.length, dropped, false);
}

// ── OLS regression ─────────────────────────────────────────────────────────────────────────────────────────────

interface Column {
  term: string;
  predictor: string | null;
  level?: string;
  values: number[];
}

function isMissingCategory(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v)) || (typeof v === "string" && v.trim() === "");
}

function numericValue(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Code-point order (Python's `sorted`, what statsmodels' C() uses): deterministic in every runtime. */
function codePointCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Householder QR of the n × p matrix given by columns (modified in place into R above the diagonal and the
 * reflectors below); applies the same reflections to `y`. Returns the diagonal of R.
 */
function householder(cols: number[][], y: number[]): number[] {
  const n = y.length;
  const p = cols.length;
  const diag: number[] = [];
  for (let k = 0; k < p; k++) {
    const ck = cols[k];
    let norm = 0;
    for (let i = k; i < n; i++) norm = Math.hypot(norm, ck[i]);
    if (norm === 0) {
      diag.push(0);
      continue;
    }
    const alpha = ck[k] > 0 ? -norm : norm;
    // v = x − alpha e1, stored in ck[k..n-1]; H = I − 2 v vᵀ / (vᵀ v)
    ck[k] -= alpha;
    let vv = 0;
    for (let i = k; i < n; i++) vv += ck[i] * ck[i];
    for (let j = k + 1; j < p; j++) {
      const cj = cols[j];
      let dot = 0;
      for (let i = k; i < n; i++) dot += ck[i] * cj[i];
      const f = (2 * dot) / vv;
      for (let i = k; i < n; i++) cj[i] -= f * ck[i];
    }
    let dy = 0;
    for (let i = k; i < n; i++) dy += ck[i] * y[i];
    const fy = (2 * dy) / vv;
    for (let i = k; i < n; i++) y[i] -= fy * ck[i];
    diag.push(alpha);
  }
  return diag;
}

/**
 * Ordinary least squares with an intercept and ≤ 6 predictors. Numeric predictors enter as they are; categorical ones
 * (≤ 6 levels) are dummy coded against their first level. Rows with a missing response or predictor are left out.
 * Returns coefficients (estimate, SE, t, p, 95 % CI), R², adjusted R², the overall F test and the fitted equation.
 */
export function olsRegression(y: NumLike[], X: Predictor[], options: { response?: string } = {}): RegressionResult {
  if (!X.length) throw new InferenceError("too_few_groups", "predictors");
  if (X.length > MAX_PREDICTORS) throw new InferenceError("too_many_predictors");
  const rows = y.length;
  const kinds = X.map((pr) => {
    if (pr.values.length !== rows) throw new InferenceError("length_mismatch", pr.name);
    if (pr.kind) return pr.kind;
    for (let i = 0; i < pr.values.length; i++) {
      const v = pr.values[i];
      if (typeof v === "string") return "categorical";
    }
    return "numeric";
  });
  // Listwise deletion.
  const keep: number[] = [];
  for (let i = 0; i < rows; i++) {
    if (!isNum(y[i])) continue;
    let ok = true;
    for (let j = 0; j < X.length && ok; j++) {
      const v = X[j].values[i];
      ok = kinds[j] === "numeric" ? numericValue(v) !== null : !isMissingCategory(v);
    }
    if (ok) keep.push(i);
  }
  const dropped = rows - keep.length;
  const n = keep.length;
  const yv = keep.map((i) => y[i] as number);

  const columns: Column[] = [{ term: "(Intercept)", predictor: null, values: keep.map(() => 1) }];
  const references: { predictor: string; level: string; levels: string[] }[] = [];
  for (let j = 0; j < X.length; j++) {
    const pr = X[j];
    if (kinds[j] === "numeric") {
      const vals = keep.map((i) => numericValue(pr.values[i]) as number);
      let same = true;
      for (let i = 1; i < vals.length && same; i++) same = vals[i] === vals[0];
      if (same) throw new InferenceError("constant", pr.name);
      columns.push({ term: pr.name, predictor: pr.name, values: vals });
      continue;
    }
    const labels = keep.map((i) => String(pr.values[i]).trim());
    const present: Record<string, true> = {};
    for (let i = 0; i < labels.length; i++) present[labels[i]] = true;
    let levels: string[];
    if (pr.levels && pr.levels.length) {
      levels = pr.levels.map((l) => String(l).trim()).filter((l, i, all) => present[l] && all.indexOf(l) === i);
      const extra = Object.keys(present).filter((l) => levels.indexOf(l) < 0).sort(codePointCompare);
      levels = levels.concat(extra);
    } else {
      levels = Object.keys(present).sort(codePointCompare);
    }
    if (levels.length > MAX_LEVELS) throw new InferenceError("too_many_levels", pr.name);
    if (levels.length < 2) throw new InferenceError("constant", pr.name);
    references.push({ predictor: pr.name, level: levels[0], levels });
    for (let l = 1; l < levels.length; l++) {
      const level = levels[l];
      columns.push({ term: `${pr.name}[${level}]`, predictor: pr.name, level, values: labels.map((v) => (v === level ? 1 : 0)) });
    }
  }
  const p = columns.length;
  if (n < MIN_N || n - p < 1) throw new InferenceError("too_few", "rows");

  // Scale columns to unit norm, factorise, check the conditioning.
  const scale = columns.map((c) => {
    let s = 0;
    for (let i = 0; i < n; i++) s = Math.hypot(s, c.values[i]);
    return s;
  });
  const work = columns.map((c, j) => c.values.map((v) => v / scale[j]));
  const qty = yv.slice();
  const diag = householder(work, qty);
  for (let k = 0; k < p; k++) if (!(Math.abs(diag[k]) > 1e-10)) throw new InferenceError("collinear", columns[k].term);
  // R (p × p, upper): R[k][k] = diag[k], R[k][j] = work[j][k] for j > k.
  const R = (k: number, j: number): number => (k === j ? diag[k] : work[j][k]);
  // γ = R⁻¹ (Qᵀy)[0..p)
  const gamma = new Array<number>(p);
  for (let k = p - 1; k >= 0; k--) {
    let s = qty[k];
    for (let j = k + 1; j < p; j++) s -= R(k, j) * gamma[j];
    gamma[k] = s / diag[k];
  }
  // Rinv (upper triangular), so (XsᵀXs)⁻¹ = Rinv Rinvᵀ.
  const Rinv: number[][] = [];
  for (let i = 0; i < p; i++) Rinv.push(new Array<number>(p).fill(0));
  for (let j = 0; j < p; j++) {
    Rinv[j][j] = 1 / diag[j];
    for (let i = j - 1; i >= 0; i--) {
      let s = 0;
      for (let k = i + 1; k <= j; k++) s += R(i, k) * Rinv[k][j];
      Rinv[i][j] = -s / diag[i];
    }
  }
  const beta = gamma.map((g, j) => g / scale[j]);
  let sse = 0;
  const my = sumOf(yv) / n;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    let fit = 0;
    for (let j = 0; j < p; j++) fit += beta[j] * columns[j].values[i];
    const e = yv[i] - fit;
    sse += e * e;
    sst += (yv[i] - my) * (yv[i] - my);
  }
  if (!(sst > 0)) throw new InferenceError("constant", options.response || "y");
  if (!(sse > 1e-20 * sst)) throw new InferenceError("perfect_fit");
  const dfResid = n - p;
  const dfModel = p - 1;
  const s2 = sse / dfResid;
  const tCrit = tQuantile(0.975, dfResid);
  const coefficients: Coefficient[] = columns.map((c, j) => {
    let v = 0;
    for (let k = j; k < p; k++) v += Rinv[j][k] * Rinv[j][k];
    const se = Math.sqrt(s2 * v) / scale[j];
    const t = beta[j] / se;
    const out: Coefficient = {
      term: c.term,
      predictor: c.predictor,
      estimate: beta[j],
      se,
      t,
      p: tTwoSided(t, dfResid),
      ci95: [beta[j] - tCrit * se, beta[j] + tCrit * se],
    };
    if (c.level !== undefined) out.level = c.level;
    return out;
  });
  const r2 = 1 - sse / sst;
  const adjR2 = 1 - ((1 - r2) * (n - 1)) / dfResid;
  const F = ((sst - sse) / dfModel) / s2;
  const pF = fSf(F, dfModel, dfResid);
  const notes = missingNote(dropped);
  for (let i = 0; i < references.length; i++) {
    notes.push({ code: "referenceLevel", values: { predictor: references[i].predictor, level: references[i].level } });
  }
  return {
    name: "regression",
    statistic: { symbol: "F", value: F, df: [dfModel, dfResid] },
    p: pF,
    effect: { name: "R²", value: r2 },
    n,
    notes,
    coefficients,
    r2,
    adjR2,
    F,
    df1: dfModel,
    df2: dfResid,
    pF,
    sigma: Math.sqrt(s2),
    references,
    equation: {
      response: options.response || "y",
      intercept: beta[0],
      terms: coefficients.slice(1).map((c) => {
        const term: { term: string; predictor: string; level?: string; coefficient: number } = {
          term: c.term,
          predictor: c.predictor as string,
          coefficient: c.estimate,
        };
        if (c.level !== undefined) term.level = c.level;
        return term;
      }),
    },
  };
}
