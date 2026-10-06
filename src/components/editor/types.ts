import type { Editor } from "@tiptap/react";

export interface ThesisDoc {
  id: string;
  title: string;
  description: string;
  content: string;
  status: string;
  wordCount: number;
  aiUsagePercent: number;
  integrityScore: number;
  targetWords: number;
  citationStyle: "APA" | "MLA" | "Chicago" | "IEEE" | "Harvard";
  provenance: { human: number; paste: number; ai: number };
  deadline?: string;
  updatedAt: string;
  studentId: string;
  professorId?: string;
  studentName: string;
  professorName: string;
  references: Reference[];
  tabs?: ThesisTab[];
  pageSetup: { orientation: "portrait" | "landscape"; size: "A4" | "Letter"; margin: number; lineSpacing: number };
}

export interface ThesisTab {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
}

export interface Reference {
  id: string;
  type: "book" | "article" | "web" | "thesis" | "chapter";
  authors: string;
  year: string;
  title: string;
  source: string;
  url?: string;
  doi?: string;
  pages?: string;
  volume?: string;
  issue?: string;
  openalexId?: string;
  s2Id?: string;
  pmid?: string;
  isRetracted?: boolean;
  verification?: { status: "verified" | "unverified" | "retracted" | "mismatch"; checkedAt: string; source: "openalex" | "crossref" | "s2" | "manual"; mismatches?: string[] };
  supportSnippet?: { text: string; workId?: string; section?: string };
  interactionId?: string;
}

export interface CommentItem {
  id: string;
  anchorId: string;
  quote: string;
  text: string;
  resolved: boolean;
  authorId: string;
  authorName: string;
  authorRole?: string;
  createdAt: string;
  replies: { id: string; authorId: string; authorName: string; text: string; createdAt: string }[];
}

export interface VersionItem {
  id: string;
  label?: string;
  kind: string;
  wordCount: number;
  createdAt: string;
  authorName: string;
}

export interface FlagItem {
  id: string;
  type: string;
  severity: string;
  description: string;
  timestamp: string;
  resolved: boolean;
}

export type SidebarKind = "none" | "outline" | "comments" | "versions" | "references" | "find" | "ai" | "integrity" | "reviewer" | "language" | "cite" | "process" | "sources" | "evidence";

export interface EditorCtx {
  editor: Editor;
}

export const FONTS = ["Georgia", "Times New Roman", "Garamond", "Cambria", "Arial", "Helvetica", "Calibri", "Verdana", "Courier New", "Inter"];
export const FONT_SIZES = ["8", "9", "10", "11", "12", "14", "16", "18", "20", "24", "28", "32", "36", "48"];
export const COLORS = ["#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#d9d9d9", "#ffffff", "#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8", "#0000ff", "#9900ff", "#ff00ff", "#e6b8af", "#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#c9daf8", "#cfe2f3", "#d9d2e9", "#ead1dc", "#cc4125", "#e06666", "#f6b26b", "#ffd966", "#93c47d", "#76a5af", "#6d9eeb", "#6fa8dc", "#8e7cc3", "#c27ba0"];
export const HIGHLIGHTS = ["#fff59d", "#ffe082", "#b9f6ca", "#b3e5fc", "#e1bee7", "#ffccbc", "#cfd8dc"];

export function formatReference(r: Reference, style: ThesisDoc["citationStyle"]): { full: string; inText: string } {
  const authors = r.authors.trim();
  const firstAuthorLast = authors.split(/,|&| and /)[0].trim().split(" ").pop() || authors;
  const etAl = authors.split(/,|&| and /).length > 2 ? `${firstAuthorLast} et al.` : authors.split(/&| and /).length === 2 ? `${firstAuthorLast} & ${(authors.split(/&| and /)[1] || "").trim().split(" ").pop()}` : firstAuthorLast;
  const doi = r.doi ? ` https://doi.org/${r.doi}` : r.url ? ` ${r.url}` : "";
  switch (style) {
    case "MLA":
      return { full: `${authors}. "${r.title}." ${r.source}${r.volume ? `, vol. ${r.volume}` : ""}${r.issue ? `, no. ${r.issue}` : ""}, ${r.year}${r.pages ? `, pp. ${r.pages}` : ""}.${doi}`, inText: `(${firstAuthorLast}${r.pages ? ` ${r.pages.split("-")[0]}` : ""})` };
    case "Chicago":
      return { full: `${authors}. ${r.year}. "${r.title}." ${r.source}${r.volume ? ` ${r.volume}` : ""}${r.issue ? ` (${r.issue})` : ""}${r.pages ? `: ${r.pages}` : ""}.${doi}`, inText: `(${etAl} ${r.year})` };
    case "IEEE":
      return { full: `${authors}, "${r.title}," ${r.source}${r.volume ? `, vol. ${r.volume}` : ""}${r.issue ? `, no. ${r.issue}` : ""}${r.pages ? `, pp. ${r.pages}` : ""}, ${r.year}.${doi}`, inText: `[#]` };
    case "Harvard":
      return { full: `${authors} (${r.year}) '${r.title}', ${r.source}${r.volume ? `, ${r.volume}` : ""}${r.issue ? `(${r.issue})` : ""}${r.pages ? `, pp. ${r.pages}` : ""}.${doi}`, inText: `(${etAl}, ${r.year})` };
    default:
      return { full: `${authors} (${r.year}). ${r.title}. ${r.type === "article" ? `<em>${r.source}</em>` : r.source}${r.volume ? `, <em>${r.volume}</em>` : ""}${r.issue ? `(${r.issue})` : ""}${r.pages ? `, ${r.pages}` : ""}.${doi}`, inText: `(${etAl}, ${r.year})` };
  }
}

// ---------- Integrity ledger (mirrors src/lib/integrity.ts, which is server-only) ----------
export type IntegrityFix = "attribute_paste" | "reduce_ai" | "open_notice" | "none";
export interface IntegrityLine {
  reason: string;
  points: number;
  fix?: IntegrityFix;
  noticeId?: string;
}
export interface IntegrityBreakdown {
  score: number;
  starting: 100;
  lines: IntegrityLine[];
}

/** The slice of an AI interaction the editor needs to annotate a provenance mark. */
export interface InteractionLite {
  id: string;
  provider: string;
  model: string;
  mode: string;
  timestamp: string;
  insertedWords?: number;
}

/** UI labels for assistant modes and providers (the server-side MODES / PROVIDER_META pull in the data layer). */
export const MODE_LABELS: Record<string, string> = {
  chat: "Ask", brainstorm: "Brainstorm", outline: "Outline", critique: "Critique", grammar: "Grammar", summarize: "Summarize", explain: "Explain", citations: "Citations", gaps: "Find gaps", paraphrase_check: "Paraphrase", copilot: "Research copilot", paste: "Pasted",
};
export const PROVIDER_LABELS: Record<string, string> = { anthropic: "Claude", openai: "GPT", google: "Gemini", mistral: "Mistral", demo: "Demo", assistant: "AI", external: "External AI" };
