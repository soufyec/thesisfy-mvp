/** Wire contracts. Existing db.ts and editor types remain the persistence source of truth. */
import type { IntegrityBreakdown } from "@/components/editor/types";
export type EngineLanguage = "fr" | "en" | "es" | "de";
export type EngineErrorCode = "invalid_input" | "forbidden" | "unavailable" | "privacy_unavailable" | "stale_revision";
export type EngineResult<T> = { ok: true; data: T } | { ok: false; code: EngineErrorCode };
export type AcademicProvider = "openalex" | "crossref" | "s2";
export interface AcademicSearchRequest { query: string; limit?: number; language?: EngineLanguage }
export interface VerifiedPaper {
  id: string; doi: string; title: string; authors: string; year: number;
  provider: AcademicProvider; checkedAt: string;
  /** Metadata existence only: neither full-text verification nor scientific endorsement. */
  verification: "indexed_metadata";
  abstract?: string; url: string;
}
export interface AcademicSearchResponse {
  status: "ok" | "empty" | "unavailable";
  papers: VerifiedPaper[];
  providers: { provider: AcademicProvider; status: "ok" | "unavailable" }[];
}
export interface EditorCitationSuggestion { candidateId: string; doi: string; label: string; url: string }
export interface GrammarRequest { thesisId: string; revision: string; text: string; language: EngineLanguage }
export interface GrammarCorrection {
  from: number; to: number; replacement: string; message: string; ruleId: string;
  source: "languagetool"; provenance: "preserve";
}
export interface GrammarResponse { revision: string; corrections: GrammarCorrection[] }
export type PIIEntity = "STUDENT_NAME" | "EMAIL" | "PHONE" | "PERSON" | "LOCATION" | "IDENTIFIER";
export interface PIISpan { start: number; end: number; entity: PIIEntity }
export interface PrivacySummary { strategy: "local_patterns" | "patterns_and_ner"; replacements: number }
/** Do not serialize the reversible token map or retain it in a ledger/log. */
export interface ScrubbedText { text: string; summary: PrivacySummary }
export interface PasteMatchRequest { thesisId: string; revision: string; eventId: string; text: string }
export interface TextMatch { sourceId: string; chunkId: string; score: number; excerpt: string; page?: number }
export interface PasteMatchResponse {
  eventId: string; revision: string;
  status: "requires_attribution" | "no_match" | "unavailable";
  matches: TextMatch[];
  /** Absence of a match is not evidence of authorship. */
  coverage: "linked_sources" | "institution_corpus" | "external_provider";
}
export type CitationStyle = "APA" | "Chicago" | "IEEE" | "Harvard";
export interface CSLItem {
  id: string; type: string; title: string;
  author?: { family?: string; given?: string; literal?: string }[];
  issued?: { "date-parts": number[][] }; DOI?: string; URL?: string;
  "container-title"?: string; volume?: string; issue?: string; page?: string;
}
export interface CitationFormatRequest { ids: string[]; style: CitationStyle; language?: "en-US" | "fr-FR" | "es-ES" | "de-DE" }
export interface CitationFormatResponse { citations: { id: string; text: string }[]; bibliography: [string, string][] }
export interface ReferenceImportRequest { format: "bib" | "ris"; content: string }
export interface ZoteroImportRequest { start?: number; keys: string[] }
/** Resolved by the server from authenticated membership, never trusted from request JSON. */
export interface CourseScope { institutionId: string; assignmentId: string; corpusVersion: string }
export interface CourseIngestionJob {
  id: string; sourceId: string; scope: CourseScope;
  status: "queued" | "extracting" | "indexing" | "ready" | "failed";
  contentHash: string; errorCode?: string;
}
export interface CourseRetrieveRequest { assignmentId: string; query: string; limit?: number }
export interface CoursePassage {
  sourceId: string; chunkId: string; text: string; page: number; contentHash: string; score: number;
}
export interface CourseRetrieveResponse { scope: CourseScope; passages: CoursePassage[]; policy: "official_only" }
export type EngineEditorEvent =
  | { kind: "paste"; id: string; revision: string; from: number; to: number; text: string }
  | { kind: "grammar_accept"; id: string; revision: string; correction: GrammarCorrection }
  | { kind: "citation_insert"; id: string; revision: string; candidateId: string }
  | { kind: "ai_insert"; id: string; revision: string; interactionId: string; words: number }
  | { kind: "attribution_declared"; id: string; revision: string; pasteEventId: string; sourceIds: string[] };
/** Read model assembled from existing server provenance; never accept counters supplied by clients. */
export interface IntegrityLedgerState {
  thesisId: string; revision: string; breakdown: IntegrityBreakdown;
  aiWords: number; totalWords: number; aiSharePercent: number;
  pendingAttributionEventIds: string[];
}
export interface AcademicSearchEngine { search(input: AcademicSearchRequest): Promise<AcademicSearchResponse> }
export interface GrammarEngine { check(input: GrammarRequest): Promise<GrammarResponse> }
export interface AttributionEngine { match(input: PasteMatchRequest): Promise<PasteMatchResponse> }
export interface CitationEngine { format(input: CitationFormatRequest): Promise<CitationFormatResponse> }
export interface CourseRetrievalEngine { retrieve(scope: CourseScope, query: string): Promise<CourseRetrieveResponse> }
export type AcademicSearchAPIResponse = EngineResult<AcademicSearchResponse & { suggestions: EditorCitationSuggestion[] }>;
export interface PIIShieldSession {
  scrub(text: string, language?: EngineLanguage): Promise<ScrubbedText>;
  restore(text: string): string;
  dispose(): void;
}
export interface ReferenceImportResponse {
  entries: { inputKey: string; status: "imported" | "duplicate" | "invalid"; referenceId?: string; errorCode?: string }[];
}
export interface ZoteroConnectionState { connected: boolean; libraryId?: string; permission: "read_only" }
export interface ZoteroItemsResponse { items: CSLItem[]; nextCursor?: string }
export interface CourseReadingUploadRequest { assignmentId: string; file: File }
export interface CourseReadingUploadResponse { job: CourseIngestionJob }

/** Actual atomic PDF upload: multipart file, teacher/admin authorization, indexed before response. */
export interface CourseUploadResponse { id: string }
export interface CourseReadingsPolicyUpdate { officialOnly: boolean }
export interface ZoteroConnectionRequest { libraryId: string; key: string }
