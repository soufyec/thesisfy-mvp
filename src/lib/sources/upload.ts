/**
 * Uploaded files (docs/papers.md §3.3, D10): what a file is, and what Thesisfic reads from it.
 *
 * - `detectUpload` decides the type from the extension AND the bytes (`PK\x03\x04` for .docx/.xlsx, `%PDF` for
 *   .pdf, no binary data for .csv/.tsv/.txt/.md). The browser's MIME type is only a hint, used when the name has no
 *   extension (Windows sends `application/vnd.ms-excel` for .csv). Old binary Office files and other spreadsheet
 *   formats are `legacy_format`; a password-protected .docx/.xlsx (an OLE container holding `EncryptedPackage`) is
 *   `encrypted`.
 * - `parseUpload` reads a detected file: sheets (.xlsx, .csv, .tsv) become dataset sheets within a cell budget;
 *   .docx, .txt and .md become text; PDFs go through `extractFromPdf` (a scanned PDF still comes back, as `no_text`).
 * Failures are `IngestError`s, turned into translated messages by the routes.
 */
import { createHash } from "crypto";
import type { DatasetSheet, SourceKind } from "@/lib/db";
import { extractFromPdf, type Extracted } from "./extract";
import { decodeText, looksBinary, readCsv } from "./csv";
import { extractFromDocx, parseXlsx } from "./ooxml";
import { buildSheets } from "./sheets";
import { IngestError } from "./errors";
import { looksLikeZip } from "./zip";
import { MAX_DATASET_CELLS } from "./caps";

export type UploadType = "pdf" | "docx" | "xlsx" | "csv" | "tsv" | "txt" | "md";

export const UPLOAD_TYPES: UploadType[] = ["pdf", "docx", "xlsx", "csv", "tsv", "txt", "md"];
/** Formats Thesisfic names explicitly when refusing them. */
export const LEGACY_EXTENSIONS = ["xls", "doc", "xlsb", "numbers", "ods"];

/** Sheets are always primary data. */
export const SHEET_TYPES: UploadType[] = ["xlsx", "csv", "tsv"];

/** The MIME type stored for each type (the browser's is not trusted). */
export const UPLOAD_MIME: Record<UploadType, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  txt: "text/plain",
  md: "text/markdown",
};

/** Source kind of each upload type. */
export const UPLOAD_KIND: Record<UploadType, SourceKind> = { pdf: "pdf", docx: "docx", xlsx: "sheet", csv: "sheet", tsv: "sheet", txt: "text", md: "text" };

const MIME_HINT: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
  "application/csv": "csv",
  "text/tab-separated-values": "tsv",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/x-markdown": "md",
  "application/msword": "doc",
  "application/vnd.ms-excel": "xls",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "application/vnd.apple.numbers": "numbers",
  "application/vnd.ms-excel.sheet.binary.macroenabled.12": "xlsb",
};

const EXT_ALIASES: Record<string, string> = { markdown: "md", text: "txt" };

/** Lower-case extension of a file name ("" when none). */
export function extensionOf(name: string): string {
  const base = String(name || "").split(/[\\/]/).pop() || "";
  const i = base.lastIndexOf(".");
  if (i <= 0 || i === base.length - 1) return "";
  const ext = base.slice(i + 1).toLowerCase();
  return EXT_ALIASES[ext] || ext;
}

/** File name without its extension (for titles and sheet names). */
export function baseName(name: string): string {
  const base = String(name || "").split(/[\\/]/).pop() || "";
  const i = base.lastIndexOf(".");
  return (i > 0 ? base.slice(0, i) : base).trim();
}

const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function isCfb(b: Uint8Array): boolean {
  if (b.length < 8) return false;
  for (let i = 0; i < 8; i++) if (b[i] !== CFB_MAGIC[i]) return false;
  return true;
}

function isPdf(b: Uint8Array): boolean {
  return Buffer.from(b.buffer, b.byteOffset, Math.min(b.length, 1024)).toString("latin1").indexOf("%PDF-") !== -1;
}

/** An encrypted .docx/.xlsx is an OLE container with an `EncryptedPackage` stream (its name is stored in UTF-16LE). */
function hasEncryptedPackage(b: Uint8Array): boolean {
  const needle = Buffer.from("EncryptedPackage", "utf16le");
  return Buffer.from(b.buffer, b.byteOffset, b.length).indexOf(needle) !== -1;
}

export type Detected = { ok: true; type: UploadType } | { ok: false; code: "legacy_format" | "unsupported_type" | "encrypted" | "empty" | "unreadable"; ext: string };

/** See the module comment. `name` and `mime` come from the browser; `bytes` decide. */
export function detectUpload(name: string, mime: string, bytes: Uint8Array): Detected {
  let ext = extensionOf(name);
  if (!ext) {
    ext = MIME_HINT[String(mime || "").split(";")[0].trim().toLowerCase()] || "";
    // Windows labels CSV files application/vnd.ms-excel: without an extension, text bytes mean CSV.
    if (ext === "xls" && bytes.length && !isCfb(bytes) && !looksLikeZip(bytes) && !looksBinary(bytes)) ext = "csv";
  }
  if (LEGACY_EXTENSIONS.indexOf(ext) !== -1) return { ok: false, code: "legacy_format", ext };
  if ((UPLOAD_TYPES as string[]).indexOf(ext) === -1) return { ok: false, code: "unsupported_type", ext };
  const type = ext as UploadType;
  if (!bytes.length) return { ok: false, code: "empty", ext };
  if (type === "pdf") return isPdf(bytes) ? { ok: true, type } : { ok: false, code: "unreadable", ext };
  if (type === "docx" || type === "xlsx") {
    if (isCfb(bytes)) return { ok: false, code: hasEncryptedPackage(bytes) ? "encrypted" : "legacy_format", ext: type === "docx" ? "doc" : "xls" };
    return looksLikeZip(bytes) ? { ok: true, type } : { ok: false, code: "unreadable", ext };
  }
  // Text formats: an Office file, a PDF or binary data renamed to .csv/.txt is not text.
  if (looksLikeZip(bytes) || isCfb(bytes) || isPdf(bytes)) return { ok: false, code: "unsupported_type", ext };
  if (looksBinary(bytes)) return { ok: false, code: "unreadable", ext };
  return { ok: true, type };
}

export const sha256Hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export type ParsedUpload =
  /** `sheetsCut`: sheets of the file not read because of the sheet cap (D10, `MAX_SHEETS`). */
  | { kind: "sheet"; sheets: DatasetSheet[]; cells: number; sheetsCut: number }
  | { kind: "pdf" | "docx" | "text"; extracted: Extracted };

/**
 * Reads a detected upload. Sheets are cut to `cellBudget` cells (D10); a sheet file without any data row is
 * `empty`, a document without text `no_text`. Throws `IngestError`.
 */
export async function parseUpload(type: UploadType, bytes: Buffer, name: string, cellBudget: number = MAX_DATASET_CELLS): Promise<ParsedUpload> {
  if (type === "xlsx" || type === "csv" || type === "tsv") {
    const xlsx = type === "xlsx" ? parseXlsx(bytes, { cellBudget }) : null;
    const raws = xlsx ? xlsx.sheets : [readCsv(bytes, baseName(name) || "Sheet 1", { tab: type === "tsv", cellBudget }).sheet];
    const built = buildSheets(raws, cellBudget);
    if (!built.sheets.length) throw built.noRoom ? new IngestError("too_large", "No room for one row", "no_room") : new IngestError("empty", "No data rows");
    return { kind: "sheet", sheets: built.sheets, cells: built.cells, sheetsCut: built.sheetsCut + (xlsx ? xlsx.sheetsLeft : 0) };
  }
  if (type === "docx") {
    const extracted = extractFromDocx(bytes);
    if (extracted.status !== "parsed") throw new IngestError("no_text");
    return { kind: "docx", extracted };
  }
  if (type === "txt" || type === "md") {
    const text = decodeText(bytes).text.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
    if (!text) throw new IngestError("no_text");
    return { kind: "text", extracted: { text, pages: [text], pageCount: 0, status: "parsed" } };
  }
  const extracted = await extractFromPdf(bytes);
  if (extracted.status === "failed") {
    const encrypted = /password|encrypt/i.test(extracted.reason || "") || bytes.indexOf("/Encrypt") !== -1;
    if (encrypted) throw new IngestError("encrypted");
    throw new IngestError("unreadable", extracted.reason);
  }
  return { kind: "pdf", extracted };
}
