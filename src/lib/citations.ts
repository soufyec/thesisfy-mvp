import dns from "dns/promises";
import net from "net";
import type { Reference } from "./db";

/** A citation candidate. `origin` says where the metadata came from so the UI can tell verified data from AI suggestions. */
export interface CitationCandidate extends Omit<Reference, "id"> {
  origin: "crossref" | "openlibrary" | "page" | "ai";
  verified: boolean;
  note?: string;
}

const UA = "Thesisfy/1.0 (academic citation lookup; https://thesisfy-mvp-bbe1.vercel.app)";
const DOI_RE = /\b(10\.\d{4,9}\/[^\s"<>]+)/i;

export function extractDoi(text: string): string | null {
  const m = text.match(DOI_RE);
  return m ? m[1].replace(/[).,;\]]+$/, "") : null;
}

export function extractIsbn(text: string): string | null {
  const cleaned = text.replace(/[-\s]/g, "");
  const m = cleaned.match(/(?:ISBN(?:-1[03])?:?)?(97[89]\d{10}|\d{9}[\dXx])/i);
  if (!m) return null;
  // avoid treating long numeric strings inside URLs/DOIs as ISBNs
  if (/doi|http/i.test(text) && !/isbn/i.test(text)) return null;
  return m[1].toUpperCase();
}

async function fetchJson(url: string, ms = 8000) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(ms), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

type CrossrefItem = {
  DOI?: string;
  type?: string;
  title?: string[];
  "container-title"?: string[];
  publisher?: string;
  author?: { given?: string; family?: string; name?: string }[];
  editor?: { given?: string; family?: string; name?: string }[];
  issued?: { "date-parts"?: number[][] };
  published?: { "date-parts"?: number[][] };
  volume?: string;
  issue?: string;
  page?: string;
  URL?: string;
};

function authorList(people?: { given?: string; family?: string; name?: string }[]): string {
  if (!people?.length) return "";
  const fmt = (p: { given?: string; family?: string; name?: string }) => {
    if (p.name) return p.name;
    const initials = (p.given || "")
      .split(/[\s-]+/)
      .filter(Boolean)
      .map((g) => g[0].toUpperCase() + ".")
      .join(" ");
    return [p.family, initials].filter(Boolean).join(", ");
  };
  const list = people.slice(0, 20).map(fmt);
  if (list.length === 1) return list[0];
  return list.slice(0, -1).join(", ") + ", & " + list[list.length - 1];
}

function crossrefType(t?: string): Reference["type"] {
  if (!t) return "article";
  if (t.includes("book-chapter")) return "chapter";
  if (t.includes("book")) return "book";
  if (t.includes("dissertation")) return "thesis";
  if (t.includes("posted-content") || t.includes("report")) return "web";
  return "article";
}

function fromCrossref(it: CrossrefItem): CitationCandidate {
  const year = (it.issued?.["date-parts"]?.[0]?.[0] || it.published?.["date-parts"]?.[0]?.[0] || "").toString();
  const type = crossrefType(it.type);
  return {
    type,
    authors: authorList(it.author?.length ? it.author : it.editor),
    year,
    title: (it.title?.[0] || "").replace(/<[^>]+>/g, ""),
    source: it["container-title"]?.[0] || it.publisher || "",
    volume: it.volume,
    issue: it.issue,
    pages: it.page,
    doi: it.DOI,
    url: it.DOI ? `https://doi.org/${it.DOI}` : it.URL,
    origin: "crossref",
    verified: true,
  };
}

export async function lookupDoi(doi: string): Promise<CitationCandidate | null> {
  try {
    const data = await fetchJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
    return fromCrossref(data.message as CrossrefItem);
  } catch {
    return null;
  }
}

export async function searchCrossref(query: string, rows = 5): Promise<CitationCandidate[]> {
  try {
    const q = encodeURIComponent(query.slice(0, 300));
    const data = await fetchJson(`https://api.crossref.org/works?query.bibliographic=${q}&rows=${rows}&filter=has-full-text:false`).catch(() => fetchJson(`https://api.crossref.org/works?query.bibliographic=${q}&rows=${rows}`));
    const items: CrossrefItem[] = data?.message?.items || [];
    return items.filter((i) => i.title?.[0]).map(fromCrossref);
  } catch {
    return [];
  }
}

export async function lookupIsbn(isbn: string): Promise<CitationCandidate | null> {
  try {
    const data = await fetchJson(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
    const b = data[`ISBN:${isbn}`];
    if (!b) return null;
    return {
      type: "book",
      authors: (b.authors || []).map((a: { name: string }) => {
        const parts = a.name.trim().split(/\s+/);
        const family = parts.pop() || "";
        return [family, parts.map((p) => p[0] + ".").join(" ")].filter(Boolean).join(", ");
      }).join(", "),
      year: (b.publish_date || "").match(/\d{4}/)?.[0] || "",
      title: [b.title, b.subtitle].filter(Boolean).join(": "),
      source: (b.publishers || []).map((p: { name: string }) => p.name).join(", "),
      pages: b.number_of_pages ? String(b.number_of_pages) : undefined,
      url: b.url,
      origin: "openlibrary",
      verified: true,
    };
  } catch {
    return null;
  }
}

function isPrivateIp(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v === "::";
}

/** Fetches a public web page safely (no private networks, size and time limits) and returns its HTML head + some text. */
async function fetchPublicPage(raw: string): Promise<{ html: string; finalUrl: string } | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  for (let hop = 0; hop < 4; hop++) {
    if (!/^https?:$/.test(url.protocol) || /^(localhost|.*\.local|.*\.internal)$/i.test(url.hostname)) return null;
    const addrs = await dns.lookup(url.hostname, { all: true }).catch(() => []);
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) return null;
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" }, redirect: "manual", signal: AbortSignal.timeout(8000), cache: "no-store" }).catch(() => null);
    if (!res) return null;
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < 600_000) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => {});
    const html = new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
    return { html, finalUrl: url.toString() };
  }
  return null;
}

function metaAll(html: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name.replace(/[.:]/g, "\\$&")}["'][^>]*>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const c = m[0].match(/content=["']([^"']*)["']/i);
    if (c) out.push(decode(c[1]));
  }
  return out;
}
const meta = (html: string, ...names: string[]) => {
  for (const n of names) {
    const v = metaAll(html, n)[0];
    if (v) return v;
  }
  return "";
};
function decode(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim();
}

export async function lookupUrl(raw: string): Promise<{ candidate: CitationCandidate | null; pageText?: string; finalUrl?: string }> {
  const doiInUrl = extractDoi(raw);
  if (doiInUrl) {
    const c = await lookupDoi(doiInUrl);
    if (c) return { candidate: c };
  }
  const page = await fetchPublicPage(raw);
  if (!page) return { candidate: null };
  const { html, finalUrl } = page;
  // Only a DOI the page declares about itself; a DOI found elsewhere in the body usually belongs to a cited work.
  const doi = meta(html, "citation_doi", "dc.identifier", "DC.Identifier", "prism.doi", "bepress_citation_doi") || "";
  const cleanDoi = extractDoi(doi);
  if (cleanDoi) {
    const c = await lookupDoi(cleanDoi);
    if (c) return { candidate: { ...c, url: c.url || finalUrl } };
  }
  const authors = metaAll(html, "citation_author").length ? metaAll(html, "citation_author") : metaAll(html, "dc.creator").length ? metaAll(html, "dc.creator") : metaAll(html, "author");
  const title = meta(html, "citation_title", "dc.title", "og:title", "twitter:title") || decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const date = meta(html, "citation_publication_date", "citation_date", "dc.date", "article:published_time", "datePublished");
  const site = meta(html, "citation_journal_title", "og:site_name") || new URL(finalUrl).hostname.replace(/^www\./, "");
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 4000);
  const candidate: CitationCandidate = {
    type: metaAll(html, "citation_journal_title").length ? "article" : "web",
    authors: authors
      .map((a) => {
        if (a.includes(",")) {
          const [family, given = ""] = a.split(",").map((x) => x.trim());
          return [family, given.split(/[\s-]+/).filter(Boolean).map((g) => g[0].toUpperCase() + ".").join(" ")].filter(Boolean).join(", ");
        }
        const p = a.split(/\s+/);
        const f = p.pop() || "";
        return [f, p.map((x) => x[0].toUpperCase() + ".").join(" ")].filter(Boolean).join(", ");
      })
      .join(", "),
    year: date.match(/\d{4}/)?.[0] || "",
    title,
    source: site,
    volume: meta(html, "citation_volume") || undefined,
    issue: meta(html, "citation_issue") || undefined,
    pages: [meta(html, "citation_firstpage"), meta(html, "citation_lastpage")].filter(Boolean).join("-") || undefined,
    url: finalUrl,
    origin: "page",
    verified: !!(title && (authors.length || date)),
    note: authors.length || date ? undefined : "The page does not declare an author or date: add them by hand.",
  };
  return { candidate: title ? candidate : null, pageText: text, finalUrl };
}
