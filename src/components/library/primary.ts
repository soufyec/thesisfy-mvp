"use client";

import type { DatasetSummary, SourceFile, SourceKind, SourceRole } from "@/components/editor/types";
import type { Translate } from "@/lib/i18n/dictionary";

/**
 * Primary data and uploaded files on the client (docs/papers.md §3.3, §4.5, §4.7): what the library page, the editor's
 * Sources panel, the tutor's card and the assistant's attach menu say about a file, with the same words everywhere
 * (principle 2). Strings live in `library.ui.*` (messages/library.ts).
 */

/** Upload cap of the server (`MAX_UPLOAD_BYTES` in src/lib/sources/library.ts): checked here before sending. */
export const MAX_UPLOAD_MB = 4;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
/** File extensions the server reads. Extensions, not MIME types: Windows labels CSV files as Excel. */
export const UPLOAD_ACCEPT = ".pdf,.docx,.xlsx,.csv,.tsv,.txt,.md";
const SHEET_EXT = ["xlsx", "csv", "tsv"];
const DOC_EXT = ["pdf", "docx", "txt", "md"];

/** The fields of a source the primary-data helpers read (library view and thesis view both carry them). */
export interface PrimaryLike {
  kind: SourceKind;
  role?: SourceRole;
  file?: SourceFile;
  dataset?: DatasetSummary;
  wordCount: number;
  pages?: number;
  parseStatus?: "pending" | "parsed" | "no_text" | "failed";
}

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name || "");
  return m ? m[1].toLowerCase() : "";
}

/** A spreadsheet the server always stores as primary data. */
export function isSheetName(name: string): boolean {
  return SHEET_EXT.indexOf(extensionOf(name)) !== -1;
}

export function isReadableName(name: string): boolean {
  const ext = extensionOf(name);
  return SHEET_EXT.indexOf(ext) !== -1 || DOC_EXT.indexOf(ext) !== -1;
}

export function isPrimary(s: Pick<PrimaryLike, "role" | "kind">): boolean {
  return s.role === "primary" || s.kind === "sheet";
}

/** "Spreadsheet · CSV", "Word document", "PDF", "Text file"… for a file; null for DOI, URL and pasted text. */
export function fileTypeLabel(s: Pick<PrimaryLike, "kind" | "file">, t: Translate): string | null {
  const ext = s.file ? extensionOf(s.file.name) : "";
  if (s.kind === "sheet") return t("library.ui.type.sheet", { ext: (ext || "xlsx").toUpperCase() });
  if (s.kind === "docx") return t("library.ui.type.docx");
  if (s.kind === "pdf") return t("library.ui.type.pdf");
  if (s.file && (ext === "txt" || ext === "md")) return t(ext === "md" ? "library.ui.type.md" : "library.ui.type.txt");
  return null;
}

type NumberFormat = (n: number) => string;

/**
 * What Thesisfic read in a file, as one line: "Read as: 1 sheet · 132 rows · 6 columns (header on row 1)",
 * "Read as: 12 pages · 2,340 words". Null while the file is still being read or when there is nothing to say.
 */
export function readAsSummary(s: PrimaryLike, t: Translate, num: NumberFormat): string | null {
  if (s.parseStatus === "failed") return t("library.ui.readAs.failed");
  if (s.kind === "sheet" && s.dataset && s.dataset.sheets.length) {
    const sheets = s.dataset.sheets;
    const rows = sheets.reduce((n, x) => n + x.rowCount, 0);
    const parts = [sheets.length === 1 ? t("library.ui.readAs.sheet_one") : t("library.ui.readAs.sheets", { n: num(sheets.length) }), rows === 1 ? t("library.ui.readAs.row_one") : t("library.ui.readAs.rows", { n: num(rows) })];
    if (sheets.length === 1) {
      const cols = sheets[0].columns.length;
      parts.push(cols === 1 ? t("library.ui.readAs.column_one") : t("library.ui.readAs.columns", { n: num(cols) }));
      const header = sheets[0].headerRow > 0 ? t("library.ui.readAs.headerRow", { n: num(sheets[0].headerRow) }) : t("library.ui.readAs.noHeader");
      return t("library.ui.readAs", { summary: `${parts.join(" · ")} ${header}` });
    }
    return t("library.ui.readAs", { summary: parts.join(" · ") });
  }
  if (s.kind === "sheet") return null;
  if (!s.wordCount) return s.parseStatus === "no_text" ? t("library.ui.readAs.noText") : null;
  const parts: string[] = [];
  if (s.pages) parts.push(s.pages === 1 ? t("library.ui.readAs.page_one") : t("library.ui.readAs.pages", { n: num(s.pages) }));
  parts.push(s.wordCount === 1 ? t("common.word_one") : t("common.words", { n: num(s.wordCount) }));
  return t("library.ui.readAs", { summary: parts.join(" · ") });
}

/** Notes when Thesisfic kept only part of a spreadsheet: rows cut at the caps, sheets left out. */
export function cutNotes(s: Pick<PrimaryLike, "dataset">, t: Translate, num: NumberFormat): string[] {
  const out: string[] = [];
  const d = s.dataset;
  if (!d) return out;
  const cut = d.sheets.filter((x) => x.truncated);
  if (cut.length === 1 && d.sheets.length === 1) out.push(t("library.ui.note.truncated"));
  else if (cut.length) out.push(t("library.ui.note.truncatedSheets", { list: cut.map((x) => x.name).join(", ") }));
  if (d.sheetsCut) out.push(d.sheetsCut === 1 ? t("library.ui.note.sheetsCut_one") : t("library.ui.note.sheetsCut", { n: num(d.sheetsCut) }));
  return out;
}

/**
 * The privacy sentences shown before a file is read on Thesisfic's servers: what the assistant receives (by type),
 * then where the file is kept and who sees it. `where`: attached in the assistant (a primary source of this paper) or
 * added from a library form (kept in the library, seen by the teacher of each paper that uses it).
 */
export function privacyLines(sheet: boolean, t: Translate, where: "assistant" | "library" = "library"): string[] {
  return [t(sheet ? "library.ui.privacy.sheet" : "library.ui.privacy.document"), t(where === "assistant" ? "library.ui.privacy.common" : "library.ui.privacy.library")];
}

/**
 * An upload error in words the student can act on. The server translates its refusals; a 413 without a JSON body
 * (the hosting platform cut the request before Thesisfic saw it) becomes `too_large`.
 */
export function uploadErrorText(e: unknown, t: Translate): string {
  const err = e as { message?: string; status?: number; code?: string; body?: { error?: string; code?: string } } | null;
  const status = err?.status;
  const code = err?.code || err?.body?.code;
  const message = (err?.body ? err.body.error : err?.message) || "";
  // A refusal the platform sent before Thesisfic saw the request has no code (and often an HTML body).
  if (status === 413 && !code) return t("library.error.tooLarge", { max: MAX_UPLOAD_MB });
  // Thesisfic's refusals arrive translated; anything else (no answer, an HTML page, "Request failed (500)") is generic.
  if (message && !/^Request failed/.test(message) && message.indexOf("<") === -1 && message.length < 400) return message;
  return t("library.ui.uploadFailed");
}

/** Client checks before any upload: readable extension and the 4 MB cap. Returns the error text, or null. */
export function checkUpload(file: File, t: Translate): string | null {
  if (["xls", "doc", "xlsb", "numbers", "ods", "odt", "pages"].indexOf(extensionOf(file.name)) !== -1) return t("library.error.legacyFormat");
  if (!isReadableName(file.name)) return t("library.error.unsupportedType");
  if (file.size > MAX_UPLOAD_BYTES) return t("library.error.tooLarge", { max: MAX_UPLOAD_MB });
  return null;
}

/** Short form for a chip: "132 rows · 6 columns", "2,340 words". Null while the file is being read. */
export function compactSummary(s: PrimaryLike, t: Translate, num: NumberFormat): string | null {
  if (s.parseStatus === "failed") return t("library.ui.readAs.failed");
  if (s.kind === "sheet") {
    const sheets = s.dataset?.sheets || [];
    if (!sheets.length) return null;
    const rows = sheets.reduce((n, x) => n + x.rowCount, 0);
    const rowText = rows === 1 ? t("library.ui.readAs.row_one") : t("library.ui.readAs.rows", { n: num(rows) });
    if (sheets.length > 1) return `${t("library.ui.readAs.sheets", { n: num(sheets.length) })} · ${rowText}`;
    const cols = sheets[0].columns.length;
    return `${rowText} · ${cols === 1 ? t("library.ui.readAs.column_one") : t("library.ui.readAs.columns", { n: num(cols) })}`;
  }
  if (!s.wordCount) return null;
  return s.wordCount === 1 ? t("common.word_one") : t("common.words", { n: num(s.wordCount) });
}
