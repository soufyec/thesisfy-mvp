/**
 * The exact HTML a computed table becomes in the paper, and its word count (docs/papers.md §3.4, §4.5, §4.6, D12).
 * The cost card and the editor both use these functions, so "adds {words} AI-assisted words" equals the AI words
 * the server counts after the save. Pure and client-safe: `import type` from the app, relative runtime imports.
 *
 * `tr` must translate into the artifact's writing language (`artifact.lang`), e.g. on the client
 * `(k, v) => translate(artifact.lang, k, v)` from src/lib/i18n/dictionary.ts, on the server `translator(artifact.lang)`.
 */
import type { Artifact } from "@/lib/db";
import { formatNumber } from "./labels";
import type { Translate } from "./labels";

export function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** A table cell as written in the paper: numbers with the column's decimals in the writing language, null as empty. */
export function artifactCellText(v: string | number | null | undefined, lang: Artifact["lang"], precision: number): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return formatNumber(v, lang, precision);
  return String(v);
}

/** The caption: "{title} (n = {n}). Source: {file}." in the writing language (also the chart's default figcaption). */
export function artifactCaption(a: Pick<Artifact, "title" | "n" | "fileName" | "lang">, tr: Translate): string {
  return tr("data.caption", { title: a.title, n: formatNumber(a.n, a.lang, 0), file: a.fileName });
}

/** Decimals of cell (row i, column j): the cell's own (`cellPrecision`, when a column mixes variables) or its column's. */
export function artifactCellPrecision(t: Pick<Artifact["table"], "precision" | "cellPrecision">, i: number, j: number): number {
  const own = t.cellPrecision && t.cellPrecision[i] ? t.cellPrecision[i][j] : null;
  return own !== null && own !== undefined ? own : t.precision[j] ?? 0;
}

/** The text after "Note.": a test's statistic line first (it is part of the result), then the table's notes. */
export function artifactNoteText(a: Pick<Artifact, "table"> & { test?: Pick<NonNullable<Artifact["test"]>, "line"> }): string {
  const parts: string[] = [];
  if (a.test && a.test.line) parts.push(/[.!?]$/.test(a.test.line) ? a.test.line : `${a.test.line}.`);
  if (a.table.notes && a.table.notes.length) parts.push(a.table.notes.join(" "));
  return parts.join(" ");
}

/**
 * HTML inserted for a table artifact (and for a test: its results table):
 * `<p data-caption="table" style="text-align:center">{caption}</p>` (the editor numbers it "Table n."), then a
 * `<table>` whose first row holds `<th>` headers and whose cells hold one paragraph each, then
 * `<p><em>Note.</em> …</p>` when the artifact has a statistic line or notes. A test's APA line opens the note
 * ("Note. Welch's t(37.2) = 2.31, p = .026, d = 0.71. …"): its words count as AI-assisted like the cells (D27).
 */
export function artifactTableHtml(a: Pick<Artifact, "title" | "n" | "fileName" | "lang" | "table"> & { test?: Pick<NonNullable<Artifact["test"]>, "line"> }, tr: Translate): string {
  let html = `<p data-caption="table" style="text-align:center">${escapeHtml(artifactCaption(a, tr))}</p>${artifactGridHtml(a)}`;
  const note = artifactNoteText(a);
  if (note) html += `<p><em>${escapeHtml(tr("data.notePrefix"))}</em> ${escapeHtml(note)}</p>`;
  return html;
}

/**
 * Only the `<table>` of `artifactTableHtml` (header row and cells, no caption, no note): what selecting the table in
 * the editor, Word or Docs copies. The server keeps one fingerprint of it per artifact next to the whole-table one.
 */
export function artifactGridHtml(a: Pick<Artifact, "lang" | "table">): string {
  const t = a.table;
  const cell = (tag: "th" | "td", text: string) => `<${tag}><p>${escapeHtml(text)}</p></${tag}>`;
  const head = `<tr>${t.columns.map((c) => cell("th", c)).join("")}</tr>`;
  const body = t.rows.map((r, i) => `<tr>${t.columns.map((_, j) => cell("td", artifactCellText(r[j], a.lang, artifactCellPrecision(t, i, j)))).join("")}</tr>`).join("");
  return `<table><tbody>${head}${body}</tbody></table>`;
}

// ---------- Word count ----------
// KEEP IN SYNC with `htmlToWordText` and `countWords` in src/lib/db.ts (the server's counters): same block tags,
// same entity decoding, same split. This copy exists because db.ts is server-only; if the server rule changes,
// change this one in the same commit, or the cost card and the provenance after the save will disagree.

const BLOCK_TAG_RE = /<\/?(?:p|div|h[1-6]|li|ul|ol|br|hr|tr|td|th|thead|tbody|table|blockquote|pre|figure|figcaption|section|header|footer|details|summary)\b[^>]*>/gi;

/** The words of an HTML fragment as the server sees them (block tags separate words, inline tags do not). */
export function artifactText(html: string): string {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(BLOCK_TAG_RE, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Words of the exact HTML inserted (caption, headers, cells and note): the number the cost card shows. */
export function artifactWords(html: string): number {
  const text = artifactText(html.replace(/<figcaption[\s\S]*?<\/figcaption>/gi, " "));
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

/** Cells of a table artifact (header row included), for "({cells} cells)" on the cost card. */
export function artifactCells(a: Pick<Artifact, "table">): number {
  return a.table.columns.length * (a.table.rows.length + 1);
}
