/**
 * Text extraction for the per-thesis source library (F5).
 *
 * Three entry points, one output shape:
 * - `extractFromPdf(buffer)`  → page-split text via pdf-parse (pure JS, no GROBID here). Scanned PDFs are detected
 *   (fewer than 50 characters per page on average) and reported as `no_text` instead of being indexed as noise.
 * - `extractFromUrl(url)`     → public page text (or the PDF behind the URL). Same SSRF rules as `citations.ts`:
 *   http(s) only, no private or link-local addresses, bounded redirects, size and time limits.
 * - `extractFromDoi(doi)`     → metadata from OpenAlex, then Crossref; the open-access PDF from Unpaywall or the
 *   OpenAlex `oaUrl` when it is really a PDF (≤ 15 MB, 20 s); otherwise the abstract only.
 *
 * Nothing here stores anything: the API route decides what to keep (text is capped there) and respects the
 * per-source `license` reported by Unpaywall.
 */

import dns from "node:dns/promises";
import net from "node:net";
import { crossrefWork, normalizeDoi, openAlexWork, ScholarWork, unpaywall } from "@/lib/scholar";

export type ExtractStatus = "parsed" | "no_text" | "failed";

export interface Extracted {
  /** Full text with pages joined by a blank line. Empty when `status` is not "parsed". */
  text: string;
  /** One entry per page (PDF) or a single entry (HTML, plain text). */
  pages: string[];
  pageCount: number;
  status: ExtractStatus;
  /** Human-readable reason when `status` is "no_text" or "failed". */
  reason?: string;
}

export interface UrlExtracted extends Extracted {
  finalUrl: string;
  contentType: "pdf" | "html" | "text";
  /** Metadata found in the page head (citation_* / og: / <title>), when any. */
  title?: string;
  authors?: string;
  year?: string;
  doi?: string;
}

export interface DoiExtracted extends Extracted {
  work: ScholarWork;
  /** "full_text" when an OA PDF was parsed, "abstract" when only the abstract is available, "none" otherwise. */
  coverage: "full_text" | "abstract" | "none";
  license?: string;
  pdfUrl?: string;
}

export const MAX_PDF_BYTES = 15 * 1024 * 1024;
export const MAX_URL_CHARS = 200_000;
const PDF_TIMEOUT_MS = 20_000;
const SCANNED_CHARS_PER_PAGE = 50;
const UA = "Thesisfic/1.0 (academic writing platform; source library)";

// ---------------------------------------------------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------------------------------------------------

type PdfTextItem = { str: string; transform: number[] };
type PdfPage = { getTextContent: (o: { normalizeWhitespace: boolean; disableCombineTextItems: boolean }) => Promise<{ items: PdfTextItem[] }> };
type PdfParseFn = (buffer: Buffer, options: { pagerender: (page: PdfPage) => Promise<string>; max?: number; version?: string }) => Promise<{ numpages: number; numrender: number; text: string }>;

/** pdf-parse is CommonJS without typings; its lib entry is required directly so the package's self-test in index.js never runs. */
function loadPdfParse(): PdfParseFn {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("pdf-parse/lib/pdf-parse.js") as PdfParseFn;
}

const PAGE_BREAK = "\f";

/** Joins a page's text items into lines (new line when the vertical position changes), then marks the page end. */
async function renderPage(page: PdfPage): Promise<string> {
  const content = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
  let lastY: number | undefined;
  let text = "";
  for (const item of content.items) {
    const y = item.transform?.[5];
    if (lastY === undefined || lastY === y) text += item.str;
    else text += "\n" + item.str;
    lastY = y;
  }
  return text + PAGE_BREAK;
}

/** Light clean-up that keeps the text searchable: de-hyphenate line breaks, collapse whitespace runs, keep paragraph breaks. */
export function cleanPageText(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .replace(/([A-Za-zÀ-ÖØ-öø-ÿ])-\n([a-zà-öø-ÿ])/g, "$1$2") // "infor-\nmation" → "information" (ES5 target: no \p{L})
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikePdf(buffer: Buffer) {
  return buffer.subarray(0, 1024).toString("latin1").includes("%PDF-");
}

export async function extractFromPdf(buffer: Buffer): Promise<Extracted> {
  if (!buffer?.length) return { text: "", pages: [], pageCount: 0, status: "failed", reason: "Empty file." };
  if (buffer.length > MAX_PDF_BYTES) return { text: "", pages: [], pageCount: 0, status: "failed", reason: "The PDF is larger than 15 MB." };
  if (!looksLikePdf(buffer)) return { text: "", pages: [], pageCount: 0, status: "failed", reason: "The file is not a PDF." };
  let parsed: { numpages: number; text: string };
  try {
    parsed = await loadPdfParse()(buffer, { pagerender: renderPage });
  } catch (e) {
    return { text: "", pages: [], pageCount: 0, status: "failed", reason: (e as Error).message?.slice(0, 200) || "The PDF could not be read." };
  }
  // pdf-parse prefixes every page with "\n\n"; the form feed we appended is the reliable page boundary.
  const pages = parsed.text.split(PAGE_BREAK).map(cleanPageText);
  if (pages.length && !pages[pages.length - 1]) pages.pop();
  const pageCount = parsed.numpages || pages.length;
  const chars = pages.reduce((n, p) => n + p.length, 0);
  if (!pageCount || chars / Math.max(1, pageCount) < SCANNED_CHARS_PER_PAGE) {
    return { text: "", pages: [], pageCount, status: "no_text", reason: "No text layer: this looks like a scanned PDF. It cannot be indexed without OCR." };
  }
  return { text: pages.join("\n\n"), pages, pageCount, status: "parsed" };
}

// ---------------------------------------------------------------------------------------------------------------------
// Public URL (same network rules as src/lib/citations.ts, which keeps its fetch helper private)
// ---------------------------------------------------------------------------------------------------------------------

function isPrivateIp(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.") || v === "::";
}

async function hostIsPublic(url: URL) {
  if (!/^https?:$/.test(url.protocol) || /^(localhost|.*\.local|.*\.internal)$/i.test(url.hostname)) return false;
  if (net.isIP(url.hostname)) return !isPrivateIp(url.hostname);
  const addrs = await dns.lookup(url.hostname, { all: true }).catch(() => []);
  return addrs.length > 0 && !addrs.some((a) => isPrivateIp(a.address));
}

async function readBounded(res: Response, maxBytes: number): Promise<{ buffer: Buffer; truncated: boolean }> {
  const reader = res.body!.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    size += value.length;
    if (size > maxBytes) {
      truncated = true;
      break;
    }
  }
  reader.cancel().catch(() => {});
  return { buffer: Buffer.concat(chunks), truncated };
}

/**
 * Fetches a public resource with redirect, size and time limits. `accept` steers content negotiation.
 * Returns null when the host is private, the response is not OK, or the transfer exceeds `maxBytes` (when `strictSize`).
 */
async function fetchPublic(raw: string, opts: { accept: string; maxBytes: number; timeoutMs: number; strictSize?: boolean }): Promise<{ buffer: Buffer; finalUrl: string; contentType: string; truncated: boolean } | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  for (let hop = 0; hop < 4; hop++) {
    if (!(await hostIsPublic(url))) return null;
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: opts.accept }, redirect: "manual", signal: AbortSignal.timeout(opts.timeoutMs), cache: "no-store" }).catch(() => null);
    if (!res) return null;
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      url = new URL(loc, url);
      continue;
    }
    if (!res.ok || !res.body) return null;
    const declared = Number(res.headers.get("content-length") || 0);
    if (opts.strictSize && declared > opts.maxBytes) return null;
    const { buffer, truncated } = await readBounded(res, opts.maxBytes);
    if (opts.strictSize && truncated) return null;
    return { buffer, finalUrl: url.toString(), contentType: (res.headers.get("content-type") || "").toLowerCase(), truncated };
  }
  return null;
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function metaAll(html: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name.replace(/[.:]/g, "\\$&")}["'][^>]*>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const c = m[0].match(/content=["']([^"']*)["']/i);
    if (c) out.push(decodeEntities(c[1]).trim());
  }
  return out.filter(Boolean);
}

/** Visible text of an HTML document: drops scripts, styles, navigation and markup; keeps block boundaries as line breaks. */
export function htmlToText(html: string): string {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|iframe)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote|pre|td|th|dd|dt|figcaption)>/gi, "\n")
    .replace(/<(h[1-6])\b[^>]*>/gi, "\n\n<$1>")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(body)
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractFromUrl(raw: string): Promise<UrlExtracted | null> {
  const got = await fetchPublic(raw, { accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,text/plain;q=0.8,*/*;q=0.5", maxBytes: MAX_PDF_BYTES, timeoutMs: PDF_TIMEOUT_MS });
  if (!got) return null;
  const { buffer, finalUrl, contentType, truncated } = got;
  if (contentType.includes("application/pdf") || looksLikePdf(buffer)) {
    if (truncated) return { text: "", pages: [], pageCount: 0, status: "failed", reason: "The PDF is larger than 15 MB.", finalUrl, contentType: "pdf" };
    const pdf = await extractFromPdf(buffer);
    return { ...pdf, finalUrl, contentType: "pdf" };
  }
  const html = buffer.toString("utf8");
  const isHtml = contentType.includes("html") || /<html[\s>]/i.test(html.slice(0, 2000));
  const text = (isHtml ? htmlToText(html) : html.replace(/\r/g, "").trim()).slice(0, MAX_URL_CHARS);
  const title = metaAll(html, "citation_title")[0] || metaAll(html, "og:title")[0] || decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim() || undefined;
  const authors = metaAll(html, "citation_author");
  const date = metaAll(html, "citation_publication_date")[0] || metaAll(html, "citation_date")[0] || metaAll(html, "article:published_time")[0];
  const doi = normalizeDoi(metaAll(html, "citation_doi")[0] || "");
  const status: ExtractStatus = text.replace(/\s+/g, "").length < 200 ? "no_text" : "parsed";
  return {
    text: status === "parsed" ? text : "",
    pages: status === "parsed" ? [text] : [],
    pageCount: status === "parsed" ? 1 : 0,
    status,
    reason: status === "no_text" ? "The page has almost no readable text (it may need a login or load its content with scripts)." : undefined,
    finalUrl,
    contentType: isHtml ? "html" : "text",
    title: isHtml ? title : undefined,
    authors: authors.length ? authors.join(", ") : undefined,
    year: date?.match(/\d{4}/)?.[0],
    doi,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// DOI
// ---------------------------------------------------------------------------------------------------------------------

/** Downloads a PDF only: `application/pdf` (or a %PDF body) under 15 MB within 20 s, else null. */
export async function downloadPdf(url: string): Promise<Buffer | null> {
  const got = await fetchPublic(url, { accept: "application/pdf", maxBytes: MAX_PDF_BYTES, timeoutMs: PDF_TIMEOUT_MS, strictSize: true });
  if (!got) return null;
  if (!got.contentType.includes("application/pdf") && !looksLikePdf(got.buffer)) return null;
  return got.buffer;
}

export async function extractFromDoi(input: string): Promise<DoiExtracted | null> {
  const doi = normalizeDoi(input);
  if (!doi) return null;
  const work = (await openAlexWork(doi).catch(() => null)) || (await crossrefWork(doi).catch(() => null));
  if (!work) return null;

  const oa = await unpaywall(doi).catch(() => null);
  const candidates = Array.from(new Set([oa?.pdfUrl, work.oaUrl].filter((u): u is string => !!u && /^https?:/i.test(u))));
  for (const pdfUrl of candidates) {
    const buffer = await downloadPdf(pdfUrl).catch(() => null);
    if (!buffer) continue;
    const pdf = await extractFromPdf(buffer);
    if (pdf.status === "parsed") return { ...pdf, work, coverage: "full_text", license: oa?.license, pdfUrl };
    // A scanned OA PDF: keep the abstract instead, but say why the full text is missing.
    if (pdf.status === "no_text" && work.abstract) return { text: work.abstract, pages: [work.abstract], pageCount: 0, status: "parsed", reason: pdf.reason, work, coverage: "abstract", license: oa?.license, pdfUrl };
  }
  if (work.abstract) return { text: work.abstract, pages: [work.abstract], pageCount: 0, status: "parsed", work, coverage: "abstract", license: oa?.license, pdfUrl: candidates[0] };
  return { text: "", pages: [], pageCount: 0, status: "no_text", reason: oa?.isOa ? "No readable open-access copy was found for this DOI." : "No open-access copy and no abstract are available for this DOI.", work, coverage: "none", license: oa?.license, pdfUrl: candidates[0] };
}
