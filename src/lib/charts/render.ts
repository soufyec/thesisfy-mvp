/**
 * Self-contained SVG charts for artifacts computed by Thesisfic (docs/papers.md §3.4, D17). Pure and client-safe:
 * `import type` from the app, relative runtime imports only; the same string is drawn inline in the assistant panel
 * (at the measured width, min 320), in the editor's chart node and rasterised for DOCX (640×400).
 *
 * Rules: 12px text in Inter/Helvetica/Arial; white background; 1px solid hairline grid and axis; text never in a
 * series colour; one series → green, no legend; two or more → legend on top and direct labels at line ends (≤ 4);
 * bars ≤ 24px thick with a 4px rounded data end and a flat base, 2px gaps between touching bars; 2px round lines;
 * markers r = 4 with a 2px white ring (≤ 300 points; above, r = 2.5, no ring, opacity 0.7); histogram bars
 * contiguous with a 2px gap; fitted line 2px dark neutral with "r = 0,62 · n = 120"; values at bar tips when there
 * are ≤ 12 bars and they fit; 4–6 round Y ticks, compact from 1,000 (1K); never a second axis. `role="img"` with
 * `<title>`/`<desc>`; `interactive` adds a `<title>` to every mark (native tooltip). All text is escaped.
 *
 * Bar charts whose category labels do not fit under the bars are drawn horizontally; their height grows (never
 * shrinks) so that every category keeps a readable row. The returned SVG's width/height attributes are the truth.
 */
import type { ChartData, WritingLanguage } from "@/lib/db";
import { CHART_AXIS, CHART_FIT, CHART_FONT, CHART_GRID, CHART_MUTED, CHART_SURFACE, CHART_TEXT, seriesColor } from "./palette";
import { formatCompact, formatNumber } from "../data/labels";
import { innerTicks, niceTicks, stepDecimals } from "../data/stats";

export interface RenderOptions {
  width: number;
  height: number;
  /** Adds a `<title>` (native tooltip) to every mark. */
  interactive?: boolean;
  /** Accessible name (`<title>`), usually the artifact title. */
  title: string;
  /** Accessible description (`<desc>`), usually the caption. */
  desc: string;
  /** Writing language of the numbers (decimal comma in es/fr/de). */
  lang: WritingLanguage;
}

const FS = 12;
const PAD = 12;
const ROW = 16;
const BAR_MAX = 24;
const RADIUS = 4;
const GAP = 2;
const VALUE_LABEL_MAX_BARS = 12;

// ---------- Text ----------

export function escapeXml(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Helvetica/Arial advance widths (1/1000 em) of printable ASCII from space; others use 556. */
const ADV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611,
  778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556,
  556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const WIDE: Record<string, number> = { "—": 1000, "…": 1000, "–": 556, "·": 278, "°": 400, "²": 333, " ": 278, "€": 556, "%": 889 };

/**
 * Estimated rendered width of `s` at 12px. Inter is about 8 % wider than Arial; the estimate adds 10 % so that a
 * label measured to fit does fit in any of the three fonts.
 */
export function textWidth(s: string, size = FS): number {
  let w = 0;
  for (const ch of String(s)) {
    const c = ch.charCodeAt(0);
    if (WIDE[ch] !== undefined) w += WIDE[ch];
    else if (c >= 32 && c < 127) w += ADV[c - 32];
    else if (c >= 0x3000) w += 1000;
    else w += 556;
  }
  return (w / 1000) * size * 1.1;
}

/** Characters of a label measured when it has to be cut (no chart is wide enough to show more). */
const FIT_SCAN_CHARS = 300;

/** `s` cut with "…" to fit `max` pixels: the longest prefix that fits, found by binary search (at least 1 character). */
function fit(s: string, max: number): string {
  if (textWidth(s) <= max) return s;
  const chars = Array.from(s.length > FIT_SCAN_CHARS ? s.slice(0, FIT_SCAN_CHARS) : s);
  let lo = 1;
  let hi = chars.length;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (textWidth(chars.slice(0, m).join("") + "…") <= max) lo = m;
    else hi = m - 1;
  }
  return chars.slice(0, lo).join("").trimEnd() + "…";
}

// ---------- Input limits ----------

/** What `renderChartSvg` accepts of a `ChartData`, whoever built it (the engine, or a spec parsed from saved HTML). */
export const CHART_LIMITS = { labelChars: 200, categories: 500, series: 5, points: 500 } as const;

const CHART_KINDS: ChartData["type"][] = ["bar", "groupedBar", "line", "scatter", "histogram"];

const label200 = (v: unknown) => String(v ?? "").slice(0, CHART_LIMITS.labelChars);
const finiteNum = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

/**
 * A `ChartData` within the engine's own limits: labels and series names cut to 200 characters, at most 500
 * categories and values per series, 5 series and 500 points per series, numbers kept only when finite (others read
 * as gaps), the fitted line kept only when all its numbers are finite. The engine never produces more; a chart spec
 * decoded from a paper's HTML (student-controlled) is held to the same limits before it is drawn.
 */
export function normalizeChart(chart: ChartData): ChartData {
  const c = (chart && typeof chart === "object" ? chart : {}) as Partial<ChartData>;
  const out: ChartData = {
    type: CHART_KINDS.indexOf(c.type as ChartData["type"]) !== -1 ? (c.type as ChartData["type"]) : "bar",
    xLabel: label200(c.xLabel),
    yLabel: label200(c.yLabel),
    series: (Array.isArray(c.series) ? c.series : []).slice(0, CHART_LIMITS.series).map((raw) => {
      const sr = (raw && typeof raw === "object" ? raw : {}) as ChartData["series"][number];
      const s: ChartData["series"][number] = { name: label200(sr.name) };
      if (Array.isArray(sr.values)) s.values = sr.values.slice(0, CHART_LIMITS.categories).map(finiteNum);
      if (Array.isArray(sr.points)) {
        s.points = sr.points
          .slice(0, CHART_LIMITS.points)
          .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
          .map((p) => [p[0], p[1]] as [number, number]);
      }
      if (sr.other) s.other = true;
      return s;
    }),
  };
  if (Array.isArray(c.categories)) out.categories = c.categories.slice(0, CHART_LIMITS.categories).map(label200);
  const f = c.fit;
  if (f && [f.slope, f.intercept, f.r, f.n].every((v) => typeof v === "number" && Number.isFinite(v))) out.fit = { slope: f.slope, intercept: f.intercept, r: f.r, n: f.n };
  if (c.percent) out.percent = true;
  return out;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Crisp 1px line coordinate. */
const crisp = (n: number) => Math.round(n) + 0.5;

function text(x: number, y: number, s: string, o: { anchor?: "start" | "middle" | "end"; fill?: string; full?: string; weight?: number } = {}): string {
  const anchor = o.anchor && o.anchor !== "start" ? ` text-anchor="${o.anchor}"` : "";
  const weight = o.weight ? ` font-weight="${o.weight}"` : "";
  const tip = o.full && o.full !== s ? `<title>${escapeXml(o.full)}</title>` : "";
  return `<text x="${r2(x)}" y="${r2(y)}" fill="${o.fill || CHART_TEXT}"${anchor}${weight}>${tip}${escapeXml(s)}</text>`;
}

/** x of a centred label kept inside the chart (first and last axis labels near the edges). */
function clampX(cx: number, label: string, W: number): number {
  const half = textWidth(label) / 2;
  return Math.max(PAD + half, Math.min(W - PAD - half, cx));
}

/** Baseline y of 12px text vertically centred on `y`. */
const mid = (y: number) => y + 4;

function hline(x1: number, x2: number, y: number, color: string): string {
  return `<line x1="${r2(x1)}" x2="${r2(x2)}" y1="${crisp(y)}" y2="${crisp(y)}" stroke="${color}" stroke-width="1"/>`;
}
function vline(x: number, y1: number, y2: number, color: string): string {
  return `<line x1="${crisp(x)}" x2="${crisp(x)}" y1="${r2(y1)}" y2="${r2(y2)}" stroke="${color}" stroke-width="1"/>`;
}

const tip = (interactive: boolean | undefined, s: string) => (interactive ? `<title>${escapeXml(s)}</title>` : "");

// ---------- Numbers ----------

/** Charts print negatives with a true minus sign (−), tables keep the hyphen-minus of `formatNumber`. */
const minus = (s: string) => (s.charAt(0) === "-" ? "\u2212" + s.slice(1) : s);

interface Axis {
  ticks: number[];
  lo: number;
  hi: number;
  format: (v: number) => string;
}

/**
 * A value axis. "cover" (bars, histograms): the ticks are the domain, from the first tick to the last. "data"
 * (lines, scatter): the domain is the data range plus 5 %, with round ticks inside it; when no 1-2-5 step gives
 * 4–6 ticks inside, it falls back to "cover".
 */
function axis(lo: number, hi: number, lang: WritingLanguage, compactFrom: number, mode: "cover" | "data" = "cover"): Axis {
  let ticks: number[] | null = null;
  let dlo = lo;
  let dhi = hi;
  if (mode === "data" && hi > lo) {
    const pad = (hi - lo) * 0.05;
    dlo = lo >= 0 && lo - pad < 0 ? 0 : lo - pad;
    dhi = hi <= 0 && hi + pad > 0 ? 0 : hi + pad;
    ticks = innerTicks(dlo, dhi);
  }
  if (!ticks) {
    ticks = niceTicks(lo, hi);
    dlo = ticks[0];
    dhi = ticks[ticks.length - 1];
  }
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
  const d = stepDecimals(step);
  const maxAbs = Math.max(...ticks.map((t) => Math.abs(t)));
  // Compact (1K, 1.5K) from 1,000 up, when the step keeps it to one decimal; fine steps print in full (980, 1000, 1020).
  const compact = maxAbs >= compactFrom && step >= 100;
  return { ticks, lo: dlo, hi: dhi, format: (v) => minus(compact ? formatCompact(v, lang, d) : formatNumber(v, lang, d)) };
}

/** Decimals for value labels: whole numbers stay whole, shares get 1, other values 0–2 by size. */
function valueFormat(values: number[], percent: boolean | undefined, lang: WritingLanguage): (v: number) => string {
  const finite = values.filter((v) => Number.isFinite(v));
  const maxAbs = finite.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const integers = finite.every((v) => Number.isInteger(v));
  const d = integers ? 0 : percent ? 1 : maxAbs >= 100 ? 0 : maxAbs >= 10 ? 1 : 2;
  // Full numbers up to 99999 (a bar tip has room for them); larger ones compact with one decimal (123.5K).
  return (v) => minus(maxAbs >= 100000 ? formatCompact(v, lang, d, true, 1) : formatNumber(v, lang, d));
}

const finiteOr = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// ---------- Shapes ----------

/** Vertical bar from baseline y0 to data end y1, rounded at the data end only. */
function barV(x: number, w: number, y0: number, y1: number, color: string, title: string): string {
  const h = Math.abs(y0 - y1);
  if (h < 0.5 || w <= 0) return "";
  const r = Math.min(RADIUS, w / 2, h);
  let d: string;
  if (y1 <= y0) d = `M${r2(x)} ${r2(y0)}V${r2(y1 + r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(x + r)} ${r2(y1)}H${r2(x + w - r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(x + w)} ${r2(y1 + r)}V${r2(y0)}Z`;
  else d = `M${r2(x)} ${r2(y0)}V${r2(y1 - r)}A${r2(r)} ${r2(r)} 0 0 0 ${r2(x + r)} ${r2(y1)}H${r2(x + w - r)}A${r2(r)} ${r2(r)} 0 0 0 ${r2(x + w)} ${r2(y1 - r)}V${r2(y0)}Z`;
  return `<path d="${d}" fill="${color}">${title}</path>`;
}

/** Horizontal bar from baseline x0 to data end x1, rounded at the data end only. */
function barH(y: number, h: number, x0: number, x1: number, color: string, title: string): string {
  const w = Math.abs(x1 - x0);
  if (w < 0.5 || h <= 0) return "";
  const r = Math.min(RADIUS, h / 2, w);
  let d: string;
  if (x1 >= x0) d = `M${r2(x0)} ${r2(y)}H${r2(x1 - r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(x1)} ${r2(y + r)}V${r2(y + h - r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(x1 - r)} ${r2(y + h)}H${r2(x0)}Z`;
  else d = `M${r2(x0)} ${r2(y)}H${r2(x1 + r)}A${r2(r)} ${r2(r)} 0 0 0 ${r2(x1)} ${r2(y + r)}V${r2(y + h - r)}A${r2(r)} ${r2(r)} 0 0 0 ${r2(x1 + r)} ${r2(y + h)}H${r2(x0)}Z`;
  return `<path d="${d}" fill="${color}">${title}</path>`;
}

// ---------- Legend and title row ----------

type Swatch = "rect" | "line" | "dot";

interface Series {
  name: string;
  color: string;
  values: (number | null)[];
  points: [number, number][];
  other: boolean;
}

function prepSeries(chart: ChartData): Series[] {
  return (chart.series || [])
    .map((s, i) => ({
      name: String(s.name ?? ""),
      color: seriesColor(i, !!s.other),
      values: (s.values || []).map(finiteOr),
      points: (s.points || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) as [number, number][],
      other: !!s.other,
    }))
    .filter((s) => s.values.some((v) => v !== null) || s.points.length || chart.type === "histogram");
}

/** Legend rows (wrapped) for two or more series; returns the markup and its height. */
function legend(series: Series[], W: number, swatch: Swatch, top: number): { svg: string; height: number } {
  if (series.length < 2) return { svg: "", height: 0 };
  const maxItem = W - 2 * PAD;
  let x = PAD;
  let row = 0;
  const parts: string[] = [];
  for (const s of series) {
    const label = fit(s.name, Math.max(40, maxItem - 20));
    const w = 10 + 6 + textWidth(label) + 16;
    if (x > PAD && x + w - 16 > W - PAD) {
      row++;
      x = PAD;
    }
    const cy = top + row * ROW + ROW / 2;
    if (swatch === "rect") parts.push(`<rect x="${r2(x)}" y="${r2(cy - 5)}" width="10" height="10" rx="2" fill="${s.color}"/>`);
    else if (swatch === "line") parts.push(`<line x1="${r2(x)}" x2="${r2(x + 10)}" y1="${r2(cy)}" y2="${r2(cy)}" stroke="${s.color}" stroke-width="2" stroke-linecap="round"/>`);
    else parts.push(`<circle cx="${r2(x + 5)}" cy="${r2(cy)}" r="4" fill="${s.color}"/>`);
    parts.push(text(x + 16, mid(cy), label, { full: s.name }));
    x += w;
  }
  return { svg: parts.join(""), height: (row + 1) * ROW + 6 };
}

/** The row above the plot: an axis title on the left, an optional note (fit) on the right, wrapped when they collide. */
function titleRow(left: string, right: string | null, W: number, top: number): { svg: string; height: number } {
  const parts: string[] = [];
  let h = 0;
  const leftText = left ? fit(left, W - 2 * PAD) : "";
  if (leftText) parts.push(text(PAD, mid(top + ROW / 2), leftText, { full: left }));
  if (right) {
    const rw = textWidth(right);
    const sameRow = !leftText || textWidth(leftText) + 16 + rw <= W - 2 * PAD;
    const y = sameRow ? top : top + ROW;
    parts.push(text(W - PAD, mid(y + ROW / 2), fit(right, W - 2 * PAD), { anchor: "end", fill: CHART_FIT }));
    h = sameRow ? ROW : 2 * ROW;
  } else if (leftText) h = ROW;
  return { svg: parts.join(""), height: h ? h + 8 : 0 };
}

// ---------- Charts ----------

interface Drawn {
  svg: string;
  height: number;
}

const looksOrdered = (cats: string[]) => cats.length > 0 && cats.every((c) => /^-?\d+([.,]\d+)?$/.test(c.trim()) || /^\d{4}(-\d{2}(-\d{2})?)?$/.test(c.trim()));

/** Indices of category labels to print so that none overlap (every k-th, always the first). */
function thinLabels(labels: string[], band: number): { step: number; maxW: number } {
  const maxW = labels.reduce((m, l) => Math.max(m, textWidth(l)), 0);
  const step = Math.max(1, Math.ceil((maxW + 8) / Math.max(1, band)));
  return { step, maxW };
}

/** Plot rectangle of a vertical chart; `footroom` keeps room under the plot for labels of negative bars. */
function verticalFrame(W: number, H: number, top: number, yAxis: Axis, xTitle: string, rightReserve: number, headroom: number, footroom = 0) {
  const tickW = yAxis.ticks.reduce((m, t) => Math.max(m, textWidth(yAxis.format(t))), 0);
  const left = PAD + tickW + 8;
  const right = W - PAD - rightReserve;
  const bottom = H - PAD - (xTitle ? ROW + 6 : 0) - ROW - 6 - footroom;
  return { left, right, top: top + headroom, bottom, foot: footroom };
}

function yGrid(frame: { left: number; right: number; top: number; bottom: number }, yAxis: Axis, yOf: (v: number) => number): string {
  const parts: string[] = [];
  for (const t of yAxis.ticks) {
    const y = yOf(t);
    parts.push(hline(frame.left, frame.right, y, t === 0 || t === yAxis.lo ? CHART_AXIS : CHART_GRID));
    parts.push(text(frame.left - 8, mid(y), yAxis.format(t), { anchor: "end", fill: CHART_MUTED }));
  }
  // Data-following domains do not end on a tick: the baseline still closes the plot.
  if (yAxis.ticks[0] !== yAxis.lo) parts.push(hline(frame.left, frame.right, frame.bottom, CHART_AXIS));
  return parts.join("");
}

function drawBarsVertical(chart: ChartData, series: Series[], o: RenderOptions, W: number, H: number): Drawn | null {
  const cats = chart.categories || [];
  const n = cats.length;
  const s = series.length;
  const all = series.flatMap((x) => x.values).filter((v): v is number => v !== null);
  const lo = Math.min(0, ...all);
  const hi = Math.max(0, ...all);
  const yAxis = axis(lo, hi, o.lang, 1000);
  const lg = legend(series, W, "rect", PAD);
  const tr = titleRow(chart.yLabel, null, W, PAD + lg.height);
  const top = PAD + lg.height + tr.height;
  const fmtV = valueFormat(all, chart.percent, o.lang);
  const barCount = n * s;
  let showValues = barCount <= VALUE_LABEL_MAX_BARS;
  const frame = verticalFrame(W, H, top, yAxis, chart.xLabel, 0, showValues ? 14 : 0, showValues && lo < 0 ? 14 : 0);
  const plotW = frame.right - frame.left;
  const band = plotW / Math.max(1, n);
  const ordered = looksOrdered(cats);
  const { step, maxW } = thinLabels(cats, band);
  // Category labels that do not fit (and are not an ordered axis that can skip labels) → horizontal bars.
  if (!ordered && (step > 1 || n > VALUE_LABEL_MAX_BARS)) return null;
  void maxW;
  const thick = Math.max(2, Math.min(BAR_MAX, (band * 0.72 - (s - 1) * GAP) / s));
  const groupW = s * thick + (s - 1) * GAP;
  if (showValues) {
    // Each value label must fit over its bar (plus the gap) or over the band for single bars.
    const room = s === 1 ? band - 4 : thick + GAP + 2;
    showValues = series.every((x) => x.values.every((v) => v === null || textWidth(fmtV(v)) <= room));
  }
  const yOf = (v: number) => frame.bottom - ((v - yAxis.lo) / (yAxis.hi - yAxis.lo)) * (frame.bottom - frame.top);
  const y0 = yOf(Math.max(yAxis.lo, Math.min(yAxis.hi, 0)));
  const parts: string[] = [lg.svg, tr.svg, yGrid(frame, yAxis, yOf)];
  const labels: string[] = [];
  for (let i = 0; i < n; i++) {
    const gx = frame.left + band * i + (band - groupW) / 2;
    series.forEach((ser, j) => {
      const v = ser.values[i];
      if (v === null || v === undefined) return;
      const x = gx + j * (thick + GAP);
      const y1 = yOf(v);
      const name = s > 1 ? `${cats[i]} · ${ser.name}: ${fmtV(v)}` : `${cats[i]}: ${fmtV(v)}`;
      parts.push(barV(x, thick, y0, y1, ser.color, tip(o.interactive, name)));
      if (showValues) labels.push(text(x + thick / 2, v >= 0 ? y1 - 4 : y1 + 14, fmtV(v), { anchor: "middle" }));
    });
  }
  parts.push(hline(frame.left, frame.right, y0, CHART_AXIS));
  parts.push(labels.join(""));
  for (let i = 0; i < n; i += step) {
    const label = fit(cats[i], band * step - 6);
    parts.push(text(clampX(frame.left + band * (i + 0.5), label, W), frame.bottom + frame.foot + 6 + 12, label, { anchor: "middle", full: cats[i] }));
  }
  if (chart.xLabel) parts.push(text((frame.left + frame.right) / 2, H - PAD - 2, fit(chart.xLabel, W - 2 * PAD), { anchor: "middle", full: chart.xLabel }));
  return { svg: parts.join(""), height: H };
}

function drawBarsHorizontal(chart: ChartData, series: Series[], o: RenderOptions, W: number, H: number): Drawn {
  const cats = chart.categories || [];
  const n = cats.length;
  const s = series.length;
  const all = series.flatMap((x) => x.values).filter((v): v is number => v !== null);
  const lo = Math.min(0, ...all);
  const hi = Math.max(0, ...all);
  const xAxis = axis(lo, hi, o.lang, 1000);
  const fmtV = valueFormat(all, chart.percent, o.lang);
  const showValues = n * s <= VALUE_LABEL_MAX_BARS;
  const lg = legend(series, W, "rect", PAD);
  const tr = titleRow(chart.xLabel, null, W, PAD + lg.height);
  const top = PAD + lg.height + tr.height;
  const catW = Math.min(W * 0.36, cats.reduce((m, c) => Math.max(m, textWidth(c)), 0));
  const valueW = showValues ? all.reduce((m, v) => Math.max(m, textWidth(fmtV(v))), 0) + 6 : 0;
  const left = PAD + catW + 8;
  const lastTickHalf = textWidth(xAxis.format(xAxis.hi)) / 2;
  const right = W - PAD - Math.max(valueW, lastTickHalf);
  const bottomBand = ROW + 6 + (chart.yLabel ? ROW + 6 : 0);
  // Rows of at least 18px, and enough for the bars of every series.
  const minBand = Math.max(18, s * 6 + (s - 1) * GAP + 6);
  let plotH = H - PAD - bottomBand - top;
  if (plotH / Math.max(1, n) < minBand) {
    plotH = minBand * n;
    H = Math.ceil(top + plotH + bottomBand + PAD);
  }
  const bottom = top + plotH;
  const band = plotH / Math.max(1, n);
  const thick = Math.max(2, Math.min(BAR_MAX, (band * 0.72 - (s - 1) * GAP) / s));
  const groupH = s * thick + (s - 1) * GAP;
  const xOf = (v: number) => left + ((v - xAxis.lo) / (xAxis.hi - xAxis.lo)) * (right - left);
  const x0 = xOf(Math.max(xAxis.lo, Math.min(xAxis.hi, 0)));
  const parts: string[] = [lg.svg, tr.svg];
  for (const t of xAxis.ticks) {
    const x = xOf(t);
    parts.push(vline(x, top, bottom, t === 0 ? CHART_AXIS : CHART_GRID));
    const label = xAxis.format(t);
    parts.push(text(clampX(x, label, W), bottom + 6 + 12, label, { anchor: "middle", fill: CHART_MUTED }));
  }
  for (let i = 0; i < n; i++) {
    const gy = top + band * i + (band - groupH) / 2;
    parts.push(text(left - 8, mid(top + band * (i + 0.5)), fit(cats[i], catW), { anchor: "end", full: cats[i] }));
    series.forEach((ser, j) => {
      const v = ser.values[i];
      if (v === null || v === undefined) return;
      const y = gy + j * (thick + GAP);
      const x1 = xOf(v);
      const name = s > 1 ? `${cats[i]} · ${ser.name}: ${fmtV(v)}` : `${cats[i]}: ${fmtV(v)}`;
      parts.push(barH(y, thick, x0, x1, ser.color, tip(o.interactive, name)));
      if (showValues) parts.push(text(v >= 0 ? x1 + 4 : x1 - 4, mid(y + thick / 2), fmtV(v), { anchor: v >= 0 ? "start" : "end" }));
    });
  }
  parts.push(vline(x0, top, bottom, CHART_AXIS));
  if (chart.yLabel) parts.push(text((left + right) / 2, H - PAD - 2, fit(chart.yLabel, W - 2 * PAD), { anchor: "middle", full: chart.yLabel }));
  return { svg: parts.join(""), height: H };
}

function drawLine(chart: ChartData, series: Series[], o: RenderOptions, W: number, H: number): Drawn {
  const cats = chart.categories || [];
  const n = cats.length;
  const all = series.flatMap((x) => x.values).filter((v): v is number => v !== null);
  const yAxis = axis(Math.min(...all), Math.max(...all), o.lang, 1000, "data");
  const lg = legend(series, W, "line", PAD);
  const tr = titleRow(chart.yLabel, null, W, PAD + lg.height);
  const top = PAD + lg.height + tr.height;
  const direct = series.length >= 2 && series.length <= 4;
  const labelW = direct ? Math.min(W * 0.26, series.reduce((m, x) => Math.max(m, textWidth(x.name)), 0)) : 0;
  const frame = verticalFrame(W, H, top, yAxis, chart.xLabel, direct ? labelW + 14 : 0, 0);
  const band = (frame.right - frame.left) / Math.max(1, n);
  const xOf = (i: number) => frame.left + band * (i + 0.5);
  const yOf = (v: number) => frame.bottom - ((v - yAxis.lo) / (yAxis.hi - yAxis.lo)) * (frame.bottom - frame.top);
  const fmtV = valueFormat(all, chart.percent, o.lang);
  const parts: string[] = [lg.svg, tr.svg, yGrid(frame, yAxis, yOf)];
  const markers = n <= 24;
  const ends: { y: number; x: number; s: Series }[] = [];
  // "Other" underneath, then the series in order.
  const order = series.filter((x) => x.other).concat(series.filter((x) => !x.other));
  for (const ser of order) {
    let d = "";
    let pen = false;
    ser.values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${r2(xOf(i))} ${r2(yOf(v))}`;
      pen = true;
    });
    if (d) parts.push(`<path d="${d}" fill="none" stroke="${ser.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
    let last = -1;
    ser.values.forEach((v, i) => {
      if (v === null) return;
      last = i;
      const name = series.length > 1 ? `${cats[i]} · ${ser.name}: ${fmtV(v)}` : `${cats[i]}: ${fmtV(v)}`;
      if (markers) parts.push(`<circle cx="${r2(xOf(i))}" cy="${r2(yOf(v))}" r="4" fill="${ser.color}" stroke="${CHART_SURFACE}" stroke-width="2">${tip(o.interactive, name)}</circle>`);
      else if (o.interactive) parts.push(`<circle cx="${r2(xOf(i))}" cy="${r2(yOf(v))}" r="6" fill="transparent">${tip(true, name)}</circle>`);
    });
    if (!markers && last !== -1) parts.push(`<circle cx="${r2(xOf(last))}" cy="${r2(yOf(ser.values[last] as number))}" r="4" fill="${ser.color}" stroke="${CHART_SURFACE}" stroke-width="2"/>`);
    if (last !== -1) ends.push({ x: xOf(last), y: yOf(ser.values[last] as number), s: ser });
  }
  if (direct) {
    // End labels: kept in order, pushed apart to 14px, with a leader line when moved.
    const sorted = ends.slice().sort((a, b) => a.y - b.y);
    const ys = sorted.map((e) => e.y);
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + 14);
    const overflow = ys.length ? ys[ys.length - 1] - frame.bottom : 0;
    if (overflow > 0) for (let i = ys.length - 1; i >= 0; i--) ys[i] = Math.min(ys[i] - overflow, i < ys.length - 1 ? ys[i + 1] - 14 : Infinity);
    for (let i = 0; i < ys.length; i++) ys[i] = Math.max(ys[i], frame.top - 6);
    sorted.forEach((e, i) => {
      const lx = frame.right + 10;
      if (Math.abs(ys[i] - e.y) > 2 || lx - e.x > 12) parts.push(`<line x1="${r2(e.x + 6)}" y1="${r2(e.y)}" x2="${r2(lx - 3)}" y2="${r2(ys[i])}" stroke="${CHART_AXIS}" stroke-width="1"/>`);
      parts.push(text(lx, mid(ys[i]), fit(e.s.name, labelW + 2), { full: e.s.name }));
    });
  }
  const { step } = thinLabels(cats, band);
  for (let i = 0; i < n; i += step) {
    const label = fit(cats[i], band * step - 6);
    parts.push(text(clampX(xOf(i), label, W), frame.bottom + 6 + 12, label, { anchor: "middle", full: cats[i] }));
  }
  if (chart.xLabel) parts.push(text((frame.left + frame.right) / 2, H - PAD - 2, fit(chart.xLabel, W - 2 * PAD), { anchor: "middle", full: chart.xLabel }));
  return { svg: parts.join(""), height: H };
}

function drawHistogram(chart: ChartData, series: Series[], o: RenderOptions, W: number, H: number): Drawn {
  const ser = series[0];
  const counts = (ser?.values || []).map((v) => v ?? 0);
  const edgesOk = ser && ser.points.length === counts.length && counts.length > 0;
  const k = counts.length;
  const yAxis = axis(0, Math.max(1, ...counts), o.lang, 1000);
  const tr = titleRow(chart.yLabel, null, W, PAD);
  const top = PAD + tr.height;
  let showValues = k <= VALUE_LABEL_MAX_BARS;
  const frame = verticalFrame(W, H, top, yAxis, chart.xLabel, 0, showValues ? 14 : 0);
  // Room for the last edge label, centred on the right end.
  const xmin = edgesOk ? ser.points[0][0] : 0;
  const xmax = edgesOk ? ser.points[k - 1][1] : k;
  const edgeFmt = (() => {
    if (!edgesOk) return (v: number) => String(v);
    const width = ser.points[0][1] - ser.points[0][0];
    const d = stepDecimals(width);
    const maxAbs = Math.max(Math.abs(xmin), Math.abs(xmax));
    return (v: number) => minus(formatCompact(v, o.lang, d, maxAbs >= 10000));
  })();
  const lastHalf = edgesOk ? textWidth(edgeFmt(xmax)) / 2 : 0;
  frame.right = Math.min(frame.right, W - PAD - lastHalf);
  const xOf = (v: number) => frame.left + ((v - xmin) / (xmax - xmin || 1)) * (frame.right - frame.left);
  const yOf = (v: number) => frame.bottom - ((v - yAxis.lo) / (yAxis.hi - yAxis.lo)) * (frame.bottom - frame.top);
  const fmtV = valueFormat(counts, false, o.lang);
  const parts: string[] = [tr.svg, yGrid(frame, yAxis, yOf)];
  const cats = chart.categories || [];
  const barW = (frame.right - frame.left) / Math.max(1, k);
  if (showValues) showValues = counts.every((c) => textWidth(fmtV(c)) <= barW);
  for (let i = 0; i < k; i++) {
    const x1 = edgesOk ? xOf(ser.points[i][0]) : frame.left + barW * i;
    const x2 = edgesOk ? xOf(ser.points[i][1]) : frame.left + barW * (i + 1);
    const w = Math.max(1, x2 - x1 - GAP);
    const name = `${cats[i] ?? ""}: ${fmtV(counts[i])}`;
    parts.push(barV(x1 + GAP / 2, w, yOf(0), yOf(counts[i]), ser.color, tip(o.interactive, name)));
    if (showValues && counts[i] > 0) parts.push(text(x1 + (x2 - x1) / 2, yOf(counts[i]) - 4, fmtV(counts[i]), { anchor: "middle" }));
  }
  parts.push(hline(frame.left, frame.right, yOf(0), CHART_AXIS));
  if (edgesOk) {
    const edges = ser.points.map((p) => p[0]).concat(xmax);
    const labels = edges.map(edgeFmt);
    const maxW = labels.reduce((m, l) => Math.max(m, textWidth(l)), 0);
    const step = Math.max(1, Math.ceil((maxW + 8) / Math.max(1, barW)));
    edges.forEach((e, i) => {
      if (i % step !== 0 && i !== edges.length - 1) return;
      if (i === edges.length - 1 && i % step !== 0 && xOf(e) - xOf(edges[i - (i % step)]) < maxW + 8) return;
      parts.push(vline(xOf(e), frame.bottom, frame.bottom + 4, CHART_AXIS));
      parts.push(text(clampX(xOf(e), labels[i], W), frame.bottom + 6 + 12, labels[i], { anchor: "middle", fill: CHART_MUTED }));
    });
  } else {
    const { step } = thinLabels(cats, barW);
    for (let i = 0; i < k; i += step) parts.push(text(frame.left + barW * (i + 0.5), frame.bottom + 6 + 12, fit(cats[i] ?? "", barW * step - 6), { anchor: "middle", full: cats[i] }));
  }
  if (chart.xLabel) parts.push(text((frame.left + frame.right) / 2, H - PAD - 2, fit(chart.xLabel, W - 2 * PAD), { anchor: "middle", full: chart.xLabel }));
  return { svg: parts.join(""), height: H };
}

/** The part of the line y = a + b·x inside the rectangle (Liang–Barsky), or null. */
function clipLine(a: number, b: number, x0: number, x1: number, y0: number, y1: number): [number, number, number, number] | null {
  let ax = x0;
  let ay = a + b * x0;
  const dx = x1 - x0;
  const dy = b * dx;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, ax - x0],
    [dx, x1 - ax],
    [-dy, ay - y0],
    [dy, y1 - ay],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  const bx = ax + t1 * dx;
  const by = ay + t1 * dy;
  ax = ax + t0 * dx;
  ay = ay + t0 * dy;
  return [ax, ay, bx, by];
}

function drawScatter(chart: ChartData, series: Series[], o: RenderOptions, W: number, H: number): Drawn {
  const pts = series.flatMap((s) => s.points);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const yAxis = axis(Math.min(...ys), Math.max(...ys), o.lang, 1000, "data");
  const xAxis = axis(Math.min(...xs), Math.max(...xs), o.lang, 10000, "data");
  const lg = legend(series, W, "dot", PAD);
  const fitText = chart.fit && Number.isFinite(chart.fit.r) ? `r = ${minus(formatNumber(chart.fit.r, o.lang, 2))} · n = ${formatNumber(chart.fit.n, o.lang, 0)}` : null;
  const tr = titleRow(chart.yLabel, fitText, W, PAD + lg.height);
  const top = PAD + lg.height + tr.height;
  const frame = verticalFrame(W, H, top, yAxis, chart.xLabel, 0, 0);
  // A last tick on the domain edge needs half its label of room on the right (data-following domains end past it).
  const lastTick = xAxis.ticks[xAxis.ticks.length - 1];
  if (lastTick === xAxis.hi) frame.right = Math.min(frame.right, W - PAD - textWidth(xAxis.format(lastTick)) / 2);
  const xOf = (v: number) => frame.left + ((v - xAxis.lo) / (xAxis.hi - xAxis.lo)) * (frame.right - frame.left);
  const yOf = (v: number) => frame.bottom - ((v - yAxis.lo) / (yAxis.hi - yAxis.lo)) * (frame.bottom - frame.top);
  const parts: string[] = [lg.svg, tr.svg, yGrid(frame, yAxis, yOf)];
  for (const t of xAxis.ticks) {
    const x = xOf(t);
    parts.push(vline(x, frame.top, frame.bottom, t === xAxis.lo ? CHART_AXIS : CHART_GRID));
    const label = xAxis.format(t);
    parts.push(text(clampX(x, label, W), frame.bottom + 6 + 12, label, { anchor: "middle", fill: CHART_MUTED }));
  }
  const dense = pts.length > 300;
  const fx = (v: number) => formatNumber(v, o.lang, Math.min(3, stepDecimals(xAxis.ticks[1] - xAxis.ticks[0]) + 1));
  const fy = (v: number) => formatNumber(v, o.lang, Math.min(3, stepDecimals(yAxis.ticks[1] - yAxis.ticks[0]) + 1));
  const order = series.filter((x) => x.other).concat(series.filter((x) => !x.other));
  for (const ser of order) {
    for (const [x, y] of ser.points) {
      const name = `${series.length > 1 ? ser.name + " · " : ""}${chart.xLabel}: ${fx(x)} · ${chart.yLabel}: ${fy(y)}`;
      parts.push(
        dense
          ? `<circle cx="${r2(xOf(x))}" cy="${r2(yOf(y))}" r="2.5" fill="${ser.color}" fill-opacity="0.7">${tip(o.interactive, name)}</circle>`
          : `<circle cx="${r2(xOf(x))}" cy="${r2(yOf(y))}" r="4" fill="${ser.color}" stroke="${CHART_SURFACE}" stroke-width="2">${tip(o.interactive, name)}</circle>`,
      );
    }
  }
  if (chart.fit && Number.isFinite(chart.fit.slope) && Number.isFinite(chart.fit.intercept)) {
    // Drawn over the observed x-range only: the line describes the data, it does not extrapolate.
    const seg = clipLine(chart.fit.intercept, chart.fit.slope, Math.min(...xs), Math.max(...xs), yAxis.lo, yAxis.hi);
    if (seg) parts.push(`<line x1="${r2(xOf(seg[0]))}" y1="${r2(yOf(seg[1]))}" x2="${r2(xOf(seg[2]))}" y2="${r2(yOf(seg[3]))}" stroke="${CHART_FIT}" stroke-width="2" stroke-linecap="round">${tip(o.interactive, fitText || "")}</line>`);
  }
  if (chart.xLabel) parts.push(text((frame.left + frame.right) / 2, H - PAD - 2, fit(chart.xLabel, W - 2 * PAD), { anchor: "middle", full: chart.xLabel }));
  return { svg: parts.join(""), height: H };
}

/**
 * The chart as a self-contained SVG string (see the module comment for the rules). Width is at least 280 and height
 * at least 200; horizontal bar charts may come back taller than `opts.height`.
 */
export function renderChartSvg(input: ChartData, opts: RenderOptions): string {
  const chart = normalizeChart(input);
  const W = Math.max(280, Math.round(opts.width || 640));
  const H = Math.max(200, Math.round(opts.height || 400));
  const series = prepSeries(chart);
  let drawn: Drawn = { svg: "", height: H };
  const hasData = series.length > 0 && (chart.type === "scatter" ? series.some((s) => s.points.length) : (chart.categories || []).length > 0 || chart.type === "histogram");
  if (hasData) {
    switch (chart.type) {
      case "bar":
      case "groupedBar":
        drawn = drawBarsVertical(chart, series, opts, W, H) || drawBarsHorizontal(chart, series, opts, W, H);
        break;
      case "line":
        drawn = drawLine(chart, series, opts, W, H);
        break;
      case "histogram":
        drawn = drawHistogram(chart, series, opts, W, H);
        break;
      case "scatter":
        drawn = drawScatter(chart, series, opts, W, H);
        break;
    }
  }
  const h = Math.round(drawn.height);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" role="img" font-family="${CHART_FONT}" font-size="${FS}">` +
    `<title>${escapeXml(opts.title)}</title><desc>${escapeXml(opts.desc)}</desc>` +
    `<rect width="${W}" height="${h}" fill="${CHART_SURFACE}"/>` +
    drawn.svg +
    `</svg>`
  );
}
