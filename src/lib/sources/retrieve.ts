/**
 * Retrieval over a thesis's source chunks (F5).
 *
 * - `bm25Rank` / `retrieve`: lexical BM25 (k1 = 1.5, b = 0.75) over `SourceChunk.text`, tokenised lowercase without
 *   accents and without EN/ES/FR stopwords. There are no embeddings in this MVP; BM25 is the half of "hybrid
 *   retrieval" that costs nothing and needs no key.
 * - `rerankAndSummarize`: PaperQA2's RCS step when a live model is available: the model scores each candidate for the
 *   question and writes a ~60-word contextual summary; the answer is then built from the best five only.
 * - `groundingBlock`: the numbered passages the model may answer from, `[S1] Author (Year), p. N: "…"`, plus the rule.
 * - `matchPasteToSources`: the constructive side of provenance. Text the student pastes is checked against the
 *   library; when most of its sentences appear in one source, that source is returned so the paste can be attributed
 *   and cited at the moment it happens.
 */

import { db, SourceChunk, ThesisSource } from "@/lib/db";
import { quoteAppearsIn } from "@/lib/scholar";
import { ResolvedProvider, streamCompletion } from "@/lib/ai/providers";

export interface RetrievedPassage {
  /** "S1", "S2"… in the order the model sees them. */
  ref: string;
  chunkId: string;
  sourceId: string;
  index: number;
  page?: number;
  section?: string;
  text: string;
  score: number;
  /** Contextual summary written by the rerank step, when it ran. */
  summary?: string;
  title: string;
  authors?: string;
  year?: string;
}

// ---------------------------------------------------------------------------------------------------------------------
// Tokenisation
// ---------------------------------------------------------------------------------------------------------------------

const STOPWORDS = new Set(
  (
    // English
    "a an the and or but if then else of to in on at by for with from as is are was were be been being this that these those it its into about over under between through during before after above below not no nor so than too very can will would should could may might must do does did doing have has had having i you he she we they me him her us them my your his our their what which who whom whose where when why how all any both each few more most other some such only own same also there here " +
    // Spanish
    "el la los las un una unos unas y o pero si de del a al en con por para como es son era eran fue fueron ser sido se su sus lo le les que quien cual cuales donde cuando porque este esta estos estas ese esa esos esas aquel aquella mi mis tu tus nuestro nuestra nuestros nuestras muy más menos ya no ni sin sobre entre hasta desde hay han ha he " +
    // French
    "le la les un une des du de et ou mais si dans en sur sous avec pour par au aux ce cet cette ces ceux celle celles qui que quoi dont où est sont était étaient été être a ont avait avaient il elle ils elles nous vous je tu on ne pas plus moins très aussi leur leurs mon ma mes ton ta tes notre nos votre vos son sa ses y"
  )
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => stripAccents(w))
);

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Very light stemmer: drops plural and feminine endings so "results"/"result", "méthodes"/"méthode" share a token. */
function stem(w: string) {
  if (w.length <= 4) return w;
  if (/(ces|ses|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (/ies$/.test(w)) return w.slice(0, -3) + "y";
  if (/s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
  return w;
}

export function tokenize(text: string): string[] {
  return stripAccents(text.toLowerCase())
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

// ---------------------------------------------------------------------------------------------------------------------
// BM25
// ---------------------------------------------------------------------------------------------------------------------

const K1 = 1.5;
const B = 0.75;

export interface Scored<T> {
  item: T;
  score: number;
}

/** Ranks `docs` (anything with `text`) for `query` with BM25; only documents sharing at least one term are returned. */
export function bm25Rank<T extends { text: string }>(docs: T[], query: string, k = 12): Scored<T>[] {
  const q = Array.from(new Set(tokenize(query)));
  if (!q.length || !docs.length) return [];
  const tokenised = docs.map((d) => tokenize(d.text));
  const avgLen = tokenised.reduce((n, t) => n + t.length, 0) / docs.length || 1;
  const df = new Map<string, number>();
  for (const terms of tokenised) for (const t of Array.from(new Set(terms))) df.set(t, (df.get(t) || 0) + 1);
  const N = docs.length;
  const out: Scored<T>[] = [];
  tokenised.forEach((terms, i) => {
    if (!terms.length) return;
    const tf = new Map<string, number>();
    for (const t of terms) tf.set(t, (tf.get(t) || 0) + 1);
    let score = 0;
    for (const term of q) {
      const f = tf.get(term);
      if (!f) continue;
      const n = df.get(term) || 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * terms.length) / avgLen)));
    }
    if (score > 0) out.push({ item: docs[i], score });
  });
  return out.sort((a, b) => b.score - a.score).slice(0, k);
}

function sourceMeta(s?: ThesisSource) {
  return { title: s?.title || "Untitled source", authors: s?.authors, year: s?.year };
}

/** Top `k` chunks of a thesis's library for `query`, optionally restricted to some sources. */
export function retrieve(thesisId: string, query: string, k = 12, sourceIds?: string[]): RetrievedPassage[] {
  let chunks = db.sourceChunks.listByThesis(thesisId);
  if (sourceIds?.length) {
    const allow = new Set(sourceIds);
    chunks = chunks.filter((c) => allow.has(c.sourceId));
  }
  const ranked = bm25Rank(chunks, query, k);
  const sources = new Map<string, ThesisSource | undefined>();
  return ranked.map((r, i) => {
    const c = r.item;
    if (!sources.has(c.sourceId)) sources.set(c.sourceId, db.sources.findById(c.sourceId));
    return { ref: `S${i + 1}`, chunkId: c.id, sourceId: c.sourceId, index: c.index, page: c.page, section: c.section, text: c.text, score: r.score, ...sourceMeta(sources.get(c.sourceId)) };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Rerank + contextual summary (PaperQA2's RCS), only with a live provider
// ---------------------------------------------------------------------------------------------------------------------

const RERANK_SYSTEM = `You rank passages from a student's reading list for relevance to a question. For every passage return a relevance score from 0 (irrelevant) to 10 (answers the question directly) and a contextual summary of about 60 words that keeps the facts, numbers and claims relevant to the question, quoting key phrases verbatim. Do not answer the question. Reply with JSON only, an array of objects {"ref": "S1", "relevance": 0-10, "summary": "..."} in any order.`;

export async function rerankAndSummarize(cfg: ResolvedProvider, question: string, passages: RetrievedPassage[], top = 5): Promise<{ passages: RetrievedPassage[]; reranked: boolean; usage: { inputTokens: number; outputTokens: number } }> {
  const usage = { inputTokens: 0, outputTokens: 0 };
  if (cfg.provider === "demo" || !cfg.apiKey || passages.length <= 1) return { passages: renumber(passages.slice(0, top)), reranked: false, usage };
  const list = passages.map((p) => `[${p.ref}] ${p.authors || p.title}${p.year ? ` (${p.year})` : ""}${p.page ? `, p. ${p.page}` : ""}${p.section ? `, ${p.section}` : ""}:\n${p.text.slice(0, 2400)}`).join("\n\n");
  let raw = "";
  for await (const chunk of streamCompletion(cfg, RERANK_SYSTEM, [{ role: "user", content: `Question: ${question}\n\nPassages:\n\n${list}` }], 1800)) {
    if (chunk.type === "delta") raw += chunk.text;
    else if (chunk.type === "usage") Object.assign(usage, { inputTokens: chunk.inputTokens, outputTokens: chunk.outputTokens });
  }
  const parsed = parseJsonArray<{ ref?: string; relevance?: number; summary?: string }>(raw);
  if (!parsed) return { passages: renumber(passages.slice(0, top)), reranked: false, usage };
  const byRef = new Map(parsed.filter((r) => typeof r.ref === "string").map((r) => [r.ref!.toUpperCase().replace(/[\[\]]/g, ""), r]));
  const scored = passages
    .map((p) => ({ p, r: byRef.get(p.ref), rel: Number(byRef.get(p.ref)?.relevance ?? 0) }))
    .filter((x) => x.rel > 0)
    .sort((a, b) => b.rel - a.rel || b.p.score - a.p.score)
    .slice(0, top)
    .map((x) => ({ ...x.p, summary: typeof x.r?.summary === "string" ? x.r.summary.slice(0, 600) : undefined }));
  return { passages: renumber(scored.length ? scored : passages.slice(0, top)), reranked: true, usage };
}

function renumber(passages: RetrievedPassage[]): RetrievedPassage[] {
  return passages.map((p, i) => ({ ...p, ref: `S${i + 1}` }));
}

/** Pulls the first JSON array or object out of a model reply that may be wrapped in prose or code fences. */
export function parseJsonArray<T>(raw: string): T[] | null {
  const v = parseJsonLoose(raw);
  return Array.isArray(v) ? (v as T[]) : null;
}

export function parseJsonLoose(raw: string): unknown {
  const text = raw.replace(/```(?:json)?/gi, "").trim();
  const starts = [text.indexOf("{"), text.indexOf("[")].filter((i) => i >= 0);
  if (!starts.length) return null;
  const start = Math.min(...starts);
  const closer = text[start] === "{" ? "}" : "]";
  const end = text.lastIndexOf(closer);
  if (end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Grounding block
// ---------------------------------------------------------------------------------------------------------------------

export function passageLabel(p: Pick<RetrievedPassage, "authors" | "title" | "year" | "page">) {
  const who = p.authors?.trim() || p.title;
  return `${who}${p.year ? ` (${p.year})` : ""}${p.page ? `, p. ${p.page}` : ""}`;
}

export const GROUNDING_RULE =
  "Answer only from these passages. Cite each claim with the passage number in square brackets, like [S1]; quote short phrases verbatim when you can. If the passages do not contain the answer, say so plainly instead of answering from general knowledge, and do not add claims that no passage supports.";

/** The numbered passages a grounded answer may draw on, as the model sees them. */
export function groundingBlock(passages: RetrievedPassage[], maxCharsPerPassage = 2000): string {
  if (!passages.length) return `Passages from the student's source library: none matched this question.\n\n${GROUNDING_RULE} Since no passage matched, say that the library has no passage on this and suggest which source or search term might.`;
  const lines = passages.map((p) => `[${p.ref}] ${passageLabel(p)}${p.section ? ` — ${p.section}` : ""}: "${p.text.slice(0, maxCharsPerPassage).replace(/\s+/g, " ").trim()}"${p.summary ? `\n    Context: ${p.summary}` : ""}`);
  return `Passages from the student's source library:\n\n${lines.join("\n\n")}\n\n${GROUNDING_RULE}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// API view of a source
// ---------------------------------------------------------------------------------------------------------------------

export type SourceCoverage = "full_text" | "abstract" | "none";

/** What the library indexed for a source: pages of text, an abstract only, or nothing. */
export function coverageOf(s: ThesisSource): SourceCoverage {
  if (s.parseStatus !== "parsed" || !s.text) return "none";
  if (s.pages && s.pages > 0) return "full_text";
  if (s.kind === "doi" && s.abstract && s.text.trim() === s.abstract.trim()) return "abstract";
  return "full_text";
}

export type PublicSource = Omit<ThesisSource, "text"> & { coverage: SourceCoverage; chunkCount: number };

/** The source as the API returns it: no extracted text (that lives in chunks), plus coverage and chunk count. */
export function publicSource(s: ThesisSource): PublicSource {
  const { text: _text, ...rest } = s;
  void _text;
  return { ...rest, coverage: coverageOf(s), chunkCount: db.sourceChunks.listBySource(s.id).length };
}

// ---------------------------------------------------------------------------------------------------------------------
// Paste attribution
// ---------------------------------------------------------------------------------------------------------------------

export interface PasteSourceMatch {
  sourceId: string;
  title: string;
  authors?: string;
  year?: string;
  page?: number;
  /** Share of the pasted sentences (≥ 8 words) found in the source, 0–1. */
  share: number;
  doi?: string;
  url?: string;
}

const MIN_SENTENCE_WORDS = 8;
const MIN_SHARE = 0.6;

/** Sentences of at least 8 words, the unit a student is likely to copy. */
export function pasteSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…]["”')\]]?)\s+(?=["“'(\[]?[A-ZÀ-ÖØ-Þ0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.split(" ").length >= MIN_SENTENCE_WORDS)
    .slice(0, 60);
}

/** Pure matcher over a chunk list, used by `matchPasteToSources` and by tests. */
export function matchPasteToChunks(chunks: SourceChunk[], text: string, sources: (id: string) => ThesisSource | undefined): PasteSourceMatch | null {
  const sentences = pasteSentences(text);
  if (!sentences.length) return null;
  const bySource = new Map<string, SourceChunk[]>();
  for (const c of chunks) {
    const arr = bySource.get(c.sourceId) || [];
    arr.push(c);
    bySource.set(c.sourceId, arr);
  }
  let best: PasteSourceMatch | null = null;
  for (const [sourceId, list] of Array.from(bySource.entries())) {
    const ordered = [...list].sort((a, b) => a.index - b.index);
    const whole = ordered.map((c) => c.text).join(" ");
    let hits = 0;
    let page: number | undefined;
    for (const s of sentences) {
      const inChunk = ordered.find((c) => quoteAppearsIn(s, c.text));
      if (inChunk) {
        hits++;
        if (page === undefined) page = inChunk.page;
      } else if (quoteAppearsIn(s, whole)) hits++;
    }
    const share = hits / sentences.length;
    if (share >= MIN_SHARE && (!best || share > best.share)) {
      const src = sources(sourceId);
      best = { sourceId, page, share, doi: src?.doi, url: src?.url, ...{ title: src?.title || "Untitled source", authors: src?.authors, year: src?.year } };
    }
  }
  return best;
}

/** Best library source for a pasted text, when at least 60 % of its sentences appear in that source; else null. */
export function matchPasteToSources(thesisId: string, text: string): PasteSourceMatch | null {
  const chunks = db.sourceChunks.listByThesis(thesisId);
  if (!chunks.length) return null;
  return matchPasteToChunks(chunks, text, (id) => db.sources.findById(id));
}
