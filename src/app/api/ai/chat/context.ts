/**
 * What a copilot message brings with it (docs/papers.md §3.5): the sources attached to it (`sourceIds`), split into
 * spreadsheets (data cards and computed artifacts) and documents (passages labelled [P1]…), and the library sources
 * "Use my sources" searches. Only sources of the paper's owner that are linked to the paper count; other ids are
 * ignored. Server-only (data layer).
 */
import { db } from "@/lib/db";
import type { Thesis, ThesisSource } from "@/lib/db";
import { retrieve } from "@/lib/sources/retrieve";
import { splitSentences } from "@/lib/sources/chunk";
import { MAX_PRIMARY_WHOLE_CHARS } from "@/lib/ai/prompts";
import type { PromptPassage } from "@/lib/ai/prompts";
import type { SheetAttachment } from "./artifacts";

/** Sources one message may attach (the per-paper cap of primary sources). */
export const MAX_ATTACHMENTS = 20;
/** Passages retrieved from attached documents when they are too long to send whole. */
export const PRIMARY_PASSAGES = 8;

export interface ChatAttachments {
  /** Accepted source ids, in the order the client sent them. */
  ids: string[];
  sheets: SheetAttachment[];
  documents: ThesisSource[];
  /** For `meta.attachments`. */
  view: { sourceId: string; file: string; kind: "sheet" | "document" }[];
}

export const fileNameOf = (s: Pick<ThesisSource, "file" | "title">): string => (s.file?.name || s.title || "file").slice(0, 200);

/** The attached sources the server accepts: the paper owner's, linked to this paper, with a dataset for sheets. */
export function chatAttachments(thesis: Thesis | null | undefined, sourceIds: unknown): ChatAttachments {
  const out: ChatAttachments = { ids: [], sheets: [], documents: [], view: [] };
  if (!thesis || !Array.isArray(sourceIds)) return out;
  const seen = new Set<string>();
  // Linked to this paper (also through the legacy `thesisId` field, as `db.sources.list` reads it).
  const linked = new Map(db.sources.list(thesis.id).map((s) => [s.id, s]));
  for (const id of sourceIds) {
    if (typeof id !== "string" || seen.has(id) || out.ids.length >= MAX_ATTACHMENTS) continue;
    seen.add(id);
    const s = linked.get(id);
    if (!s || s.ownerId !== thesis.studentId) continue;
    const file = fileNameOf(s);
    if (s.kind === "sheet") {
      const dataset = (s.datasetId && db.datasets.findById(s.datasetId)) || db.datasets.findBySource(s.id);
      if (!dataset || !dataset.sheets.length) continue;
      out.sheets.push({ sourceId: s.id, fileName: file, dataset });
      out.view.push({ sourceId: s.id, file, kind: "sheet" });
    } else {
      out.documents.push(s);
      out.view.push({ sourceId: s.id, file, kind: "document" });
    }
    out.ids.push(s.id);
  }
  return out;
}

export interface PrimaryPassage extends PromptPassage {
  sourceId: string;
  file: string;
}

/**
 * Passages of the attached documents for the model: every document whole when all of them fit in 24 000
 * characters; otherwise the best 8 chunks for the question (BM25, even when "Use my sources" is off), or, when
 * nothing matches lexically, the opening chunks of each document. Labelled P1, P2… in order.
 */
export function primaryPassages(thesis: Thesis, query: string, documents: ThesisSource[]): PrimaryPassage[] {
  if (!documents.length) return [];
  const byId = new Map(documents.map((d) => [d.id, d]));
  const total = documents.reduce((n, d) => n + (d.text || "").trim().length, 0);
  let picked: Omit<PrimaryPassage, "ref">[] = [];
  if (total > 0 && total <= MAX_PRIMARY_WHOLE_CHARS) {
    picked = documents.filter((d) => (d.text || "").trim()).map((d) => ({ sourceId: d.id, file: fileNameOf(d), label: fileNameOf(d), text: (d.text || "").trim() }));
  } else {
    const hits = retrieve(thesis.id, query, PRIMARY_PASSAGES, documents.map((d) => d.id));
    picked = hits.map((p) => {
      const d = byId.get(p.sourceId);
      const file = d ? fileNameOf(d) : p.title;
      return { sourceId: p.sourceId, file, label: `${file}${p.page ? `, p. ${p.page}` : ""}`, section: p.section, text: p.text };
    });
    if (!picked.length) {
      // Nothing matched lexically ("what themes come up?"): the opening of each document, within the same budget.
      const per = Math.max(1, Math.floor(PRIMARY_PASSAGES / documents.length));
      for (const d of documents) {
        for (const c of db.sourceChunks.listBySource(d.id).slice(0, per)) {
          if (picked.length >= PRIMARY_PASSAGES) break;
          picked.push({ sourceId: d.id, file: fileNameOf(d), label: `${fileNameOf(d)}${c.page ? `, p. ${c.page}` : ""}`, section: c.section, text: c.text });
        }
      }
    }
  }
  return picked.map((p, i) => ({ ...p, ref: `P${i + 1}` }));
}

/** "Used {n} passages from {file}": passages per attached document, for `meta.groundedFiles`. */
export function passagesPerFile(passages: PrimaryPassage[]): { sourceId: string; file: string; passages: number }[] {
  const out: { sourceId: string; file: string; passages: number }[] = [];
  for (const p of passages) {
    const row = out.find((r) => r.sourceId === p.sourceId);
    if (row) row.passages++;
    else out.push({ sourceId: p.sourceId, file: p.file, passages: 1 });
  }
  return out;
}

/** The first sentence of a passage, for the demo answer. */
export function firstSentence(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return (splitSentences(t)[0] || t).slice(0, 300);
}

/**
 * Sources "Use my sources" searches: the literature linked to the paper. Spreadsheets (their data card is not
 * literature), primary sources and the documents attached to this message (sent as [P…] passages) are left out.
 */
export function librarySourceIds(thesis: Thesis, exclude: string[] = []): string[] {
  const skip = new Set(exclude);
  return db.sources
    .list(thesis.id)
    .filter((s) => s.kind !== "sheet" && s.role !== "primary" && !skip.has(s.id))
    .map((s) => s.id);
}
