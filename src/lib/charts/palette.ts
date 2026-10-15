/**
 * Chart colours (docs/papers.md D17). The only place chart hex values live: charts are SVG strings, so they cannot
 * use Tailwind classes. Validated with the dataviz palette validator on white (light mode): lightness band, chroma
 * floor, CVD separation of adjacent slots ΔE 13.0 (protan), normal vision ΔE 27.5; the pink is below 3:1 against
 * white, so charts with 2 or more series always carry a legend, direct labels where they fit, and a table view.
 *
 * Fixed order: a series keeps its colour from its position, never from its rank. At most 4 series + "Other" (grey).
 * Never the provenance colours (violet AI, amber paste, mint written). A pie chart follows the same rule: its four
 * largest slices take the four series colours and the rest is folded into a grey "Other" slice.
 *
 * Diagrams (src/lib/diagrams/theme.ts) import these values too: this file is the single home of chart and diagram hex.
 */

/** Series colours, in this order: fir green, pink, blue, orange. */
export const CHART_SERIES = ["#037947", "#e87ba4", "#2a78d6", "#eb6834"] as const;
/** The "Other" series (folded smaller groups). */
export const CHART_OTHER = "#9ca3af";
/** Gridlines (gray-200). */
export const CHART_GRID = "#e5e7eb";
/** Axis and baseline (gray-300). */
export const CHART_AXIS = "#d1d5db";
/** Labels, legend, axis titles, value labels (gray-600). */
export const CHART_TEXT = "#4b5563";
/** Tick labels and secondary text (gray-500). */
export const CHART_MUTED = "#6b7280";
/** Chart background and the 2px separating gap/ring (also the white separators between pie slices). */
export const CHART_SURFACE = "#ffffff";
/** Header bands and panels of diagrams (gray-100): PRISMA phase labels, Gantt group rows. */
export const CHART_PANEL = "#f3f4f6";
/** Least-squares line: dark neutral, never a series colour. */
export const CHART_FIT = CHART_TEXT;
export const CHART_FONT = "Inter, Helvetica, Arial, sans-serif";

/** Colour of series `i` (by position); "Other" is always grey. */
export function seriesColor(i: number, other?: boolean): string {
  if (other) return CHART_OTHER;
  return CHART_SERIES[((i % CHART_SERIES.length) + CHART_SERIES.length) % CHART_SERIES.length];
}
