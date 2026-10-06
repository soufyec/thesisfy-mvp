/**
 * Anchoring of reviewer quotes inside plain text, after the AnchoredAI recipe:
 * exact match → normalised match (whitespace, quotes, dashes, case) → disambiguate repeated
 * matches by widening the context window word → sentence → paragraph until unique → fuzzy
 * sentence match → fuzzy paragraph match. Pure functions, no DOM, no editor.
 *
 * Offsets are indices into the `text` argument: `[start, end)`.
 */

export type AnchorStrategy = "exact" | "normalized" | "context" | "sentence" | "paragraph";

export interface Anchor {
  start: number;
  end: number;
  /** 1 for a unique exact match, lower for normalised, disambiguated or fuzzy matches. */
  confidence: number;
  strategy: AnchorStrategy;
}

export type AnchorStatus = "live" | "stale" | "orphaned";

/** Similarity under which a comment's anchored text is considered stale. */
export const STALE_THRESHOLD = 0.6;

// ---------- normalisation ----------

const QUOTES = /[‘’‚‛′´`]/g;
const DQUOTES = /[“”„‟″«»]/g;
const DASHES = /[‐‑‒–—―−]/g;

/**
 * Lower-cases, unifies quotes and dashes and collapses whitespace. Returns the normalised string
 * and a map from each normalised index to the original index (plus one trailing entry for the end).
 */
export function normalizeForMatch(input: string): { text: string; map: number[] } {
  let out = "";
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < input.length; i++) {
    let ch = input[i];
    if (/\s/.test(ch)) {
      pendingSpace = out.length > 0;
      continue;
    }
    if (pendingSpace) {
      out += " ";
      map.push(i - 1);
      pendingSpace = false;
    }
    ch = ch.replace(QUOTES, "'").replace(DQUOTES, '"').replace(DASHES, "-").toLowerCase();
    out += ch;
    map.push(i);
  }
  map.push(input.length);
  return { text: out, map };
}

export function tokens(s: string): string[] {
  return normalizeForMatch(s)
    .text.replace(/[^\w\s\u00C0-\u024F]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/** Jaccard similarity of the token sets of two strings (0..1). */
export function tokenJaccard(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size && !B.size) return 1;
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((t) => {
    if (B.has(t)) inter++;
  });
  return inter / (A.size + B.size - inter);
}

// ---------- occurrences ----------

function allIndexes(hay: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  let i = hay.indexOf(needle);
  while (i !== -1) {
    out.push(i);
    i = hay.indexOf(needle, i + 1);
  }
  return out;
}

/** Sentence spans of a text: `[start, end)` offsets, split on terminal punctuation and newlines. */
export function sentenceSpans(text: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  const re = /[^.!?\n]+(?:[.!?]+(?=\s|$)|\n|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!m[0].trim()) continue;
    let s = m.index;
    let e = m.index + m[0].length;
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e > s) spans.push({ start: s, end: e });
    if (m[0].length === 0) re.lastIndex++;
  }
  return spans;
}

/** Paragraph spans: blocks separated by one or more newlines. */
export function paragraphSpans(text: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  const re = /[^\n]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].trim()) spans.push({ start: m.index, end: m.index + m[0].length });
  }
  return spans;
}

function wordsAround(src: string, from: number, to: number, n: number): { before: string; after: string } {
  const beforeWords = src.slice(0, from).split(/(\s+)/);
  const afterWords = src.slice(to).split(/(\s+)/);
  // keep the last n non-space words before and first n after, with their separators
  let before = "";
  let count = 0;
  for (let i = beforeWords.length - 1; i >= 0 && count < n; i--) {
    before = beforeWords[i] + before;
    if (beforeWords[i].trim()) count++;
  }
  let after = "";
  count = 0;
  for (let i = 0; i < afterWords.length && count < n; i++) {
    after += afterWords[i];
    if (afterWords[i].trim()) count++;
  }
  return { before, after };
}

/**
 * Among several occurrences of `needle` in `hay`, pick the one whose surroundings match the
 * surroundings of `needle` in `context` (word → sentence → paragraph windows). Returns the
 * occurrence index in `hay`, or -1 when the context does not single one out.
 */
function disambiguate(hay: string, needle: string, occurrences: number[], context: string): number {
  const inCtx = context.indexOf(needle);
  if (inCtx === -1) return -1;
  const ctxEnd = inCtx + needle.length;
  const tries: { before: string; after: string }[] = [];
  for (const n of [1, 2, 4, 8, 16]) tries.push(wordsAround(context, inCtx, ctxEnd, n));
  const sent = sentenceSpans(context).find((s) => s.start <= inCtx && s.end >= ctxEnd);
  if (sent) tries.push({ before: context.slice(sent.start, inCtx), after: context.slice(ctxEnd, sent.end) });
  const para = paragraphSpans(context).find((p) => p.start <= inCtx && p.end >= ctxEnd);
  if (para) tries.push({ before: context.slice(para.start, inCtx), after: context.slice(ctxEnd, para.end) });

  let candidates = occurrences;
  for (const { before, after } of tries) {
    if (!before && !after) continue;
    const next = candidates.filter((o) => hay.startsWith(before, o - before.length) && hay.startsWith(after, o + needle.length));
    if (next.length === 1) return next[0];
    if (next.length === 0) continue; // this window was too strict; try the next one on the previous set
    candidates = next;
  }
  return -1;
}

// ---------- public API ----------

/**
 * Locate `quote` in `text`. `context` is optional surrounding text (e.g. the sentence the model saw)
 * used only to disambiguate repeated occurrences. Returns null when nothing plausible is found.
 */
export function locateQuote(text: string, quote: string, context?: string): Anchor | null {
  const q = quote.trim();
  if (!q || !text) return null;

  // 1. exact
  const exact = allIndexes(text, q);
  if (exact.length === 1) return { start: exact[0], end: exact[0] + q.length, confidence: 1, strategy: "exact" };
  if (exact.length > 1) {
    const pick = context ? disambiguate(text, q, exact, context) : -1;
    if (pick !== -1) return { start: pick, end: pick + q.length, confidence: 0.9, strategy: "context" };
    return { start: exact[0], end: exact[0] + q.length, confidence: 0.5, strategy: "exact" };
  }

  // 2. normalised
  const nt = normalizeForMatch(text);
  const nq = normalizeForMatch(q);
  const norm = allIndexes(nt.text, nq.text);
  if (norm.length >= 1) {
    let pick = norm[0];
    let confidence = norm.length === 1 ? 0.95 : 0.45;
    let strategy: AnchorStrategy = "normalized";
    if (norm.length > 1 && context) {
      const nc = normalizeForMatch(context);
      const d = disambiguate(nt.text, nq.text, norm, nc.text);
      if (d !== -1) {
        pick = d;
        confidence = 0.85;
        strategy = "context";
      }
    }
    const start = nt.map[pick];
    const end = nt.map[pick + nq.text.length - 1] + 1;
    return { start, end, confidence, strategy };
  }

  // 3. fuzzy sentence
  let best: { span: { start: number; end: number }; score: number } | null = null;
  for (const span of sentenceSpans(text)) {
    const score = tokenJaccard(text.slice(span.start, span.end), q);
    if (!best || score > best.score) best = { span, score };
  }
  if (best && best.score >= STALE_THRESHOLD) return { start: best.span.start, end: best.span.end, confidence: Math.min(0.8, best.score), strategy: "sentence" };

  // 4. fuzzy paragraph (containment: how much of the quote's vocabulary the paragraph holds)
  let bestP: { span: { start: number; end: number }; score: number } | null = null;
  const qTokens = new Set(tokens(q));
  if (qTokens.size) {
    for (const span of paragraphSpans(text)) {
      const pTokens = new Set(tokens(text.slice(span.start, span.end)));
      let hit = 0;
      qTokens.forEach((t) => {
        if (pTokens.has(t)) hit++;
      });
      const score = hit / qTokens.size;
      if (!bestP || score > bestP.score) bestP = { span, score };
    }
  }
  if (bestP && bestP.score >= 0.8) return { start: bestP.span.start, end: bestP.span.end, confidence: Math.min(0.6, bestP.score * 0.7), strategy: "paragraph" };
  return null;
}

/**
 * Does the text currently under an anchor still match what the reviewer saw?
 * live: same or nearly the same; stale: similarity below the threshold; orphaned: nothing left.
 */
export function anchorStatusFor(currentText: string, originalQuote: string, threshold = STALE_THRESHOLD): AnchorStatus {
  const cur = currentText.trim();
  if (!cur) return "orphaned";
  if (normalizeForMatch(cur).text === normalizeForMatch(originalQuote).text) return "live";
  return tokenJaccard(cur, originalQuote) >= threshold ? "live" : "stale";
}
