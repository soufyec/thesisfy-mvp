/**
 * LanguageTool v2 client (server side).
 *
 * The editor serialises each paragraph as `data.annotation` items: text runs go as `{ text }`, and anything
 * the checker must never touch (citations, cited passages, code, math-like spans, inline atoms) goes as
 * `{ markup, interpretAs }`. Match offsets come back relative to the ORIGINAL text, i.e. the concatenation of
 * every `text` and `markup` string in order, so a markup item of the same length as the document span it
 * stands for keeps offsets aligned 1:1 with document positions.
 *
 * Public API limits (api.languagetool.org, free tier): 20 requests/minute per IP, 20 KB per request,
 * 75 KB per minute. We never send more than LT_MAX_REQUEST_BYTES and fail soft on 429/5xx.
 * Set LANGUAGETOOL_URL to a self-hosted instance for production (GDPR: the text leaves the server).
 */

export type LanguageCategory = "spelling" | "grammar" | "punctuation" | "style" | "consistency";

export const LANGUAGE_CATEGORIES: LanguageCategory[] = ["spelling", "grammar", "punctuation", "style", "consistency"];

export type AnnotationItem = { text: string } | { markup: string; interpretAs?: string };

export interface CheckOptions {
  /** LanguageTool language code: "en-US", "en-GB", "es", "fr" or "auto". */
  language: string;
  motherTongue?: string;
  disabledRules?: string[];
  disabledCategories?: string[];
  level?: "default" | "picky";
  /** Abort the HTTP request after this many ms (default 12 000). */
  timeoutMs?: number;
}

export interface LTMatch {
  /** Offset in the original (text + markup) string. */
  offset: number;
  length: number;
  message: string;
  shortMessage: string;
  replacements: string[];
  rule: { id: string; category: { id: string; name: string }; issueType: string };
  /** Thesisfic category derived from the rule. */
  category: LanguageCategory;
}

export interface CheckResult {
  matches: LTMatch[];
  language?: { code: string; name?: string; detectedCode?: string };
  /** Set when the request failed; `matches` is then empty. */
  error?: string;
  status?: number;
}

export const LT_DEFAULT_URL = "https://api.languagetool.org/v2";
/** Hard ceiling per request, below the public tier's 20 KB. */
export const LT_MAX_REQUEST_BYTES = 15000;

/**
 * Rules that over-flag ordinary academic register (passive voice, long sentences, hedging). Off by default
 * for theses; a student can still enable them by removing them from the thesis prefs later.
 */
export const THESIS_DEFAULT_DISABLED_RULES = ["PASSIVE_VOICE", "TOO_LONG_SENTENCE", "SENTENCE_WHITESPACE", "EN_QUOTES", "FR_SPELLING_RULE_PICKY"];

const CONSISTENCY_RULE = /(BRITISH|AMERICAN|OXFORD_SPELLING|CONSISTEN|UK_US|US_UK|SPELLING_VARIANT|EN_GB_|EN_US_|_GB_SIMPLE|_US_SIMPLE)/i;
const CONSISTENCY_CATEGORY = /^(BRITISH_ENGLISH|AMERICAN_ENGLISH_STYLE|CONSISTENCY)$/i;

const CATEGORY_MAP: Record<string, LanguageCategory> = {
  TYPOS: "spelling",
  CASING: "spelling",
  COMPOUNDING: "spelling",
  GRAMMAR: "grammar",
  CONFUSED_WORDS: "grammar",
  COLLOCATIONS: "grammar",
  SEMANTICS: "grammar",
  FALSE_FRIENDS: "grammar",
  PUNCTUATION: "punctuation",
  TYPOGRAPHY: "punctuation",
  STYLE: "style",
  REDUNDANCY: "style",
  PLAIN_ENGLISH: "style",
  WIKIPEDIA: "style",
  NONSTANDARD_PHRASES: "style",
  REPETITIONS: "style",
  REPETITIONS_STYLE: "style",
  CREATIVE_WRITING: "style",
  GENDER_NEUTRALITY: "style",
  TEXT_ANALYSIS: "style",
  MISC: "grammar",
};

/** Maps a LanguageTool rule to one of Thesisfic's five categories. */
export function mapCategory(categoryId: string, ruleId: string): LanguageCategory {
  const cat = (categoryId || "").toUpperCase();
  const rule = (ruleId || "").toUpperCase();
  if (CONSISTENCY_CATEGORY.test(cat)) return "consistency";
  // Morfologik rules are plain spell-checking even when the id carries the variant (MORFOLOGIK_RULE_EN_GB).
  if (!rule.startsWith("MORFOLOGIK") && CONSISTENCY_RULE.test(rule)) return "consistency";
  return CATEGORY_MAP[cat] || "grammar";
}

/** Byte length of the original text an annotation array stands for (text + markup). */
export function annotationBytes(items: AnnotationItem[]): number {
  let n = 0;
  for (const it of items) n += Buffer.byteLength("text" in it ? it.text : it.markup, "utf8");
  return n;
}

/** Original string the offsets refer to: every text and markup item concatenated in order. */
export function annotationOriginal(items: AnnotationItem[]): string {
  return items.map((it) => ("text" in it ? it.text : it.markup)).join("");
}

/** Ranges (in original offsets) covered by markup items; matches touching them are not trustworthy. */
export function protectedRanges(items: AnnotationItem[]): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let pos = 0;
  for (const it of items) {
    const len = "text" in it ? it.text.length : it.markup.length;
    if (!("text" in it) && len) out.push({ from: pos, to: pos + len });
    pos += len;
  }
  return out;
}

export function intersectsProtected(from: number, to: number, ranges: { from: number; to: number }[]) {
  return ranges.some((r) => from < r.to && to > r.from);
}

function baseUrl() {
  return (process.env.LANGUAGETOOL_URL || LT_DEFAULT_URL).replace(/\/+$/, "");
}

interface RawMatch {
  offset: number;
  length: number;
  message: string;
  shortMessage?: string;
  replacements?: { value: string }[];
  rule?: { id?: string; issueType?: string; category?: { id?: string; name?: string } };
}

async function postCheck(items: AnnotationItem[], opts: CheckOptions): Promise<CheckResult> {
  const params = new URLSearchParams();
  params.set("language", opts.language || "auto");
  params.set("data", JSON.stringify({ annotation: items }));
  if (opts.motherTongue) params.set("motherTongue", opts.motherTongue);
  if (opts.disabledRules?.length) params.set("disabledRules", opts.disabledRules.join(","));
  if (opts.disabledCategories?.length) params.set("disabledCategories", opts.disabledCategories.join(","));
  if (opts.level) params.set("level", opts.level);
  if (process.env.LANGUAGETOOL_USERNAME && process.env.LANGUAGETOOL_API_KEY) {
    params.set("username", process.env.LANGUAGETOOL_USERNAME);
    params.set("apiKey", process.env.LANGUAGETOOL_API_KEY);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 12000);
  try {
    const res = await fetch(`${baseUrl()}/check`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: params.toString(),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const error = res.status === 429 ? "LanguageTool rate limit reached. Checks resume in a minute." : res.status >= 500 ? "LanguageTool is unavailable right now." : `LanguageTool rejected the request (${res.status})${text ? `: ${text.slice(0, 160)}` : ""}`;
      return { matches: [], error, status: res.status };
    }
    const data = (await res.json()) as { matches?: RawMatch[]; language?: { code?: string; name?: string; detectedLanguage?: { code?: string } } };
    const matches: LTMatch[] = (data.matches || []).map((m) => {
      const ruleId = m.rule?.id || "UNKNOWN";
      const catId = m.rule?.category?.id || "MISC";
      return {
        offset: m.offset,
        length: m.length,
        message: m.message || "",
        shortMessage: m.shortMessage || "",
        replacements: (m.replacements || []).map((r) => r.value).filter((v) => typeof v === "string").slice(0, 5),
        rule: { id: ruleId, category: { id: catId, name: m.rule?.category?.name || catId }, issueType: m.rule?.issueType || "" },
        category: mapCategory(catId, ruleId),
      };
    });
    return { matches, language: data.language?.code ? { code: data.language.code, name: data.language.name, detectedCode: data.language.detectedLanguage?.code } : undefined };
  } catch (e) {
    const err = e as Error;
    return { matches: [], error: err.name === "AbortError" ? "LanguageTool did not answer in time." : err.message || "LanguageTool request failed." };
  } finally {
    clearTimeout(timer);
  }
}

/** Splits a long text item at whitespace so that no chunk exceeds `max` bytes. */
function splitText(text: string, max: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (Buffer.byteLength(rest, "utf8") > max) {
    let cut = Math.min(rest.length, Math.floor(max / 2));
    const ws = rest.lastIndexOf(" ", cut);
    if (ws > cut / 2) cut = ws + 1;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) out.push(rest);
  return out;
}

/** Groups annotation items into requests of at most LT_MAX_REQUEST_BYTES; returns each chunk with its offset in the original. */
export function chunkAnnotations(items: AnnotationItem[], max = LT_MAX_REQUEST_BYTES): { items: AnnotationItem[]; base: number }[] {
  const chunks: { items: AnnotationItem[]; base: number }[] = [];
  let cur: AnnotationItem[] = [];
  let curBytes = 0;
  let curBase = 0;
  let pos = 0;
  const flush = () => {
    if (cur.length) chunks.push({ items: cur, base: curBase });
    cur = [];
    curBytes = 0;
    curBase = pos;
  };
  const pushItem = (it: AnnotationItem) => {
    const s = "text" in it ? it.text : it.markup;
    const bytes = Buffer.byteLength(s, "utf8");
    if (curBytes + bytes > max && cur.length) flush();
    cur.push(it);
    curBytes += bytes;
    pos += s.length;
  };
  for (const it of items) {
    if ("text" in it && Buffer.byteLength(it.text, "utf8") > max) for (const part of splitText(it.text, max)) pushItem({ text: part });
    else pushItem(it);
  }
  flush();
  return chunks;
}

/**
 * Checks one paragraph given as annotation items. Long paragraphs are split into several requests and the
 * offsets re-based, so callers always get offsets in the full original string. Failures never throw.
 */
export async function checkAnnotated(items: AnnotationItem[], opts: CheckOptions): Promise<CheckResult> {
  const clean = items.filter((it) => ("text" in it ? typeof it.text === "string" && it.text.length > 0 : typeof it.markup === "string" && it.markup.length > 0));
  if (!clean.some((it) => "text" in it && it.text.trim())) return { matches: [] };
  const chunks = chunkAnnotations(clean);
  const results = await Promise.all(chunks.map((c) => postCheck(c.items, opts)));
  const out: CheckResult = { matches: [] };
  results.forEach((r, i) => {
    if (r.error && !out.error) {
      out.error = r.error;
      out.status = r.status;
    }
    if (r.language && !out.language) out.language = r.language;
    for (const m of r.matches) out.matches.push({ ...m, offset: m.offset + chunks[i].base });
  });
  out.matches.sort((a, b) => a.offset - b.offset);
  return out;
}
