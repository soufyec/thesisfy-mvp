/**
 * Visual constants and text helpers for the diagram SVGs (docs/papers.md §3.4, D17).
 * Colours come from `src/lib/charts/palette.ts`, the single home of chart and diagram hex values (D17), so a diagram
 * and a chart on the same page always share one palette. Text is always 12 px in neutral ink, never in a series colour.
 */
import { CHART_AXIS, CHART_FONT, CHART_GRID, CHART_MUTED, CHART_OTHER, CHART_PANEL, CHART_SERIES, CHART_SURFACE, CHART_TEXT } from "../charts/palette";

/** Series colours in their fixed order (D17). Groups beyond the fourth use `DIAGRAM_COLORS.other`. */
export const DIAGRAM_SERIES: readonly string[] = CHART_SERIES;

/** Neutrals (D17) plus the two surfaces the diagrams need. */
export const DIAGRAM_COLORS = {
  /** "Other" groups and box outlines. */
  other: CHART_OTHER,
  grid: CHART_GRID,
  axis: CHART_AXIS,
  text: CHART_TEXT,
  muted: CHART_MUTED,
  surface: CHART_SURFACE,
  /** Header bands and PRISMA phase labels (gray-100). */
  panel: CHART_PANEL,
  /** Box outlines and arrows. */
  stroke: CHART_OTHER,
  arrow: CHART_MUTED,
} as const;

export const FONT_FAMILY = CHART_FONT;
export const FONT_SIZE = 12;
/** Line box for 12 px text; the baseline sits `BASELINE` px below the top of each line. */
export const LINE_HEIGHT = 16;
export const BASELINE = 12;

/** Colour of the series slot `i` (0-based): the palette in order, gray from the fifth slot on. */
export function seriesColor(i: number): string {
  return i >= 0 && i < DIAGRAM_SERIES.length ? DIAGRAM_SERIES[i] : DIAGRAM_COLORS.other;
}

/* ------------------------------------------------------------------------------------------------------------------
 * Text measurement: advance widths of Inter (Google Fonts v20) in thousandths of an em, measured in Chromium.
 * Kerning is ignored, so estimates run slightly wide (safe for boxes). Accented letters fall back to their base letter.
 * ---------------------------------------------------------------------------------------------------------------- */

// prettier-ignore
const ASCII_400 = [281,288,466,633,642,982,644,300,365,365,501,662,288,460,288,360,631,407,610,618,646,593,620,566,619,620,288,302,662,662,662,511,966,690,654,730,722,601,590,746,743,269,571,672,565,903,753,765,639,765,644,642,646,744,690,985,682,679,629,365,360,365,471,456,323,562,612,571,612,583,370,613,591,242,242,549,242,876,591,600,612,612,376,528,327,591,562,818,546,562,552,426,333,426,662];
// prettier-ignore
const ASCII_500 = [267,304,494,639,646,993,653,313,369,369,521,667,303,462,303,370,646,415,616,627,656,603,630,571,629,630,303,315,667,667,667,527,982,709,657,733,722,603,589,748,745,272,575,688,565,913,756,767,642,769,648,646,653,740,709,1003,701,696,641,369,370,369,477,463,337,568,618,577,618,587,379,620,602,252,252,559,252,888,602,604,618,618,387,539,340,602,575,829,557,575,559,440,346,440,667];
// prettier-ignore
const ASCII_600 = [252,321,523,644,650,1004,663,326,373,373,540,673,319,465,319,379,660,423,623,636,666,612,640,576,640,640,319,329,673,673,673,543,999,728,659,737,722,605,588,749,746,277,580,703,565,922,759,769,645,773,652,650,660,736,728,1020,720,713,652,373,379,373,481,469,351,574,624,583,624,591,389,625,612,262,262,569,262,900,612,609,624,624,397,549,353,612,587,839,569,588,566,455,359,455,673];

/** Non-ASCII glyphs that are not "base letter + accent" (weights 400 / 600; 500 is interpolated). */
const EXTRA: Record<string, [number, number]> = {
  "Æ": [994, 1013], "æ": [917, 913], "Œ": [1005, 1014], "œ": [1000, 992], "ß": [616, 644], "Ø": [765, 769], "ø": [600, 609],
  "–": [500, 500], "—": [1000, 1000], "…": [864, 956], "‘": [261, 294], "’": [261, 294], "“": [440, 507], "”": [440, 501],
  "«": [583, 634], "»": [583, 634], "€": [667, 679], "≠": [662, 673], "≤": [662, 673], "≥": [662, 673], "·": [288, 319],
  "•": [563, 503], "×": [662, 673], "÷": [662, 673], "°": [456, 458], "±": [662, 673], "§": [568, 568], "¿": [511, 543],
  "¡": [288, 321], " ": [281, 252], " ": [182, 166], " ": [182, 166], "→": [662, 673], "≈": [662, 673],
};

export type FontWeight = 400 | 500 | 600;

function charEm(ch: string, weight: FontWeight): number {
  const code = ch.charCodeAt(0);
  const table = weight === 600 ? ASCII_600 : weight === 500 ? ASCII_500 : ASCII_400;
  if (code >= 32 && code < 127) return table[code - 32] / 1000;
  const extra = EXTRA[ch];
  if (extra) return (weight === 600 ? extra[1] : weight === 500 ? (extra[0] + extra[1]) / 2 : extra[0]) / 1000;
  // Latin letters with diacritics: width of the base letter.
  const base = typeof ch.normalize === "function" ? ch.normalize("NFD").charAt(0) : ch;
  const bc = base.charCodeAt(0);
  if (base !== ch && bc >= 32 && bc < 127) return table[bc - 32] / 1000;
  // Combining marks take no room; wide scripts (CJK, emoji) about one em; anything else a wide Latin glyph.
  if (code >= 0x300 && code < 0x370) return 0;
  if (code >= 0x2e80) return 1;
  return 0.7;
}

/** Estimated advance width in px of `text` set in Inter at `size` px and `weight`. */
export function textWidth(text: string, weight: FontWeight = 400, size: number = FONT_SIZE): number {
  let em = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // Surrogate pairs (emoji and rare scripts): one wide glyph.
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      em += 1;
      i++;
      continue;
    }
    em += charEm(text.charAt(i), weight);
  }
  return em * size;
}

/** Cuts `text` with an ellipsis so it fits in `maxWidth` px. */
export function ellipsize(text: string, maxWidth: number, weight: FontWeight = 400): string {
  if (textWidth(text, weight) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && textWidth(out + "…", weight) > maxWidth) out = out.slice(0, -1);
  return out.replace(/\s+$/, "") + "…";
}

/**
 * Greedy word wrap at `maxWidth` px. Breaks at ordinary spaces only (no-break spaces stay, as in French « : »);
 * a word longer than the line is split by characters. With `maxLines`, the last kept line ends with an ellipsis.
 * `restWidth` (default `maxWidth`) is the width of the second and later lines, for hanging indents.
 */
export function wrapText(text: string, maxWidth: number, weight: FontWeight = 400, maxLines?: number, restWidth: number = maxWidth): string[] {
  const words = text.split(/[ \t\n\r]+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let line = "";
  const limit = () => (lines.length === 0 ? maxWidth : restWidth);
  for (let wi = 0; wi < words.length; wi++) {
    let word = words[wi];
    const candidate = line ? line + " " + word : word;
    if (textWidth(candidate, weight) <= limit()) {
      line = candidate;
      continue;
    }
    if (line) {
      lines.push(line);
      line = "";
    }
    // An over-long word breaks after one of its own hyphens or slashes when one fits, else with an added hyphen.
    while (textWidth(word, weight) > limit() && word.length > 1) {
      let cut = -1;
      for (let i = word.length - 1; i > 0; i--) {
        const ch = word.charAt(i - 1);
        if ((ch === "-" || ch === "/" || ch === "‐") && textWidth(word.slice(0, i), weight) <= limit()) {
          cut = i;
          break;
        }
      }
      if (cut > 0) {
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
        continue;
      }
      cut = word.length - 1;
      while (cut > 1 && textWidth(word.slice(0, cut) + "-", weight) > limit()) cut--;
      // Keep at least two letters on each side when the line allows it.
      if (cut > 2 && word.length - cut < 2) cut = word.length - 2;
      const head = word.slice(0, cut);
      const letters = /[A-Za-zÀ-ɏ]$/.test(head) && /^[A-Za-zÀ-ɏ]/.test(word.slice(cut));
      lines.push(letters ? head + "-" : head);
      word = word.slice(cut);
    }
    line = word;
  }
  if (line) lines.push(line);
  if (lines.length === 0) lines.push("");
  if (maxLines && lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = ellipsize(kept[maxLines - 1] + " " + lines[maxLines], maxLines === 1 ? maxWidth : restWidth, weight);
    return kept;
  }
  return lines;
}

/** Widest line of `lines` in px. */
export function maxLineWidth(lines: string[], weight: FontWeight = 400): number {
  let w = 0;
  for (const l of lines) w = Math.max(w, textWidth(l, weight));
  return w;
}

/* ------------------------------------------------------------------------------------------------------------------
 * SVG helpers
 * ---------------------------------------------------------------------------------------------------------------- */

/** Escapes text and attribute values for SVG/XML (`& < > " '`) and drops characters XML 1.0 forbids. */
export function escapeXml(value: string): string {
  return String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Coordinate to string with at most one decimal (no "-0"). */
export function num(v: number): string {
  const r = Math.round(v * 10) / 10;
  return (r === 0 ? 0 : r).toString();
}

/**
 * One `<text>` element per line (no `<tspan>` with `dy`, so every renderer places lines identically).
 * `x` is the anchor point, `top` the top of the first line box.
 */
export function textLines(
  lines: string[],
  x: number,
  top: number,
  opts: { anchor?: "start" | "middle" | "end"; weight?: FontWeight; fill?: string; lineHeight?: number } = {},
): string {
  const lh = opts.lineHeight ?? LINE_HEIGHT;
  const anchor = opts.anchor && opts.anchor !== "start" ? ` text-anchor="${opts.anchor}"` : "";
  const weight = opts.weight && opts.weight !== 400 ? ` font-weight="${opts.weight}"` : "";
  const fill = ` fill="${opts.fill ?? DIAGRAM_COLORS.text}"`;
  let out = "";
  for (let i = 0; i < lines.length; i++) {
    out += `<text x="${num(x)}" y="${num(top + i * lh + BASELINE - (LINE_HEIGHT - lh) / 2)}"${anchor}${weight}${fill}>${escapeXml(lines[i])}</text>`;
  }
  return out;
}

/** A filled triangle arrowhead whose tip is at (`x`, `y`) pointing along (`dx`, `dy`) (unit vector). */
export function arrowHead(x: number, y: number, dx: number, dy: number, color: string = DIAGRAM_COLORS.arrow, len = 7, half = 3.5): string {
  const bx = x - dx * len;
  const by = y - dy * len;
  const px = -dy * half;
  const py = dx * half;
  return `<path d="M${num(x)} ${num(y)}L${num(bx + px)} ${num(by + py)}L${num(bx - px)} ${num(by - py)}Z" fill="${color}"/>`;
}

/** Length of the arrowhead drawn by `arrowHead` (lines stop this far before the tip). */
export const ARROW_LEN = 7;

/** True when two boxes overlap by more than `tolerance` px on both axes. */
export function boxesOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, tolerance = 0): boolean {
  return a.x + a.w - tolerance > b.x && b.x + b.w - tolerance > a.x && a.y + a.h - tolerance > b.y && b.y + b.h - tolerance > a.y;
}

/** Overlapping area of two boxes in px² (0 when apart). */
export function overlapArea(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
