import { Policy, RubricCriterion, Thesis } from "../db";
import { BASE_SYSTEM } from "./prompts";
import { normalizeForMatch, sentenceSpans, paragraphSpans } from "./anchor";

/**
 * AI reviewer: rubric, prompt, output validation and a deterministic demo.
 * The reviewer produces anchored comments (quote + rationale + question), never prose.
 */

export type ReviewCategory = RubricCriterion["id"];
export type ReviewSeverity = "low" | "medium" | "high";
export type ReviewScope = "selection" | "section" | "document";

export const REVIEW_CATEGORIES: ReviewCategory[] = ["argument", "evidence", "structure", "clarity", "citations", "method"];
export const SEVERITY_ORDER: Record<ReviewSeverity, number> = { high: 0, medium: 1, low: 2 };
export const MAX_COMMENTS_PER_SECTION = 8;
export const MAX_QUOTE_CHARS = 200;
/** A quoted or proposed sentence of this many words or more that is not in the source counts as replacement prose. */
export const REPLACEMENT_WORDS = 12;

export const DEFAULT_RUBRIC: RubricCriterion[] = [
  { id: "argument", label: "Argument", description: "Is the claim explicit, and does the reasoning that leads to it hold? Conclusions should follow from what the section shows.", weight: 3 },
  { id: "evidence", label: "Evidence", description: "Are claims supported by data, results or sources present in the text? Unsupported generalisations and overstated findings.", weight: 3 },
  { id: "structure", label: "Structure", description: "Does the section progress in a readable order, with transitions and a point per paragraph?", weight: 2 },
  { id: "clarity", label: "Clarity", description: "Are sentences precise and readable? Ambiguous terms, long sentences and undefined jargon.", weight: 2 },
  { id: "citations", label: "Citations", description: "Are sources cited where needed, consistently and in the thesis style? Numbers and borrowed ideas without a reference.", weight: 2 },
  { id: "method", label: "Method", description: "Are methods, samples and analysis described with enough detail to be judged and reproduced?", weight: 2 },
];

export const DEFAULT_RUBRIC_VERSION = "default-2026-10";

export function isReviewCategory(x: unknown): x is ReviewCategory {
  return typeof x === "string" && (REVIEW_CATEGORIES as string[]).includes(x);
}

export function clampWeight(w: unknown): number {
  const n = Math.round(Number(w));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(3, n));
}

/** The rubric in force for a university: the institution's weights over the default criteria. */
export function effectiveRubric(policy: Pick<Policy, "reviewRubric">): RubricCriterion[] {
  const custom = policy.reviewRubric || [];
  return DEFAULT_RUBRIC.map((d) => {
    const c = custom.find((x) => x.id === d.id);
    return c ? { ...d, label: c.label || d.label, description: c.description || d.description, weight: clampWeight(c.weight) } : d;
  });
}

/** Short identifier of a rubric's configuration, stored on each ReviewRun. */
export function rubricVersion(rubric: RubricCriterion[]): string {
  const weights = DEFAULT_RUBRIC.map((d) => rubric.find((r) => r.id === d.id)?.weight ?? d.weight);
  const isDefault = weights.every((w, i) => w === DEFAULT_RUBRIC[i].weight) && rubric.every((r) => DEFAULT_RUBRIC.find((d) => d.id === r.id)?.label === r.label);
  return isDefault ? DEFAULT_RUBRIC_VERSION : `custom-${weights.join("")}`;
}

/** Validates an admin-submitted rubric. Unknown ids are rejected; missing criteria keep their defaults. */
export function validateRubric(input: unknown): { rubric: RubricCriterion[] } | { error: string } {
  if (!Array.isArray(input)) return { error: "rubric must be an array of criteria" };
  const out: RubricCriterion[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return { error: "each criterion must be an object" };
    const r = raw as Record<string, unknown>;
    if (!isReviewCategory(r.id)) return { error: `unknown criterion id: ${String(r.id)}` };
    if (out.some((x) => x.id === r.id)) return { error: `duplicate criterion id: ${r.id}` };
    if (r.weight === undefined || !Number.isFinite(Number(r.weight))) return { error: `weight is required for ${r.id}` };
    const def = DEFAULT_RUBRIC.find((d) => d.id === r.id)!;
    out.push({
      id: r.id,
      label: typeof r.label === "string" && r.label.trim() ? r.label.trim().slice(0, 40) : def.label,
      description: typeof r.description === "string" && r.description.trim() ? r.description.trim().slice(0, 300) : def.description,
      weight: clampWeight(r.weight),
    });
  }
  for (const d of DEFAULT_RUBRIC) if (!out.some((x) => x.id === d.id)) out.push(d);
  out.sort((a, b) => REVIEW_CATEGORIES.indexOf(a.id) - REVIEW_CATEGORIES.indexOf(b.id));
  return { rubric: out };
}

// ---------- prompt ----------

export interface ReviewerComment {
  quote: string;
  category: ReviewCategory;
  severity: ReviewSeverity;
  rationale: string;
  question?: string;
  /** Optional sentence around the quote, used only to disambiguate repeated quotes. */
  context?: string;
}

/** A validated comment with its offsets inside the reviewed plain text. */
export interface AnchoredReviewComment extends Omit<ReviewerComment, "context"> {
  start: number;
  end: number;
  confidence: number;
}

const REVIEWER_RULES = `Reviewer mode: you review a passage of the student's thesis and return anchored comments, not prose.

Hard rules for this mode:
- Never write replacement text. No rewritten sentences, no "try: ...", no model sentences, no example phrasings longer than a few words, no scaffolds or templates. Point at the problem and ask; the student writes.
- Each comment must quote verbatim a short span (at most ${MAX_QUOTE_CHARS} characters, ideally one clause or sentence) copied exactly from the passage, so it can be anchored in the editor. Do not paraphrase the quote.
- rationale: at most two sentences, concrete, about this passage. Say what is missing or weak and why it matters for a thesis reader.
- question: optional, one Socratic question that helps the student decide what to do (e.g. "Which result in table 3 supports this?"). Omit it when it would be generic.
- Only comment on categories in the rubric below, respecting their weights (weight 3: look hard; weight 1: only clear problems; weight 0: never).
- At most ${MAX_COMMENTS_PER_SECTION} comments. Prefer the few that matter most; order by severity.
- Severity: high = a reader would reject or misread the argument; medium = weakens the section; low = polish.
- Do not comment on spelling or formatting. Do not praise. Do not invent facts about the field; if a citation seems missing, say so without naming a source.

Output: a single JSON object, no Markdown fences, no text before or after:
{"comments":[{"quote":"...","category":"argument|evidence|structure|clarity|citations|method","severity":"low|medium|high","rationale":"...","question":"..."}]}
Return {"comments":[]} when the passage needs no comment.`;

export function buildReviewerPrompt(opts: { rubric: RubricCriterion[]; scope: ReviewScope; sectionLabel?: string; thesis?: Pick<Thesis, "title" | "citationStyle"> | null; ledgerSummary?: string }) {
  const active = opts.rubric.filter((r) => r.weight > 0);
  const rubricLines = active.map((r) => `- ${r.id} (weight ${r.weight}): ${r.label}. ${r.description}`).join("\n");
  const parts = [BASE_SYSTEM, REVIEWER_RULES, `Rubric set by the institution:\n${rubricLines || "- (no active criteria)"}`];
  const where = opts.scope === "selection" ? "a selected passage" : opts.scope === "section" ? `the section "${opts.sectionLabel || "untitled"}"` : "the whole submission";
  parts.push(`Scope: ${where}${opts.thesis ? ` of the thesis "${opts.thesis.title}" (citation style ${opts.thesis.citationStyle})` : ""}.`);
  if (opts.ledgerSummary) parts.push(`Process context from the integrity ledger (for your judgement only, never to be mentioned as an accusation): ${opts.ledgerSummary}`);
  return parts.join("\n\n");
}

export function buildReviewerUserMessage(text: string, scope: ReviewScope, sectionLabel?: string) {
  return `Review this ${scope === "section" ? `section${sectionLabel ? ` ("${sectionLabel}")` : ""}` : scope === "selection" ? "selected passage" : "document"} and return the JSON object.\n\n"""\n${text}\n"""`;
}

// ---------- parsing & validation ----------

export interface ParseResult {
  comments: ReviewerComment[];
  /** Comments dropped by validation, with the reason, for diagnostics. */
  rejected: { reason: string; quote?: string }[];
  error?: string;
}

function extractJson(raw: string): unknown {
  const s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(s);
  } catch {
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a !== -1 && b > a) {
      try {
        return JSON.parse(s.slice(a, b + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function wordCount(s: string) {
  return s.split(/\s+/).filter(Boolean).length;
}

const PROPOSAL_LEADS = /\b(try|instead|rewrite|reword|rephrase|replace (?:it|this)? ?with|could (?:read|say|be(?:come)?|be rewritten as)|should read|for example|for instance|such as|consider(?: writing)?|something like|e\.g\.|i\.e\.)\b\s*[:,]?\s*/i;

/**
 * Heuristic: does the text contain a sentence the student could paste? True when a quoted span, or a
 * clause introduced by a proposal lead ("try:", "could read", "for example"), has >= REPLACEMENT_WORDS
 * words and does not appear in the source passage.
 */
export function containsReplacementText(text: string, source: string): boolean {
  if (!text) return false;
  const src = normalizeForMatch(source).text;
  const notInSource = (span: string) => wordCount(span) >= REPLACEMENT_WORDS && !src.includes(normalizeForMatch(span).text);
  const quoted = text.match(/["“«‘']([^"”»’']{20,})["”»’']/g) || [];
  for (const q of quoted) if (notInSource(q.slice(1, -1))) return true;
  for (const span of sentenceSpans(text)) {
    const s = text.slice(span.start, span.end);
    const m = PROPOSAL_LEADS.exec(s);
    if (m) {
      const tail = s.slice(m.index + m[0].length);
      if (notInSource(tail)) return true;
    }
  }
  return false;
}

function firstSentences(s: string, n: number) {
  const spans = sentenceSpans(s);
  if (spans.length <= n) return s.trim();
  return s.slice(spans[0].start, spans[n - 1].end).trim();
}

function trimQuote(q: string): string | null {
  const t = q.replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t.length <= MAX_QUOTE_CHARS) return t;
  const spans = sentenceSpans(t);
  const first = spans.length ? t.slice(spans[0].start, spans[0].end) : t;
  if (first.length <= MAX_QUOTE_CHARS) return first;
  const cut = t.slice(0, MAX_QUOTE_CHARS);
  const sp = cut.lastIndexOf(" ");
  return sp > 40 ? cut.slice(0, sp) : null;
}

/**
 * Validate the model's JSON. Drops comments that are malformed, outside the active rubric, whose quote
 * is not in the source, or that contain replacement text. Caps the result at `max`, ordered by severity.
 */
export function parseReviewerOutput(raw: string, sourceText: string, opts: { rubric: RubricCriterion[]; max?: number; categories?: ReviewCategory[] }): ParseResult {
  const max = opts.max ?? MAX_COMMENTS_PER_SECTION;
  const json = extractJson(raw) as { comments?: unknown } | null;
  if (!json || typeof json !== "object" || !Array.isArray(json.comments)) return { comments: [], rejected: [], error: "The reviewer did not return valid JSON." };
  const active = new Set(opts.rubric.filter((r) => r.weight > 0 && (!opts.categories || opts.categories.includes(r.id))).map((r) => r.id));
  const srcNorm = normalizeForMatch(sourceText).text;
  const out: ReviewerComment[] = [];
  const rejected: ParseResult["rejected"] = [];
  const seen = new Set<string>();

  for (const item of json.comments) {
    if (!item || typeof item !== "object") {
      rejected.push({ reason: "not an object" });
      continue;
    }
    const c = item as Record<string, unknown>;
    const quote = typeof c.quote === "string" ? trimQuote(c.quote) : null;
    if (!quote) {
      rejected.push({ reason: "missing or unusable quote" });
      continue;
    }
    if (!srcNorm.includes(normalizeForMatch(quote).text)) {
      rejected.push({ reason: "quote not found in the passage", quote });
      continue;
    }
    if (!isReviewCategory(c.category) || !active.has(c.category)) {
      rejected.push({ reason: `category not in the active rubric: ${String(c.category)}`, quote });
      continue;
    }
    const severity: ReviewSeverity = c.severity === "high" || c.severity === "medium" || c.severity === "low" ? c.severity : "medium";
    const rationale = typeof c.rationale === "string" ? firstSentences(c.rationale.replace(/\s+/g, " "), 2) : "";
    if (!rationale) {
      rejected.push({ reason: "missing rationale", quote });
      continue;
    }
    const question = typeof c.question === "string" && c.question.trim() ? firstSentences(c.question.replace(/\s+/g, " "), 1) : undefined;
    if (containsReplacementText(rationale, sourceText) || (question && containsReplacementText(question, sourceText))) {
      rejected.push({ reason: "contains replacement text", quote });
      continue;
    }
    const key = normalizeForMatch(quote).text + "|" + c.category;
    if (seen.has(key)) {
      rejected.push({ reason: "duplicate", quote });
      continue;
    }
    seen.add(key);
    const context = typeof c.context === "string" && c.context.includes(quote) ? c.context.slice(0, 600) : undefined;
    out.push({ quote, category: c.category, severity, rationale, question, context });
  }

  out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const kept = out.slice(0, max);
  for (const extra of out.slice(max)) rejected.push({ reason: "over the per-section cap", quote: extra.quote });
  return { comments: kept, rejected };
}

// ---------- deterministic demo ----------

const CLAIM_WORDS = /\b(clearly|obviously|undoubtedly|proves?|prove[sd]?|demonstrates?|shows? that|significantly|it is (?:well )?known|widely (?:accepted|recognised|recognized)|always|never|all|every|no one|everyone|most researchers|the literature agrees)\b/i;
const CITATION = /\(\s*[A-Z][^()]*\d{4}[a-z]?\s*\)|\[\d+(?:[,–-]\s*\d+)*\]|\bet al\.|\b(?:19|20)\d{2}\b/;
const NUMBER = /\b\d+(?:[.,]\d+)?\s*(?:%|(?:percent|per cent|participants|respondents|stations|samples|cases|studies|papers)\b)/i;
const INFERENCE = /\b(therefore|thus|hence|consequently|this (?:means|shows|implies|suggests) that|it follows that|as a result)\b/i;
const METHOD = /\b(we (?:used|collected|analy[sz]ed|selected|recruited|measured|applied)|was (?:used|collected|analy[sz]ed|measured|applied)|were (?:used|collected|analy[sz]ed|measured|recruited|selected)|sample|participants|dataset|questionnaire|interviews?|regression|model was trained)\b/i;
const TRANSITION_OPEN = /^(however|moreover|furthermore|in addition|additionally|on the other hand|nevertheless|also)\b/i;
const VAGUE = /\b(some|many|several|various|a number of|a lot of|things|stuff|aspects|issues|factors)\b/i;

interface DemoCandidate {
  start: number;
  end: number;
  category: ReviewCategory;
  severity: ReviewSeverity;
  rationale: string;
  question?: string;
  score: number;
}

/**
 * Demo reviewer used when no provider key is configured: deterministic, rubric-aware comments on
 * 3–5 sentences of the passage, chosen by simple textual cues. Same shape as a real run.
 */
export function demoReview(text: string, rubric: RubricCriterion[], opts: { max?: number; categories?: ReviewCategory[] } = {}): ReviewerComment[] {
  const active = new Set(rubric.filter((r) => r.weight > 0 && (!opts.categories || opts.categories.includes(r.id))).map((r) => r.id));
  const weight = (c: ReviewCategory) => rubric.find((r) => r.id === c)?.weight ?? 0;
  const paras = paragraphSpans(text);
  const paraStart = new Set(paras.map((p) => p.start));
  const cands: DemoCandidate[] = [];
  const spans = sentenceSpans(text).filter((s) => s.end - s.start >= 25);

  for (const s of spans) {
    const sent = text.slice(s.start, s.end);
    const words = wordCount(sent);
    const hasCite = CITATION.test(sent);
    const push = (category: ReviewCategory, severity: ReviewSeverity, rationale: string, question: string | undefined, base: number) => {
      if (!active.has(category)) return;
      cands.push({ start: s.start, end: s.end, category, severity, rationale, question, score: base + weight(category) * 2 + (severity === "high" ? 3 : severity === "medium" ? 1 : 0) });
    };
    if (CLAIM_WORDS.test(sent) && !hasCite) {
      push("evidence", words > 20 ? "high" : "medium", "The sentence asserts a general finding without pointing to a result, table or source in this passage. A reader will take it as opinion until the support is visible.", "Which result or source in this chapter supports this statement, and how strong is it?", 6);
    }
    if (NUMBER.test(sent) && !hasCite) {
      push("citations", "medium", "A figure is given without a reference or a pointer to where it was obtained. Numbers without provenance are the first thing an examiner checks.", "Where does this number come from: your data, a cited study, or an estimate?", 5);
    }
    if (INFERENCE.test(sent)) {
      push("argument", "medium", "The connector signals a conclusion, but the premise it rests on is not stated in the surrounding sentences. The step from evidence to claim needs to be explicit.", "What has to be true for this conclusion to follow, and is that shown above?", 4);
    }
    if (words > 45) {
      push("clarity", words > 65 ? "high" : "medium", `This sentence runs to ${words} words and carries more than one idea. Readers lose the subject before reaching the verb.`, "Which of the ideas in this sentence is the one the paragraph is about?", 3);
    } else if (VAGUE.test(sent) && words > 12 && !hasCite) {
      push("clarity", "low", "A vague quantifier stands in for a specific term or amount. The reader cannot tell how much, or which ones, you mean.", "Can you name the specific items or give the actual number?", 1);
    }
    if (METHOD.test(sent) && !/\b\d/.test(sent)) {
      push("method", "medium", "The procedure is named but not quantified: no size, period, instrument or criterion. Without these, the method cannot be judged or repeated.", "What were the sample size, the period and the selection criteria?", 4);
    }
    if (paraStart.has(s.start) && TRANSITION_OPEN.test(sent)) {
      push("structure", "low", "The paragraph opens with a transition word, but the previous paragraph does not set up the contrast or addition it announces. Check that the link between the two paragraphs is real.", "What exactly is this paragraph contrasting with, or adding to?", 2);
    }
  }

  // one comment per sentence, best first; then spread across categories
  cands.sort((a, b) => b.score - a.score || a.start - b.start);
  const usedSentences = new Set<number>();
  const perCategory: Record<string, number> = {};
  const picked: DemoCandidate[] = [];
  for (const c of cands) {
    if (usedSentences.has(c.start)) continue;
    if ((perCategory[c.category] || 0) >= 2) continue;
    usedSentences.add(c.start);
    perCategory[c.category] = (perCategory[c.category] || 0) + 1;
    picked.push(c);
  }

  // guarantee 3 comments when the passage has enough sentences
  if (picked.length < 3) {
    const rest = spans.filter((s) => !usedSentences.has(s.start)).sort((a, b) => b.end - b.start - (a.end - a.start));
    const fallbacks: [ReviewCategory, ReviewSeverity, string, string][] = [
      ["argument", "low", "The sentence states a position, but the passage does not say what would count against it. A thesis argument is stronger when its limits are named.", "What is the strongest objection to this sentence, and where do you answer it?"],
      ["structure", "low", "This sentence carries the paragraph's main point but sits in the middle of it. Readers scan the first sentence of each paragraph for the point.", "Would the paragraph read better if this sentence came first?"],
      ["evidence", "low", "The statement is plausible but unanchored: nothing in the passage shows the reader how you know it. Tie it to a result, an observation or a source.", "What did you observe or read that makes you confident of this?"],
    ];
    for (const s of rest) {
      if (picked.length >= 3) break;
      const fb = fallbacks.find((f) => active.has(f[0]) && (perCategory[f[0]] || 0) < 2);
      if (!fb) break;
      perCategory[fb[0]] = (perCategory[fb[0]] || 0) + 1;
      usedSentences.add(s.start);
      picked.push({ start: s.start, end: s.end, category: fb[0], severity: fb[1], rationale: fb[2], question: fb[3], score: 0 });
    }
  }

  const max = Math.min(opts.max ?? 5, MAX_COMMENTS_PER_SECTION);
  return picked
    .slice(0, max)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.start - b.start)
    .map((c) => {
      const raw = text.slice(c.start, c.end);
      const quote = trimQuote(raw) || raw.slice(0, MAX_QUOTE_CHARS);
      return { quote, category: c.category, severity: c.severity, rationale: c.rationale, question: c.question, context: raw.length > quote.length ? raw : undefined };
    });
}
