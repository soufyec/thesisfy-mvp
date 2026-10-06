/**
 * Academic-style layer of the language review and the provenance rule for accepted suggestions.
 *
 * The LLM layer never writes thesis text: it only proposes sentence-bounded replacements for phrases the
 * student already wrote, each with a reason. Every proposed `original` must appear verbatim in the paragraph
 * or it is dropped. Provenance rule (CLAUDE.md principle 1): mechanical fixes keep the text as the
 * student's; a style rewrite that changes more than three words is an AI contribution and is marked `ai`
 * with the label "Language review".
 */
import type { ResolvedProvider } from "@/lib/ai/providers";
import { streamCompletion } from "@/lib/ai/providers";
import type { LanguageCategory } from "./languagetool";

export const STYLE_LABEL = "Language review";
/** Replacements that differ from the original by more than this many words are AI-assisted. */
export const MECHANICAL_WORD_LIMIT = 3;
const MAX_ORIGINAL_WORDS = 25;
const MAX_SUGGESTIONS_PER_PARAGRAPH = 5;

export interface StyleSuggestion {
  /** Verbatim fragment of the paragraph (at most 25 words, inside one sentence). */
  original: string;
  replacement: string;
  reason: string;
  category: "style";
  /** Offset of `original` in the paragraph text. */
  offset: number;
}

export interface StyleResult {
  suggestions: StyleSuggestion[];
  usage: { inputTokens: number; outputTokens: number };
  error?: string;
}

const wordsOf = (s: string) => (s.trim() ? s.trim().split(/\s+/) : []);

/** Number of words that differ between two phrases (words outside their longest common subsequence). */
export function wordDelta(a: string, b: string): number {
  const x = wordsOf(a.toLowerCase());
  const y = wordsOf(b.toLowerCase());
  const dp: number[][] = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) dp[i][j] = x[i - 1] === y[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const lcs = dp[x.length][y.length];
  return Math.max(x.length, y.length) - lcs;
}

/**
 * Who authored the text after a suggestion is accepted. Spelling, grammar, punctuation and consistency
 * fixes, and any replacement that changes at most three words, keep the student's authorship; larger
 * style rewrites coming from the model are AI-assisted.
 */
export function provenanceFor(s: { category: LanguageCategory; source: "lt" | "llm"; original: string; replacement: string }): "human" | "ai" {
  if (s.category !== "style") return "human";
  if (wordDelta(s.original, s.replacement) <= MECHANICAL_WORD_LIMIT) return "human";
  return s.source === "llm" ? "ai" : "human";
}

// ---------- Deterministic demo layer ----------

const DEMO_PHRASES: { re: RegExp; replace: (m: string) => string; reason: string }[] = [
  { re: /\bit is important to note that\b/i, replace: () => "notably,", reason: "Filler phrase; the point stands without the announcement." },
  { re: /\bdue to the fact that\b/i, replace: () => "because", reason: "Wordy connector; one word carries the same meaning." },
  { re: /\bin order to\b/i, replace: () => "to", reason: "Redundant; 'to' is enough in academic prose." },
  { re: /\ba large number of\b/i, replace: () => "many", reason: "Wordy quantifier." },
  { re: /\ba lot of\b/i, replace: () => "many", reason: "Informal quantifier for academic register." },
  { re: /\bvery\s+(\w+)/i, replace: (m) => m.replace(/^very\s+/i, ""), reason: "Intensifier adds emphasis without evidence; the adjective alone is more precise." },
  { re: /\bthe majority of\b/i, replace: () => "most", reason: "Wordy quantifier." },
  { re: /\bas a matter of fact\b/i, replace: () => "in fact", reason: "Conversational phrase." },
];

export function demoStyleSuggestions(paragraph: string): StyleSuggestion[] {
  const out: StyleSuggestion[] = [];
  for (const d of DEMO_PHRASES) {
    const m = d.re.exec(paragraph);
    if (!m) continue;
    const original = m[0];
    const replacement = d.replace(original);
    if (replacement === original) continue;
    out.push({ original, replacement, reason: d.reason, category: "style", offset: m.index });
    if (out.length >= 2) break;
  }
  return out;
}

// ---------- LLM layer ----------

const SYSTEM = `You are the language reviewer of Thesisfic, an academic writing platform. You never write thesis content and never add claims, evidence or ideas. Your only task: point out phrases in the student's own paragraph whose academic register could be tighter (hedging that adds nothing, informal wording, redundant intensifiers, wordy connectors, unclear referents) and propose a minimal replacement.

Rules:
- At most ${MAX_SUGGESTIONS_PER_PARAGRAPH} suggestions. Fewer is better. If the paragraph is fine, return [].
- Each "original" is copied VERBATIM from the paragraph (same characters, casing and punctuation), is at most ${MAX_ORIGINAL_WORDS} words long and never crosses a sentence boundary.
- Each "replacement" keeps the meaning and stays inside that sentence. Prefer changing one to three words.
- Never touch citations such as (Author, 2019) or [12], numbers, quotations, technical terms or anything inside quotation marks.
- Do not correct spelling, grammar or punctuation; another tool does that.
- "reason" is one short sentence in the language of the paragraph.
- Output ONLY a JSON array: [{"original": "...", "replacement": "...", "reason": "...", "category": "style"}]. No prose, no code fences.`;

function parseJsonArray(text: string): unknown[] {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    const v = JSON.parse(trimmed);
    return Array.isArray(v) ? v : [];
  } catch {
    const start = trimmed.indexOf("[");
    const end = trimmed.lastIndexOf("]");
    if (start === -1 || end <= start) return [];
    try {
      const v = JSON.parse(trimmed.slice(start, end + 1));
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
}

function sentenceBounded(paragraph: string, offset: number, length: number) {
  const inner = paragraph.slice(offset, offset + length);
  // A sentence terminator followed by whitespace inside the fragment means it spans two sentences.
  return !/[.!?]["”’)]*\s+\S/.test(inner);
}

/** Validates model output against the paragraph: verbatim, bounded, non-trivial. */
export function validateStyleSuggestions(paragraph: string, raw: unknown[]): StyleSuggestion[] {
  const out: StyleSuggestion[] = [];
  const taken: { from: number; to: number }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const original = typeof o.original === "string" ? o.original : "";
    const replacement = typeof o.replacement === "string" ? o.replacement.trim() : "";
    const reason = typeof o.reason === "string" ? o.reason.trim().slice(0, 240) : "";
    if (!original.trim() || replacement === original) continue;
    if (wordsOf(original).length > MAX_ORIGINAL_WORDS) continue;
    const offset = paragraph.indexOf(original);
    if (offset === -1) continue;
    if (!sentenceBounded(paragraph, offset, original.length)) continue;
    const to = offset + original.length;
    if (taken.some((t) => offset < t.to && to > t.from)) continue;
    taken.push({ from: offset, to });
    out.push({ original, replacement, reason: reason || "Academic register.", category: "style", offset });
    if (out.length >= MAX_SUGGESTIONS_PER_PARAGRAPH) break;
  }
  return out;
}

/**
 * Sentence-bounded style suggestions for one paragraph. Uses the resolved provider without streaming;
 * demo providers get the deterministic phrase list. Never throws.
 */
export async function academicStyleSuggestions(paragraphText: string, lang: "en" | "es" | "fr" | string, cfg: ResolvedProvider): Promise<StyleResult> {
  const usage = { inputTokens: 0, outputTokens: 0 };
  const text = paragraphText.slice(0, 6000);
  if (!text.trim()) return { suggestions: [], usage };
  if (cfg.provider === "demo" || !cfg.apiKey) return { suggestions: demoStyleSuggestions(text), usage };

  const prompt = `Language of the paragraph: ${lang}.\n\nParagraph:\n"""\n${text}\n"""`;
  let answer = "";
  let error: string | undefined;
  for await (const chunk of streamCompletion(cfg, SYSTEM, [{ role: "user", content: prompt }], 900)) {
    if (chunk.type === "delta") answer += chunk.text;
    else if (chunk.type === "usage") {
      usage.inputTokens = chunk.inputTokens;
      usage.outputTokens = chunk.outputTokens;
    } else if (chunk.type === "error") error = chunk.message;
  }
  if (error && !answer) return { suggestions: [], usage, error };
  return { suggestions: validateStyleSuggestions(text, parseJsonArray(answer)), usage, error };
}
