import { Node, type Editor } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { NodeSelection, Plugin, PluginKey, Selection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import ChartView from "./ChartView";
import { IMAGE_EDIT_META, outerStyle } from "./image";
import { normalizeChart, renderChartSvg } from "@/lib/charts/render";
import { renderDiagramSvg } from "@/lib/diagrams/render";
import { sanitizeDiagram } from "@/lib/diagrams/validate";
import type { DiagramSpec, DiagramWarning } from "@/lib/diagrams/types";
import type { FigureKind } from "@/lib/countable";
import { translate } from "@/lib/i18n/dictionary";
import { formatNumber } from "@/lib/data/labels";
import type { ChartData, WritingLanguage } from "./types";

/**
 * The `chart` node (docs/papers.md §4.6, §9 D21–D22): one block for every figure Thesisfic draws itself.
 * - `figure: "chart"`: a chart computed by Thesisfic from the student's data and inserted from the Research copilot
 *   (origin "ai"; data and styling are editable while the original data and origin are retained).
 * - `figure: "gantt" | "prisma" | "conceptMap"`: a diagram, made by the student with Insert › Diagram (origin
 *   "human", Written) or proposed by the copilot (origin "ai"). Both can be edited with the same form; editing never
 *   changes the origin, like AI text the student retouches (D22).
 *
 * Saved HTML (the server counters read `data-chart`, `data-figure-kind` and `data-origin`, src/lib/countable.ts):
 *   <figure data-chart class="chart-node" data-figure-kind="…" data-origin="ai|human" [data-provider data-model
 *     data-interaction data-dataset data-align data-width] data-spec="…" style="…">
 *     <img src="data:image/svg+xml;base64,…" alt="…"><figcaption>…</figcaption></figure>
 * `data-spec` is `encodeURIComponent(JSON)` of a `ChartNodeSpec` (never `<`, `>` or `"` in the attribute). In the
 * editor the NodeView draws the SVG inline from the spec (no `<img>`: "Copy image" or dragging out never yields a file
 * without its origin). Captions live in an attribute: they are never words (the server drops `<figcaption>`).
 *
 * No `renderText`: the node adds nothing to `editor.getText()`, so the client word count equals the server's.
 */

export type { FigureKind };
export const FIGURE_KINDS: FigureKind[] = ["chart", "gantt", "prisma", "conceptMap"];
export type FigureOrigin = "ai" | "human";
export type ChartAlign = "left" | "center" | "right";

/** Figures a single tab can hold (§4.6). */
export const MAX_CHARTS_PER_TAB = 30;
/** Event a selected figure's DOM receives when the student presses Enter: its NodeView opens the edit form. */
export const CHART_EDIT_EVENT = "thesisfic:edit-diagram";
/** Titles and captions are cut to this length before they are drawn or saved. */
export const CHART_TEXT_MAX = 200;
/** Storage bound for edited data plus the retained original chart. */
const MAX_SPEC_CHARS = 1_000_000;
/** Width the SVG is drawn at (the page column scales it down), as for the copilot's inserted charts (§3.4). */
export const CHART_DRAW_WIDTH = 640;
const CHART_DRAW_HEIGHT = 400;

/** What `data-spec` holds (decoded). Data charts carry the artifact without its table; diagrams their sanitized spec. */
export interface ChartNodeSpec {
  v: 1;
  figure: FigureKind;
  /** Artifact title in the writing language (≤ 200); "" for a diagram the student made. */
  title: string;
  /** Writing language of the labels (axis numbers, PRISMA boxes, Gantt months). */
  lang: WritingLanguage;
  /** figure "chart": the computed or edited chart (bounded by CHART_LIMITS, finite numbers only). */
  chart?: ChartData;
  originalChart?: ChartData;
  editedAt?: string;
  dataSelection?: import("@/lib/data/workspace").WorkspaceRequest;
  n?: number;
  fileName?: string;
  sheet?: string;
  sourceId?: string;
  datasetSha256?: string;
  op?: string;
  /** Diagrams: the spec after `sanitizeDiagram`. */
  diagram?: DiagramSpec;
  /** Copilot artifact it came from. */
  artifactId?: string;
  computedAt?: string;
}

export interface ChartAttrs {
  /** URI-encoded JSON of a `ChartNodeSpec` ("" when the figure has none). */
  spec: string;
  figure: FigureKind;
  caption: string | null;
  alt: string | null;
  /** `320px` or `50%`; null = natural size, never wider than the column. */
  width: string | null;
  align: ChartAlign;
  origin: FigureOrigin;
  provider: string | null;
  model: string | null;
  interaction: string | null;
  /** Primary source the chart was computed from (its source id). */
  dataset: string | null;
}

export interface ChartOptions {
  thesisId?: string;
  /** Called when an insertion or a paste would put more than `MAX_CHARTS_PER_TAB` figures in the tab. */
  onLimit?: (max: number) => void;
}

const LANGS: WritingLanguage[] = ["en", "es", "fr", "de"];
const ALIGNS: ChartAlign[] = ["left", "center", "right"];
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = CHART_TEXT_MAX): string => (typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, max);
const oneOf = <T extends string>(v: unknown, list: T[], fallback: T): T => (typeof v === "string" && (list as string[]).indexOf(v) !== -1 ? (v as T) : fallback);
const normWidth = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(px|%)?\s*$/.exec(v);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!(n > 0)) return null;
  return `${Math.round(Math.min(n, m[2] === "%" ? 100 : 4000) * 10) / 10}${m[2] || "px"}`;
};
/** Text for an attribute that the server's tag scan reads: no angle brackets, no control characters. */
const attrText = (v: string | null | undefined, max = CHART_TEXT_MAX) => str(v, max).replace(/[<>]/g, " ").trim();

// ---------------------------------------------------------------------------------------------
// Spec: normalise, encode, decode
// ---------------------------------------------------------------------------------------------

/**
 * A `ChartNodeSpec` from anything: a spec decoded from a paper's HTML (student-controlled), a copilot `Artifact`
 * (its `chart`, `diagram`, `id`, `spec.op` are read), or a bare `DiagramSpec`. Null when nothing drawable is left.
 * Charts go through `normalizeChart`; diagrams through `sanitizeDiagram` (which never throws).
 */
export function normalizeChartSpec(input: unknown, hint?: FigureKind): ChartNodeSpec | null {
  if (!isObj(input)) return null;
  const rawDiagram = isObj(input.diagram) ? input.diagram : typeof input.figure === "string" && input.figure !== "chart" && !isObj(input.chart) ? input : null;
  let figure: FigureKind = oneOf(input.figure, FIGURE_KINDS, rawDiagram ? oneOf(rawDiagram.figure, FIGURE_KINDS, hint || "chart") : hint || "chart");
  const base = {
    v: 1 as const,
    title: str(input.title),
    lang: oneOf(input.lang, LANGS, "en"),
  };
  const extra: Partial<ChartNodeSpec> = {};
  const artifactId = str(input.artifactId ?? (isObj(input.chart) || isObj(input.diagram) ? input.id : undefined), 80);
  if (artifactId) extra.artifactId = artifactId;
  const computedAt = str(input.computedAt, 40);
  if (computedAt) extra.computedAt = computedAt;
  if (figure === "chart") {
    if (!isObj(input.chart)) return null;
    const chart = normalizeChart(input.chart as unknown as ChartData);
    const out: ChartNodeSpec = { ...base, figure, chart, ...extra };
    if (isObj(input.originalChart)) out.originalChart = normalizeChart(input.originalChart as unknown as ChartData);
    if (typeof input.editedAt === "string") out.editedAt = str(input.editedAt, 40);
    if (isObj(input.dataSelection)) out.dataSelection = input.dataSelection as unknown as ChartNodeSpec["dataSelection"];
    const n = typeof input.n === "number" && Number.isFinite(input.n) && input.n >= 0 ? Math.round(input.n) : undefined;
    if (n !== undefined) out.n = n;
    for (const k of ["fileName", "sheet", "sourceId", "datasetSha256"] as const) {
      const v = str(input[k]);
      if (v) out[k] = v;
    }
    const op = str(input.op ?? (isObj(input.spec) ? input.spec.op : undefined), 40);
    if (op) out.op = op;
    return out;
  }
  const sanitized = sanitizeDiagram(rawDiagram);
  if (!sanitized.ok) return null;
  figure = sanitized.spec.figure;
  const out: ChartNodeSpec = { ...base, figure, diagram: sanitized.spec, ...extra };
  // A Gantt computed from a sheet keeps its source (caption "… Source: file.").
  for (const k of ["fileName", "sheet", "sourceId"] as const) {
    const v = str(input[k]);
    if (v) out[k] = v;
  }
  if (typeof input.n === "number" && Number.isFinite(input.n) && input.n > 0) out.n = Math.round(input.n);
  return out;
}

/** `data-spec` value: URI-encoded JSON (no `<`, `>` or `"`). */
export function encodeChartSpec(spec: ChartNodeSpec): string {
  return encodeURIComponent(JSON.stringify(spec));
}

const decodeCache = new Map<string, ChartNodeSpec | null>();
/** The spec behind a `data-spec` value (normalised; cached). Null when it cannot be read or drawn. */
export function readChartSpec(encoded: string | null | undefined, hint?: FigureKind): ChartNodeSpec | null {
  if (!encoded || encoded.length > MAX_SPEC_CHARS) return null;
  const key = `${hint || ""}\u0000${encoded}`;
  if (decodeCache.has(key)) return decodeCache.get(key) ?? null;
  let out: ChartNodeSpec | null = null;
  try {
    out = normalizeChartSpec(JSON.parse(decodeURIComponent(encoded)), hint);
  } catch {
    out = null;
  }
  remember(decodeCache, key, out);
  return out;
}

function remember<K, V>(map: Map<K, V>, key: K, value: V, max = 64) {
  if (map.size >= max) {
    const first = map.keys().next();
    if (!first.done) map.delete(first.value);
  }
  map.set(key, value);
}

/** `data-spec` as saved: re-encoded from the normalised spec when it can be read; otherwise kept as it was (bounded). */
function canonicalSpec(raw: string | null, hint?: FigureKind): { spec: string; decoded: ChartNodeSpec | null } {
  if (!raw || raw.length > MAX_SPEC_CHARS) return { spec: "", decoded: null };
  const decoded = readChartSpec(raw, hint);
  // Unreadable specs are kept as they are, so nothing a newer version wrote is lost; they render as a notice.
  return { spec: decoded ? encodeChartSpec(decoded) : /^[A-Za-z0-9%._~!*'()-]*$/.test(raw) ? raw : "", decoded };
}

// ---------------------------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------------------------

export interface DrawnFigure {
  svg: string;
  width: number;
  height: number;
}

const drawCache = new Map<string, DrawnFigure | null>();

/** Accessible name of a figure: its title, else the class name in the writing language. */
export function figureTitle(spec: ChartNodeSpec): string {
  return spec.title || translate(spec.lang, `figures.kind.${spec.figure}`);
}

/**
 * The figure's SVG (self-contained, every string escaped by the renderers), drawn 640 px wide like the copilot's
 * inserted charts; horizontal bar charts and tall diagrams come back taller than 400. Cached per spec and caption.
 */
export function drawChartSpec(spec: ChartNodeSpec, caption?: string | null): DrawnFigure | null {
  const desc = str(caption || "") || figureTitle(spec);
  const key = `${JSON.stringify(spec)}\u0000${desc}`;
  if (drawCache.has(key)) return drawCache.get(key) ?? null;
  let out: DrawnFigure | null = null;
  try {
    if (spec.figure === "chart" && spec.chart) {
      const svg = renderChartSvg(spec.chart, { width: CHART_DRAW_WIDTH, height: CHART_DRAW_HEIGHT, title: figureTitle(spec), desc, lang: spec.lang });
      const w = /\swidth="(\d+(?:\.\d+)?)"/.exec(svg);
      const h = /\sheight="(\d+(?:\.\d+)?)"/.exec(svg);
      out = { svg, width: w ? Number(w[1]) : CHART_DRAW_WIDTH, height: h ? Number(h[1]) : CHART_DRAW_HEIGHT };
    } else if (spec.diagram) {
      const lang = spec.lang;
      const r = renderDiagramSvg(spec.diagram, { width: CHART_DRAW_WIDTH, lang, tr: (k, v) => translate(lang, k, v), title: figureTitle(spec), desc });
      out = { svg: r.svg, width: r.width, height: r.height };
    }
  } catch {
    out = null;
  }
  remember(drawCache, key, out, 48);
  return out;
}

/** Base64 of a UTF-8 string (the SVG data URI of the saved `<img>`). */
export function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(bin);
}

const srcCache = new Map<string, string>();
/** `data:image/svg+xml;base64,…` of a drawn figure. */
export function svgDataUri(svg: string): string {
  const hit = srcCache.get(svg);
  if (hit) return hit;
  const uri = `data:image/svg+xml;base64,${utf8ToBase64(svg)}`;
  remember(srcCache, svg, uri, 48);
  return uri;
}

/** Default caption of a copilot figure: "{title} (n = {n}). Source: {file}." when it comes from a file, else its title. */
export function defaultFigureCaption(spec: ChartNodeSpec): string {
  if (spec.fileName) {
    const n = typeof spec.n === "number" ? formatNumber(spec.n, spec.lang, 0) : "";
    return str(translate(spec.lang, "data.caption", { title: spec.title, n, file: spec.fileName }));
  }
  return spec.title;
}

// ---------------------------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------------------------

const figureAttrs = (a: ChartAttrs): Record<string, string> => {
  const d: Record<string, string> = { "data-chart": "", "data-figure-kind": a.figure, "data-origin": a.origin };
  if (a.provider) d["data-provider"] = attrText(a.provider, 80);
  if (a.model) d["data-model"] = attrText(a.model, 120);
  if (a.interaction) d["data-interaction"] = attrText(a.interaction, 80);
  if (a.dataset) d["data-dataset"] = attrText(a.dataset, 80);
  if (a.align !== "center") d["data-align"] = a.align;
  if (a.width) d["data-width"] = a.width;
  return d;
};

/** Inline style of the outer `<figure>` (also used by the NodeView). */
export const chartOuterStyle = (a: Pick<ChartAttrs, "width" | "align">) => outerStyle({ width: a.width, align: a.align, wrap: "none" });

export const ChartNode = Node.create<ChartOptions>({
  name: "chart",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { onLimit: undefined };
  },

  addAttributes() {
    // Every attribute is read here and written by renderHTML below (rendered: false), so the order of the saved
    // attributes is fixed: origin before anything long.
    return {
      spec: { default: "", rendered: false, parseHTML: (el) => canonicalSpec(el.getAttribute("data-spec"), oneOf(el.getAttribute("data-figure-kind"), FIGURE_KINDS, "chart")).spec },
      figure: {
        default: "chart",
        rendered: false,
        parseHTML: (el) => readChartSpec(canonicalSpec(el.getAttribute("data-spec")).spec)?.figure || oneOf(el.getAttribute("data-figure-kind"), FIGURE_KINDS, "chart"),
      },
      caption: { default: null, rendered: false, parseHTML: (el) => str(el.querySelector("figcaption")?.textContent?.replace(/\s+/g, " ").trim() || "") || null },
      // The saved `<img alt>` falls back to the caption, then the title: such an alt is not the student's own text.
      alt: {
        default: null,
        rendered: false,
        parseHTML: (el) => {
          const alt = attrText(el.querySelector("img")?.getAttribute("alt") || "");
          if (!alt) return null;
          const caption = attrText(el.querySelector("figcaption")?.textContent?.replace(/\s+/g, " ") || "");
          const spec = readChartSpec(canonicalSpec(el.getAttribute("data-spec")).spec);
          return alt === caption || (spec && alt === attrText(figureTitle(spec))) ? null : alt;
        },
      },
      width: { default: null, rendered: false, parseHTML: (el) => normWidth(el.getAttribute("data-width")) || normWidth(el.style?.width) },
      align: { default: "center", rendered: false, parseHTML: (el) => oneOf(el.getAttribute("data-align"), ALIGNS, "center") },
      // Absent or anything but "human" reads as AI-assisted, as on the server (FIGURE_DEFAULT_ORIGIN). A data chart is
      // only ever computed by the copilot (D22, §4.6): it is AI-assisted whatever its data-origin says (countable.ts).
      origin: {
        default: "ai",
        rendered: false,
        parseHTML: (el) => {
          if (el.getAttribute("data-origin") !== "human") return "ai";
          const kind = readChartSpec(canonicalSpec(el.getAttribute("data-spec")).spec)?.figure || oneOf(el.getAttribute("data-figure-kind"), FIGURE_KINDS, "chart");
          return kind === "chart" ? "ai" : "human";
        },
      },
      provider: { default: null, rendered: false, parseHTML: (el) => attrText(el.getAttribute("data-provider"), 80) || null },
      model: { default: null, rendered: false, parseHTML: (el) => attrText(el.getAttribute("data-model"), 120) || null },
      interaction: { default: null, rendered: false, parseHTML: (el) => attrText(el.getAttribute("data-interaction"), 80) || null },
      dataset: { default: null, rendered: false, parseHTML: (el) => attrText(el.getAttribute("data-dataset"), 80) || null },
    };
  },

  parseHTML() {
    // Never returns false: any `figure[data-chart]` stays a figure (and keeps being counted), drawable or not.
    return [{ tag: "figure[data-chart]", priority: 70 }];
  },

  renderHTML({ node }) {
    const a = node.attrs as ChartAttrs;
    const spec = readChartSpec(a.spec, a.figure);
    const caption = str((a.caption || "").replace(/\s+/g, " ").trim());
    const out: unknown[] = ["figure", { ...figureAttrs(a), class: "chart-node", "data-spec": a.spec || "", style: chartOuterStyle(a) }];
    const drawn = spec ? drawChartSpec(spec, caption) : null;
    if (drawn && spec) {
      const alt = attrText(a.alt || caption || figureTitle(spec));
      out.push(["img", { src: svgDataUri(drawn.svg), alt, width: String(drawn.width), height: String(drawn.height), style: "display:block;width:100%;height:auto;max-width:100%" }]);
    }
    if (caption) out.push(["figcaption", {}, caption]);
    return out as never;
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChartView, {
      as: "figure",
      className: "chart-node",
      attrs: ({ node }) => ({ ...figureAttrs(node.attrs as ChartAttrs), style: chartOuterStyle(node.attrs as ChartAttrs) }),
      // The toolbar, the caption field and the edit dialog belong to React; drags and drops go to ProseMirror.
      stopEvent: ({ event }) => {
        const el = event.target as HTMLElement | null;
        if (event.type.startsWith("drag") || event.type === "drop") return false;
        return !!el && typeof el.closest === "function" && !!el.closest("[data-fig-ui]");
      },
    });
  },

  addKeyboardShortcuts() {
    return {
      // Enter on a selected diagram opens its form (keyboard users have no double-click); data charts have no form.
      Enter: ({ editor }) => {
        const sel = editor.state.selection;
        if (!(sel instanceof NodeSelection) || sel.node.type.name !== this.name || !editor.isEditable) return false;
        const figure = readChartSpec((sel.node.attrs as ChartAttrs).spec, (sel.node.attrs as ChartAttrs).figure)?.figure ?? (sel.node.attrs as ChartAttrs).figure;

        const dom = editor.view.nodeDOM(sel.from) as HTMLElement | null;
        const target = (dom?.querySelector?.("[data-node-view-wrapper]") as HTMLElement | null) || dom;
        target?.dispatchEvent(new CustomEvent(CHART_EDIT_EVENT));
        return true;
      },
      // Escape deselects the figure and puts the cursor next to it.
      Escape: ({ editor }) => {
        const sel = editor.state.selection;
        if (!(sel instanceof NodeSelection) || sel.node.type.name !== this.name) return false;
        const $to = editor.state.doc.resolve(sel.to);
        const next = Selection.findFrom($to, 1, true) || Selection.findFrom($to, -1, true);
        if (!next) return false;
        editor.view.dispatch(editor.state.tr.setSelection(next));
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const type = this.type;
    const options = this.options;
    return [
      new Plugin({
        key: new PluginKey("thesisficChartGuards"),
        // A paste or drop that would put more than MAX_CHARTS_PER_TAB figures in the tab is refused (with a notice).
        filterTransaction: (tr, state) => {
          if (!tr.docChanged) return true;
          const ui = tr.getMeta("uiEvent");
          if (!(tr.getMeta("paste") || ui === "paste" || ui === "drop")) return true;
          const after = countCharts(tr.doc);
          if (after <= MAX_CHARTS_PER_TAB || after <= countCharts(state.doc)) return true;
          options.onLimit?.(MAX_CHARTS_PER_TAB);
          return false;
        },
        // A figure never lives in a table cell: one that lands there (paste, drop) moves after the table.
        appendTransaction: (trs, _old, state) => (trs.some((t) => t.docChanged) ? moveChartsOutOfCells(state, type.name) : null),
      }),
    ];
  },
});

/** Figures (`chart` nodes) in a document. */
export function countCharts(doc: PMNode): number {
  let n = 0;
  doc.descendants((node) => {
    if (node.type.name === "chart") n++;
    return !node.isAtom;
  });
  return n;
}

const CELL_TYPES = ["tableCell", "tableHeader"];

function moveChartsOutOfCells(state: EditorState, name: string): Transaction | null {
  // Only top-level blocks that hold a table are searched, so typing elsewhere costs one pass over the top level.
  const jobs: { topEnd: number; charts: { pos: number; node: PMNode; onlyChild: boolean }[] }[] = [];
  state.doc.forEach((top, offset) => {
    let hasTable = top.type.name === "table";
    if (!hasTable && !top.isAtom && !top.isTextblock)
      top.descendants((n) => {
        if (n.type.name === "table") hasTable = true;
        return !hasTable;
      });
    if (!hasTable) return;
    const charts: { pos: number; node: PMNode; onlyChild: boolean }[] = [];
    top.descendants((node, pos, parent) => {
      if (node.type.name !== name) return !node.isAtom;
      const abs = offset + 1 + pos;
      const $pos = state.doc.resolve(abs);
      let inCell = false;
      for (let d = $pos.depth; d > 0; d--) if (CELL_TYPES.indexOf($pos.node(d).type.name) !== -1) inCell = true;
      if (inCell) charts.push({ pos: abs, node, onlyChild: (parent?.childCount ?? 0) === 1 });
      return false;
    });
    if (charts.length) jobs.push({ topEnd: offset + top.nodeSize, charts });
  });
  if (!jobs.length) return null;
  const tr = state.tr;
  const paragraph = state.schema.nodes.paragraph;
  // Remove from the cells, last first (earlier positions stay valid), then insert after each table.
  for (let j = jobs.length - 1; j >= 0; j--) {
    const job = jobs[j];
    for (let i = job.charts.length - 1; i >= 0; i--) {
      const c = job.charts[i];
      if (c.onlyChild && paragraph) tr.replaceWith(c.pos, c.pos + c.node.nodeSize, paragraph.create());
      else tr.delete(c.pos, c.pos + c.node.nodeSize);
    }
    tr.insert(tr.mapping.map(job.topEnd), Fragment.fromArray(job.charts.map((c) => c.node)));
  }
  tr.setMeta(IMAGE_EDIT_META, true);
  return tr;
}

// ---------------------------------------------------------------------------------------------
// Helpers for the shell and the NodeView
// ---------------------------------------------------------------------------------------------

function chartOptions(editor: Editor): ChartOptions {
  const ext = editor.extensionManager.extensions.find((e) => e.name === "chart");
  return (ext?.options as ChartOptions) || {};
}

/** Whether one more figure fits in the current tab; calls `onLimit` when it does not. */
export function canAddChart(editor: Editor): boolean {
  if (countCharts(editor.state.doc) < MAX_CHARTS_PER_TAB) return true;
  chartOptions(editor).onLimit?.(MAX_CHARTS_PER_TAB);
  return false;
}

/** Position right after the top-level block that holds the selection (never inside a cell or a list). */
export function afterTopLevelBlock(state: EditorState): number {
  const sel = state.selection;
  if (sel instanceof NodeSelection && sel.$from.depth === 0) return sel.to;
  const $from = sel.$from;
  if ($from.depth === 0) return Math.min(sel.from, state.doc.content.size);
  return $from.after(1);
}

/**
 * Where a block made with a form (a diagram, an equation on its own line) goes: after a selected node; before or after
 * the paragraph when the cursor is at its start or end (never leaving an empty half behind); `at: null` = at the cursor
 * (an empty paragraph is replaced, a paragraph is split at the cursor, as for images). `trailing`: the block would end
 * the document, so an empty paragraph should follow it (the student keeps writing below, as in Docs).
 */
export function blockInsertTarget(state: EditorState): { at: number | null; trailing: boolean } {
  const sel = state.selection;
  const size = state.doc.content.size;
  if (sel instanceof NodeSelection) return { at: sel.to, trailing: sel.to >= size };
  if (!sel.empty) return { at: null, trailing: false };
  const $from = sel.$from;
  const parent = $from.parent;
  if (!parent.isTextblock || $from.depth === 0) return { at: null, trailing: false };
  const lastTop = $from.depth === 1 && $from.after() >= size;
  if (parent.content.size === 0) return { at: null, trailing: lastTop };
  if ($from.parentOffset === 0) return { at: $from.before(), trailing: false };
  if ($from.parentOffset === parent.content.size) return { at: $from.after(), trailing: $from.after() >= size };
  return { at: null, trailing: false };
}

/** Node attributes for a new figure; `spec` is normalised and encoded here. */
export function chartAttrsFor(spec: ChartNodeSpec, extra: Partial<Omit<ChartAttrs, "spec" | "figure">> = {}): ChartAttrs {
  return {
    spec: encodeChartSpec(spec),
    figure: spec.figure,
    caption: extra.caption !== undefined ? (extra.caption ? str(extra.caption) : null) : defaultFigureCaption(spec) || null,
    alt: extra.alt ? str(extra.alt) : null,
    width: extra.width ?? null,
    align: extra.align ?? "center",
    origin: extra.origin ?? "ai",
    provider: extra.provider ?? null,
    model: extra.model ?? null,
    interaction: extra.interaction ?? null,
    dataset: extra.dataset ?? null,
  };
}

/**
 * Inserts a diagram the student made with Insert › Diagram (origin "human", Written) at the cursor, like an image.
 * Returns false when the tab already holds MAX_CHARTS_PER_TAB figures (after `onLimit`) or the spec is not drawable.
 */
export function insertDiagram(editor: Editor, value: { spec: DiagramSpec; caption?: string | null; lang: WritingLanguage }): boolean {
  if (!editor.isEditable || !canAddChart(editor)) return false;
  const spec = normalizeChartSpec({ figure: value.spec.figure, diagram: value.spec, title: "", lang: value.lang });
  if (!spec) return false;
  const attrs = chartAttrsFor(spec, { origin: "human", caption: value.caption ?? null });
  const { at, trailing } = blockInsertTarget(editor.state);
  const chain = editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.setMeta(IMAGE_EDIT_META, true);
      return true;
    });
  // At the very end of the document an empty paragraph follows, so the student can keep writing below the figure.
  const content = trailing ? [{ type: "chart", attrs }, { type: "paragraph" }] : { type: "chart", attrs };
  return (at !== null ? chain.insertContentAt(at, content) : chain.insertContent(content)).run();
}

/** Merges `patch` into the figure at `pos`. Leaves history intact and is not counted as typing. */
export function patchChart(editor: Editor, pos: number, patch: Partial<ChartAttrs>): boolean {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "chart") return false;
  const next = { ...node.attrs, ...patch } as ChartAttrs;
  if (next.caption) next.caption = str(next.caption) || null;
  if (next.alt) next.alt = str(next.alt) || null;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, next).setMeta(IMAGE_EDIT_META, true));
  return true;
}

/**
 * Replaces the diagram of the figure at `pos` (the edit form, D22). The origin is kept: an AI diagram the student
 * edits stays AI-assisted. Data charts use patchChart through their dedicated data and formatting form.
 */
export function updateDiagram(editor: Editor, pos: number, value: { spec: DiagramSpec; caption?: string | null }): boolean {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "chart") return false;
  const current = readChartSpec((node.attrs as ChartAttrs).spec, (node.attrs as ChartAttrs).figure);
  if (current && current.figure === "chart") return false;
  const spec = normalizeChartSpec({ ...(current || { title: "", lang: "en" }), figure: value.spec.figure, diagram: value.spec });
  if (!spec) return false;
  return patchChart(editor, pos, { spec: encodeChartSpec(spec), figure: spec.figure, ...(value.caption !== undefined ? { caption: value.caption ? str(value.caption) : null } : {}) });
}

/** Warnings of a diagram figure (PRISMA arithmetic, shortened labels), recomputed from its spec. */
export function diagramWarningsOf(spec: ChartNodeSpec | null): DiagramWarning[] {
  if (!spec || !spec.diagram) return [];
  const r = sanitizeDiagram(spec.diagram);
  return r.ok ? r.warnings : [];
}
