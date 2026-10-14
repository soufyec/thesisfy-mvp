/**
 * `renderDiagramSvg`: one self-contained, deterministic SVG per diagram spec (docs/papers.md D26, §3.4 rules):
 * white background, 12 px Inter/Helvetica/Arial in neutral ink, hairline neutrals, `role="img"` with `<title>` and
 * `<desc>`, every string escaped, viewBox-based so it scales to the column (width/height give the natural size).
 * Pass a spec that went through `sanitizeDiagram` (the renderer trusts its shape).
 */
import { drawConceptMap, layoutConceptMap } from "./conceptMap";
import { drawGantt, layoutGantt } from "./gantt";
import { drawPrisma, layoutPrisma } from "./prisma";
import { DIAGRAM_COLORS, FONT_FAMILY, FONT_SIZE, escapeXml, num } from "./theme";
import type { DiagramDrawing, DiagramLang, DiagramSpec, RenderDiagramOptions, RenderedDiagram } from "./types";

/** Default target width in px (same as the inserted charts, §3.4). */
export const DIAGRAM_DEFAULT_WIDTH = 640;

const LOCALE_TAGS: Record<DiagramLang, string> = { en: "en-GB", es: "es-ES", fr: "fr-FR", de: "de-DE" };

/** Integer formatter with the language's grouping (used for PRISMA counts when the caller passes none). */
export function defaultDiagramNumberFormat(lang: DiagramLang): (n: number) => string {
  const nf = new Intl.NumberFormat(LOCALE_TAGS[lang] ?? "en-GB", { maximumFractionDigits: 0 });
  return (n) => nf.format(n);
}

/** Lays out and draws `spec` as a standalone SVG string with its natural size. */
export function renderDiagramSvg(spec: DiagramSpec, opts: RenderDiagramOptions): RenderedDiagram {
  const width = Math.max(240, Math.round(opts.width ?? DIAGRAM_DEFAULT_WIDTH));
  let drawing: DiagramDrawing;
  if (spec.figure === "gantt") drawing = drawGantt(layoutGantt(spec, { width, lang: opts.lang }));
  else if (spec.figure === "prisma")
    drawing = drawPrisma(layoutPrisma(spec, { width, tr: opts.tr, formatNumber: opts.formatNumber ?? defaultDiagramNumberFormat(opts.lang) }));
  else drawing = drawConceptMap(layoutConceptMap(spec, { width }));
  const w = Math.ceil(drawing.width);
  const h = Math.ceil(drawing.height);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img"` +
    ` font-family="${escapeXml(FONT_FAMILY)}" font-size="${FONT_SIZE}">` +
    `<title>${escapeXml(opts.title)}</title><desc>${escapeXml(opts.desc)}</desc>` +
    `<rect x="0" y="0" width="${num(w)}" height="${num(h)}" fill="${DIAGRAM_COLORS.surface}"/>` +
    drawing.body +
    `</svg>`;
  return { svg, width: w, height: h };
}
