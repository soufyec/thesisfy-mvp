/**
 * Why an uploaded file was refused (docs/papers.md §3.3). The routes turn each code into a translated message
 * (`library.error.*`) and an HTTP status; see `uploadFail` in library.ts.
 */
export type IngestErrorCode =
  /** .xls .doc .xlsb .numbers .ods, or an old binary Office file renamed to .xlsx/.docx. */
  | "legacy_format"
  /** Any other kind of file, or an extension that does not match the bytes. */
  | "unsupported_type"
  /** Larger than the upload limit, or expands to more than the parsers read. */
  | "too_large"
  /** Password-protected Office file or PDF, or an encrypted ZIP entry. */
  | "encrypted"
  /** No bytes, or a sheet without any data row. */
  | "empty"
  /** A document without text. */
  | "no_text"
  /** Broken or truncated archive, malformed or DTD-bearing XML, binary data in a text file. */
  | "unreadable";

export class IngestError extends Error {
  code: IngestErrorCode;
  /** "no_room": the sheet has data but the cell budget left in the library cannot hold one row of it. */
  detail?: "no_room";
  constructor(code: IngestErrorCode, message?: string, detail?: "no_room") {
    super(message || code);
    this.code = code;
    this.name = "IngestError";
    if (detail) this.detail = detail;
  }
}

export const isIngestError = (e: unknown): e is IngestError => e instanceof IngestError || (!!e && typeof e === "object" && (e as { name?: string }).name === "IngestError");
