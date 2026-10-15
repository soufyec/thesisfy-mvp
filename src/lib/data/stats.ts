/**
 * Descriptive statistics for primary data (docs/papers.md §3.4, D11, D13). Pure and client-safe: no imports at all.
 * Every number Thesisfic shows from a student's data is computed here; the model only proposes what to compute.
 *
 * Conventions: inputs are plain number arrays (missing values already removed, see `toNumber`); a function that
 * cannot answer returns `null` rather than NaN, so JSON and the UI never meet NaN.
 */

/** A cell as numbers see it: finite numbers stay, numeric strings ("12.5", "-3", "1e3") are read, the rest is missing. */
export function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s || !NUMERIC_RE.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
// Same language as /^[-+]?(?:\d+\.?\d*|\.\d+)…$/ without its ambiguity (\d+ then \d* backtracked quadratically on
// long runs of digits followed by another character): the fraction needs its dot.
const NUMERIC_RE = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;

export function sum(xs: number[]): number {
  // Kahan summation: column sums of decimals stay exact to the printed precision.
  let s = 0;
  let c = 0;
  for (const x of xs) {
    const y = x - c;
    const t = s + y;
    c = t - s - y;
    s = t;
  }
  return s;
}

export function mean(xs: number[]): number | null {
  return xs.length ? sum(xs) / xs.length : null;
}

/** Sample variance (n − 1). Null below 2 values. */
export function variance(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = sum(xs) / xs.length;
  let ss = 0;
  for (const x of xs) ss += (x - m) * (x - m);
  return ss / (xs.length - 1);
}

/** Sample standard deviation (n − 1). Null below 2 values. */
export function sd(xs: number[]): number | null {
  const v = variance(xs);
  return v === null ? null : Math.sqrt(v);
}

export function min(xs: number[]): number | null {
  if (!xs.length) return null;
  let m = xs[0];
  for (const x of xs) if (x < m) m = x;
  return m;
}

export function max(xs: number[]): number | null {
  if (!xs.length) return null;
  let m = xs[0];
  for (const x of xs) if (x > m) m = x;
  return m;
}

export function sorted(xs: number[]): number[] {
  return xs.slice().sort((a, b) => a - b);
}

/** Quantile of type 7 (R's default, Excel's PERCENTILE.INC, Python's `statistics.quantiles(method="inclusive")`). `xs` must be sorted. */
export function quantileSorted(xs: number[], p: number): number | null {
  const n = xs.length;
  if (!n) return null;
  if (n === 1) return xs[0];
  const q = Math.min(1, Math.max(0, p));
  const h = (n - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.min(n - 1, lo + 1);
  return xs[lo] + (h - lo) * (xs[hi] - xs[lo]);
}

export function quantile(xs: number[], p: number): number | null {
  return quantileSorted(sorted(xs), p);
}

export function median(xs: number[]): number | null {
  return quantile(xs, 0.5);
}

export interface Describe {
  n: number;
  mean: number | null;
  sd: number | null;
  min: number | null;
  q1: number | null;
  median: number | null;
  q3: number | null;
  max: number | null;
}

/** n, mean, sample SD, min, quartiles (type 7), median and max of the values. */
export function describe(xs: number[]): Describe {
  const s = sorted(xs);
  return {
    n: s.length,
    mean: mean(s),
    sd: sd(s),
    min: s.length ? s[0] : null,
    q1: quantileSorted(s, 0.25),
    median: quantileSorted(s, 0.5),
    q3: quantileSorted(s, 0.75),
    max: s.length ? s[s.length - 1] : null,
  };
}

/** Coefficient of variation |sd / mean|; null when undefined (mean 0 or fewer than 2 values). */
export function coefficientOfVariation(xs: number[]): number | null {
  const m = mean(xs);
  const s = sd(xs);
  if (m === null || s === null || m === 0) return null;
  return Math.abs(s / m);
}

/** Counts per value, most frequent first, ties in ascending value order (deterministic). */
export function frequencies(values: string[]): { value: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  return Array.from(counts, ([value, n]) => ({ value, n })).sort((a, b) => b.n - a.n || compareText(a.value, b.value));
}

/** Natural text order: numbers inside labels compare as numbers ("Group 2" < "Group 10"). */
export function compareText(a: string, b: string): number {
  return NAT.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}
const NAT = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** Counts of every (row, col) pair. `rows[i]` and `cols[i]` belong to the same record. */
export function crosstab(rows: string[], cols: string[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  const n = Math.min(rows.length, cols.length);
  for (let i = 0; i < n; i++) {
    let m = out.get(rows[i]);
    if (!m) out.set(rows[i], (m = new Map()));
    m.set(cols[i], (m.get(cols[i]) || 0) + 1);
  }
  return out;
}

/** Pearson's r of paired values; null with fewer than 3 pairs or when either variable is constant. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = sum(xs.slice(0, n)) / n;
  const my = sum(ys.slice(0, n)) / n;
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
  if (sxx === 0 || syy === 0) return null;
  const r = sxy / Math.sqrt(sxx * syy);
  return Math.max(-1, Math.min(1, r));
}

export interface Regression {
  slope: number;
  intercept: number;
  r: number;
  n: number;
}

/** Ordinary least squares y = intercept + slope · x, with Pearson's r. Null with fewer than 3 pairs or constant x or y. */
export function linearRegression(xs: number[], ys: number[]): Regression | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = sum(xs.slice(0, n)) / n;
  const my = sum(ys.slice(0, n)) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) * (xs[i] - mx);
  }
  const r = pearson(xs, ys);
  if (sxx === 0 || r === null) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r, n };
}

// ---------- Nice numbers ----------

/** Decimals needed to print multiples of `step` exactly (0.25 → 2, 5 → 0). */
export function stepDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  for (let d = 0; d <= 10; d++) {
    const scaled = step * Math.pow(10, d);
    if (Math.abs(scaled - Math.round(scaled)) < 1e-9 * Math.max(1, scaled)) return d;
  }
  return 10;
}

function roundTo(v: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  const r = Math.round(v * f) / f;
  return r === 0 ? 0 : r; // no -0
}

/** Steps of the 1-2-5 × 10^k sequence around `span`, smallest first. */
function niceSteps(span: number): number[] {
  const e = Math.floor(Math.log10(span));
  const out: number[] = [];
  for (let k = e - 3; k <= e + 1; k++) for (const m of [1, 2, 5]) out.push(m * Math.pow(10, k));
  return out;
}

/**
 * Round axis ticks (1-2-5 × 10^k) covering [lo, hi], between `minTicks` and `maxTicks` of them (4–6 by default).
 * The first tick is ≤ lo and the last ≥ hi, so the ticks are also the axis domain.
 */
export function niceTicks(lo: number, hi: number, minTicks = 4, maxTicks = 6): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1, 2, 3, 4];
  if (lo > hi) [lo, hi] = [hi, lo];
  if (lo === hi) {
    if (lo === 0) hi = 1;
    else {
      const d = Math.abs(lo) * 0.1;
      if (lo > 0 && lo - d < 0) lo = 0;
      else lo -= d;
      hi += d;
    }
  }
  const span = hi - lo;
  let best: { start: number; step: number; count: number; score: number } | null = null;
  for (const step of niceSteps(span)) {
    let start = Math.floor(lo / step + 1e-9) * step;
    let end = Math.ceil(hi / step - 1e-9) * step;
    let count = Math.round((end - start) / step) + 1;
    // A span just past a step boundary can give 3 ticks: one more step keeps the 4-tick floor, added towards
    // zero when that does not cross it (512–1431 → 0, 500, 1000, 1500 rather than 500 … 2000).
    while (count < minTicks) {
      if (lo >= 0 && start - step >= -1e-9) start -= step;
      else if (hi <= 0 && end + step <= 1e-9) end += step;
      else if (lo >= 0) end += step;
      else start -= step;
      count++;
    }
    if (count > maxTicks) continue;
    const score = Math.abs(count - 5) + (count < 5 ? 0.25 : 0);
    if (!best || score < best.score) best = { start, step, count, score };
  }
  if (!best) {
    const step = Math.pow(10, Math.ceil(Math.log10(span)));
    best = { start: Math.floor(lo / step) * step, step, count: 2, score: 0 };
    while (best.start + (best.count - 1) * step < hi) best.count++;
  }
  const d = stepDecimals(best.step);
  const ticks: number[] = [];
  for (let i = 0; i < best.count; i++) ticks.push(roundTo(best.start + i * best.step, d));
  return ticks;
}

/**
 * Round ticks (1-2-5 × 10^k) strictly inside [lo, hi], between `minTicks` and `maxTicks` of them, or null when no
 * step gives that many. For axes whose domain follows the data (scatter, lines) rather than ending on a tick.
 */
export function innerTicks(lo: number, hi: number, minTicks = 4, maxTicks = 6): number[] | null {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null;
  let best: { first: number; step: number; count: number; score: number } | null = null;
  for (const step of niceSteps(hi - lo)) {
    const first = Math.ceil(lo / step - 1e-9) * step;
    const last = Math.floor(hi / step + 1e-9) * step;
    const count = Math.round((last - first) / step) + 1;
    if (count < minTicks || count > maxTicks) continue;
    const score = Math.abs(count - 5);
    if (!best || score < best.score) best = { first, step, count, score };
  }
  if (!best) return null;
  const d = stepDecimals(best.step);
  const ticks: number[] = [];
  for (let i = 0; i < best.count; i++) ticks.push(roundTo(best.first + i * best.step, d));
  return ticks;
}

// ---------- Histogram bins ----------

export interface Bins {
  /** Bin edges, length = counts.length + 1. Bin i is [edges[i], edges[i+1]); the last bin also includes its upper edge. */
  edges: number[];
  counts: number[];
  width: number;
  /** "fd" (Freedman–Diaconis), "sturges", "requested" (the spec asked for a number of bins) or "single" (constant data). */
  rule: "fd" | "sturges" | "requested" | "single";
}

/**
 * Histogram bins: Freedman–Diaconis (2·IQR·n^(−1/3)) bounded to 5–30 bins, Sturges (⌈log2 n⌉ + 1) when the IQR is 0;
 * then the width is rounded to a 1-2-5 × 10^k step (integers stay on whole-number edges) and the start is aligned to it.
 * `requested` (2–50) replaces the rule. Constant data give one bin.
 */
export function histogramBins(values: number[], requested?: number): Bins {
  const xs = sorted(values);
  const n = xs.length;
  if (!n) return { edges: [0, 1], counts: [0], width: 1, rule: "single" };
  const lo = xs[0];
  const hi = xs[n - 1];
  if (lo === hi) return { edges: [lo, hi], counts: [n], width: 0, rule: "single" };
  let target: number;
  let rule: Bins["rule"];
  if (requested && Number.isFinite(requested)) {
    target = Math.max(2, Math.min(50, Math.round(requested)));
    rule = "requested";
  } else {
    const iqr = (quantileSorted(xs, 0.75) as number) - (quantileSorted(xs, 0.25) as number);
    const h = (2 * iqr) / Math.cbrt(n);
    if (iqr > 0 && h > 0) {
      target = Math.ceil((hi - lo) / h);
      rule = "fd";
    } else {
      target = Math.ceil(Math.log2(n)) + 1;
      rule = "sturges";
    }
    target = Math.max(5, Math.min(30, target));
  }
  const integers = xs.every((x) => Number.isInteger(x));
  const minK = rule === "requested" ? 2 : 5;
  const maxK = rule === "requested" ? 50 : 30;
  let best: { step: number; start: number; k: number; score: number } | null = null;
  for (const step of niceSteps(hi - lo)) {
    if (integers && step < 1) continue;
    const start = Math.floor(lo / step + 1e-9) * step;
    const k = Math.max(1, Math.ceil((hi - start) / step - 1e-9));
    const inRange = k >= minK && k <= maxK;
    const score = Math.abs(k - target) + (inRange ? 0 : 1000);
    if (!best || score < best.score) best = { step, start, k, score };
  }
  const { step, start, k } = best as { step: number; start: number; k: number };
  const d = stepDecimals(step);
  const edges: number[] = [];
  for (let i = 0; i <= k; i++) edges.push(roundTo(start + i * step, d));
  const counts = new Array(k).fill(0);
  for (const x of xs) {
    let i = Math.floor((x - start) / step + 1e-9);
    if (i >= k) i = k - 1;
    if (i < 0) i = 0;
    // Guard against float drift at an edge: x belongs to the bin whose lower edge it reaches.
    while (i < k - 1 && x >= edges[i + 1]) i++;
    while (i > 0 && x < edges[i]) i--;
    counts[i]++;
  }
  return { edges, counts, width: step, rule };
}

// ---------- Presentation helpers ----------

/** Decimals a number shows when written plainly (12.50 → 1, 0.30000000000000004 → 1), capped at `cap`. */
export function decimalsOf(v: number, cap = 4): number {
  if (!Number.isFinite(v) || Number.isInteger(v)) return 0;
  const s = String(Number(v.toPrecision(10)));
  if (/e-/i.test(s)) return cap;
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : Math.min(cap, s.length - dot - 1);
}

/** Deterministic evenly spaced sample of `k` indices out of `n` (keeps the first and the last). */
export function evenSample(n: number, k: number): number[] {
  if (k >= n) return Array.from({ length: n }, (_, i) => i);
  if (k <= 1) return [0];
  const out: number[] = [];
  for (let i = 0; i < k; i++) out.push(Math.round((i * (n - 1)) / (k - 1)));
  return out;
}
