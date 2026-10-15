/**
 * Gantt timeline layout and drawing (docs/papers.md D26). Deterministic: dates are UTC day numbers, labels come from
 * `Intl.DateTimeFormat` in the writing language, widths from the Inter width table in `theme.ts`.
 * Layout: label column on the left (fits the longest label, at most ~36 % of the width, wraps to 3 lines), a two-row
 * time axis on top (years, then months or week starts, thinned when they would collide), one header row per named
 * group (swatch + name + a faint span of the group), one row per task: a bar with 4 px rounded ends, or a diamond for
 * a milestone. Groups take the palette in order of first appearance (four colours, then gray).
 */
import { parseDiagramDate } from "./validate";
import {
  BASELINE,
  DIAGRAM_COLORS,
  LINE_HEIGHT,
  escapeXml,
  maxLineWidth,
  num,
  seriesColor,
  textLines,
  textWidth,
  wrapText,
} from "./theme";
import type { DiagramDrawing, DiagramLang, GanttSpec } from "./types";

const PAD = 12;
const LABEL_GAP = 16;
const INDENT = 12;
const SWATCH = 8;
const AXIS_H = 36;
const TASK_ROW_MIN = 28;
const GROUP_ROW_MIN = 26;
const BAR_H = 14;
const DIAMOND = 7;
const MIN_CHART_W = 200;
const LOCALE_TAGS: Record<DiagramLang, string> = { en: "en-GB", es: "es-ES", fr: "fr-FR", de: "de-DE" };

export interface GanttLayoutOptions {
  width: number;
  lang: DiagramLang;
}

export interface GanttTick {
  /** x of the band start (gridline position). */
  x: number;
  /** Band label (month or week start) and its anchor; absent on thinned bands. */
  label?: string;
  labelX?: number;
  anchor?: "start" | "middle";
  /** Year label printed above this tick, when the year changes. */
  year?: string;
  /** Gridline drawn at this tick ("year" for January in month mode). */
  grid?: "minor" | "year";
}

export interface GanttRow {
  kind: "group" | "task";
  y: number;
  h: number;
  lines: string[];
  color: string;
  /** Text x of the label lines. */
  textX: number;
  /** Task bar, or the group's faint span on header rows. */
  bar?: { x: number; y: number; w: number; h: number };
  milestone?: { cx: number; cy: number };
}

export interface GanttLayout {
  width: number;
  height: number;
  chartX0: number;
  chartX1: number;
  axisBottom: number;
  ticks: GanttTick[];
  rows: GanttRow[];
  /** y of hairlines separating groups. */
  separators: number[];
}

/** Monday on or before day `d` (day 0 = Thursday 1970-01-01). */
function mondayOf(d: number): number {
  return d - (((d + 3) % 7) + 7) % 7;
}

function ymd(d: number): { y: number; m: number; day: number } {
  const date = new Date(d * 86400000);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth(), day: date.getUTCDate() };
}

function dayOf(y: number, m: number, day = 1): number {
  return Math.round(Date.UTC(y, m, day) / 86400000);
}

/** Computes the geometry of a sanitised Gantt spec at the given width. */
export function layoutGantt(spec: GanttSpec, opts: GanttLayoutOptions): GanttLayout {
  const tag = LOCALE_TAGS[opts.lang] ?? "en-GB";
  const tasks = spec.tasks.map((t, i) => {
    const start = parseDiagramDate(t.start, "start") as number;
    const end = t.milestone ? start : (parseDiagramDate(t.end, "end") as number);
    return { i, label: t.label, group: t.group ?? "", milestone: !!t.milestone, start, end };
  });

  // Groups in order of first appearance; the unnamed group ("") has no header row.
  const groupNames: string[] = [];
  for (const t of tasks) if (groupNames.indexOf(t.group) === -1) groupNames.push(t.group);
  const hasHeaders = groupNames.some((g) => g !== "");

  // Label column: natural width, capped, then wrapped.
  let natural = 0;
  for (const t of tasks) natural = Math.max(natural, textWidth(t.label) + (hasHeaders && t.group ? INDENT : 0));
  for (const g of groupNames) if (g) natural = Math.max(natural, textWidth(g, 600) + SWATCH + 6);
  const width = Math.max(opts.width, PAD * 2 + 80 + LABEL_GAP + MIN_CHART_W);
  const labelCol = Math.ceil(Math.min(natural, Math.max(80, Math.round(width * 0.36)), width - PAD * 2 - LABEL_GAP - MIN_CHART_W));
  const x0 = PAD + labelCol + LABEL_GAP;
  const x1 = width - PAD - DIAMOND - 2;

  // Time domain, aligned to whole months or ISO weeks.
  let minDay = Infinity;
  let maxDay = -Infinity;
  for (const t of tasks) {
    minDay = Math.min(minDay, t.start);
    maxDay = Math.max(maxDay, t.end);
  }
  const bounds: number[] = [];
  if (spec.unit === "week") {
    let d = mondayOf(minDay);
    const stop = mondayOf(maxDay) + 7;
    while (d <= stop) {
      bounds.push(d);
      d += 7;
    }
  } else {
    const a = ymd(minDay);
    let y = a.y;
    let m = a.m;
    const b = ymd(maxDay);
    const stop = dayOf(b.y, b.m + 1);
    for (;;) {
      const d = dayOf(y, m);
      bounds.push(d);
      if (d >= stop) break;
      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }
  }
  const dStart = bounds[0];
  const dEnd = bounds[bounds.length - 1];
  const scale = (d: number) => x0 + ((d - dStart) / (dEnd - dStart)) * (x1 - x0);

  // Band labels and thinning.
  const monthFmt = new Intl.DateTimeFormat(tag, { month: "short", timeZone: "UTC" });
  const weekFmt = new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", timeZone: "UTC" });
  const bandLabel = (d: number) => (spec.unit === "week" ? weekFmt : monthFmt).format(new Date(d * 86400000));
  let widest = 0;
  let narrowest = Infinity;
  for (let i = 0; i + 1 < bounds.length; i++) {
    widest = Math.max(widest, textWidth(bandLabel(bounds[i])));
    narrowest = Math.min(narrowest, scale(bounds[i + 1]) - scale(bounds[i]));
  }
  const steps = spec.unit === "week" ? [1, 2, 4, 8, 13, 26, 52] : [1, 2, 3, 6, 12, 24];
  let step = steps[steps.length - 1];
  for (const s of steps) {
    if ((s === 1 ? narrowest : s * narrowest) >= widest + (s === 1 ? 6 : 10)) {
      step = s;
      break;
    }
  }
  const ticks: GanttTick[] = [];
  let lastYear = -1;
  let lastYearRight = -Infinity;
  for (let i = 0; i + 1 < bounds.length; i++) {
    const d = bounds[i];
    const { y, m } = ymd(d);
    const labelled = spec.unit === "week" ? i % step === 0 : step === 1 || m % step === 0;
    const tick: GanttTick = { x: scale(d) };
    if (labelled) {
      const text = bandLabel(d);
      const lw = textWidth(text);
      if (step === 1) {
        tick.labelX = (scale(d) + scale(bounds[i + 1])) / 2;
        tick.anchor = "middle";
      } else {
        tick.labelX = scale(d) + 4;
        tick.anchor = "start";
      }
      // A label that would run past the right edge is left out (its gridline stays).
      const right = tick.anchor === "middle" ? tick.labelX + lw / 2 : tick.labelX + lw;
      // With one label per year or less, the year row says it all.
      const yearly = spec.unit === "month" && step >= 12;
      if (right <= width - 2 && !yearly) tick.label = text;
      else delete tick.labelX;
      tick.grid = spec.unit === "month" && m === 0 && i > 0 ? "year" : "minor";
      if (y !== lastYear) {
        const yx = scale(d) + 4;
        if ((yx >= lastYearRight + 8 || lastYear === -1) && yx + textWidth(String(y), 600) <= width - 2) {
          tick.year = String(y);
          lastYearRight = yx + textWidth(String(y), 600);
        }
        lastYear = y;
      }
    } else if (step === 1 || spec.unit === "week") {
      // Unlabelled weeks keep a gridline only when bands are wide enough to read.
      if (narrowest >= 10 && step <= 2) tick.grid = "minor";
    }
    ticks.push(tick);
  }
  ticks.push({ x: scale(dEnd), grid: "minor" });
  // The year row never starts with a lonely year label just before a January tick.
  if (ticks.length > 1 && ticks[0].year) {
    for (let i = 1; i < ticks.length; i++) {
      if (ticks[i].year) {
        if (ticks[i].x - ticks[0].x < textWidth(ticks[0].year as string, 600) + 12) delete ticks[0].year;
        break;
      }
    }
  }

  // Rows.
  const rows: GanttRow[] = [];
  const separators: number[] = [];
  const axisBottom = PAD + AXIS_H;
  let y = axisBottom + 6;
  // Named groups take the palette in order; tasks without a group are gray when named groups exist.
  const named = groupNames.filter((g) => g !== "");
  for (let gi = 0; gi < groupNames.length; gi++) {
    const g = groupNames[gi];
    const color = g ? seriesColor(named.indexOf(g)) : named.length ? DIAGRAM_COLORS.other : seriesColor(0);
    const members = tasks.filter((t) => t.group === g);
    if (gi > 0) separators.push(y - 3);
    if (hasHeaders && g) {
      const lines = wrapText(g, labelCol - SWATCH - 6, 600, 2);
      const h = Math.max(GROUP_ROW_MIN, lines.length * LINE_HEIGHT + 8);
      let gs = Infinity;
      let ge = -Infinity;
      for (const t of members) {
        gs = Math.min(gs, t.start);
        ge = Math.max(ge, t.end + 1);
      }
      const bx = scale(gs);
      rows.push({ kind: "group", y, h, lines, color, textX: PAD + SWATCH + 6, bar: { x: bx, y: y + h / 2 - 2, w: Math.max(4, scale(ge) - bx), h: 4 } });
      y += h;
    }
    const indent = hasHeaders && g ? INDENT : 0;
    for (const t of members) {
      const lines = wrapText(t.label, labelCol - indent, 400, 3);
      const h = Math.max(TASK_ROW_MIN, lines.length * LINE_HEIGHT + 12);
      const cy = y + h / 2;
      const row: GanttRow = { kind: "task", y, h, lines, color, textX: PAD + indent };
      if (t.milestone) row.milestone = { cx: scale(t.start + 0.5), cy };
      else {
        const bx = scale(t.start);
        const bw = Math.max(6, scale(t.end + 1) - bx);
        row.bar = { x: Math.min(bx, x1 - bw), y: cy - BAR_H / 2, w: bw, h: BAR_H };
      }
      rows.push(row);
      y += h;
    }
  }
  return { width, height: y + PAD, chartX0: x0, chartX1: x1, axisBottom, ticks, rows, separators };
}

/** Rounded bar path: all four corners at `r` (clamped to half the bar). */
function roundedRect(x: number, y: number, w: number, h: number, r: number, fill: string, extra = ""): string {
  const rr = Math.min(r, w / 2, h / 2);
  return `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" rx="${num(rr)}" fill="${fill}"${extra}/>`;
}

/** SVG body of a Gantt layout (gridlines, axis, labels, bars, milestones). */
export function drawGantt(layout: GanttLayout): DiagramDrawing {
  const { width, height, chartX0, chartX1, axisBottom } = layout;
  const parts: string[] = [];
  const gridTop = axisBottom;
  const gridBottom = height - PAD;
  // Gridlines (hairline, solid), year boundaries one step stronger.
  for (const t of layout.ticks) {
    if (!t.grid) continue;
    const color = t.grid === "year" ? DIAGRAM_COLORS.axis : DIAGRAM_COLORS.grid;
    parts.push(`<line x1="${num(t.x)}" y1="${num(gridTop)}" x2="${num(t.x)}" y2="${num(gridBottom)}" stroke="${color}" stroke-width="1"/>`);
  }
  // Group separators across the whole width.
  for (const sy of layout.separators) {
    parts.push(`<line x1="${PAD}" y1="${num(sy)}" x2="${num(chartX1)}" y2="${num(sy)}" stroke="${DIAGRAM_COLORS.grid}" stroke-width="1"/>`);
  }
  // Axis: baseline under the labels.
  parts.push(`<line x1="${num(chartX0)}" y1="${num(axisBottom)}" x2="${num(chartX1)}" y2="${num(axisBottom)}" stroke="${DIAGRAM_COLORS.axis}" stroke-width="1"/>`);
  for (const t of layout.ticks) {
    if (t.year) {
      parts.push(`<text x="${num(t.x + 4)}" y="${num(PAD + BASELINE)}" font-weight="600" fill="${DIAGRAM_COLORS.text}">${escapeXml(t.year)}</text>`);
    }
    if (t.label !== undefined && t.labelX !== undefined) {
      const anchor = t.anchor === "middle" ? ` text-anchor="middle"` : "";
      parts.push(`<text x="${num(t.labelX)}" y="${num(PAD + LINE_HEIGHT + BASELINE)}"${anchor} fill="${DIAGRAM_COLORS.muted}">${escapeXml(t.label)}</text>`);
    }
  }
  // Rows.
  for (const r of layout.rows) {
    const top = r.y + (r.h - r.lines.length * LINE_HEIGHT) / 2;
    if (r.kind === "group") {
      parts.push(roundedRect(PAD, r.y + r.h / 2 - SWATCH / 2, SWATCH, SWATCH, 2, r.color));
      parts.push(textLines(r.lines, r.textX, top, { weight: 600 }));
      if (r.bar) parts.push(roundedRect(r.bar.x, r.bar.y, r.bar.w, r.bar.h, 2, r.color, ` fill-opacity="0.3"`));
      continue;
    }
    parts.push(textLines(r.lines, r.textX, top));
    if (r.bar) parts.push(roundedRect(r.bar.x, r.bar.y, r.bar.w, r.bar.h, 4, r.color));
    if (r.milestone) {
      const { cx, cy } = r.milestone;
      parts.push(
        `<path d="M${num(cx)} ${num(cy - DIAMOND)}L${num(cx + DIAMOND)} ${num(cy)}L${num(cx)} ${num(cy + DIAMOND)}L${num(cx - DIAMOND)} ${num(cy)}Z" fill="${r.color}" stroke="${DIAGRAM_COLORS.surface}" stroke-width="2" stroke-linejoin="round"/>`,
      );
    }
  }
  return { width, height, body: parts.join("") };
}

/** Width of the widest label line in a laid-out Gantt (tests use it to check nothing is clipped). */
export function ganttLabelExtent(layout: GanttLayout): number {
  let w = 0;
  for (const r of layout.rows) w = Math.max(w, r.textX + maxLineWidth(r.lines, r.kind === "group" ? 600 : 400));
  return w;
}
