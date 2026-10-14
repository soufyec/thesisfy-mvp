/**
 * Types of the inferential tests computed by Thesisfic (docs/papers.md §9, D24, §9.2). Pure, no runtime imports.
 *
 * Every test function in `tests.ts` returns an `InferenceResult`: the presentation fields of the spec's
 * `TestResult` (name, statistic, p, effect, ci, notes) plus the raw numbers a table needs. `format.ts` turns it into
 * the stored `TestResult` (with the APA `line` and the notes written in the paper's language).
 */

/** Writing languages the formatter knows (same values as `WritingLanguage` in `src/lib/papers/kinds.ts`). */
export type InferenceLang = "en" | "es" | "fr" | "de";

/** Stable test ids. Display names come from the translator (`data.test.name.<id>`), never from this field. */
export type TestId =
  | "welch"
  | "pairedT"
  | "anova"
  | "chiSquare"
  | "pearson"
  | "spearman"
  | "mannWhitney"
  | "kruskal"
  | "regression";

/** Codes of `InferenceError` (the route maps every one of them to `artifact_error` `too_few` or its own code). */
export type InferenceErrorCode =
  | "too_few" // fewer observations than the test needs (n ≥ 3 per group, n ≥ 3 pairs, more rows than terms…)
  | "too_few_groups" // fewer than two groups, or a table with fewer than two non-empty rows or columns
  | "length_mismatch" // paired arrays of different lengths
  | "constant" // no variation where the test needs it (identical values, zero variance, all ties)
  | "invalid_table" // negative or non-finite counts
  | "too_many_predictors" // more than 6 predictors in a regression
  | "too_many_levels" // a categorical predictor with more than 6 levels
  | "collinear" // the design matrix is (numerically) rank deficient
  | "perfect_fit"; // the regression residuals are all zero: standard errors would be 0 and t infinite

/** Codes of the notes attached to a result. `format.ts` writes them with `data.test.note.<code>`. */
export type InferenceNoteCode =
  | "missingExcluded" // {count}: observations or rows left out because a value was missing
  | "dPooled" // Cohen's d of the Welch test divided by the pooled SD
  | "dPaired" // d of the paired test = mean difference / SD of the differences (d_z)
  | "expectedLow" // {share}: share (%) of expected counts below 5 when it is above 20 %
  | "expectedBelowOne" // some expected count is below 1
  | "emptyDropped" // {count}: empty rows or columns of the table left out
  | "smallSampleApprox" // rank test with a group of fewer than 8: normal approximation
  | "referenceLevel"; // {predictor} {level}: reference level of a categorical predictor

/** A note with its interpolation values (numbers arrive raw and are formatted in the writing language). */
export interface InferenceNote {
  code: InferenceNoteCode;
  values?: Record<string, string | number>;
}

/** Test statistic as reported: symbol ("t", "F", "χ²", "r", "ρ", "U", "H"), value and degrees of freedom. */
export interface TestStatistic {
  symbol: string;
  value: number;
  df?: number | [number, number];
}

/** Effect size: symbol ("d", "η²", "V", "r", "ε²", "R²") and value. */
export interface EffectSize {
  name: string;
  value: number;
}

/** What `ci` is an interval of (the formatter and the table need to know). */
export type CiTarget = "meanDifference" | "r";

/** Common, presentation-ready part of every result (spec §9.2 `TestResult` without `line`, notes as codes). */
export interface InferenceBase {
  name: TestId;
  statistic: TestStatistic;
  /** Two-sided p-value in [0, 1]. */
  p: number;
  effect?: EffectSize;
  /** 95 % confidence interval of `ciTarget`. */
  ci?: [number, number];
  ciTarget?: CiTarget;
  /** Total number of observations (pairs for paired tests and correlations, rows for the regression). */
  n: number;
  /** Extra statistics printed after the main one (Mann–Whitney: z). */
  extra?: { symbol: string; value: number }[];
  notes?: InferenceNote[];
}

/** Per-group summary used by the group tests. */
export interface GroupSummary {
  n: number;
  mean: number;
  sd: number;
}

export interface WelchResult extends InferenceBase {
  name: "welch";
  groups: [GroupSummary, GroupSummary];
  meanDifference: number;
  se: number;
  df: number;
  /** Cohen's d with the pooled standard deviation (d_s), the convention `effect` uses. */
  d: number;
  pooledSd: number;
}

export interface PairedResult extends InferenceBase {
  name: "pairedT";
  meanDifference: number;
  sdDifference: number;
  se: number;
  df: number;
  /** d_z = mean difference / SD of the differences. */
  d: number;
  means: [number, number];
}

export interface AnovaResult extends InferenceBase {
  name: "anova";
  groups: GroupSummary[];
  ssBetween: number;
  ssWithin: number;
  msBetween: number;
  msWithin: number;
  df1: number;
  df2: number;
  etaSquared: number;
}

export interface ChiSquareResult extends InferenceBase {
  name: "chiSquare";
  /** The table actually tested (empty rows and columns removed). */
  observed: number[][];
  expected: number[][];
  /** Indices of the input rows and columns kept, in order. */
  rowsKept: number[];
  colsKept: number[];
  df: number;
  cramersV: number;
  /** Share of expected counts below 5, in [0, 1]. */
  expectedBelow5Share: number;
  minExpected: number;
  /** Always false: no Yates correction, also for 2 × 2 tables. */
  yates: false;
}

export interface CorrelationResult extends InferenceBase {
  name: "pearson" | "spearman";
  r: number;
  t: number;
  df: number;
}

export interface MannWhitneyResult extends InferenceBase {
  name: "mannWhitney";
  /** U of the first group (scipy's `statistic`), U of the second, and the smaller of the two. */
  u1: number;
  u2: number;
  uMin: number;
  /** Normal approximation with tie and continuity correction, from max(U1, U2) like scipy's two-sided test. */
  z: number;
  /** r = z / √N. */
  r: number;
  meanRanks: [number, number];
  groupN: [number, number];
}

export interface KruskalResult extends InferenceBase {
  name: "kruskal";
  h: number;
  df: number;
  epsilonSquared: number;
  meanRanks: number[];
  groupN: number[];
  tieCorrection: number;
}

/** One predictor of `olsRegression`. `values` are numbers (numeric) or strings (categorical, dummy coded). */
export interface Predictor {
  name: string;
  values: (number | null | undefined)[] | (string | null | undefined)[];
  /** Force the coding (e.g. a year used as a factor). Default: numbers → numeric, strings → categorical. */
  kind?: "numeric" | "categorical";
  /** Explicit level order for a categorical predictor; the first one is the reference. Default: sorted by code point. */
  levels?: string[];
}

/** One estimated coefficient. `term` is the predictor name, or `name[level]` for a dummy. */
export interface Coefficient {
  term: string;
  predictor: string | null; // null for the intercept
  level?: string;
  estimate: number;
  se: number;
  t: number;
  p: number;
  ci95: [number, number];
}

/** The fitted equation as data: ŷ = intercept + Σ coefficient · term. */
export interface FittedEquation {
  response: string;
  intercept: number;
  terms: { term: string; predictor: string; level?: string; coefficient: number }[];
}

export interface RegressionResult extends InferenceBase {
  name: "regression";
  coefficients: Coefficient[];
  r2: number;
  adjR2: number;
  F: number;
  df1: number;
  df2: number;
  pF: number;
  /** Residual standard error. */
  sigma: number;
  /** Reference level of each categorical predictor. */
  references: { predictor: string; level: string; levels: string[] }[];
  equation: FittedEquation;
}

/** Any result of `tests.ts`. */
export type InferenceResult =
  | WelchResult
  | PairedResult
  | AnovaResult
  | ChiSquareResult
  | CorrelationResult
  | MannWhitneyResult
  | KruskalResult
  | RegressionResult;

/**
 * The spec's stored `TestResult` (§9.2): what `format.ts` builds from an `InferenceResult`. `name` is the display
 * name in the writing language; `test` (an addition to §9.2) keeps the stable id.
 */
export interface TestResult {
  name: string;
  test: TestId;
  statistic: TestStatistic;
  p: number;
  effect?: EffectSize;
  ci?: [number, number];
  line: string;
  notes?: string[];
}

/** Same shape as `Translate` in `src/lib/data/labels.ts` / the i18n dictionary (`{var}` interpolation). */
export type Translate = (key: string, vars?: Record<string, string | number | undefined>) => string;

/** Same shape as `formatNumber` in `src/lib/data/labels.ts`: decimal comma in es/fr/de, no grouping. */
export type FormatNumber = (v: number, lang: string, precision: number) => string;

/** A results table, shape-compatible with `ArtifactTable` (§1.4): raw numbers plus the decimals of each column. */
export interface InferenceTable {
  columns: string[];
  rows: (string | number | null)[][];
  precision: number[];
}
