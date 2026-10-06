import { NextRequest } from "next/server";
import { db, SourceKind, ThesisSource } from "@/lib/db";
import { canAccessThesis } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";
import { normalizeDoi } from "@/lib/scholar";
import { extractFromDoi, extractFromPdf, extractFromUrl, Extracted, MAX_PDF_BYTES } from "@/lib/sources/extract";
import { chunkText, wordCount } from "@/lib/sources/chunk";
import { publicSource } from "@/lib/sources/retrieve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SOURCES_PER_THESIS = 40;
const MAX_TEXT_CHARS = 250_000;

interface JsonBody {
  kind?: SourceKind;
  value?: string;
  title?: string;
  authors?: string;
  year?: string;
}

/** GET → every source of the thesis, without the extracted text. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error("Thesis not found", 404);
  return json({ sources: db.sources.list(thesis.id).map(publicSource) });
}

/**
 * POST → add a source. Either multipart with a `file` PDF (≤ 15 MB) or JSON { kind: "doi" | "url" | "text", value, title?, authors?, year? }.
 * The source is created, its text extracted, chunked and indexed in the same request; `parseStatus` tells the outcome.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error("Thesis not found", 404);
  if (db.sources.list(thesis.id).length >= MAX_SOURCES_PER_THESIS) return error(`A thesis library holds up to ${MAX_SOURCES_PER_THESIS} sources. Remove one before adding another.`, 409);

  const contentType = request.headers.get("content-type") || "";
  let created: ThesisSource;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") return error("Attach a PDF in the `file` field.");
    if (file.size > MAX_PDF_BYTES) return error("The PDF is larger than 15 MB.", 413);
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    if (!isPdf) return error("Only PDF files can be added.", 415);
    const title = str(form?.get("title")) || (file.name || "Uploaded PDF").replace(/\.pdf$/i, "");
    created = db.sources.create({ thesisId: thesis.id, kind: "pdf", title: title.slice(0, 300), authors: str(form?.get("authors"))?.slice(0, 300), year: str(form?.get("year"))?.slice(0, 8), wordCount: 0, parseStatus: "pending" });
    const buffer = Buffer.from(await file.arrayBuffer());
    const extracted = await extractFromPdf(buffer).catch((e: Error) => failed(e));
    return json({ source: index(created, extracted) }, 201);
  }

  const body = (await request.json().catch(() => null)) as JsonBody | null;
  const value = (body?.value || "").trim();
  if (!body || !value) return error("`kind` and `value` are required.");
  const given = { title: body.title?.trim().slice(0, 300) || undefined, authors: body.authors?.trim().slice(0, 300) || undefined, year: body.year?.trim().slice(0, 8) || undefined };

  if (body.kind === "doi") {
    const doi = normalizeDoi(value);
    if (!doi) return error("That does not look like a DOI (expected 10.xxxx/…).");
    if (db.sources.list(thesis.id).some((s) => s.doi === doi)) return error("This DOI is already in the library.", 409);
    created = db.sources.create({ thesisId: thesis.id, kind: "doi", doi, url: `https://doi.org/${doi}`, title: given.title || doi, authors: given.authors, year: given.year, wordCount: 0, parseStatus: "pending" });
    const res = await extractFromDoi(doi).catch((e: Error) => ({ error: e }));
    if (!res || "error" in res) {
      const updated = db.sources.update(created.id, { parseStatus: "failed", abstract: res && "error" in res ? `Lookup failed: ${res.error.message.slice(0, 160)}` : "DOI not found in OpenAlex or Crossref." });
      return json({ source: publicSource(updated!) }, 201);
    }
    const w = res.work;
    db.sources.update(created.id, {
      title: given.title || w.title,
      authors: given.authors || w.authors || undefined,
      year: given.year || w.year,
      venue: w.venue,
      abstract: w.abstract,
      openalexId: w.openalexId,
      license: res.license,
      url: res.pdfUrl || w.landingUrl || `https://doi.org/${doi}`,
    });
    return json({ source: index(db.sources.findById(created.id)!, res) }, 201);
  }

  if (body.kind === "url") {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return error("Enter a full URL starting with http:// or https://.");
    }
    if (!/^https?:$/.test(url.protocol)) return error("Only http and https URLs can be added.");
    created = db.sources.create({ thesisId: thesis.id, kind: "url", url: url.toString(), title: given.title || url.hostname + url.pathname, authors: given.authors, year: given.year, wordCount: 0, parseStatus: "pending" });
    const res = await extractFromUrl(url.toString()).catch((e: Error) => failed(e));
    if (!res) {
      const updated = db.sources.update(created.id, { parseStatus: "failed", abstract: "The page could not be fetched (private address, blocked, or not found)." });
      return json({ source: publicSource(updated!) }, 201);
    }
    if ("finalUrl" in res) {
      db.sources.update(created.id, { title: given.title || res.title || created.title, authors: given.authors || res.authors, year: given.year || res.year, doi: res.doi, url: res.finalUrl });
    }
    return json({ source: index(db.sources.findById(created.id)!, res) }, 201);
  }

  if (body.kind === "text") {
    if (wordCount(value) < 20) return error("Paste at least 20 words of text.");
    created = db.sources.create({ thesisId: thesis.id, kind: "text", title: given.title || value.slice(0, 60).replace(/\s+/g, " ") + "…", authors: given.authors, year: given.year, wordCount: 0, parseStatus: "pending" });
    return json({ source: index(created, { text: value, pages: [value], pageCount: 0, status: "parsed" }) }, 201);
  }

  return error("`kind` must be doi, url or text (upload PDFs as multipart).");
}

function str(v: FormDataEntryValue | null | undefined) {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function failed(e: Error): Extracted {
  return { text: "", pages: [], pageCount: 0, status: "failed", reason: e.message?.slice(0, 200) || "Extraction failed." };
}

/** Stores the extracted text (capped), chunks it, and records pages, words and status. Returns the public view. */
function index(source: ThesisSource, extracted: Extracted) {
  if (extracted.status !== "parsed" || !extracted.text.trim()) {
    const updated = db.sources.update(source.id, { parseStatus: extracted.status === "no_text" ? "no_text" : "failed", pages: extracted.pageCount || undefined, wordCount: 0, abstract: source.abstract || extracted.reason });
    db.sourceChunks.removeForSource(source.id);
    return publicSource(updated!);
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
    chunks.map((c) => ({ sourceId: source.id, thesisId: source.thesisId, index: c.index, page: c.page, section: c.section, text: c.text, wordCount: c.wordCount }))
  );
  const updated = db.sources.update(source.id, { text, pages: extracted.pageCount || undefined, wordCount: wordCount(text), parseStatus: "parsed" });
  return publicSource(updated!);
}
