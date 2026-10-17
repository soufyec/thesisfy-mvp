import type { Editor } from "@tiptap/core";
import { DOMParser as PMDOMParser, Fragment, type Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection, Selection } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import { artifactCaption, artifactCells, artifactTableHtml, artifactWords } from "@/lib/data/artifactHtml";
import { translate } from "@/lib/i18n/dictionary";
import { parseLatex } from "@/lib/math/latex";
import type { Artifact } from "./types";
import { afterTopLevelBlock, canAddChart, chartAttrsFor, normalizeChartSpec, type ChartNodeSpec } from "./chart";
import { cleanLatex } from "./math";

/**
 * Inserting a Research copilot result into the paper (docs/papers.md §4.6, §9 D21–D27). Pure-ish: everything the
 * shell (DocsEditor) and the cost card need, with one rule for both, so "adds {words} AI-assisted words" is what
 * the server counts after the save.
 *
 * - table / test: `artifactTableHtml(artifact, writing-language translator)` (caption "Table n.", cells, note with
 *   the APA line for a test), with the `provenance` mark (source "ai", label "Research copilot · {file}",
 *   interactionId) on all of its text. `words = artifactWords(html)`.
 * - chart: a `chart` node (figure "chart", origin "ai"), 1 AI-assisted figure, no words.
 * - diagram (copilot Gantt, PRISMA, concept map): a `chart` node with the diagram's class, origin "ai".
 * - equation (and a regression's fitted equation, `part: "equation"` or `withEquation`): a `mathBlock` with origin
 *   "ai", 1 AI-assisted equation, no words (D27).
 * Always after the top-level block that holds the cursor (never inside a cell or a list), in one transaction with the
 * meta "ai-insert" (the typing counters skip it), run inside the shell's `programmatic()` when it passes one.
 * Refused without `meta.interactionId` (D12).
 */

export type ArtifactInsertKind = "table" | "chart" | "test" | "diagram" | "equation";

/** What the assistant panel passes (same fields as its `InsertMeta`, without `words`). */
export interface ArtifactInsertMeta {
  provider: string;
  model: string;
  mode: string;
  interactionId?: string;
}

export interface ArtifactInsertOptions {
  /** A validated top-level drop boundary. */
  position?: number;
  /** The shell's `programmatic()` wrapper: the typing counters skip what runs inside it. */
  programmatic?: <T>(fn: () => T) => T;
  /** "equation": insert only the fitted equation of a test (regression) artifact. Default "main". */
  part?: "main" | "equation";
  /** With a test that has a fitted equation: insert the equation after the table, in the same step. */
  withEquation?: boolean;
  /** Number the inserted equation "(n)". */
  numbered?: boolean;
}

/** What an insertion adds, before it happens (the cost card) and after (the `ai_insert` event). */
export interface ArtifactInsertPlan {
  kind: ArtifactInsertKind;
  /** HTML inserted for a table or test (what `words` counts); null for figures and equations. */
  html: string | null;
  /** AI-assisted words (tables and tests only). */
  words: number;
  /** Cells of the table, header row included (for "({cells} cells)"). */
  cells: number;
  /** AI-assisted figures added (charts and diagrams). */
  figures: number;
  /** AI-assisted equations added. */
  equations: number;
}

export type ArtifactInsertFailure = "no_interaction" | "read_only" | "limit" | "invalid";
export type ArtifactInsertResult = ({ ok: true; from: number; to: number } & ArtifactInsertPlan) | { ok: false; reason: ArtifactInsertFailure };

/** Translator into the artifact's writing language (titles, captions, notes are written in it). */
const writingTr = (a: Pick<Artifact, "lang">) => (k: string, v?: Record<string, string | number | undefined>) => translate(a.lang || "en", k, v);

const validLatex = (latex: string | undefined): string | null => {
  const clean = cleanLatex(latex || "").trim();
  return clean && parseLatex(clean).ok ? clean : null;
};

/** Spec of the figure node a chart or diagram artifact becomes (null when it cannot be drawn). */
export function artifactFigureSpec(artifact: Artifact): ChartNodeSpec | null {
  if (artifact.kind === "chart" && artifact.chart) return normalizeChartSpec(artifact, "chart");
  if ((artifact.kind === "diagram" || artifact.kind === "chart") && artifact.diagram) return normalizeChartSpec({ ...artifact, figure: artifact.diagram.figure });
  return null;
}

/** The plan of an insertion: kind, HTML and the counts it adds. Null when the artifact cannot be inserted. */
export function planArtifactInsert(artifact: Artifact, opts: Pick<ArtifactInsertOptions, "part" | "withEquation"> = {}): ArtifactInsertPlan | null {
  const eq = validLatex(artifact.equation?.latex);
  if (opts.part === "equation") return eq ? { kind: "equation", html: null, words: 0, cells: 0, figures: 0, equations: 1 } : null;
  switch (artifact.kind) {
    case "table":
    case "test": {
      if (!artifact.table || !Array.isArray(artifact.table.columns)) return null;
      const html = artifactTableHtml(artifact, writingTr(artifact));
      return { kind: artifact.kind, html, words: artifactWords(html), cells: artifactCells(artifact), figures: 0, equations: opts.withEquation && eq ? 1 : 0 };
    }
    case "chart":
    case "diagram":
      return artifactFigureSpec(artifact) ? { kind: artifact.kind, html: null, words: 0, cells: 0, figures: 1, equations: 0 } : null;
    case "equation":
      return eq ? { kind: "equation", html: null, words: 0, cells: 0, figures: 0, equations: 1 } : null;
    default:
      return null;
  }
}

/** Default caption of a copilot figure: "{title} (n = {n}). Source: {file}." from a file, else its title. */
function figureCaption(artifact: Artifact): string {
  return artifact.fileName ? artifactCaption(artifact, writingTr(artifact)) : artifact.title || "";
}

/**
 * Inserts `artifact` after the top-level block holding the cursor and returns what it added (for `ai_insert`:
 * `{ words, kind, figures, equations, artifactId }`). The caller shows the cost card before calling this (principle 5).
 */
export function insertArtifactCommand(editor: Editor, artifact: Artifact, meta: ArtifactInsertMeta, opts: ArtifactInsertOptions = {}): ArtifactInsertResult {
  if (!meta.interactionId) return { ok: false, reason: "no_interaction" };
  if (!editor.isEditable) return { ok: false, reason: "read_only" };
  const plan = planArtifactInsert(artifact, opts);
  if (!plan) return { ok: false, reason: "invalid" };
  if (plan.figures && !canAddChart(editor)) return { ok: false, reason: "limit" };
  const schema = editor.state.schema;
  const nodes: PMNode[] = [];

  if (plan.html) {
    // Parsed in an inert document (never the live one), then read through the schema.
    const holder = new DOMParser().parseFromString(plan.html, "text/html").body;
    PMDOMParser.fromSchema(schema).parse(holder).content.forEach((n) => nodes.push(n));
  }
  if (plan.figures) {
    const spec = artifactFigureSpec(artifact);
    if (!spec || !schema.nodes.chart) return { ok: false, reason: "invalid" };
    const attrs = chartAttrsFor(spec, {
      caption: figureCaption(artifact) || null,
      origin: "ai",
      provider: meta.provider || null,
      model: meta.model || null,
      interaction: meta.interactionId,
      dataset: artifact.sourceId || null,
    });
    nodes.push(schema.nodes.chart.create(attrs));
  }
  if (plan.equations) {
    const latex = validLatex(artifact.equation?.latex);
    if (!latex || !schema.nodes.mathBlock) return { ok: false, reason: "invalid" };
    nodes.push(schema.nodes.mathBlock.create({ latex, origin: "ai", provider: meta.provider || null, model: meta.model || null, interaction: meta.interactionId, numbered: !!opts.numbered }));
  }
  if (!nodes.length) return { ok: false, reason: "invalid" };

  let range: { from: number; to: number } | null = null;
  const run = () =>
    editor
      .chain()
      .command(({ tr, state }) => {
        const at = opts.position ?? afterTopLevelBlock(state);
        if (!Number.isInteger(at) || at < 0 || at > tr.doc.content.size || tr.doc.resolve(at).depth !== 0) return false;
        closeHistory(tr);
        const atEnd = at >= tr.doc.content.size;
        // At the very end of the document an empty paragraph follows, so the student can keep writing below.
        const content = Fragment.fromArray(atEnd && schema.nodes.paragraph ? [...nodes, schema.nodes.paragraph.create()] : nodes);
        tr.insert(at, content);
        const to = at + nodes.reduce((s, n) => s + n.nodeSize, 0);
        if (plan.html && schema.marks.provenance) {
          const label = artifact.fileName ? `Research copilot · ${artifact.fileName}` : "Research copilot";
          tr.addMark(at, to, schema.marks.provenance.create({ source: "ai", provider: meta.provider || null, label, interactionId: meta.interactionId }));
        }
        const last = tr.doc.nodeAt(to - nodes[nodes.length - 1].nodeSize);
        if (last && last.isAtom && NodeSelection.isSelectable(last)) tr.setSelection(NodeSelection.create(tr.doc, to - last.nodeSize));
        else tr.setSelection(Selection.near(tr.doc.resolve(Math.min(to, tr.doc.content.size)), -1));
        tr.setMeta("ai-insert", true).scrollIntoView();
        range = { from: at, to };
        return true;
      })
      .run();
  const done = opts.programmatic ? opts.programmatic(run) : run();
  if (!done || !range) return { ok: false, reason: "invalid" };
  // Typing immediately inside the inserted table must undo independently of the insertion.
  editor.view.dispatch(closeHistory(editor.state.tr));
  const r = range as { from: number; to: number };
  return { ok: true, from: r.from, to: r.to, ...plan };
}
