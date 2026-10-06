/**
 * Thin clients for the open scholarly graphs the literature features sit on:
 * OpenAlex (search, works, abstracts, retraction flag), Crossref (DOI resolution, bibliographic matching),
 * Semantic Scholar (title match, snippet search; optional key) and Unpaywall (open-access PDF links).
 *
 * Rules shared by every feature that uses these:
 * - The model never emits bibliographic strings; it picks identifiers from candidates returned here.
 * - "Not found" is shown as Unverified, never as fabricated.
 * - Semantic Scholar and CORE require visible attribution in the UI.
 */

const OPENALEX = "https://api.openalex.org";
const CROSSREF = "https://api.crossref.org";
const S2 = "https://api.semanticscholar.org/graph/v1";
const UNPAYWALL = "https://api.unpaywall.org/v2";

const MAILTO = process.env.OPENALEX_MAILTO || process.env.CROSSREF_MAILTO || "hello@thesisfic.edu";
const OPENALEX_KEY = process.env.OPENALEX_API_KEY;
const S2_KEY = process.env.S2_API_KEY;
const UA = `Thesisfic/1.0 (academic writing platform; mailto:${MAILTO})`;

export interface ScholarWork {
  id: string; // openalex id (W…) when known, else "doi:…" or "s2:…"
  openalexId?: string;
  s2Id?: string;
  doi?: string;
  pmid?: string;
  title: string;
  authors: string; // "Last, I., Last, I."
  year?: string;
  venue?: string;
  type?: string; // article, book, preprint…
  abstract?: string;
  citedByCount?: number;
  isRetracted?: boolean;
  oaUrl?: string; // best open-access PDF/landing when known
  landingUrl?: string;
  source: "openalex" | "crossref" | "s2";
}

const timeoutFetch = async (url: string, init: RequestInit = {}, ms = 12000) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "application/json", ...(init.headers || {}) } });
  } finally {
    clearTimeout(t);
  }
};

/** OpenAlex stores abstracts as an inverted index; rebuild the text. */
export function reconstructAbstract(inv?: Record<string, number[]> | null): string | undefined {
  if (!inv) return undefined;
  const words: [number, string][] = [];
  for (const [w, positions] of Object.entries(inv)) for (const p of positions) words.push([p, w]);
  words.sort((a, b) => a[0] - b[0]);
  const text = words.map((w) => w[1]).join(" ").trim();
  return text || undefined;
}

export function normalizeDoi(input: string): string | undefined {
  const m = input.match(/10\.\d{4,9}\/[^\s"'<>]+/i);
  return m ? m[0].replace(/[.,;)\]]+$/, "").toLowerCase() : undefined;
}

export function formatAuthors(list: { name?: string; family?: string; given?: string }[] = [], max = 6): string {
  const names = list.slice(0, max).map((a) => {
    if (a.family) return `${a.family}, ${(a.given || "").split(/\s+/).filter(Boolean).map((g) => g[0] + ".").join(" ")}`.trim();
    const parts = (a.name || "").trim().split(/\s+/);
    if (parts.length < 2) return a.name || "";
    const family = parts.pop()!;
    return `${family}, ${parts.map((g) => g[0] + ".").join(" ")}`;
  });
  return names.join(", ") + (list.length > max ? ", et al." : "");
}

function fromOpenAlex(w: Record<string, unknown>): ScholarWork {
  const ids = (w.ids as Record<string, string>) || {};
  const authorships = (w.authorships as { author?: { display_name?: string } }[]) || [];
  const loc = (w.best_oa_location as { pdf_url?: string; landing_page_url?: string }) || null;
  const primary = (w.primary_location as { source?: { display_name?: string }; landing_page_url?: string }) || null;
  return {
    id: String(w.id || "").replace("https://openalex.org/", ""),
    openalexId: String(w.id || "").replace("https://openalex.org/", ""),
    doi: w.doi ? normalizeDoi(String(w.doi)) : undefined,
    pmid: ids.pmid ? String(ids.pmid).replace(/^.*\//, "") : undefined,
    title: String(w.display_name || w.title || "Untitled"),
    authors: formatAuthors(authorships.map((a) => ({ name: a.author?.display_name }))),
    year: w.publication_year ? String(w.publication_year) : undefined,
    venue: primary?.source?.display_name,
    type: typeof w.type === "string" ? w.type : undefined,
    abstract: reconstructAbstract(w.abstract_inverted_index as Record<string, number[]> | null),
    citedByCount: typeof w.cited_by_count === "number" ? w.cited_by_count : undefined,
    isRetracted: !!w.is_retracted,
    oaUrl: loc?.pdf_url || loc?.landing_page_url || undefined,
    landingUrl: primary?.landing_page_url || (w.doi ? String(w.doi) : undefined),
    source: "openalex",
  };
}

const OA_FIELDS = "id,ids,doi,display_name,title,authorships,publication_year,primary_location,best_oa_location,type,abstract_inverted_index,cited_by_count,is_retracted";

function oaParams(extra: Record<string, string>) {
  const p = new URLSearchParams({ mailto: MAILTO, ...extra });
  if (OPENALEX_KEY) p.set("api_key", OPENALEX_KEY);
  return p.toString();
}

/** Relevance search over OpenAlex works. `semantic` uses the embedding search (keyed, 1 rps) when a key is set. */
export async function openAlexSearch(query: string, opts: { perPage?: number; semantic?: boolean; fromYear?: number } = {}): Promise<ScholarWork[]> {
  const q = query.trim().slice(0, 500);
  if (!q) return [];
  const perPage = Math.min(25, opts.perPage || 10);
  const params: Record<string, string> = { "per-page": String(perPage), select: OA_FIELDS };
  if (opts.semantic && OPENALEX_KEY) params["search.semantic"] = q;
  else params.search = q;
  if (opts.fromYear) params.filter = `publication_year:>${opts.fromYear - 1}`;
  const res = await timeoutFetch(`${OPENALEX}/works?${oaParams(params)}`);
  if (!res.ok) throw new Error(`OpenAlex search failed (${res.status})`);
  const json = await res.json();
  return ((json.results as Record<string, unknown>[]) || []).map(fromOpenAlex);
}

/** Single work lookup by OpenAlex id or DOI (free tier on OpenAlex). */
export async function openAlexWork(idOrDoi: string): Promise<ScholarWork | null> {
  const doi = normalizeDoi(idOrDoi);
  const path = doi ? `https://doi.org/${doi}` : idOrDoi.replace("https://openalex.org/", "");
  const res = await timeoutFetch(`${OPENALEX}/works/${encodeURIComponent(path)}?${oaParams({ select: OA_FIELDS })}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OpenAlex lookup failed (${res.status})`);
  return fromOpenAlex(await res.json());
}

function fromCrossref(m: Record<string, unknown>): ScholarWork {
  const authors = (m.author as { family?: string; given?: string; name?: string }[]) || [];
  const issued = (m.issued as { "date-parts"?: number[][] })?.["date-parts"]?.[0]?.[0];
  const title = ((m.title as string[]) || [])[0] || "Untitled";
  const container = ((m["container-title"] as string[]) || [])[0];
  const abstract = typeof m.abstract === "string" ? m.abstract.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : undefined;
  const doi = m.DOI ? normalizeDoi(String(m.DOI)) : undefined;
  return {
    id: doi ? `doi:${doi}` : `crossref:${title}`,
    doi,
    title,
    authors: formatAuthors(authors),
    year: issued ? String(issued) : undefined,
    venue: container,
    type: typeof m.type === "string" ? m.type : undefined,
    abstract,
    citedByCount: typeof m["is-referenced-by-count"] === "number" ? (m["is-referenced-by-count"] as number) : undefined,
    landingUrl: typeof m.URL === "string" ? m.URL : undefined,
    source: "crossref",
  };
}

/** Resolve a DOI through Crossref. */
export async function crossrefWork(doi: string): Promise<ScholarWork | null> {
  const d = normalizeDoi(doi);
  if (!d) return null;
  const res = await timeoutFetch(`${CROSSREF}/works/${encodeURIComponent(d)}?mailto=${encodeURIComponent(MAILTO)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Crossref lookup failed (${res.status})`);
  const json = await res.json();
  return fromCrossref(json.message);
}

/** Match a free-text reference string (Crossref's query.bibliographic is built for this). Returns best candidates with Crossref's score. */
export async function crossrefBibliographic(reference: string, rows = 3): Promise<(ScholarWork & { score: number })[]> {
  const q = reference.trim().slice(0, 500);
  if (!q) return [];
  const params = new URLSearchParams({ "query.bibliographic": q, rows: String(rows), mailto: MAILTO, select: "DOI,title,author,issued,container-title,type,is-referenced-by-count,URL,abstract,score" });
  const res = await timeoutFetch(`${CROSSREF}/works?${params}`);
  if (!res.ok) throw new Error(`Crossref search failed (${res.status})`);
  const json = await res.json();
  return ((json.message?.items as Record<string, unknown>[]) || []).map((m) => ({ ...fromCrossref(m), score: Number(m.score || 0) }));
}

export const s2Available = () => !!S2_KEY;

function s2Headers(): Record<string, string> {
  return S2_KEY ? { "x-api-key": S2_KEY } : {};
}

/** Semantic Scholar title match (returns the closest paper). Requires S2_API_KEY for reliable rate limits. */
export async function s2MatchTitle(title: string): Promise<ScholarWork | null> {
  const params = new URLSearchParams({ query: title.slice(0, 300), fields: "paperId,externalIds,title,authors,year,venue,abstract,citationCount,openAccessPdf,publicationTypes" });
  const res = await timeoutFetch(`${S2}/paper/search/match?${params}`, { headers: s2Headers() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Semantic Scholar match failed (${res.status})`);
  const json = await res.json();
  const p = (json.data || [])[0];
  return p ? fromS2(p) : null;
}

/** Semantic Scholar snippet search: ~500-word passages from paper bodies that match a query. */
export async function s2SnippetSearch(query: string, limit = 10): Promise<{ text: string; section?: string; work: ScholarWork }[]> {
  const params = new URLSearchParams({ query: query.slice(0, 500), limit: String(Math.min(limit, 20)) });
  const res = await timeoutFetch(`${S2}/snippet/search?${params}`, { headers: s2Headers() });
  if (!res.ok) throw new Error(`Semantic Scholar snippet search failed (${res.status})`);
  const json = await res.json();
  return ((json.data as { snippet?: { text?: string; section?: string }; paper?: Record<string, unknown> }[]) || [])
    .filter((d) => d.snippet?.text && d.paper)
    .map((d) => ({ text: d.snippet!.text!, section: d.snippet!.section, work: fromS2(d.paper!) }));
}

function fromS2(p: Record<string, unknown>): ScholarWork {
  const ext = (p.externalIds as Record<string, string>) || {};
  const authors = (p.authors as { name?: string }[]) || [];
  const oa = p.openAccessPdf as { url?: string } | null;
  return {
    id: `s2:${p.paperId}`,
    s2Id: String(p.paperId || ""),
    doi: ext.DOI ? normalizeDoi(ext.DOI) : undefined,
    pmid: ext.PubMed,
    title: String(p.title || "Untitled"),
    authors: formatAuthors(authors),
    year: p.year ? String(p.year) : undefined,
    venue: typeof p.venue === "string" ? p.venue : undefined,
    type: Array.isArray(p.publicationTypes) ? String((p.publicationTypes as string[])[0] || "").toLowerCase() : undefined,
    abstract: typeof p.abstract === "string" ? p.abstract : undefined,
    citedByCount: typeof p.citationCount === "number" ? p.citationCount : undefined,
    oaUrl: oa?.url,
    source: "s2",
  };
}

/** Open-access location for a DOI. Unpaywall needs a real contact email. */
export async function unpaywall(doi: string): Promise<{ pdfUrl?: string; landingUrl?: string; license?: string; isOa: boolean } | null> {
  const d = normalizeDoi(doi);
  if (!d) return null;
  const res = await timeoutFetch(`${UNPAYWALL}/${encodeURIComponent(d)}?email=${encodeURIComponent(MAILTO)}`);
  if (!res.ok) return null;
  const json = await res.json();
  const best = json.best_oa_location || null;
  return { isOa: !!json.is_oa, pdfUrl: best?.url_for_pdf || undefined, landingUrl: best?.url || undefined, license: best?.license || undefined };
}

/** True when `quote` appears (normalised) inside `text`: the string check every shown snippet must pass. */
export function quoteAppearsIn(quote: string, text: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[‘’“”]/g, "'").replace(/[^a-z0-9À-ɏ' ]+/g, " ").replace(/\s+/g, " ").trim();
  const q = norm(quote);
  const t = norm(text);
  if (!q || q.split(" ").length < 4) return false;
  return t.includes(q);
}
