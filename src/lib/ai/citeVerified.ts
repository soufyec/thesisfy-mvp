/**
 * Verified citations with a supporting passage, and the reference checker.
 *
 * Anti-fabrication rules (see src/components/editor/citations/README.md):
 * - Candidates come only from the open graphs (OpenAlex, Semantic Scholar). The model never emits a title, author, DOI or year.
 * - The model picks candidates by id and must quote at most 40 words verbatim from the candidate's passage; the server
 *   re-checks every quote with `quoteAppearsIn` and drops anything that fails. What the student sees has passed that check.
 * - A reference the registries cannot resolve is "unverified", never "fabricated".
 * - Retractions come from OpenAlex `is_retracted` and are surfaced as their own status.
 */

import type { Reference } from "@/lib/db";
import { crossrefBibliographic, crossrefWork, normalizeDoi, openAlexSearch, openAlexWork, quoteAppearsIn, s2Available, s2MatchTitle, s2SnippetSearch, ScholarWork } from "@/lib/scholar";
import { ResolvedProvider, streamCompletion } from "@/lib/ai/providers";

// ---------- Find support for a claim ----------

export interface SupportCandidate {
  id: string; // "c1", "c2"… stable for one request only
  work: ScholarWork;
  /** Abstract (OpenAlex) or body snippet (Semantic Scholar) the quote must come from. */
  passage: string;
  section?: string;
}

export interface SupportResult {
  candidateId: string;
  work: ScholarWork;
  /** Verbatim fragment of the passage, ≤ 40 words, verified by string match. */
  quote: string;
  relevance: number; // 1–5
  why: string;
  section?: string;
  verified: true;
}

export interface FindSupportOptions {
  /** Resolved provider for the model step; omitted or `demo` runs the deterministic path. */
  cfg?: ResolvedProvider | null;
  maxCandidates?: number; // default 12
  maxResults?: number; // default 5
  fromYear?: number;
  /** Test hook: skip the network searches and use these candidates. */
  candidates?: SupportCandidate[];
}

export interface FindSupportOutput {
  results: SupportResult[];
  candidateCount: number;
  aiUsed: boolean;
  usage: { inputTokens: number; outputTokens: number };
  /** Data sources that answered this request; the UI shows them in the footer (Semantic Scholar licence requires it). */
  attribution: string[];
  warnings: string[];
}

const STOPWORDS = new Set(
  "a an the and or but of in on at to for from by with without as is are was were be been being this that these those it its their there which who whom whose what when where why how not no nor so than then too very can could may might must shall should will would do does did done has have had having we our us you your they them he she his her i my me also into onto over under between among about across after before during through while such more most less least much many few each every both either any all some own same other another only just even still yet already often never always"
    .split(/\s+/)
);

/** Content words of a claim, for the keyword search when no semantic search key is set. */
export function cleanQuery(claim: string, maxWords = 14): string {
  const words = claim
    .toLowerCase()
    .replace(/[“”"'‘’()[\]{}:;,.!?]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= maxWords) break;
  }
  return out.join(" ") || claim.trim().slice(0, 200);
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const firstWords = (s: string, n: number) => s.trim().split(/\s+/).filter(Boolean).slice(0, n).join(" ");

/** First sentence of a passage, capped at `maxWords`; falls back to the first words when the sentence is too short. */
export function firstSentence(passage: string, maxWords = 40): string {
  const text = passage.replace(/\s+/g, " ").trim();
  const m = text.match(/^.+?[.!?](?=\s|$)/);
  const sentence = m ? m[0] : text;
  if (wordCount(sentence) >= 4 && wordCount(sentence) <= maxWords) return sentence;
  return firstWords(text, maxWords);
}

const workKey = (w: ScholarWork) => w.doi || w.openalexId || w.s2Id || w.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function gatherCandidates(claim: string, opts: FindSupportOptions, warnings: string[], attribution: Set<string>): Promise<SupportCandidate[]> {
  const max = Math.min(12, opts.maxCandidates || 12);
  const semantic = !!process.env.OPENALEX_API_KEY;
  const query = semantic ? claim : cleanQuery(claim);
  const [oa, s2] = await Promise.all([
    openAlexSearch(query, { perPage: 10, semantic, fromYear: opts.fromYear }).catch((e: Error) => {
      warnings.push(`OpenAlex search unavailable (${e.message}).`);
      return [] as ScholarWork[];
    }),
    s2Available()
      ? s2SnippetSearch(claim, 8).catch((e: Error) => {
          warnings.push(`Semantic Scholar snippet search unavailable (${e.message}).`);
          return [] as { text: string; section?: string; work: ScholarWork }[];
        })
      : Promise.resolve([] as { text: string; section?: string; work: ScholarWork }[]),
  ]);
  if (oa.length) attribution.add("OpenAlex");
  if (s2.length) attribution.add("Semantic Scholar");

  const seen = new Set<string>();
  const out: SupportCandidate[] = [];
  const push = (work: ScholarWork, passage: string | undefined, section?: string) => {
    const text = (passage || "").replace(/\s+/g, " ").replace(/^(?:abstract|summary)\b[\s:.\-–—]*/i, "").trim();
    if (!text || wordCount(text) < 8) return; // nothing quotable, nothing to verify
    const key = workKey(work);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ id: `c${out.length + 1}`, work, passage: text.slice(0, 4000), section });
  };
  // Interleave so the keyword list does not crowd out the body snippets.
  const n = Math.max(oa.length, s2.length);
  for (let i = 0; i < n && out.length < max; i++) {
    if (s2[i]) push(s2[i].work, s2[i].text, s2[i].section || "body");
    if (oa[i]) push(oa[i], oa[i].abstract, "abstract");
  }
  return out;
}

const PICK_SYSTEM = `You help a student find published sources that support a claim in their thesis.
You receive a CLAIM and a numbered list of CANDIDATES, each with an id, bibliographic line and a PASSAGE (abstract or body excerpt).
Choose at most 5 candidates whose passage genuinely supports, qualifies or is directly relevant to the claim.
Return ONLY a JSON array: [{"candidateId": "c3", "quote": "...", "relevance": 4, "why": "..."}]
Rules:
- candidateId must be one of the given ids. Never add sources that are not in the list.
- quote must be copied VERBATIM from that candidate's PASSAGE (same words, same order, no ellipses, no paraphrase), at most 40 words. It will be checked by exact string match and dropped if it does not match.
- relevance is an integer 1–5 (5 = the passage states the claim directly).
- why is one sober sentence (max 25 words) saying how the passage relates to the claim.
- If nothing is relevant, return [].`;

interface Pick {
  candidateId: string;
  quote: string;
  relevance: number;
  why: string;
}

function parsePicks(text: string): Pick[] {
  const jsonText = text.match(/\[[\s\S]*\]/)?.[0];
  if (!jsonText) return [];
  try {
    const arr = JSON.parse(jsonText);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((p) => p && typeof p.candidateId === "string" && typeof p.quote === "string")
      .map((p) => ({ candidateId: String(p.candidateId).trim(), quote: String(p.quote).trim(), relevance: Math.min(5, Math.max(1, Math.round(Number(p.relevance) || 3))), why: String(p.why || "").trim().slice(0, 240) }));
  } catch {
    return [];
  }
}

/** Server-side check: the quote (trimmed to 40 words) must appear verbatim in the candidate's passage. */
export function verifyQuote(quote: string, passage: string): string | null {
  const q = firstWords(quote.replace(/^["“'‘]+|["”'’.]+$/g, ""), 40);
  return quoteAppearsIn(q, passage) ? q : null;
}

function demoPicks(candidates: SupportCandidate[], max: number): SupportResult[] {
  const out: SupportResult[] = [];
  for (const c of candidates) {
    const quote = verifyQuote(firstSentence(c.passage), c.passage);
    if (!quote) continue;
    out.push({ candidateId: c.id, work: c.work, quote, relevance: 3, why: `Top search result for the claim; the quote is the opening of the ${c.section || "passage"}. Read the source before citing it.`, section: c.section, verified: true });
    if (out.length >= max) break;
  }
  return out;
}

/** Fill retraction flag, citation count and ids from OpenAlex when the search source did not provide them (single lookups are free). */
async function enrich(results: SupportResult[]): Promise<void> {
  let lookups = 0;
  for (const r of results) {
    const w = r.work;
    const missing = w.isRetracted === undefined || w.citedByCount === undefined || !w.openalexId;
    if (!missing || lookups >= 5) continue;
    const key = w.openalexId || w.doi;
    if (!key) continue;
    lookups++;
    const full = await openAlexWork(key).catch(() => null);
    if (!full) continue;
    r.work = { ...w, openalexId: full.openalexId || w.openalexId, pmid: w.pmid || full.pmid, isRetracted: full.isRetracted, citedByCount: w.citedByCount ?? full.citedByCount, type: w.type || full.type, venue: w.venue || full.venue, oaUrl: w.oaUrl || full.oaUrl, landingUrl: w.landingUrl || full.landingUrl };
    await sleep(120);
  }
}

/**
 * Finds published sources whose abstract or body passage supports `claim`.
 * With a real provider the model picks candidates and quotes them; without one (demo) the top search hits are returned
 * with the passage's first sentence as the quote. Every quote shown has passed the verbatim check.
 */
export async function findSupportingSources(claim: string, opts: FindSupportOptions = {}): Promise<FindSupportOutput> {
  const warnings: string[] = [];
  const attribution = new Set<string>();
  const text = claim.replace(/\s+/g, " ").trim().slice(0, 1500);
  const maxResults = Math.min(5, opts.maxResults || 5);
  const candidates = opts.candidates ? opts.candidates.slice(0, 12) : text ? await gatherCandidates(text, opts, warnings, attribution) : [];
  const out: FindSupportOutput = { results: [], candidateCount: candidates.length, aiUsed: false, usage: { inputTokens: 0, outputTokens: 0 }, attribution: Array.from(attribution), warnings };
  if (!candidates.length) {
    if (!warnings.length) warnings.push("No indexed work with a quotable abstract matched this claim. Coverage of Spanish- and French-language literature in these indexes is limited.");
    return out;
  }

  const cfg = opts.cfg;
  if (cfg && cfg.provider !== "demo") {
    const list = candidates
      .map((c) => `[${c.id}] ${c.work.authors || "Unknown authors"} (${c.work.year || "n.d."}). ${c.work.title}. ${c.work.venue || ""}\nPASSAGE: ${c.passage.slice(0, 1800)}`)
      .join("\n\n");
    let answer = "";
    let err: string | undefined;
    for await (const chunk of streamCompletion(cfg, PICK_SYSTEM, [{ role: "user", content: `CLAIM:\n${text}\n\nCANDIDATES:\n${list}` }], 1200)) {
      if (chunk.type === "delta") answer += chunk.text;
      else if (chunk.type === "usage") out.usage = { inputTokens: chunk.inputTokens, outputTokens: chunk.outputTokens };
      else if (chunk.type === "error") err = chunk.message;
    }
    if (err && !answer) warnings.push(`The model did not answer (${err}); showing search order instead.`);
    else {
      out.aiUsed = true;
      const picks = parsePicks(answer);
      const used = new Set<string>();
      let dropped = 0;
      for (const p of picks) {
        const c = candidates.find((x) => x.id === p.candidateId);
        if (!c || used.has(c.id)) continue;
        const quote = verifyQuote(p.quote, c.passage);
        if (!quote) {
          dropped++;
          continue;
        }
        used.add(c.id);
        out.results.push({ candidateId: c.id, work: c.work, quote, relevance: p.relevance, why: p.why || "Selected by the model as relevant to the claim.", section: c.section, verified: true });
        if (out.results.length >= maxResults) break;
      }
      if (dropped) warnings.push(`${dropped} suggestion${dropped > 1 ? "s were" : " was"} dropped because the quoted text did not match the source passage.`);
      if (!picks.length && answer) warnings.push("The model's answer could not be read; showing search order instead.");
    }
  }
  if (!out.results.length) out.results = demoPicks(candidates, maxResults);
  await enrich(out.results);
  return out;
}

// ---------- Reference checker ----------

export type ReferenceStatus = NonNullable<Reference["verification"]>["status"];
export type ReferenceSource = NonNullable<Reference["verification"]>["source"];

export interface ReferenceCheck {
  status: ReferenceStatus;
  source: ReferenceSource;
  mismatches: string[];
  ids: { doi?: string; openalexId?: string; s2Id?: string; pmid?: string };
  /** The record the reference was matched against, when one was found. */
  match?: ScholarWork;
  recordUrl?: string;
  checkedAt: string;
  /** Network or API failure during the check; the status is then "unverified" and should be retried later. */
  error?: string;
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokens = (s: string) => new Set(fold(s).split(" ").filter((t) => t.length > 1));

/** Dice coefficient over normalised title tokens (0–1). */
export function titleSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  ta.forEach((t) => {
    if (tb.has(t)) inter++;
  });
  return (2 * inter) / (ta.size + tb.size);
}

/** Family names in an author string such as "Smith, J., Doe, A." or "J. Smith and A. Doe". */
export function familyNames(authors: string): string[] {
  const cleaned = authors.replace(/\bet al\.?/gi, "").replace(/&/g, ",").replace(/\band\b/gi, ",");
  const parts = cleaned.split(/,|;/).map((p) => p.trim()).filter(Boolean);
  const names: string[] = [];
  const isInitial = (w: string) => /^[a-zà-ɏ]\.?$/i.test(w) || /^(?:[a-zà-ɏ]\.){2,}$/i.test(w); // "J.", "J", "J.A."
  for (const p of parts) {
    const words = p.split(/\s+/).filter((w) => !isInitial(w));
    if (!words.length) continue; // initials only: "J." or "J. A."
    // "Last, F." was split on the comma, so a part is either "Last" or "First Last": the family name is the last word.
    const family = words[words.length - 1];
    if (family && family.length > 1) names.push(fold(family));
  }
  return Array.from(new Set(names));
}

function compare(ref: Reference, work: ScholarWork, matchedByDoi: boolean): string[] {
  const mismatches: string[] = [];
  const sim = titleSimilarity(ref.title, work.title);
  if (sim < (matchedByDoi ? 0.5 : 0.8)) mismatches.push(`Title differs from the record: "${work.title}".`);
  if (ref.year && work.year && Math.abs(Number(ref.year) - Number(work.year)) > 1) mismatches.push(`Year: your reference says ${ref.year}, the record says ${work.year}.`);
  const mine = familyNames(ref.authors);
  const theirs = familyNames(work.authors);
  if (mine.length && theirs.length && !theirs.some((t) => mine.includes(t)) && !mine.some((m) => theirs.includes(m))) {
    mismatches.push(`Authors differ from the record: ${work.authors.replace(/\.$/, "")}.`);
  }
  return mismatches;
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/**
 * Resolves a reference against Crossref, OpenAlex and Semantic Scholar and reports verified / mismatch / retracted / unverified.
 * "Unverified" means the registries did not return a match; print-only sources often end there legitimately.
 */
export async function checkReference(ref: Reference): Promise<ReferenceCheck> {
  const checkedAt = new Date().toISOString();
  const errors: string[] = [];
  let match: ScholarWork | null = null;
  let source: ReferenceSource = "manual";
  let matchedByDoi = false;
  let oaWork: ScholarWork | null = null;

  const doi = normalizeDoi(ref.doi || "") || normalizeDoi(ref.url || "");
  if (doi) {
    try {
      match = await crossrefWork(doi);
      if (match) source = "crossref";
    } catch (e) {
      errors.push((e as Error).message);
    }
    if (!match) {
      try {
        oaWork = await openAlexWork(doi);
        if (oaWork) {
          match = oaWork;
          source = "openalex";
        }
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    matchedByDoi = !!match;
  }

  if (!match && ref.title.trim()) {
    try {
      const hits = await crossrefBibliographic([ref.authors, ref.year, ref.title, ref.source].filter(Boolean).join(" "), 3);
      const best = hits.map((h) => ({ h, sim: titleSimilarity(ref.title, h.title) })).sort((a, b) => b.sim - a.sim || b.h.score - a.h.score)[0];
      if (best && best.sim >= 0.8) {
        match = best.h;
        source = "crossref";
      }
    } catch (e) {
      errors.push((e as Error).message);
    }
  }

  if (!match && ref.title.trim()) {
    try {
      const hit = await s2MatchTitle(ref.title);
      if (hit && titleSimilarity(ref.title, hit.title) >= 0.8) {
        match = hit;
        source = "s2";
      }
    } catch (e) {
      // Semantic Scholar without a key answers 429 most of the time; that is not a verdict on the reference.
      errors.push((e as Error).message);
    }
  }

  if (!match) {
    return { status: "unverified", source: "manual", mismatches: [], ids: { doi }, checkedAt, error: errors.length ? errors[errors.length - 1] : undefined };
  }

  // Retraction flag and ids live in OpenAlex; a single lookup is free.
  const lookupKey = match.openalexId || match.doi || doi;
  if (!oaWork && lookupKey && match.source !== "openalex") {
    try {
      oaWork = await openAlexWork(lookupKey);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  const oa = match.source === "openalex" ? match : oaWork;
  const ids = { doi: match.doi || doi, openalexId: match.openalexId || oa?.openalexId, s2Id: match.s2Id, pmid: match.pmid || oa?.pmid };
  const mismatches = compare(ref, match, matchedByDoi);
  const retracted = !!(oa?.isRetracted || match.isRetracted);
  const recordUrl = ids.doi ? `https://doi.org/${ids.doi}` : ids.openalexId ? `https://openalex.org/${ids.openalexId}` : match.landingUrl;
  return {
    status: retracted ? "retracted" : mismatches.length ? "mismatch" : "verified",
    source,
    mismatches,
    ids,
    match: { ...match, isRetracted: retracted },
    recordUrl,
    checkedAt,
    error: errors.length && !oa && match.source !== "openalex" ? errors[errors.length - 1] : undefined,
  };
}

/** Writes a check result back onto a reference without touching the bibliographic fields the student typed. */
export function applyCheck(ref: Reference, check: ReferenceCheck): Reference {
  return {
    ...ref,
    doi: ref.doi || check.ids.doi,
    openalexId: check.ids.openalexId || ref.openalexId,
    s2Id: check.ids.s2Id || ref.s2Id,
    pmid: check.ids.pmid || ref.pmid,
    isRetracted: check.status === "retracted" ? true : check.status === "unverified" ? ref.isRetracted : false,
    verification: { status: check.status, checkedAt: check.checkedAt, source: check.source, mismatches: check.mismatches.length ? check.mismatches : undefined },
  };
}

/** Builds a Reference from a scholarly work and the verified supporting quote. Shared by the panel and the API. */
export function referenceFromWork(work: ScholarWork, opts: { id?: string; quote?: string; section?: string; interactionId?: string; checkedAt?: string } = {}): Reference {
  const type: Reference["type"] = /book-chapter|chapter/.test(work.type || "") ? "chapter" : /book|monograph/.test(work.type || "") ? "book" : /dissertation|thesis/.test(work.type || "") ? "thesis" : /report|posted-content|preprint|web/.test(work.type || "") ? "web" : "article";
  return {
    id: opts.id || `ref_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    type,
    authors: work.authors || "",
    year: work.year || "",
    title: work.title,
    source: work.venue || "",
    doi: work.doi,
    url: work.doi ? `https://doi.org/${work.doi}` : work.landingUrl || work.oaUrl,
    openalexId: work.openalexId,
    s2Id: work.s2Id,
    pmid: work.pmid,
    isRetracted: !!work.isRetracted,
    verification: { status: work.isRetracted ? "retracted" : "verified", checkedAt: opts.checkedAt || new Date().toISOString(), source: work.source },
    supportSnippet: opts.quote ? { text: opts.quote, workId: work.id, section: opts.section } : undefined,
    interactionId: opts.interactionId,
  };
}
