/**
 * APA-style presentation of the inferential tests (docs/papers.md §9, D24): the statistic line, the notes, the
 * results tables and the fitted regression equation as LaTeX (for the math module). Pure and client-safe.
 *
 * Rules (APA 7): statistics with two decimals; p with three decimals and no leading zero ("p = .026"), "p < .001",
 * and "p > .999" when it rounds to 1; no leading zero for values that cannot exceed 1 (r, ρ, η², ε², V, R²), a
 * leading zero for d; df with one decimal for Welch, integers otherwise. In es/fr/de numbers use a decimal comma
 * (through the caller's `formatNumber`), so the clauses and the bounds of an interval are separated by "; ".
 */
import { inferenceTranslator } from "./messages";
import type {
  CorrelationResult,
  FittedEquation,
  FormatNumber,
  InferenceLang,
  InferenceNote,
  InferenceResult,
  InferenceTable,
  RegressionResult,
  TestId,
  TestResult,
  Translate,
} from "./types";

const DECIMAL_COMMA: Record<string, boolean> = { es: true, fr: true, de: true };

/** Effects that can exceed 1 and therefore keep their leading zero. */
const KEEP_ZERO_EFFECTS: Record<string, boolean> = { d: true };

/** Separator between the clauses of a line and the bounds of an interval: ", " in English, "; " with a decimal comma. */
export function clauseSeparator(lang: InferenceLang | string): string {
  return DECIMAL_COMMA[lang] ? "; " : ", ";
}

/** Drops the leading zero of a formatted number in (−1, 1): "0.026" → ".026", "-0,45" → "-,45". */
export function stripLeadingZero(s: string): string {
  return s.replace(/^([-−]?)0(?=[.,]\d)/, "$1");
}

/** Decimals for a value that should show two, or three when two would print a non-zero value as zero. */
function smallDecimals(v: number): number {
  return v !== 0 && Math.abs(v) < 0.005 ? 3 : 2;
}

/** The p-value as a table cell: ".026", "< .001" or "> .999" (no "p", no "="). */
export function formatPValue(p: number, lang: InferenceLang | string, formatNumber: FormatNumber): string {
  if (!Number.isFinite(p)) return "—";
  if (p < 0.001) return `< ${stripLeadingZero(formatNumber(0.001, lang, 3))}`;
  if (p >= 0.9995) return `> ${stripLeadingZero(formatNumber(0.999, lang, 3))}`;
  return stripLeadingZero(formatNumber(p, lang, 3));
}

/** The p clause of an APA line: "p = .026", "p < .001", "p > .999". */
export function formatP(p: number, lang: InferenceLang | string, formatNumber: FormatNumber): string {
  const cell = formatPValue(p, lang, formatNumber);
  return cell.charAt(0) === "<" || cell.charAt(0) === ">" ? `p ${cell}` : `p = ${cell}`;
}

/** Degrees of freedom as printed: Welch with one decimal, otherwise integers ("2, 129" for a pair). */
export function formatDf(result: InferenceResult, lang: InferenceLang | string, formatNumber: FormatNumber): string {
  const df = result.statistic.df;
  if (df === undefined) return "";
  const one = (v: number): string =>
    formatNumber(v, lang, result.name === "welch" || Math.abs(v - Math.round(v)) > 1e-9 ? 1 : 0);
  return Array.isArray(df) ? `${one(df[0])}, ${one(df[1])}` : one(df);
}

/** The main statistic as printed: two decimals; U with as many decimals as it has (0 or 1); r and ρ without leading zero. */
export function formatStatistic(result: InferenceResult, lang: InferenceLang | string, formatNumber: FormatNumber): string {
  const v = result.statistic.value;
  if (result.name === "mannWhitney") return formatNumber(v, lang, Math.abs(v - Math.round(v)) > 1e-9 ? 1 : 0);
  if (result.name === "pearson" || result.name === "spearman") return stripLeadingZero(formatNumber(v, lang, 2));
  return formatNumber(v, lang, 2);
}

/** An effect size as printed ("d = 0.71", "η² = .07"). */
export function formatEffect(effect: { name: string; value: number }, lang: InferenceLang | string, formatNumber: FormatNumber): string {
  const s = formatNumber(effect.value, lang, smallDecimals(effect.value));
  return `${effect.name} = ${KEEP_ZERO_EFFECTS[effect.name] ? s : stripLeadingZero(s)}`;
}

/** The 95 % CI of a correlation as printed: "95% CI [.31, .57]" / "IC 95 % [,31; ,57]". */
function formatCorrelationCi(result: CorrelationResult, lang: InferenceLang | string, formatNumber: FormatNumber, tr: Translate): string | null {
  if (!result.ci) return null;
  const sep = clauseSeparator(lang);
  const b = (v: number): string => stripLeadingZero(formatNumber(v, lang, 2));
  return tr("data.test.ci", { ci: `[${b(result.ci[0])}${sep}${b(result.ci[1])}]` });
}

/** Display name of a test in the writing language (`data.test.name.<id>`). */
export function testName(id: TestId, tr: Translate): string {
  return tr(`data.test.name.${id}`);
}

/**
 * The APA line of a result, e.g. "Welch's t(37.2) = 2.31, p = .026, d = 0.71" or, in Spanish,
 * "t de Welch(37,2) = 2,31; p = ,026; d = 0,71". `tr` defaults to the module's own messages.
 */
export function apaLine(result: InferenceResult, lang: InferenceLang | string, formatNumber: FormatNumber, tr: Translate = inferenceTranslator(lang)): string {
  const sep = clauseSeparator(lang);
  const parts: string[] = [
    tr(`data.test.line.${result.name}`, {
      df: formatDf(result, lang, formatNumber),
      value: formatStatistic(result, lang, formatNumber),
      n: formatNumber(result.n, lang, 0),
    }),
  ];
  if (result.extra) for (let i = 0; i < result.extra.length; i++) parts.push(`${result.extra[i].symbol} = ${formatNumber(result.extra[i].value, lang, 2)}`);
  parts.push(formatP(result.p, lang, formatNumber));
  if (result.effect) parts.push(formatEffect(result.effect, lang, formatNumber));
  if (result.name === "pearson") {
    const ci = formatCorrelationCi(result, lang, formatNumber, tr);
    if (ci) parts.push(ci);
  }
  return parts.join(sep);
}

/** One note in the writing language; numbers in its values are formatted (integers plain, others with one decimal). */
export function noteText(note: InferenceNote, lang: InferenceLang | string, formatNumber: FormatNumber, tr: Translate = inferenceTranslator(lang)): string {
  const vars: Record<string, string> = {};
  const values = note.values || {};
  for (const k of Object.keys(values)) {
    const v = values[k];
    vars[k] = typeof v === "number" ? formatNumber(v, lang, Math.abs(v - Math.round(v)) > 1e-9 ? 1 : 0) : v;
  }
  return tr(`data.test.note.${note.code}`, vars);
}

/** All notes of a result in the writing language. */
export function noteTexts(result: InferenceResult, lang: InferenceLang | string, formatNumber: FormatNumber, tr: Translate = inferenceTranslator(lang)): string[] {
  return (result.notes || []).map((n) => noteText(n, lang, formatNumber, tr));
}

/** The stored `TestResult` (§9.2) of a result: display name, statistic, p, effect, CI, APA line and written notes. */
export function toTestResult(result: InferenceResult, lang: InferenceLang | string, formatNumber: FormatNumber, tr: Translate = inferenceTranslator(lang)): TestResult {
  const out: TestResult = {
    name: testName(result.name, tr),
    test: result.name,
    statistic: { ...result.statistic },
    p: result.p,
    line: apaLine(result, lang, formatNumber, tr),
  };
  if (result.effect) out.effect = { ...result.effect };
  if (result.ci) out.ci = [result.ci[0], result.ci[1]];
  const notes = noteTexts(result, lang, formatNumber, tr);
  if (notes.length) out.notes = notes;
  return out;
}

// ── tables ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Group table of a two- or k-group test: Group · n · Mean · SD (Welch, ANOVA) or Group · n · Mean rank (Mann–Whitney,
 * Kruskal–Wallis). `labels` name the groups in the order they were passed; `precision` is the decimals of means/SDs.
 */
export function groupTable(result: InferenceResult, labels: string[], tr: Translate, precision = 2): InferenceTable | null {
  if (result.name === "welch" || result.name === "anova") {
    return {
      columns: [tr("data.test.col.group"), tr("data.test.col.n"), tr("data.test.col.mean"), tr("data.test.col.sd")],
      rows: result.groups.map((g, i) => [labels[i] ?? String(i + 1), g.n, g.mean, g.sd]),
      precision: [0, 0, precision, precision],
    };
  }
  if (result.name === "mannWhitney" || result.name === "kruskal") {
    return {
      columns: [tr("data.test.col.group"), tr("data.test.col.n"), tr("data.test.col.meanRank")],
      rows: result.groupN.map((n, i) => [labels[i] ?? String(i + 1), n, result.meanRanks[i]]),
      precision: [0, 0, 2],
    };
  }
  return null;
}

/** Decimals for coefficients: 3 significant digits for the smallest non-zero |B|, between 2 and 4. */
function coefficientPrecision(values: number[]): number {
  let d = 2;
  for (let i = 0; i < values.length; i++) {
    const a = Math.abs(values[i]);
    if (a > 0 && Number.isFinite(a)) d = Math.max(d, 2 - Math.floor(Math.log10(a)));
  }
  return Math.min(4, d);
}

/**
 * Coefficient table of a regression: Term · B · SE · t · p · 95 % CI lower · upper. p is a formatted string
 * (".026", "< .001"); `label` turns a predictor name into its readable label (dummies print "Label: level").
 */
export function coefficientTable(
  result: RegressionResult,
  lang: InferenceLang | string,
  formatNumber: FormatNumber,
  tr: Translate = inferenceTranslator(lang),
  label: (predictor: string) => string = (s) => s
): InferenceTable {
  const prec = coefficientPrecision(result.coefficients.map((c) => c.estimate));
  return {
    columns: [
      tr("data.test.col.term"),
      tr("data.test.col.estimate"),
      tr("data.test.col.se"),
      tr("data.test.col.t"),
      tr("data.test.col.p"),
      tr("data.test.col.ciLow"),
      tr("data.test.col.ciHigh"),
    ],
    rows: result.coefficients.map((c) => [
      c.predictor === null ? tr("data.test.term.intercept") : c.level !== undefined ? `${label(c.predictor)}: ${c.level}` : label(c.predictor),
      c.estimate,
      c.se,
      c.t,
      formatPValue(c.p, lang, formatNumber),
      c.ci95[0],
      c.ci95[1],
    ]),
    precision: [0, prec, prec, 2, 0, prec, prec],
  };
}

// ── fitted equation ────────────────────────────────────────────────────────────────────────────────────────────

/** Text safe inside \text{…} of the math module's LaTeX subset. */
function latexText(s: string): string {
  return String(s)
    .replace(/[\\^~]/g, " ")
    .replace(/([{}%&#$_])/g, "\\$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Decimals of one coefficient in the equation: 1 from 100 up, 2 from 1 up, otherwise 3 significant digits (≤ 6). */
function equationDecimals(v: number): number {
  const a = Math.abs(v);
  if (a >= 100) return 1;
  if (a >= 1 || a === 0) return 2;
  return Math.min(6, 2 - Math.floor(Math.log10(a)));
}

/**
 * The fitted equation as LaTeX for the equation artifact, e.g.
 * `\text{Predicted annual rainfall (mm)} = 812.4 + 0.531 \cdot \text{Elevation (m)} - 2.10 \cdot \text{Region}_{\text{North}}`.
 * Numbers use the writing language's decimal mark (the math parser reads "812,4" as one number).
 */
export function equationLatex(
  eq: FittedEquation,
  lang: InferenceLang | string,
  formatNumber: FormatNumber,
  options: { tr?: Translate; label?: (name: string) => string; decimals?: number } = {}
): string {
  const tr = options.tr || inferenceTranslator(lang);
  const label = options.label || ((s: string) => s);
  const num = (v: number): string => formatNumber(Math.abs(v), lang, options.decimals ?? equationDecimals(v));
  let out = `\\text{${latexText(tr("data.test.eq.predicted", { response: label(eq.response) }))}} = `;
  out += (eq.intercept < 0 ? "-" : "") + num(eq.intercept);
  for (let i = 0; i < eq.terms.length; i++) {
    const t = eq.terms[i];
    const name = `\\text{${latexText(label(t.predictor))}}`;
    const term = t.level !== undefined ? `${name}_{\\text{${latexText(t.level)}}}` : name;
    out += ` ${t.coefficient < 0 ? "-" : "+"} ${num(t.coefficient)} \\cdot ${term}`;
  }
  return out;
}
