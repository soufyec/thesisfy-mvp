/**
 * The student's personal library of sources and references: shared by `/api/library/*` and the thesis-scoped
 * `/api/theses/[id]/sources` routes, so extraction, indexing, caps, lock rules and views exist once.
 *
 * - A source (`ThesisSource`) is full text the assistant can quote. It belongs to `ownerId` and is linked to the
 *   theses in `thesisIds` (always theses of the same owner).
 * - A reference (`LibraryReference`) is a bibliographic entry. `thesis.references` stays the per-thesis list; a library
 *   reference is linked to a thesis iff that list holds the same id (see `db.libraryReferences`).
 * - Theses that are approved or submitted are locked: no link can be added to or removed from them.
 */

import { NextResponse } from "next/server";
import { db, LibraryReference, Reference, Thesis, thesisCopyOf, ThesisSource, uid, User } from "@/lib/db";
import { json } from "@/lib/api";
import type { Translate } from "@/lib/i18n/dictionary";
import { normalizeDoi } from "@/lib/scholar";
import { extractFromDoi, extractFromPdf, extractFromUrl, Extracted, MAX_PDF_BYTES } from "./extract";
import { chunkText, wordCount } from "./chunk";
import { librarySourceView, LibrarySourceView } from "./retrieve";
import { thesisCitationCounts } from "./cited";

export const MAX_SOURCES_PER_THESIS = 40;
export const MAX_SOURCES_PER_LIBRARY = 150;
export const MAX_TEXT_CHARS = 250_000;

export type LibraryErrorCode = "locked" | "cited" | "thesis_cap" | "library_cap" | "duplicate" | "conflict" | "owner_only";

/** A refused request, already shaped as the response `{ error, code?, ...extra }`. */
export interface Fail {
  fail: NextResponse;
}

export function fail(message: string, status = 400, code?: LibraryErrorCode, extra?: Record<string, unknown>): Fail {
  return { fail: json({ error: message, ...(code ? { code } : {}), ...(extra || {}) }, status) };
}

export const isFail = (v: unknown): v is Fail => !!v && typeof v === "object" && "fail" in (v as Record<string, unknown>);

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

export function thesisCapFail(t: Pick<Thesis, "title">, tr: Translate) {
  return fail(tr("library.error.thesisCap", { max: MAX_SOURCES_PER_THESIS, title: t.title }), 409, "thesis_cap");
}

export function libraryCapFail(tr: Translate) {
  return fail(tr("library.error.libraryCap", { max: MAX_SOURCES_PER_LIBRARY }), 409, "library_cap");
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
}

export type SourceInput =
  | ({ kind: "pdf"; file: File } & Given)
  | ({ kind: "doi"; doi: string } & Given)
  | ({ kind: "url"; url: string } & Given)
  | ({ kind: "text"; text: string } & Given);

function str(v: unknown) {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Reads a source from the request: multipart with a `file` PDF (≤ 15 MB, optional title, authors, year) or JSON
 * `{ kind: "doi" | "url" | "text", value, title?, authors?, year? }`. `thesisIds` is returned for the library route to
 * validate: the JSON value as sent, or the multipart field (repeated or comma-separated) as an array of ids.
 */
export async function readSourceInput(request: Request, tr: Translate): Promise<{ input: SourceInput; thesisIds: unknown } | Fail> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") return fail(tr("library.error.attachPdf"));
    if (file.size > MAX_PDF_BYTES) return fail(tr("library.error.pdfTooLarge"), 413);
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    if (!isPdf) return fail(tr("library.error.pdfOnly"), 415);
    const ids = (form?.getAll("thesisIds") || []).flatMap((v) => (typeof v === "string" ? v.split(",") : [])).filter((v) => v.trim());
    const title = str(form?.get("title")) || (file.name || "").replace(/\.pdf$/i, "").trim() || tr("library.source.uploadedPdf");
    return {
      input: { kind: "pdf", file, title: title.slice(0, 300), authors: str(form?.get("authors"))?.slice(0, 300), year: str(form?.get("year"))?.slice(0, 8) },
      thesisIds: ids.length ? ids : undefined,
    };
  }

  const body = (await request.json().catch(() => null)) as { kind?: unknown; value?: unknown; title?: unknown; authors?: unknown; year?: unknown; thesisIds?: unknown } | null;
  const value = typeof body?.value === "string" ? body.value.trim() : "";
  if (!body || !value) return fail(tr("library.error.kindValue"));
  const given: Given = { title: str(body.title)?.slice(0, 300), authors: str(body.authors)?.slice(0, 300), year: str(body.year)?.slice(0, 8) };

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

/**
 * Creates the source in the owner's library, linked to `thesisIds`, then extracts, chunks and indexes its text in
 * the same request. A source whose text could not be indexed is still created, with `parseStatus` "no_text" or
 * "failed" and the reason in `abstract`. Caps, locks and duplicates are the caller's job (see `checkLinkable`): check
 * them right before calling, with no await in between; the source itself is created before this function's first await.
 */
export async function createLibrarySource(ownerId: string, thesisIds: string[], input: SourceInput, tr: Translate): Promise<ThesisSource> {
  const base = { ownerId, thesisIds, wordCount: 0, parseStatus: "pending" as const };

  if (input.kind === "pdf") {
    const created = db.sources.create({ ...base, kind: "pdf", title: input.title || tr("library.source.uploadedPdf"), authors: input.authors, year: input.year });
    const buffer = Buffer.from(await input.file.arrayBuffer());
    const extracted = await extractFromPdf(buffer).catch((e: Error) => failed(e, tr));
    return indexSource(created, extracted, tr);
  }

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

/** Fails when one of `theses` is locked, or cannot take one more source (ignoring theses the source already uses). */
export function checkLinkable(theses: Thesis[], tr: Translate, already: string[] = []): Fail | null {
  for (const t of theses) {
    if (already.indexOf(t.id) !== -1) continue;
    if (isLocked(t)) return lockedFail(t, tr);
    if (db.sources.list(t.id).length >= MAX_SOURCES_PER_THESIS) return thesisCapFail(t, tr);
  }
  return null;
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
