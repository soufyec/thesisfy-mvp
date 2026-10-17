import type { Thesis } from "@/lib/db";
import { htmlToText } from "@/lib/sources/extract";

export const MAX_DOCUMENT_CHARS = 60000;
export interface EditorDocumentSnapshot { tabId: string; text: string }
export interface DocumentContext { title: string; text: string; partial: boolean; totalChars: number; live: boolean }

/** The authorized paper only. Owner snapshots include unsaved editor changes; other viewers use saved content. */
export function documentContext(thesis: Thesis, snapshot: unknown, owner: boolean, query: string): DocumentContext {
  const candidate = snapshot && typeof snapshot === "object" ? snapshot as Partial<EditorDocumentSnapshot> : undefined;
  const live = owner && typeof candidate?.tabId === "string" && typeof candidate.text === "string";
  const tab = candidate?.tabId !== "submission" ? thesis.tabs?.find(t => t.id === candidate?.tabId) : undefined;
  const title = live ? (candidate.tabId === "submission" ? "Final submission" : tab?.title || "Open editor tab") : "Final submission";
  const text = (live ? candidate.text! : htmlToText(thesis.content || "")).replace(/\r\n?/g, "\n").trim();
  if (text.length <= MAX_DOCUMENT_CHARS) return { title, text, partial: false, totalChars: text.length, live };
  // Bound provider input while retaining opening, ending and passages matching this turn, including later sections.
  const size = 4000;
  const terms = Array.from(new Set(query.toLocaleLowerCase().match(new RegExp("[\\p{L}\\p{N}]{3,}", "gu")) || [])).slice(0, 80);
  const chunks: { index: number; text: string; score: number }[] = [];
  for (let start = 0; start < text.length; start += size) {
    const passage = text.slice(start, start + size);
    const lower = passage.toLocaleLowerCase();
    chunks.push({ index: chunks.length, text: passage, score: terms.reduce((n, term) => n + (lower.includes(term) ? 1 : 0), 0) });
  }
  const selected = new Set([0, 1, chunks.length - 1]);
  for (const chunk of [...chunks].sort((a, b) => b.score - a.score || a.index - b.index)) {
    if (selected.size >= 14) break;
    selected.add(chunk.index);
  }
  return { title, totalChars: text.length, live, partial: true, text: chunks.filter(c => selected.has(c.index)).map(c => `[Document characters ${c.index * size + 1}–${Math.min((c.index + 1) * size, text.length)}]\n${c.text}`).join("\n\n[… omitted …]\n\n") };
}
