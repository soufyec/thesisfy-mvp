import { crossrefBibliographic, openAlexSearch, s2MatchTitle, type ScholarWork } from "../scholar";
import type { AcademicSearchEngine, AcademicSearchRequest, AcademicSearchResponse, EditorCitationSuggestion, VerifiedPaper } from "../../types/engines";

interface AcademicClients {
  openalex: (query: string, limit: number) => Promise<ScholarWork[]>;
  crossref: (query: string, limit: number) => Promise<ScholarWork[]>;
  s2: (query: string) => Promise<ScholarWork | null>;
}
const defaults: AcademicClients = {
  openalex: (q, n) => openAlexSearch(q, { perPage: n }),
  crossref: crossrefBibliographic, s2: s2MatchTitle,
};
/** Server-side orchestrator reusing bounded, timeout-protected scholar.ts HTTP adapters.
 * Caller must pseudonymize queries before invoking this external-network service.
 */
export class AcademicSearchService implements AcademicSearchEngine {
  constructor(private readonly clients: AcademicClients = defaults) {}
  async search(input: AcademicSearchRequest): Promise<AcademicSearchResponse> {
    if (typeof input.query !== "string" || !input.query.trim() || input.query.length > 500 ||
        (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 20))) {
      throw new Error("invalid_input");
    }
    const query = input.query.trim();
    const limit = input.limit ?? 6;
    const providers: AcademicSearchResponse["providers"] = [];
    const papers = new Map<string, VerifiedPaper>();
    const retracted = new Set<string>();
    const canonicalDoi = (work: ScholarWork) => work.doi?.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").trim().toLowerCase();
    const add = (works: ScholarWork[]) => {
      for (const work of works) {
        const doi = canonicalDoi(work);
        const year = Number(work.year);
        if (!doi || !/^10\.\d{4,9}\/[^\s<>"']+$/i.test(doi) || work.isRetracted || retracted.has(doi) ||
            !work.title?.trim() || work.title === "Untitled" || !work.authors?.trim() ||
            !Number.isInteger(year) || year < 1000 || year > new Date().getUTCFullYear() + 1 || papers.has(doi)) continue;
        papers.set(doi, {
          id: `doi:${doi}`, doi, title: work.title, authors: work.authors, year,
          provider: work.source, verification: "indexed_metadata", checkedAt: new Date().toISOString(),
          abstract: work.abstract, url: `https://doi.org/${doi.split("/").map(encodeURIComponent).join("/")}`,
        });
      }
    };
    // Provider failures are reported separately from a successful zero-result search.
    const results = await Promise.allSettled([this.clients.openalex(query, limit), this.clients.crossref(query, limit)]);
    for (const result of results) {
      if (result.status === "fulfilled") for (const work of result.value) {
        const doi = canonicalDoi(work);
        if (doi && work.isRetracted) retracted.add(doi);
      }
    }
    results.forEach((result, i) => {
      providers.push({ provider: i === 0 ? "openalex" : "crossref", status: result.status === "fulfilled" ? "ok" : "unavailable" });
      if (result.status === "fulfilled") add(result.value);
    });
    // Optional title matcher fallback, not a substitute for a broad literature search.
    if (!papers.size) {
      try { const work = await this.clients.s2(query); if (work) add([work]); providers.push({ provider: "s2", status: "ok" }); }
      catch { providers.push({ provider: "s2", status: "unavailable" }); }
    }
    return {
      status: papers.size ? "ok" : providers.every(p => p.status === "unavailable") ? "unavailable" : "empty",
      papers: Array.from(papers.values()).slice(0, limit), providers,
    };
  }
  suggestions(papers: VerifiedPaper[]): EditorCitationSuggestion[] {
    // Structured data, never HTML or model-authored bibliography. CSL renders the final citation.
    return papers.map(p => ({ candidateId: p.id, doi: p.doi, label: `${p.authors} (${p.year}). ${p.title}`, url: p.url }));
  }
}
