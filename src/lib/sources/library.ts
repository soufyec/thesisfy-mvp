/**
 * The student's personal library of sources and references: shared by `/api/library/*` and the thesis-scoped
 * `/api/theses/[id]/sources` routes, so extraction, indexing, caps, lock rules and views exist once.
 *
 * - A source (`ThesisSource`) is full text the assistant can quote. It belongs to `ownerId` and is linked to the
 *   theses in `thesisIds` (always theses of the same owner).
 * - A source is primary data (`role: "primary"`: the student's own data, transcripts, field notes; sheets always) or
 *   literature (absent or "secondary"). Each role has its own caps (docs/papers.md §1.3, D10).
 * - Uploaded files (.pdf .docx .xlsx .csv .tsv .txt .md, ≤ 4 MB) are detected by extension and bytes, deduplicated by
 *   SHA-256 within the library, parsed before anything is written, then stored: a sheet as a column-major dataset
 *   plus its D11 data card as the indexed text, a document as its text. The file itself is never kept.
 * - A reference (`LibraryReference`) is a bibliographic entry. `thesis.references` stays the per-thesis list; a library
 *   reference is linked to a thesis iff that list holds the same id (see `db.libraryReferences`).
 * - Theses that are approved or submitted are locked: no link can be added to or removed from them.
 */

import { NextResponse } from "next/server";
import { db, LibraryReference, Reference, Thesis, thesisCopyOf, ThesisSource, uid, User } from "@/lib/db";
import type { SourceRole } from "@/lib/db";
import { json } from "@/lib/api";
import type { Translate } from "@/lib/i18n/dictionary";
import { normalizeDoi } from "@/lib/scholar";
import { dataCard } from "@/lib/data/summarize";
import { extractFromDoi, extractFromUrl, Extracted } from "./extract";
import { chunkText, wordCount } from "./chunk";
import { librarySourceView, LibrarySourceView } from "./retrieve";
import { thesisCitationCounts } from "./cited";
import {
  MAX_CELL_CHARS,
  MAX_COLUMNS,
  MAX_DATASET_CELLS,
  MAX_LIBRARY_CELLS,
  MAX_PRIMARY_PER_LIBRARY,
  MAX_PRIMARY_PER_THESIS,
  MAX_SHEETS,
  MAX_SOURCES_PER_LIBRARY,
  MAX_SOURCES_PER_THESIS,
  MAX_TEXT_CHARS,
  MAX_UPLOAD_BYTES,
} from "./caps";
import { IngestErrorCode, isIngestError } from "./errors";
import { baseName, detectUpload, parseUpload, ParsedUpload, sha256Hex, SHEET_TYPES, UPLOAD_KIND, UPLOAD_MIME, UploadType } from "./upload";

export {
  MAX_CELL_CHARS,
  MAX_COLUMNS,
  MAX_DATASET_CELLS,
  MAX_LIBRARY_CELLS,
  MAX_PRIMARY_PER_LIBRARY,
  MAX_PRIMARY_PER_THESIS,
  MAX_SHEETS,
  MAX_SOURCES_PER_LIBRARY,
  MAX_SOURCES_PER_THESIS,
  MAX_TEXT_CHARS,
  MAX_UPLOAD_BYTES,
};

export type LibraryErrorCode = "locked" | "cited" | "thesis_cap" | "library_cap" | "duplicate" | "conflict" | "owner_only" | IngestErrorCode;

/** A refused request, already shaped as the response `{ error, code?, ...extra }`. */
export interface Fail {
  fail: NextResponse;
}

export function fail(message: string, status = 400, code?: LibraryErrorCode, extra?: Record<string, unknown>): Fail {
  return { fail: json({ error: message, ...(code ? { code } : {}), ...(extra || {}) }, status) };
}

export const isFail = (v: unknown): v is Fail => !!v && typeof v === "object" && "fail" in (v as Record<string, unknown>);

const UPLOAD_ERROR: Record<IngestErrorCode, { key: string; status: number }> = {
  legacy_format: { key: "library.error.legacyFormat", status: 415 },
  unsupported_type: { key: "library.error.unsupportedType", status: 415 },
  too_large: { key: "library.error.tooLarge", status: 413 },
  encrypted: { key: "library.error.encrypted", status: 422 },
  empty: { key: "library.error.empty", status: 422 },
  no_text: { key: "library.error.noText", status: 422 },
  unreadable: { key: "library.error.unreadable", status: 422 },
};

/**
 * A refused upload: `{ error: <translated>, code }`. `stage` "parse" words two codes for what was found inside the
 * file: `too_large` (it expands past what Thesisfic reads, 422) and `empty` (a sheet without data rows).
 */
export function uploadFail(code: IngestErrorCode, tr: Translate, stage: "upload" | "parse" = "upload"): Fail {
  const e = UPLOAD_ERROR[code];
  if (stage === "parse" && code === "too_large") return fail(tr("library.error.expandsTooLarge"), 422, code);
  if (stage === "parse" && code === "empty") return fail(tr("library.error.noRows"), 422, code);
  return fail(tr(e.key, { max: Math.round(MAX_UPLOAD_BYTES / (1024 * 1024)) }), e.status, code);
}

// ---------------------------------------------------------------------------------------------------------------------
// Theses: ownership, lock, caps
// ---------------------------------------------------------------------------------------------------------------------

/** Approved and submitted theses are locked, as in the editor (`canEdit`). */
export function isLocked(t: Pick<Thesis, "status">) {
  return t.status === "approved" || t.status === "submitted";
}

export function lockedFail(t: Pick<Thesis, "title">, tr: Translate) {
  return fail(tr("library.error.locked", { title: t.title }), 409, "locked");
}

export function thesisCapFail(t: Pick<Thesis, "title">, tr: Translate, role: SourceRole = "secondary") {
  if (role === "primary") return fail(tr("library.error.primaryThesisCap", { max: MAX_PRIMARY_PER_THESIS, title: t.title }), 409, "thesis_cap");
  return fail(tr("library.error.thesisCap", { max: MAX_SOURCES_PER_THESIS, title: t.title }), 409, "thesis_cap");
}

export function libraryCapFail(tr: Translate, role: SourceRole = "secondary") {
  if (role === "primary") return fail(tr("library.error.primaryLibraryCap", { max: MAX_PRIMARY_PER_LIBRARY }), 409, "library_cap");
  return fail(tr("library.error.libraryCap", { max: MAX_SOURCES_PER_LIBRARY }), 409, "library_cap");
}

/** The library cannot hold more cells of data (`MAX_LIBRARY_CELLS`). */
export function dataCapFail(tr: Translate) {
  return fail(tr("library.error.dataCap", { max: MAX_LIBRARY_CELLS }), 409, "library_cap");
}

/** Role of a source: "primary", or "secondary" (also when absent). */
export function roleOf(s: Pick<ThesisSource, "role">): SourceRole {
  return s.role === "primary" ? "primary" : "secondary";
}

/** Sources of a list with that role (the 40/150 caps count secondary sources only, the 20/60 caps primary ones). */
export function countRole(list: Pick<ThesisSource, "role">[], role: SourceRole): number {
  let n = 0;
  for (const s of list) if (roleOf(s) === role) n++;
  return n;
}

/** Fails when the owner's library holds the maximum of sources with this role. */
export function libraryRoleCap(ownerId: string, role: SourceRole, tr: Translate): Fail | null {
  const n = countRole(db.sources.listByOwner(ownerId), role);
  if (role === "primary" ? n >= MAX_PRIMARY_PER_LIBRARY : n >= MAX_SOURCES_PER_LIBRARY) return libraryCapFail(tr, role);
  return null;
}

/**
 * Validates a `thesisIds` input against the caller's own theses: absent means none; anything but an array of strings
 * (null, a string) is refused, so a malformed body never reads as "unlink from every thesis". The multipart field of
 * `POST /api/library/sources` arrives here already split (see `readSourceInput`).
 * Unknown ids and theses of someone else are both "not found", so nothing leaks about other students' work.
 */
export function resolveOwnTheses(user: User, raw: unknown, tr: Translate): Thesis[] | Fail {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return fail(tr("library.error.thesisIds"), 400);
  const out: Thesis[] = [];
  for (const v of raw as unknown[]) {
    if (typeof v !== "string") return fail(tr("library.error.thesisIds"), 400);
    const id = v.trim();
    if (!id || out.some((t) => t.id === id)) continue;
    const t = db.theses.findById(id);
    if (!t || t.studentId !== user.id) return fail(tr("library.error.thesisNotFound"), 404);
    out.push(t);
  }
  return out;
}

/** The theses of the owner, as the library page lists them. */
export function libraryTheses(ownerId: string) {
  return db.theses.getByStudent(ownerId).map((t) => ({ id: t.id, title: t.title, status: t.status, citationStyle: t.citationStyle, locked: isLocked(t) }));
}

// ---------------------------------------------------------------------------------------------------------------------
// Sources: input, creation, extraction and indexing
// ---------------------------------------------------------------------------------------------------------------------

interface Given {
  title?: string;
  authors?: string;
  year?: string;
  /** Asked for by the client; sheets are always primary whatever is sent. */
  role?: SourceRole;
}

/** An uploaded file, already detected and hashed; the bytes live only for the request. */
export interface UploadInput {
  type: UploadType;
  /** File name as sent (without folders), at most 200 characters. */
  name: string;
  /** MIME type of the detected type (the browser's is not trusted). */
  mime: string;
  bytes: Buffer;
  sha256: string;
}

export type FileSourceInput = { kind: "file"; upload: UploadInput } & Given;

export type SourceInput =
  | FileSourceInput
  | ({ kind: "doi"; doi: string } & Given)
  | ({ kind: "url"; url: string } & Given)
  | ({ kind: "text"; text: string } & Given);

function str(v: unknown) {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** `role` field: absent → undefined; "primary"/"secondary" → that; anything else → null (refused). */
function parseRole(v: unknown): SourceRole | undefined | null {
  if (v === undefined || v === null || v === "") return undefined;
  return v === "primary" || v === "secondary" ? v : null;
}

/** A multipart request: the 4 MB file plus room for the other fields and the multipart framing. */
const MAX_MULTIPART_BYTES = MAX_UPLOAD_BYTES + 256 * 1024;

/** The request body, or null as soon as it passes `limit` bytes (the rest is not read). */
async function readBodyBounded(request: Request, limit: number): Promise<ArrayBuffer | null> {
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limit) {
      reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new ArrayBuffer(total);
  const view = new Uint8Array(out);
  let at = 0;
  for (const c of chunks) {
    view.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/**
 * Reads a source from the request: multipart with a `file` (.pdf .docx .xlsx .csv .tsv .txt .md, ≤ 4 MB; optional
 * title, authors, year, role) or JSON `{ kind: "doi" | "url" | "text", value, title?, authors?, year?, role? }`.
 * `thesisIds` is returned for the library route to validate: the JSON value as sent, or the multipart field
 * (repeated or comma-separated) as an array of ids. Files are detected, size-checked and hashed here; refusals carry
 * a code (`legacy_format` 415, `unsupported_type` 415, `too_large` 413, `encrypted`/`empty`/`unreadable` 422).
 */
export async function readSourceInput(request: Request, tr: Translate): Promise<{ input: SourceInput; thesisIds: unknown } | Fail> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > MAX_MULTIPART_BYTES) return uploadFail("too_large", tr);
    // The body is read with a byte counter whatever the headers say (a chunked request has no Content-Length), so a
    // request larger than the cap is refused before it is held in memory or parsed.
    const raw = await readBodyBounded(request, MAX_MULTIPART_BYTES).catch(() => undefined);
    if (raw === null) return uploadFail("too_large", tr);
    const form = raw ? await new Response(raw, { headers: { "content-type": contentType } }).formData().catch(() => null) : null;
    const file = form?.get("file");
    if (!file || typeof file === "string") return fail(tr("library.error.attachFile"));
    if (file.size > MAX_UPLOAD_BYTES) return uploadFail("too_large", tr);
    const role = parseRole(form?.get("role"));
    if (role === null) return fail(tr("library.error.roleInvalid"));
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > MAX_UPLOAD_BYTES) return uploadFail("too_large", tr);
    const detected = detectUpload(file.name || "", file.type || "", bytes);
    if (!detected.ok) return uploadFail(detected.code, tr);
    const type = detected.type;
    const name = ((file.name || "").split(/[\\/]/).pop() || "").trim().slice(0, 200) || `upload.${type}`;
    const ids = (form?.getAll("thesisIds") || []).flatMap((v) => (typeof v === "string" ? v.split(",") : [])).filter((v) => v.trim());
    const title = str(form?.get("title")) || baseName(name) || tr("library.source.uploadedFile");
    return {
      input: {
        kind: "file",
        upload: { type, name, mime: UPLOAD_MIME[type], bytes, sha256: sha256Hex(bytes) },
        title: title.slice(0, 300),
        authors: str(form?.get("authors"))?.slice(0, 300),
        year: str(form?.get("year"))?.slice(0, 8),
        role,
      },
      thesisIds: ids.length ? ids : undefined,
    };
  }

  const body = (await request.json().catch(() => null)) as { kind?: unknown; value?: unknown; title?: unknown; authors?: unknown; year?: unknown; thesisIds?: unknown; role?: unknown } | null;
  const value = typeof body?.value === "string" ? body.value.trim() : "";
  if (!body || !value) return fail(tr("library.error.kindValue"));
  const role = parseRole(body.role);
  if (role === null) return fail(tr("library.error.roleInvalid"));
  const given: Given = { title: str(body.title)?.slice(0, 300), authors: str(body.authors)?.slice(0, 300), year: str(body.year)?.slice(0, 8), role };

  if (body.kind === "doi") {
    const doi = normalizeDoi(value);
    if (!doi) return fail(tr("library.error.doiInvalid"));
    return { input: { kind: "doi", doi, ...given }, thesisIds: body.thesisIds };
  }
  if (body.kind === "url") {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return fail(tr("library.error.urlInvalid"));
    }
    if (!/^https?:$/.test(url.protocol)) return fail(tr("library.error.urlProtocol"));
    return { input: { kind: "url", url: url.toString(), ...given }, thesisIds: body.thesisIds };
  }
  if (body.kind === "text") {
    if (wordCount(value) < 20) return fail(tr("library.error.textTooShort"));
    return { input: { kind: "text", text: value, ...given }, thesisIds: body.thesisIds };
  }
  return fail(tr("library.error.kindInvalid"));
}

/** Role a new source gets: sheets are always primary; otherwise what the client asked, or secondary. */
export function roleFor(input: SourceInput): SourceRole {
  if (input.kind === "file" && SHEET_TYPES.indexOf(input.upload.type) !== -1) return "primary";
  return input.role || "secondary";
}

/**
 * Creates a DOI, URL or pasted-text source in the owner's library, linked to `thesisIds`, then extracts, chunks and
 * indexes its text in the same request. A source whose text could not be indexed is still created, with
 * `parseStatus` "no_text" or "failed" and the reason in `abstract`. Caps, locks and duplicates are the caller's job
 * (see `checkLinkable`): check them right before calling, with no await in between; the source itself is created
 * before this function's first await. Uploaded files go through `addUploadedSource`.
 */
export async function createLibrarySource(ownerId: string, thesisIds: string[], input: Exclude<SourceInput, FileSourceInput>, tr: Translate): Promise<ThesisSource> {
  const base = { ownerId, thesisIds, wordCount: 0, parseStatus: "pending" as const, ...(input.role ? { role: input.role } : {}) };

  if (input.kind === "doi") {
    const doi = input.doi;
    const created = db.sources.create({ ...base, kind: "doi", doi, url: `https://doi.org/${doi}`, title: input.title || doi, authors: input.authors, year: input.year });
    const res = await extractFromDoi(doi).catch((e: Error) => ({ error: e }));
    if (!res || "error" in res) {
      return db.sources.update(created.id, { parseStatus: "failed", abstract: res && "error" in res ? tr("library.source.lookupFailed", { reason: res.error.message.slice(0, 160) }) : tr("library.source.doiNotFound") })!;
    }
    const w = res.work;
    db.sources.update(created.id, {
      title: input.title || w.title,
      authors: input.authors || w.authors || undefined,
      year: input.year || w.year,
      venue: w.venue,
      abstract: w.abstract,
      openalexId: w.openalexId,
      license: res.license,
      url: res.pdfUrl || w.landingUrl || `https://doi.org/${doi}`,
    });
    return indexSource(db.sources.findById(created.id)!, res, tr);
  }

  if (input.kind === "url") {
    const u = new URL(input.url);
    const created = db.sources.create({ ...base, kind: "url", url: input.url, title: input.title || u.hostname + u.pathname, authors: input.authors, year: input.year });
    const res = await extractFromUrl(input.url).catch((e: Error) => failed(e, tr));
    if (!res) return db.sources.update(created.id, { parseStatus: "failed", abstract: tr("library.source.urlFailed") })!;
    if ("finalUrl" in res) {
      db.sources.update(created.id, { title: input.title || res.title || created.title, authors: input.authors || res.authors, year: input.year || res.year, doi: res.doi, url: res.finalUrl });
    }
    return indexSource(db.sources.findById(created.id)!, res, tr);
  }

  const created = db.sources.create({ ...base, kind: "text", title: input.title || input.text.slice(0, 60).replace(/\s+/g, " ") + "…", authors: input.authors, year: input.year });
  return indexSource(created, { text: input.text, pages: [input.text], pageCount: 0, status: "parsed" }, tr);
}

function failed(e: Error, tr: Translate): Extracted {
  return { text: "", pages: [], pageCount: 0, status: "failed", reason: e.message?.slice(0, 200) || tr("library.source.extractionFailed") };
}

/** Stores the extracted text (capped), chunks it, and records pages, words and status. */
function indexSource(source: ThesisSource, extracted: Extracted, tr: Translate): ThesisSource {
  if (extracted.status !== "parsed" || !extracted.text.trim()) {
    db.sourceChunks.removeForSource(source.id);
    return db.sources.update(source.id, { parseStatus: extracted.status === "no_text" ? "no_text" : "failed", pages: extracted.pageCount || undefined, wordCount: 0, abstract: source.abstract || extracted.reason || tr("library.source.extractionFailed") })!;
  }
  let pages = extracted.pages;
  let text = extracted.text;
  if (text.length > MAX_TEXT_CHARS) {
    // Keep whole pages up to the cap so page numbers stay truthful.
    const kept: string[] = [];
    let n = 0;
    for (const p of pages) {
      if (n + p.length > MAX_TEXT_CHARS) break;
      kept.push(p);
      n += p.length + 2;
    }
    pages = kept.length ? kept : [text.slice(0, MAX_TEXT_CHARS)];
    text = pages.join("\n\n");
  }
  const chunks = chunkText(extracted.pageCount > 0 ? pages : text, { targetWords: 300, overlap: 40 });
  db.sourceChunks.replaceForSource(
    source.id,
    chunks.map((c) => ({ sourceId: source.id, index: c.index, page: c.page, section: c.section, text: c.text, wordCount: c.wordCount }))
  );
  return db.sources.update(source.id, { text, pages: extracted.pageCount || undefined, wordCount: wordCount(text), parseStatus: "parsed" })!;
}

/**
 * Fails when one of `theses` is locked, or cannot take one more source of this role (ignoring theses the source
 * already uses): 20 primary sources per paper, 40 secondary ones.
 */
export function checkLinkable(theses: Thesis[], tr: Translate, already: string[] = [], role: SourceRole = "secondary"): Fail | null {
  for (const t of theses) {
    if (already.indexOf(t.id) !== -1) continue;
    if (isLocked(t)) return lockedFail(t, tr);
    const n = countRole(db.sources.list(t.id), role);
    if (n >= (role === "primary" ? MAX_PRIMARY_PER_THESIS : MAX_SOURCES_PER_THESIS)) return thesisCapFail(t, tr, role);
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Uploaded files
// ---------------------------------------------------------------------------------------------------------------------

/** The theses again by id (they may have changed while the request awaited), or a 404. */
function freshTheses(ids: string[], tr: Translate): Thesis[] | Fail {
  const out: Thesis[] = [];
  for (const id of ids) {
    const t = db.theses.findById(id);
    if (!t) return fail(tr("library.error.thesisNotFound"), 404);
    out.push(t);
  }
  return out;
}

/**
 * The same file (SHA-256) already in the owner's library: links it to the theses that do not use it yet and returns
 * it (`existing: true`), or a refusal (lock, caps). A primary upload of a file kept as literature makes it primary.
 * Null when the library has no such file.
 */
function linkExisting(ownerId: string, ids: string[], sha256: string, role: SourceRole, tr: Translate): { source: ThesisSource; existing: true } | Fail | null {
  const existing = db.sources.findByHash(ownerId, sha256);
  if (!existing) return null;
  const upgrade = role === "primary" && roleOf(existing) !== "primary";
  const finalRole: SourceRole = upgrade ? "primary" : roleOf(existing);
  const newIds = ids.filter((id) => existing.thesisIds.indexOf(id) === -1);
  const theses = freshTheses(newIds, tr);
  if (isFail(theses)) return theses;
  const refused = checkLinkable(theses, tr, [], finalRole);
  if (refused) return refused;
  if (upgrade) {
    const capped = libraryRoleCap(ownerId, "primary", tr);
    if (capped) return capped;
    for (const id of existing.thesisIds) {
      const t = db.theses.findById(id);
      if (t && countRole(db.sources.list(id), "primary") >= MAX_PRIMARY_PER_THESIS) return thesisCapFail(t, tr, "primary");
    }
  }
  if (!newIds.length && !upgrade) return { source: existing, existing: true };
  const updated = db.sources.update(existing.id, { thesisIds: existing.thesisIds.concat(newIds), ...(upgrade ? { role: "primary" as const } : {}) })!;
  return { source: updated, existing: true };
}

/**
 * Adds an uploaded file to the owner's library, linked to `theses` (the owner's own, already resolved).
 * Order: an identical file already in the library is linked instead (200 `existing`); locks and caps (by role, and
 * the library's data cells for sheets) are checked; the file is parsed (sheets within the cell budget); the checks run
 * again with no await before the write; the source (and for a sheet its dataset and data card) is created.
 */
export async function addUploadedSource(ownerId: string, theses: Thesis[], input: FileSourceInput, tr: Translate): Promise<{ source: ThesisSource; existing: boolean } | Fail> {
  const { upload } = input;
  const role = roleFor(input);
  const ids = theses.map((t) => t.id);
  const sheet = SHEET_TYPES.indexOf(upload.type) !== -1;

  const checks = (): Fail | { source: ThesisSource; existing: true } | null => {
    const dup = linkExisting(ownerId, ids, upload.sha256, role, tr);
    if (dup) return dup;
    const fresh = freshTheses(ids, tr);
    if (isFail(fresh)) return fresh;
    return checkLinkable(fresh, tr, [], role) || libraryRoleCap(ownerId, role, tr);
  };
  const early = checks();
  if (early) return early;

  let budget = MAX_DATASET_CELLS;
  if (sheet) {
    const left = MAX_LIBRARY_CELLS - db.datasets.cellsByOwner(ownerId);
    if (left < 1) return dataCapFail(tr);
    budget = Math.min(budget, left);
  }
  let parsed: ParsedUpload;
  try {
    parsed = await parseUpload(upload.type, upload.bytes, upload.name, budget);
  } catch (e) {
    if (isIngestError(e)) return e.detail === "no_room" ? dataCapFail(tr) : uploadFail(e.code, tr, "parse");
    return uploadFail("unreadable", tr, "parse");
  }

  // From here to the write nothing awaits: the checks below see the state the write will change.
  const late = checks();
  if (late) return late;
  if (parsed.kind === "sheet" && db.datasets.cellsByOwner(ownerId) + parsed.cells > MAX_LIBRARY_CELLS) return dataCapFail(tr);
  return { source: createUploadedSource(ownerId, ids, input, role, parsed, tr), existing: false };
}

function createUploadedSource(ownerId: string, thesisIds: string[], input: FileSourceInput, role: SourceRole, parsed: ParsedUpload, tr: Translate): ThesisSource {
  const { upload } = input;
  const base = {
    ownerId,
    thesisIds,
    wordCount: 0,
    parseStatus: "pending" as const,
    role,
    file: { name: upload.name, mime: upload.mime, bytes: upload.bytes.length, sha256: upload.sha256 },
    title: input.title || baseName(upload.name) || tr("library.source.uploadedFile"),
    authors: input.authors,
    year: input.year,
  };
  if (parsed.kind === "sheet") {
    const created = db.sources.create({ ...base, kind: "sheet" });
    const dataset = db.datasets.create({
      sourceId: created.id,
      ownerId,
      sha256: upload.sha256,
      sheets: parsed.sheets,
      ...(parsed.sheetsCut > 0 ? { sheetsCut: parsed.sheetsCut } : {}),
    });
    db.sources.update(created.id, { datasetId: dataset.id });
    // The indexed text of a sheet is its data card (D11): names, types and statistics, never rows. Sheets past the
    // sheet cap (D10) are kept on the dataset (`sheetsCut`), so the chat's data cards, the source views
    // (`datasetSummary`) and this indexed card all name them.
    const card = dataCard(dataset, upload.name);
    return indexSource(db.sources.findById(created.id)!, { text: card, pages: [card], pageCount: 0, status: "parsed" }, tr);
  }
  const created = db.sources.create({ ...base, kind: UPLOAD_KIND[upload.type] });
  return indexSource(created, parsed.extracted, tr);
}

/** Owner view of every source in the library, newest first. */
export function librarySourceViews(ownerId: string): LibrarySourceView[] {
  const counts = db.sourceChunks.countBySource();
  return db.sources.listByOwner(ownerId).map((s) => librarySourceView(s, counts));
}

// ---------------------------------------------------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------------------------------------------------

/** A library reference as its owner sees it: the entry, the theses that use it and its in-text citations per thesis. */
export type LibraryReferenceView = Reference & { thesisIds: string[]; citedIn: Record<string, number>; addedAt: string; updatedAt: string };

interface OwnerIndex {
  theses: Thesis[];
  links: Map<string, string[]>;
  counts: Map<string, Record<string, number>>;
}

function ownerIndex(ownerId: string): OwnerIndex {
  const theses = db.theses.getByStudent(ownerId);
  const links = new Map<string, string[]>();
  const counts = new Map<string, Record<string, number>>();
  for (const t of theses) {
    counts.set(t.id, thesisCitationCounts(t));
    for (const r of t.references || []) {
      if (!r || typeof r.id !== "string") continue;
      const list = links.get(r.id) || [];
      if (list.indexOf(t.id) === -1) list.push(t.id);
      links.set(r.id, list);
    }
  }
  return { theses, links, counts };
}

function toView(item: LibraryReference, idx: OwnerIndex): LibraryReferenceView {
  const { ownerId: _owner, addedAt, updatedAt, ...ref } = item;
  void _owner;
  const citedIn: Record<string, number> = {};
  for (const t of idx.theses) {
    const n = idx.counts.get(t.id)?.[item.id] || 0;
    if (n > 0) citedIn[t.id] = n;
  }
  return { ...ref, thesisIds: (idx.links.get(item.id) || []).slice(), citedIn, addedAt, updatedAt };
}

function firstAuthor(authors: string) {
  return (authors || "").split(/;|&| and |,/)[0].trim().toLowerCase();
}

/** Every reference of the library, ordered by first author, then year, then title. */
export function libraryReferenceViews(ownerId: string): LibraryReferenceView[] {
  const idx = ownerIndex(ownerId);
  return db.libraryReferences
    .listByOwner(ownerId)
    .map((r) => toView(r, idx))
    .sort((a, b) => firstAuthor(a.authors).localeCompare(firstAuthor(b.authors)) || String(a.year || "").localeCompare(String(b.year || "")) || String(a.title || "").localeCompare(String(b.title || "")));
}

export function libraryReferenceView(item: LibraryReference): LibraryReferenceView {
  return toView(item, ownerIndex(item.ownerId));
}

/** In-text citations of a reference per thesis of its owner (only theses where it is cited). */
export function citedInFor(ownerId: string, id: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of db.theses.getByStudent(ownerId)) {
    const n = thesisCitationCounts(t)[id] || 0;
    if (n > 0) out[t.id] = n;
  }
  return out;
}

const REF_TYPES: Reference["type"][] = ["book", "article", "web", "thesis", "chapter"];
const TEXT_LIMITS = { authors: 1000, year: 16, title: 500, source: 300, url: 1000, doi: 200, pages: 40, volume: 40, issue: 40 } as const;
type TextField = keyof typeof TEXT_LIMITS;
/** Fields that are always strings on a Reference (may be empty); the others are optional and cleared by "". */
const REQUIRED_TEXT: TextField[] = ["authors", "year", "title", "source"];

/** Bibliographic fields a client may set on a library reference. */
export type ReferenceFields = Partial<Pick<Reference, "type" | TextField>>;

/**
 * Keeps only the bibliographic fields (type, authors, year, title, source, url, doi, pages, volume, issue), trimmed and
 * capped. An empty optional field becomes `undefined` (cleared). `creating` requires a title and fills the defaults.
 */
export function sanitizeReferenceFields(raw: unknown, tr: Translate, creating: boolean): ReferenceFields | Fail {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!o) return fail(tr("library.error.invalidBody"));
  const out: ReferenceFields = {};
  if (typeof o.type === "string" && (REF_TYPES as string[]).indexOf(o.type) !== -1) out.type = o.type as Reference["type"];
  for (const k of Object.keys(TEXT_LIMITS) as TextField[]) {
    if (!(k in o) || o[k] === undefined) continue;
    const v = o[k] === null ? "" : typeof o[k] === "string" || typeof o[k] === "number" ? String(o[k]).trim().slice(0, TEXT_LIMITS[k]) : undefined;
    if (v === undefined) continue;
    if (REQUIRED_TEXT.indexOf(k) !== -1) out[k] = v;
    else out[k] = v || undefined;
  }
  if (out.doi) {
    const doi = normalizeDoi(out.doi);
    if (!doi) return fail(tr("library.error.doiInvalid"));
    out.doi = doi;
  }
  if (out.url) {
    try {
      const u = new URL(out.url);
      if (!/^https?:$/.test(u.protocol)) return fail(tr("library.error.urlProtocol"));
    } catch {
      return fail(tr("library.error.urlInvalid"));
    }
  }
  if ("title" in out && !out.title) return fail(tr("library.error.referenceTitle"));
  if (creating) {
    if (!out.title) return fail(tr("library.error.referenceTitle"));
    return { type: out.type || "article", authors: out.authors || "", year: out.year || "", source: out.source || "", ...out };
  }
  return out;
}

/** A reference id that is free in the owner's library and in every one of the owner's theses. */
export function newReferenceId(ownerId: string): string {
  const taken = new Set<string>(db.libraryReferences.listByOwner(ownerId).map((r) => r.id));
  for (const t of db.theses.getByStudent(ownerId)) for (const r of t.references || []) if (r && typeof r.id === "string") taken.add(r.id);
  let id = uid("ref");
  while (taken.has(id)) id = uid("ref");
  return id;
}

/** Adds the library item to a thesis's references (no-op when the thesis already has that id). */
export function addReferenceToThesis(t: Thesis, item: LibraryReference) {
  const refs = Array.isArray(t.references) ? t.references : [];
  if (refs.some((r) => r && r.id === item.id)) return;
  db.theses.update(t.id, { references: [...refs, thesisCopyOf(item)] });
}

/** Removes a reference id from a thesis's references (the library keeps it). */
export function removeReferenceFromThesis(t: Thesis, id: string) {
  const refs = Array.isArray(t.references) ? t.references : [];
  if (!refs.some((r) => r && r.id === id)) return;
  db.theses.update(t.id, { references: refs.filter((r) => !(r && r.id === id)) });
}
