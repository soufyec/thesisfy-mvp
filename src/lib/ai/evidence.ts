/**
 * Evidence check for a claim: supporting / qualifying / contradicting passages from the open scholarly graphs.
 *
 * Pipeline (see reports "Editores académicos con IA", section 6):
 *   claim → OpenAlex search (semantic when keyed, keyword otherwise) + Semantic Scholar snippet search (when keyed)
 *         → up to 20 candidates {id, work, passage}
 *         → stance classification by the model over the literal passage, structured JSON
 *         → server-side string verification: every quote must appear verbatim in its passage, or it is dropped
 *         → enrichment with cited_by_count, type, publication_year, is_retracted from OpenAlex.
 *
 * Rules:
 * - No aggregate meter or percentage. The result is an audited list; every study weighs the same.
 * - The model never emits bibliographic strings; it picks candidate ids and quotes from the passage.
 * - Without a provider (demo), the top candidates are returned as "mentions" with the passage's first sentence,
 *   so the UI is testable and nothing is pretended.
 * - This module never inserts citations: that only happens through the verified-citation flow.
 */

import { openAlexSearch, openAlexWork, quoteAppearsIn, s2Available, s2SnippetSearch, ScholarWork } from "@/lib/scholar";
import { ResolvedProvider, streamCompletion } from "@/lib/ai/providers";
import type { EvidenceCheck } from "@/lib/db";

export type Stance = EvidenceCheck["results"][number]["stance"];
export const STANCES: Stance[] = ["supports", "qualifies", "contradicts", "mentions"];

/** One classified passage. Extends the stored shape with display-only fields (all optional, additive). */
export interface EvidenceResult {
  workId: string;
  title: string;
  authors?: string;
  year?: string;
  doi?: string;
  quote: string;
  stance: Stance;
  confidence: number;
  citedByCount?: number;
  type?: string;
  isRetracted?: boolean;
  venue?: string;
  /** Landing page or open-access location when no DOI is known. */
  url?: string;
  source?: ScholarWork["source"];
  /** True when the quote was found verbatim in the passage (always true for returned results). */
  verified?: boolean;
}

export interface EvidenceCandidate {
  id: string;
  work: ScholarWork;
  passage: string;
  passageKind: "abstract" | "snippet";
}

export interface EvidenceOutcome {
  results: EvidenceResult[];
  /** True when a model classified the passages; false in demo mode. */
  aiUsed: boolean;
  /** True when a non-demo provider was available for this request. */
  aiAvailable: boolean;
  attribution: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  candidates: number;
  /** Non-fatal problems (a source that failed, malformed model output). Shown to the user, never hidden. */
  warnings: string[];
}

export interface EvidenceOptions {
  /** Resolved provider; omit or pass a demo provider to run in demo mode. */
  cfg?: ResolvedProvider | null;
  maxCandidates?: number;
  /** Max OpenAlex lookups used to enrich S2-only works that have a DOI. */
  maxEnrichLookups?: number;
}

const MAX_QUOTE_WORDS = 40;
const MIN_NON_MENTION = 3;
const DEMO_RESULTS = 6;

const SYSTEM = `You classify how scholarly passages relate to a claim. You never write prose and never invent text.

For each candidate passage decide its stance towards the CLAIM:
- "supports": the passage presents evidence or a conclusion consistent with the claim.
- "qualifies": the passage partly supports the claim but limits it (conditions, scope, population, horizon, mixed results).
- "contradicts": the passage presents evidence or a conclusion that conflicts with the claim.
- "mentions": the passage is about the topic but takes no position on the claim.
Omit candidates that are not about the claim at all.

For every included candidate copy ONE quote: a contiguous span of at most ${MAX_QUOTE_WORDS} words taken verbatim from that passage, in the passage's own language, with no edits, ellipses or added words. The quote must be the span that justifies the stance.

Return ONLY a JSON array, no commentary:
[{"candidateId": "c1", "quote": "...", "stance": "supports" | "qualifies" | "contradicts" | "mentions", "confidence": 0.0-1.0}]`;

/** Collect up to `max` candidate passages for a claim from OpenAlex and (when keyed) Semantic Scholar. */
export async function gatherCandidates(claim: string, max = 20): Promise<{ candidates: EvidenceCandidate[]; warnings: string[]; sources: string[] }> {
  const warnings: string[] = [];
  const sources: string[] = ["OpenAlex"];
  const [oa, s2] = await Promise.all([
    openAlexSearch(claim, { perPage: 15, semantic: true }).catch((e: Error) => {
      warnings.push(`OpenAlex unavailable: ${e.message}`);
      return [] as ScholarWork[];
    }),
    s2Available()
      ? s2SnippetSearch(claim, 10).catch((e: Error) => {
          warnings.push(`Semantic Scholar unavailable: ${e.message}`);
          return [] as { text: string; section?: string; work: ScholarWork }[];
        })
      : Promise.resolve([] as { text: string; section?: string; work: ScholarWork }[]),
  ]);
  if (s2Available()) sources.push("Semantic Scholar");

  // Deduplicate by identifier and by normalised title: the same paper often appears as preprint and journal version.
  const seen = new Set<string>();
  const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const keysOf = (w: ScholarWork) => [w.doi ? `doi:${w.doi}` : "", w.openalexId ? `oa:${w.openalexId}` : "", w.id, `title:${normTitle(w.title)}`].filter(Boolean);
  const candidates: EvidenceCandidate[] = [];
  const push = (work: ScholarWork, passage: string | undefined, kind: EvidenceCandidate["passageKind"]) => {
    const text = (passage || "").replace(/\s+/g, " ").replace(/^abstract[.:]?\s+/i, "").trim();
    if (!text || text.split(" ").length < 8) return;
    const keys = keysOf(work);
    if (keys.some((k) => seen.has(k))) return;
    keys.forEach((k) => seen.add(k));
    candidates.push({ id: `c${candidates.length + 1}`, work, passage: text.slice(0, 2500), passageKind: kind });
  };
  // Snippets come from paper bodies and tend to be more specific than abstracts; interleave so both sources are represented.
  const a = [...oa];
  const b = [...s2];
  while ((a.length || b.length) && candidates.length < max) {
    const w = a.shift();
    if (w) push(w, w.abstract, "abstract");
    const s = b.shift();
    if (s && candidates.length < max) push(s.work, s.text, "snippet");
  }
  return { candidates, warnings, sources };
}

function firstSentence(text: string): string {
  const m = text.match(/^[\s\S]*?[.!?](?=\s|$)/);
  let s = (m ? m[0] : text).trim();
  if (s.split(/\s+/).length < 4) s = text.split(/\s+/).slice(0, 12).join(" ");
  const words = s.split(/\s+/);
  return words.length > MAX_QUOTE_WORDS ? words.slice(0, MAX_QUOTE_WORDS).join(" ") : s;
}

function toResult(c: EvidenceCandidate, quote: string, stance: Stance, confidence: number): EvidenceResult {
  const w = c.work;
  return {
    workId: w.id,
    title: w.title,
    authors: w.authors || undefined,
    year: w.year,
    doi: w.doi,
    quote,
    stance,
    confidence: Math.max(0, Math.min(1, Number.isFinite(confidence) ? confidence : 0)),
    citedByCount: w.citedByCount,
    type: w.type,
    isRetracted: w.isRetracted,
    venue: w.venue,
    url: w.landingUrl || w.oaUrl,
    source: w.source,
    verified: true,
  };
}

/** Parse the model's JSON array; tolerate code fences and leading prose. */
function parseClassification(text: string): { candidateId: string; quote: string; stance: string; confidence: number }[] {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x === "object")
      .map((x) => ({ candidateId: String(x.candidateId || x.id || ""), quote: String(x.quote || ""), stance: String(x.stance || "").toLowerCase(), confidence: Number(x.confidence) }));
  } catch {
    return [];
  }
}

/** Fill in cited_by_count, type, year and the retraction flag for works that only came from Semantic Scholar. */
async function enrich(results: EvidenceResult[], candidates: EvidenceCandidate[], maxLookups: number): Promise<string[]> {
  const warnings: string[] = [];
  let lookups = 0;
  for (const r of results) {
    if (lookups >= maxLookups) break;
    const c = candidates.find((x) => x.work.id === r.workId);
    if (!c || c.work.source !== "s2" || !r.doi) continue;
    lookups++;
    try {
      const oa = await openAlexWork(r.doi);
      if (!oa) continue;
      r.citedByCount = oa.citedByCount ?? r.citedByCount;
      r.type = oa.type || r.type;
      r.year = oa.year || r.year;
      r.isRetracted = oa.isRetracted ?? r.isRetracted;
      r.venue = oa.venue || r.venue;
      r.url = r.url || oa.landingUrl || oa.oaUrl;
    } catch (e) {
      warnings.push(`OpenAlex lookup failed for ${r.doi}: ${(e as Error).message}`);
    }
  }
  return warnings;
}

const STANCE_ORDER: Record<Stance, number> = { supports: 0, qualifies: 1, contradicts: 2, mentions: 3 };
const sortResults = (rs: EvidenceResult[]) => rs.sort((a, b) => STANCE_ORDER[a.stance] - STANCE_ORDER[b.stance] || b.confidence - a.confidence);

/**
 * Run the full evidence check. With no provider (or a demo one) the result is deterministic:
 * the top candidates as "mentions" with their first sentence as quote and `aiUsed: false`.
 */
export async function evidenceForClaim(claim: string, opts: EvidenceOptions = {}): Promise<EvidenceOutcome> {
  const text = claim.trim().slice(0, 1000);
  const max = Math.min(20, Math.max(1, opts.maxCandidates ?? 20));
  const cfg = opts.cfg || null;
  const aiAvailable = !!cfg && cfg.provider !== "demo";
  const usage = { inputTokens: 0, outputTokens: 0 };
  const { candidates, warnings, sources } = text ? await gatherCandidates(text, max) : { candidates: [], warnings: ["Empty claim"], sources: ["OpenAlex"] };
  const attribution = `Data: ${sources.join(" · ")}`;

  if (!aiAvailable || !candidates.length) {
    const results = candidates.slice(0, DEMO_RESULTS).map((c) => toResult(c, firstSentence(c.passage), "mentions", 0));
    return { results, aiUsed: false, aiAvailable, attribution, model: "demo", usage, candidates: candidates.length, warnings };
  }

  const prompt = [
    `CLAIM:\n${text}`,
    "",
    "CANDIDATE PASSAGES:",
    ...candidates.map((c) => `[${c.id}] (${c.passageKind}; ${c.work.title}${c.work.year ? `, ${c.work.year}` : ""})\n${c.passage}`),
  ].join("\n");

  let out = "";
  let err: string | undefined;
  for await (const chunk of streamCompletion(cfg!, SYSTEM, [{ role: "user", content: prompt }], 3000)) {
    if (chunk.type === "delta") out += chunk.text;
    else if (chunk.type === "usage") Object.assign(usage, { inputTokens: chunk.inputTokens, outputTokens: chunk.outputTokens });
    else if (chunk.type === "error") err = chunk.message;
  }
  if (err && !out) throw new Error(err);

  const parsed = parseClassification(out);
  if (!parsed.length) warnings.push("The model returned no usable classification; nothing was labelled.");

  const used = new Set<string>();
  let dropped = 0;
  const results: EvidenceResult[] = [];
  for (const p of parsed) {
    const c = candidates.find((x) => x.id === p.candidateId);
    if (!c || used.has(c.id)) continue;
    if (!STANCES.includes(p.stance as Stance)) continue;
    const quote = p.quote.replace(/\s+/g, " ").trim();
    if (!quote || quote.split(" ").length > MAX_QUOTE_WORDS || !quoteAppearsIn(quote, c.passage)) {
      dropped++;
      continue;
    }
    used.add(c.id);
    results.push(toResult(c, quote, p.stance as Stance, p.confidence));
  }
  if (dropped) warnings.push(`${dropped} ${dropped === 1 ? "quote was" : "quotes were"} not found verbatim in the passage and ${dropped === 1 ? "was" : "were"} dropped.`);

  const positioned = results.filter((r) => r.stance !== "mentions");
  const kept = positioned.length >= MIN_NON_MENTION ? positioned : results;
  warnings.push(...(await enrich(kept, candidates, opts.maxEnrichLookups ?? 5)));

  return { results: sortResults(kept), aiUsed: true, aiAvailable, attribution, model: cfg!.model, usage, candidates: candidates.length, warnings };
}

/** "3 support · 1 qualifies · 2 contradict" for logs and history rows. */
export function summarizeStances(results: { stance: Stance }[]): string {
  const n = (s: Stance) => results.filter((r) => r.stance === s).length;
  const parts = [
    `${n("supports")} support`,
    `${n("qualifies")} ${n("qualifies") === 1 ? "qualifies" : "qualify"}`,
    `${n("contradicts")} contradict`,
  ];
  if (n("mentions")) parts.push(`${n("mentions")} mention`);
  return parts.join(" · ");
}
