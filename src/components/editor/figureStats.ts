import type { Node as PMNode } from "@tiptap/pm/model";
import { computeEquations, figureBreakdown, type FigureBreakdown, type FigureKind, type OriginCounts } from "@/lib/countable";

/**
 * Figures and equations of the live document, counted on the client exactly as the server counts the saved HTML
 * (`computeFigures` / `figureBreakdown` / `computeEquations` in src/lib/countable.ts, used by db.ts and process.ts):
 * - a `chart` node is one figure of its class (`figure`, else "chart"); it is AI-assisted unless its origin is
 *   "human" (the node and the server both default to "ai");
 * - a `math` or `mathBlock` node is one equation; it is AI-assisted only when its origin is "ai" (default "human");
 *   an inline equation inside the AI-use declaration appendix is left out, as the server drops that span whole.
 * Totals belong to the Final submission only: call these on the Final submission tab (other tabs are notes).
 */

export type { FigureBreakdown, FigureKind, OriginCounts };

export interface DocFigureStats {
  figures: FigureBreakdown;
  equations: OriginCounts;
}

const KINDS: FigureKind[] = ["chart", "gantt", "prisma", "conceptMap"];

const empty = (): DocFigureStats => ({
  figures: { total: 0, ai: 0, byKind: { chart: { total: 0, ai: 0 }, gantt: { total: 0, ai: 0 }, prisma: { total: 0, ai: 0 }, conceptMap: { total: 0, ai: 0 } } },
  equations: { total: 0, ai: 0 },
});

/** One pass over the document: figures by class and origin, equations by origin. */
export function docFigureStats(doc: PMNode): DocFigureStats {
  const out = empty();
  doc.descendants((node) => {
    const name = node.type.name;
    if (name === "chart") {
      const kind: FigureKind = KINDS.indexOf(node.attrs.figure) !== -1 ? node.attrs.figure : "chart";
      const ai = node.attrs.origin !== "human";
      out.figures.total++;
      out.figures.byKind[kind].total++;
      if (ai) {
        out.figures.ai++;
        out.figures.byKind[kind].ai++;
      }
      return false;
    }
    if (name === "math" || name === "mathBlock") {
      if (node.marks.some((m) => m.type.name === "provenance" && m.attrs.declaration)) return false;
      out.equations.total++;
      if (node.attrs.origin === "ai") out.equations.ai++;
      return false;
    }
    return true;
  });
  return out;
}

/** Figures of the document (total and AI-assisted), ≡ server `computeFigures`. */
export function docFigures(doc: PMNode): OriginCounts {
  const f = docFigureStats(doc).figures;
  return { total: f.total, ai: f.ai };
}

/** Equations of the document (total and AI-assisted), ≡ server `computeEquations`. */
export function docEquations(doc: PMNode): OriginCounts {
  return docFigureStats(doc).equations;
}

/** The same counts from saved HTML (another tab, or HTML about to be pasted): the server's own functions. */
export function htmlFigureStats(html: string): DocFigureStats {
  return { figures: figureBreakdown(html || ""), equations: computeEquations(html || "") };
}

/** Counts for the integrity display: the live document when it is the Final submission, else nothing (notes tabs). */
export function submissionFigureStats(doc: PMNode, isFinalSubmission: boolean): DocFigureStats {
  return isFinalSubmission ? docFigureStats(doc) : empty();
}
