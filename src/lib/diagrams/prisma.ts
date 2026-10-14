/**
 * PRISMA 2020 flow diagram layout and drawing (docs/papers.md D26): the template for new systematic reviews that
 * searched databases and registers, with the optional "other methods" column.
 *
 *            ┌ Identification of studies via databases and registers ┐  ┌ … via other methods ┐
 *  Ident.    [Records identified]        → [Records removed before screening]   [Records identified (websites…)]
 *  Screening [Records screened]          → [Records excluded]                         │
 *            [Reports sought]            → [Reports not retrieved]                [Reports sought] → [Not retrieved]
 *            [Reports assessed]          → [Reports excluded: reasons]            [Reports assessed] → [Excluded]
 *  Included  [Studies included / reports of included studies]  ←─────────────────────────┘
 *
 * Boxes keep the order and wording of the official template; text is wrapped to the column width; counts go through
 * the caller's number formatter. Optional boxes appear only when their count is given; a box whose count is
 * missing but whose row is drawn shows "n = –".
 */
import {
  ARROW_LEN,
  BASELINE,
  DIAGRAM_COLORS,
  LINE_HEIGHT,
  arrowHead,
  escapeXml,
  num,
  textLines,
  textWidth,
  wrapText,
  type FontWeight,
} from "./theme";
import {
  PRISMA_LABEL_KEYS,
  type Box,
  type DiagramDrawing,
  type DiagramTranslator,
  type PrismaCountKey,
  type PrismaCounts,
  type PrismaSpec,
} from "./types";

const PAD = 12;
const BAND_W = 26;
const BAND_GAP = 10;
const PAIR_GAP = 32; // between a flow box and its exclusion box (horizontal arrow)
const PAIR_GAP_NARROW = 26; // the same with the other-methods column (four box columns)
const COLUMN_GAP = 20; // between the two column pairs
const ROW_GAP = 26; // vertical arrows
const BOX_PAD_X = 10;
const BOX_PAD_Y = 8;
const MIN_COL_W = 112;
/** Space between the items of a box, and the hanging indent of an item's wrapped lines. */
const PARA_GAP = 4;
const HANG = 8;
const MISSING = "–";

export interface PrismaLayoutOptions {
  width: number;
  tr: DiagramTranslator;
  formatNumber: (n: number) => string;
}

export type PrismaPhase = "identification" | "screening" | "included";

export interface PrismaLine {
  text: string;
  weight: FontWeight;
  /** Offsets of the line box from the box's text origin (top-left inside the padding). */
  dx: number;
  dy: number;
}

export interface PrismaBox extends Box {
  id: string;
  lines: PrismaLine[];
}

export interface PrismaLayout {
  width: number;
  height: number;
  headers: (Box & { lines: string[] })[];
  bands: (Box & { label: string })[];
  boxes: PrismaBox[];
  /** Polylines; the last point is the arrow tip. */
  arrows: [number, number][][];
}

interface Para {
  text: string;
  weight?: FontWeight;
  /** A list item: gap before it and a hanging indent when it wraps. */
  item?: boolean;
}

interface Cell {
  id: string;
  paras: Para[];
}

/** Computes the geometry of a sanitised PRISMA spec at the given width. */
export function layoutPrisma(spec: PrismaSpec, opts: PrismaLayoutOptions): PrismaLayout {
  const { tr, formatNumber } = opts;
  const c = spec.counts as PrismaCounts;
  const has = (k: PrismaCountKey) => typeof c[k] === "number";
  const other = !!spec.otherMethods;
  const reasons = spec.reasons ?? [];
  // "(n = 1,234)" never breaks inside; a line breaks before it when the label is long.
  const nText = (v: number | undefined) => tr("data.diagram.prisma.n", { n: v === undefined ? MISSING : formatNumber(v) }).replace(/ /g, " ");
  const line = (label: string, v: number | undefined): Para => ({ text: `${label} ${nText(v)}`, item: true });
  const countLine = (k: PrismaCountKey): Para => line(tr(PRISMA_LABEL_KEYS[k]), c[k]);
  const listCell = (id: string, titleKey: string, keys: PrismaCountKey[], always: boolean): Cell | null => {
    const present = keys.filter(has);
    if (!present.length && !always) return null;
    const paras: Para[] = [{ text: tr(titleKey) }];
    if (present.length) for (const k of present) paras.push(countLine(k));
    else paras.push({ text: nText(undefined) });
    return { id, paras };
  };
  const single = (id: string, k: PrismaCountKey, show: boolean): Cell | null => (show ? { id, paras: [countLine(k)] } : null);

  // Rows: [flow, exclusion, other flow, other exclusion].
  type Row = { phase: PrismaPhase; cells: (Cell | null)[] };
  const rows: Row[] = [];
  rows.push({
    phase: "identification",
    cells: [
      listCell("identified", "data.diagram.prisma.identifiedFrom", ["databases", "registers"], true),
      listCell("removed", "data.diagram.prisma.removedBefore", ["duplicatesRemoved", "automationRemoved", "otherRemoved"], false),
      other ? listCell("otherIdentified", "data.diagram.prisma.identifiedFrom", ["websites", "organisations", "citationSearching"], true) : null,
      null,
    ],
  });
  rows.push({ phase: "screening", cells: [single("screened", "screened", true), single("screenedExcluded", "screenedExcluded", has("screenedExcluded")), null, null] });
  rows.push({
    phase: "screening",
    cells: [
      single("sought", "soughtForRetrieval", has("soughtForRetrieval") || has("notRetrieved")),
      single("notRetrieved", "notRetrieved", has("notRetrieved")),
      single("otherSought", "otherSought", other),
      single("otherNotRetrieved", "otherNotRetrieved", other && has("otherNotRetrieved")),
    ],
  });
  let excludedCell: Cell | null = null;
  if (reasons.length) {
    excludedCell = { id: "reportsExcluded", paras: [{ text: tr("data.diagram.prisma.reportsExcludedList") }] };
    for (const r of reasons) excludedCell.paras.push(line(r.label, r.n));
  } else if (has("reportsExcluded")) excludedCell = single("reportsExcluded", "reportsExcluded", true);
  rows.push({
    phase: "screening",
    cells: [
      single("assessed", "assessedForEligibility", has("assessedForEligibility") || excludedCell !== null),
      excludedCell,
      single("otherAssessed", "otherAssessed", other),
      single("otherExcluded", "otherExcluded", other && has("otherExcluded")),
    ],
  });
  const included: Cell = { id: "included", paras: [countLine("studiesIncluded")] };
  if (has("reportsIncluded")) included.paras.push(countLine("reportsIncluded"));
  rows.push({ phase: "included", cells: [included, null, null, null] });
  const shown = rows.filter((r) => r.cells.some((x) => x !== null));

  // Columns.
  const colStart = PAD + BAND_W + BAND_GAP;
  const nCols = other ? 4 : 2;
  const pairGap = other ? PAIR_GAP_NARROW : PAIR_GAP;
  const gaps = other ? pairGap * 2 + COLUMN_GAP : pairGap;
  const width = Math.max(opts.width, colStart + PAD + gaps + nCols * MIN_COL_W);
  const colW = Math.floor((width - colStart - PAD - gaps) / nCols);
  const colX = other
    ? [colStart, colStart + colW + pairGap, colStart + 2 * colW + pairGap + COLUMN_GAP, colStart + 3 * colW + 2 * pairGap + COLUMN_GAP]
    : [colStart, colStart + colW + pairGap];
  const inner = colW - BOX_PAD_X * 2;

  // Headers.
  const headers: (Box & { lines: string[] })[] = [];
  const pairW = colW * 2 + pairGap;
  const headerTexts = other ? [tr("data.diagram.prisma.headerMain"), tr("data.diagram.prisma.headerOther")] : [tr("data.diagram.prisma.headerMain")];
  const headerLines = headerTexts.map((t) => wrapText(t, pairW - BOX_PAD_X * 2, 600));
  const headerH = Math.max(...headerLines.map((l) => l.length)) * LINE_HEIGHT + BOX_PAD_Y * 2;
  headerLines.forEach((lines, i) => headers.push({ x: colX[i * 2], y: PAD, w: pairW, h: headerH, lines }));

  // Box sizes.
  const wrapCell = (cell: Cell): { lines: PrismaLine[]; h: number } => {
    const lines: PrismaLine[] = [];
    let dy = 0;
    cell.paras.forEach((p, i) => {
      const weight = p.weight ?? 400;
      // Hanging indent for list items, unless one of its words would not fit the indented width.
      const fitsHang = p.text.split(/ +/).every((word) => textWidth(word, weight) <= inner - HANG);
      const hang = p.item && cell.paras.length > 1 && fitsHang ? HANG : 0;
      if (i > 0 && p.item) dy += PARA_GAP;
      wrapText(p.text, inner, weight, undefined, inner - hang).forEach((text, j) => {
        lines.push({ text, weight, dx: j > 0 ? hang : 0, dy });
        dy += LINE_HEIGHT;
      });
    });
    return { lines, h: dy + BOX_PAD_Y * 2 };
  };
  const sized = shown.map((r) => r.cells.map((cell) => (cell ? { cell, ...wrapCell(cell) } : null)));
  const rowH = sized.map((cells) => Math.max(...cells.map((x) => (x ? x.h : 0))));

  // Phase bands must fit their rotated label: stretch the rows of a short phase.
  const phases: PrismaPhase[] = ["identification", "screening", "included"];
  for (const ph of phases) {
    const idx = shown.map((r, i) => (r.phase === ph ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const span = idx.reduce((s, i) => s + rowH[i], 0) + (idx.length - 1) * ROW_GAP;
    const need = textWidth(tr(`data.diagram.prisma.phase.${ph}`), 600) + 24;
    if (span < need) for (const i of idx) rowH[i] += (need - span) / idx.length;
  }

  // Place rows and boxes.
  const boxes: PrismaBox[] = [];
  const grid: (PrismaBox | null)[][] = [];
  const rowTop: number[] = [];
  let y = PAD + headerH + 16;
  for (let r = 0; r < shown.length; r++) {
    rowTop.push(y);
    const placed: (PrismaBox | null)[] = [];
    for (let col = 0; col < sized[r].length; col++) {
      const s = sized[r][col];
      if (!s || col >= nCols) {
        placed.push(null);
        continue;
      }
      const h = s.h;
      const box: PrismaBox = { id: s.cell.id, x: colX[col], y: y + (rowH[r] - h) / 2, w: colW, h, lines: s.lines };
      boxes.push(box);
      placed.push(box);
    }
    grid.push(placed);
    y += rowH[r] + (r + 1 < shown.length ? ROW_GAP : 0);
  }
  const height = y + PAD;

  // Phase bands.
  const bands: (Box & { label: string })[] = [];
  for (const ph of phases) {
    const idx = shown.map((r, i) => (r.phase === ph ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const top = rowTop[idx[0]];
    const bottom = rowTop[idx[idx.length - 1]] + rowH[idx[idx.length - 1]];
    bands.push({ x: PAD, y: top, w: BAND_W, h: bottom - top, label: tr(`data.diagram.prisma.phase.${ph}`) });
  }

  // Arrows: down each flow column, right into each exclusion box, and from other methods into the included box.
  const arrows: [number, number][][] = [];
  for (const col of other ? [0, 2] : [0]) {
    let prev: PrismaBox | null = null;
    for (let r = 0; r < grid.length; r++) {
      const b = grid[r][col];
      if (!b) continue;
      if (prev) arrows.push([[prev.x + prev.w / 2, prev.y + prev.h], [b.x + b.w / 2, b.y]]);
      prev = b;
    }
    if (col === 2 && prev) {
      const inc = grid[grid.length - 1][0] as PrismaBox;
      const cy = inc.y + inc.h / 2;
      arrows.push([[prev.x + prev.w / 2, prev.y + prev.h], [prev.x + prev.w / 2, cy], [inc.x + inc.w, cy]]);
    }
  }
  for (let r = 0; r < grid.length; r++) {
    for (const [a, b] of other ? [[0, 1], [2, 3]] : [[0, 1]]) {
      const from = grid[r][a];
      const to = grid[r][b];
      if (from && to) {
        const cy = rowTop[r] + rowH[r] / 2;
        arrows.push([[from.x + from.w, cy], [to.x, cy]]);
      }
    }
  }
  return { width, height, headers, bands, boxes, arrows };
}

/** SVG body of a PRISMA layout. */
export function drawPrisma(layout: PrismaLayout): DiagramDrawing {
  const parts: string[] = [];
  for (const h of layout.headers) {
    parts.push(`<rect x="${num(h.x)}" y="${num(h.y)}" width="${num(h.w)}" height="${num(h.h)}" rx="4" fill="${DIAGRAM_COLORS.panel}"/>`);
    parts.push(textLines(h.lines, h.x + h.w / 2, h.y + BOX_PAD_Y, { anchor: "middle", weight: 600 }));
  }
  for (const b of layout.bands) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    parts.push(`<rect x="${num(b.x)}" y="${num(b.y)}" width="${num(b.w)}" height="${num(b.h)}" rx="4" fill="${DIAGRAM_COLORS.panel}"/>`);
    parts.push(
      `<text x="${num(cx)}" y="${num(cy + 4)}" text-anchor="middle" font-weight="600" fill="${DIAGRAM_COLORS.text}" transform="rotate(-90 ${num(cx)} ${num(cy)})">${escapeXml(b.label)}</text>`,
    );
  }
  for (const pts of layout.arrows) {
    const n = pts.length;
    const [tx, ty] = pts[n - 1];
    const [px, py] = pts[n - 2];
    const len = Math.hypot(tx - px, ty - py) || 1;
    const dx = (tx - px) / len;
    const dy = (ty - py) / len;
    const stop: [number, number] = [tx - dx * (ARROW_LEN - 1), ty - dy * (ARROW_LEN - 1)];
    const path = pts.slice(0, n - 1).concat([stop]);
    const d = path.map((p, i) => `${i ? "L" : "M"}${num(p[0])} ${num(p[1])}`).join("");
    parts.push(`<path d="${d}" fill="none" stroke="${DIAGRAM_COLORS.arrow}" stroke-width="1.25" stroke-linejoin="round"/>`);
    parts.push(arrowHead(tx, ty, dx, dy));
  }
  for (const b of layout.boxes) {
    parts.push(
      `<rect x="${num(b.x + 0.5)}" y="${num(b.y + 0.5)}" width="${num(b.w - 1)}" height="${num(b.h - 1)}" rx="4" fill="${DIAGRAM_COLORS.surface}" stroke="${DIAGRAM_COLORS.stroke}" stroke-width="1"/>`,
    );
    for (const l of b.lines) {
      parts.push(
        `<text x="${num(b.x + BOX_PAD_X + l.dx)}" y="${num(b.y + BOX_PAD_Y + l.dy + BASELINE)}"${l.weight !== 400 ? ` font-weight="${l.weight}"` : ""} fill="${DIAGRAM_COLORS.text}">${escapeXml(l.text)}</text>`,
      );
    }
  }
  return { width: layout.width, height: layout.height, body: parts.join("") };
}
