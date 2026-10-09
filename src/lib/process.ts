// Replayable process record: hash-chained snapshots, a compact paragraph diff, the timeline the
// Process panel draws, and the ledger summary the AI-use declaration is rendered from.
//
// Design notes (see reports/Editores académicos con IA.md §4):
// - Snapshots, never keystrokes. A snapshot stores the full HTML on the first and every 20th entry
//   and a line diff of the paragraph-split plain text otherwise. Replay is rebuilt from those diffs.
// - Every snapshot carries the hash of the previous one, so the record is tamper-evident without
//   trusting the server. `verifyChain` recomputes the chain.
// - Nothing here infers anything. Every number comes from an event that happened in the editor
//   (a paste, an insertion from the assistant, a recognised copilot passage) or from the
//   `data-provenance` marks already present in the document HTML.
//
// Server-only module (uses node:crypto and the data layer). Client code imports types only.

import { createHash } from "crypto";
import { db } from "./db";
import type { AIInteraction, AIMode, Consent, Policy, Snapshot, Thesis, ThesisVersion, WritingSession } from "./db";

export const FULL_SNAPSHOT_EVERY = 20;

// ---------------------------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------------------------

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** sha256 hex of the previous hash followed by a canonical JSON serialisation of the payload. */
export function computeHash(prevHash: string | undefined, payload: unknown): string {
  return createHash("sha256")
    .update(prevHash || "")
    .update("\n")
    .update(stableStringify(payload))
    .digest("hex");
}

/** The fields of a snapshot that are covered by its hash (everything the server did not assign itself). */
export function snapshotPayload(s: Omit<Snapshot, "id" | "createdAt" | "hash">) {
  return { thesisId: s.thesisId, tabId: s.tabId, userId: s.userId, sessionId: s.sessionId, wordCount: s.wordCount, provenance: s.provenance, html: s.html, diff: s.diff };
}

export function verifyChain(snapshots: Snapshot[]): { ok: boolean; brokenAt?: string; checked: number } {
  let prev: Snapshot | undefined;
  for (const s of snapshots) {
    const expected = computeHash(s.prevHash, snapshotPayload(s));
    if (expected !== s.hash) return { ok: false, brokenAt: s.id, checked: snapshots.length };
    // The first element of a truncated chain may point at a snapshot that was dropped; only linked pairs are checked.
    if (prev && s.prevHash !== prev.hash) return { ok: false, brokenAt: s.id, checked: snapshots.length };
    prev = s;
  }
  return { ok: true, checked: snapshots.length };
}

// ---------------------------------------------------------------------------------------------
// HTML → paragraphs and provenance counts
// ---------------------------------------------------------------------------------------------

const BLOCK_END = /<\/(?:p|h[1-6]|li|tr|blockquote|pre|div|figcaption)>|<br\s*\/?>/gi;

function decodeEntities(s: string) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

export function countWords(text: string) {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Plain-text paragraphs of a TipTap document, one per block, whitespace collapsed, empty blocks dropped. */
export function htmlToParagraphs(html: string): string[] {
  return html
    .replace(/<figcaption[\s\S]*?<\/figcaption>/gi, "") // image captions are not thesis text
    .replace(BLOCK_END, "\n")
    .replace(/<[^>]*>/g, "")
    .split("\n")
    .map((l) => decodeEntities(l).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export type ProvenanceKind = "human" | "ai" | "paste";

export interface ChapterStats {
  heading: string;
  level: number; // 0 before the first heading, 1 for H1, 2 for H2
  words: number;
  ai: number;
  paste: number;
  human: number;
}

export interface HtmlScan {
  chapters: ChapterStats[];
  words: number;
  ai: number;
  paste: number;
  human: number;
  /** Pasted words whose mark names a source (library source or a declared citation). */
  pasteAttributed: number;
  /** AI-assisted words per interaction id (marks that carry `data-interaction`). */
  aiByInteraction: Record<string, number>;
}

/**
 * Walks the document HTML once and counts words per provenance mark, per H1/H2 section.
 * Provenance comes only from `<span data-provenance="…">` marks the editor wrote.
 */
export function scanHtml(html: string): HtmlScan {
  const scan: HtmlScan = { chapters: [], words: 0, ai: 0, paste: 0, human: 0, pasteAttributed: 0, aiByInteraction: {} };
  const tokens = html.match(/<[^>]*>|[^<]+/g) || [];
  // One entry per open <span>: the provenance it carries, or null for an unrelated span.
  const spans: ({ kind: ProvenanceKind; attributed: boolean; interactionId?: string } | null)[] = [];
  let current: ChapterStats | null = null;
  let headingLevel = 0;
  let headingText = "";

  const section = () => {
    if (!current) {
      current = { heading: "Before the first heading", level: 0, words: 0, ai: 0, paste: 0, human: 0 };
      scan.chapters.push(current);
    }
    return current as ChapterStats;
  };

  for (const tok of tokens) {
    if (tok[0] === "<") {
      const tag = tok.toLowerCase();
      if (tag.startsWith("<span")) {
        const prov = /data-provenance="([^"]*)"/i.exec(tok)?.[1] as ProvenanceKind | undefined;
        if (prov === "ai" || prov === "paste" || prov === "human") {
          spans.push({ kind: prov, attributed: /data-source="[^"]+"/i.test(tok), interactionId: /data-interaction="([^"]+)"/i.exec(tok)?.[1] });
        } else spans.push(null);
      } else if (tag.startsWith("</span")) {
        spans.pop();
      } else if (/^<h[12][\s>]/.test(tag)) {
        headingLevel = Number(tag[2]);
        headingText = "";
        current = { heading: "", level: headingLevel, words: 0, ai: 0, paste: 0, human: 0 };
        scan.chapters.push(current);
      } else if (/^<\/h[12]>/.test(tag)) {
        if (current) current.heading = headingText.replace(/\s+/g, " ").trim() || "Untitled section";
        headingLevel = 0;
      }
      continue;
    }
    const text = decodeEntities(tok);
    const n = countWords(text);
    if (headingLevel) headingText += text;
    if (!n) continue;
    let mark: { kind: ProvenanceKind; attributed: boolean; interactionId?: string } | null = null;
    for (let i = spans.length - 1; i >= 0; i--) if (spans[i]) { mark = spans[i]; break; }
    const kind: ProvenanceKind = mark?.kind || "human";
    const sec = section();
    sec.words += n;
    sec[kind] += n;
    scan.words += n;
    scan[kind] += n;
    if (kind === "paste" && mark?.attributed) scan.pasteAttributed += n;
    if (kind === "ai" && mark?.interactionId) scan.aiByInteraction[mark.interactionId] = (scan.aiByInteraction[mark.interactionId] || 0) + n;
  }
  // A heading without any body text still appears as a chapter; one that never closed keeps its text.
  if (current && headingLevel && !(current as ChapterStats).heading) (current as ChapterStats).heading = headingText.trim() || "Untitled section";
  return scan;
}

// ---------------------------------------------------------------------------------------------
// Compact line diff (LCS) in a unified-style format
//
//   @@ -<oldStart>,<oldLen> +<newStart>,<newLen> @@
//   -removed line
//   +added line
//
// Starts are 0-based indexes into the paragraph arrays; hunks carry no context lines.
// ---------------------------------------------------------------------------------------------

const LCS_CELL_CAP = 4_000_000;

type Op = { t: "=" | "-" | "+"; line: string };

function lcsOps(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  if (!n && !m) return [];
  if (!n) return b.map((line) => ({ t: "+" as const, line }));
  if (!m) return a.map((line) => ({ t: "-" as const, line }));
  if ((n + 1) * (m + 1) > LCS_CELL_CAP) {
    // Too large for the table: record the middle as a replacement. Still a valid, applicable diff.
    return [...a.map((line) => ({ t: "-" as const, line })), ...b.map((line) => ({ t: "+" as const, line }))];
  }
  const w = m + 1;
  const dp = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ t: "=", line: a[i] });
      i++;
      j++;
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
      ops.push({ t: "-", line: a[i++] });
    } else {
      ops.push({ t: "+", line: b[j++] });
    }
  }
  while (i < n) ops.push({ t: "-", line: a[i++] });
  while (j < m) ops.push({ t: "+", line: b[j++] });
  return ops;
}

/** Unified-style diff turning paragraph list `a` into `b`. Empty string when they are equal. */
export function diffLines(a: string[], b: string[]): string {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const ops = lcsOps(a.slice(start, endA), b.slice(start, endB));
  const hunks: string[] = [];
  let oldPos = start;
  let newPos = start;
  let k = 0;
  while (k < ops.length) {
    if (ops[k].t === "=") {
      oldPos++;
      newPos++;
      k++;
      continue;
    }
    const removed: string[] = [];
    const added: string[] = [];
    const oldStart = oldPos;
    const newStart = newPos;
    while (k < ops.length && ops[k].t !== "=") {
      if (ops[k].t === "-") {
        removed.push(ops[k].line);
        oldPos++;
      } else {
        added.push(ops[k].line);
        newPos++;
      }
      k++;
    }
    hunks.push(`@@ -${oldStart},${removed.length} +${newStart},${added.length} @@`, ...removed.map((l) => `-${l}`), ...added.map((l) => `+${l}`));
  }
  return hunks.join("\n");
}

/** Applies a diff produced by `diffLines` to `a`. Tolerant: never throws on a malformed hunk, it keeps the old text. */
export function applyDiff(a: string[], diff: string): string[] {
  if (!diff) return a.slice();
  const out: string[] = [];
  let cursor = 0;
  const lines = diff.split("\n");
  let idx = 0;
  while (idx < lines.length) {
    const header = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@$/.exec(lines[idx]);
    if (!header) {
      idx++;
      continue;
    }
    const oldStart = Number(header[1]);
    const oldLen = Number(header[2]);
    idx++;
    if (oldStart < cursor || oldStart > a.length) return a.slice();
    for (let p = cursor; p < oldStart; p++) out.push(a[p]);
    cursor = Math.min(a.length, oldStart + oldLen);
    while (idx < lines.length && !lines[idx].startsWith("@@")) {
      const l = lines[idx++];
      if (l[0] === "+") out.push(l.slice(1));
      // "-" lines are consumed by advancing the cursor above.
    }
  }
  for (let p = cursor; p < a.length; p++) out.push(a[p]);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------------------------

export interface SnapshotInput {
  thesisId: string;
  tabId: string;
  userId: string;
  sessionId?: string;
  html: string;
  wordCount?: number;
  provenance?: { human: number; ai: number; paste: number };
}

export interface ReplayState {
  snapshotId: string;
  at: string;
  text: string;
  lines: string[];
  wordCount: number;
  full: boolean;
}

/** Reconstructs the plain-text state after each snapshot. Diff-only entries before the first full snapshot are skipped. */
export function replaySnapshots(list: Snapshot[]): ReplayState[] {
  const states: ReplayState[] = [];
  let lines: string[] | null = null;
  for (const s of list) {
    if (s.html !== undefined) lines = htmlToParagraphs(s.html);
    else if (lines && s.diff !== undefined) lines = applyDiff(lines, s.diff);
    else continue;
    states.push({ snapshotId: s.id, at: s.createdAt, text: lines.join("\n"), lines, wordCount: s.wordCount, full: s.html !== undefined });
  }
  return states;
}

/**
 * Builds the next snapshot of a tab: full HTML on the first and every 20th entry, a paragraph diff otherwise.
 * `chain` is the tab's existing chain (oldest first); it defaults to the stored one.
 */
export function makeSnapshot(input: SnapshotInput, chain?: Snapshot[]): Omit<Snapshot, "id" | "createdAt"> {
  const existing = chain ?? db.snapshots.list(input.thesisId, input.tabId);
  const previous = existing[existing.length - 1];
  const paragraphs = htmlToParagraphs(input.html);
  const scan = input.provenance ? null : scanHtml(input.html);
  const provenance = input.provenance ?? { human: scan!.human, ai: scan!.ai, paste: scan!.paste };
  const wordCount = input.wordCount ?? countWords(paragraphs.join(" "));

  let full = !previous || existing.length % FULL_SNAPSHOT_EVERY === 0;
  let diff: string | undefined;
  if (!full) {
    const states = replaySnapshots(existing);
    const prevLines = states.length ? states[states.length - 1].lines : null;
    if (!prevLines) full = true;
    else diff = diffLines(prevLines, paragraphs);
  }
  const body: Omit<Snapshot, "id" | "createdAt" | "hash"> = {
    thesisId: input.thesisId,
    tabId: input.tabId,
    userId: input.userId,
    sessionId: input.sessionId,
    wordCount,
    provenance,
    html: full ? input.html : undefined,
    diff: full ? undefined : diff,
    prevHash: previous?.hash,
  };
  return { ...body, hash: computeHash(body.prevHash, snapshotPayload(body)) };
}

// ---------------------------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------------------------

export type EventAttribution = "source" | "copilot" | "assistant" | "ai_tool" | "unattributed" | "own";
export type TimelineEventKind = "paste" | "ai_insert" | "ai_prompt" | "snapshot" | "version";

export interface TimelineSegment {
  sessionId: string;
  start: string;
  end: string;
  minutes: number;
  words: number;
  keystrokes: number;
  pastes: number;
  aiInserts: number;
  aiPrompts: number;
  device: WritingSession["device"];
  consented: boolean;
}

export interface TimelineEvent {
  id: string;
  at: string;
  kind: TimelineEventKind;
  sessionId?: string;
  words?: number;
  attribution?: EventAttribution;
  interactionId?: string;
  mode?: AIMode | string;
  model?: string;
  provider?: string;
  costUsd?: number;
  blocked?: boolean;
  label?: string;
  tabId?: string;
}

export interface TimelineTotals {
  words: number;
  ai: number;
  paste: number;
  human: number;
  sessions: number;
  minutes: number;
  pastes: number;
  aiInserts: number;
  aiPrompts: number;
  snapshots: number;
  firstActivity?: string;
  lastActivity?: string;
}

export interface ProcessTimeline {
  segments: TimelineSegment[];
  events: TimelineEvent[];
  chapters: ChapterStats[];
  totals: TimelineTotals;
}

const minutesBetween = (a: string, b: string) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));

/**
 * What the student (or the editor) said about a paste, in the order the facts arrive: recognised from an assistant
 * answer, recognised from a library source, declared in the dialog (own text, a source, an AI tool), or nothing.
 * Short pastes under the dialog threshold carry no declaration: they stay in the student's own words.
 */
function pasteAttribution(data: Record<string, unknown>): EventAttribution {
  const matched = data.matchedAi as { mode?: string } | undefined;
  if (matched) return matched.mode === "copilot" ? "copilot" : "assistant";
  if (data.matchedSource) return "source";
  const declared = typeof data.attribution === "string" ? data.attribution : data.attributed ? "own" : "none";
  if (declared === "own") return "own";
  if (declared === "ai") return "ai_tool";
  if (declared === "source" || data.sourceId || data.label) return "source";
  if (Number(data.words || 0) < 30) return "own";
  return "unattributed";
}

export function processTimeline(thesis: Thesis, sessions: WritingSession[], interactions: AIInteraction[], snapshots: Snapshot[], versions: ThesisVersion[] = []): ProcessTimeline {
  const byInteraction = new Map<string, AIInteraction>();
  interactions.forEach((i) => byInteraction.set(i.id, i));
  const events: TimelineEvent[] = [];
  const segments: TimelineSegment[] = [];

  const ordered = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  for (const s of ordered) {
    const end = s.endedAt || s.lastHeartbeatAt;
    let aiInserts = 0;
    let aiPrompts = 0;
    for (const ev of s.events) {
      if (ev.type === "paste") {
        events.push({ id: ev.id, at: ev.timestamp, kind: "paste", sessionId: s.id, words: Number(ev.data.words || 0), attribution: pasteAttribution(ev.data), interactionId: (ev.data.matchedAi as { interactionId?: string } | undefined)?.interactionId, mode: (ev.data.matchedAi as { mode?: string } | undefined)?.mode });
      } else if (ev.type === "ai_insert") {
        aiInserts++;
        const it = typeof ev.data.interactionId === "string" ? byInteraction.get(ev.data.interactionId) : undefined;
        const mode = (it?.mode || ev.data.mode) as string | undefined;
        events.push({ id: ev.id, at: ev.timestamp, kind: "ai_insert", sessionId: s.id, words: Number(ev.data.words || 0), attribution: mode === "copilot" ? "copilot" : "assistant", interactionId: it?.id, mode, model: it?.model, provider: it?.provider || (ev.data.provider as string | undefined), costUsd: it?.costUsd });
      } else if (ev.type === "ai_prompt") {
        aiPrompts++;
        // Prompts are listed from the interaction log below; only orphans (no logged interaction) come from the session.
        if (typeof ev.data.interactionId === "string" && byInteraction.has(ev.data.interactionId)) continue;
        events.push({ id: ev.id, at: ev.timestamp, kind: "ai_prompt", sessionId: s.id, mode: ev.data.mode as string | undefined, provider: ev.data.provider as string | undefined, model: ev.data.model as string | undefined, blocked: !!ev.data.blocked });
      }
    }
    segments.push({ sessionId: s.id, start: s.startedAt, end, minutes: minutesBetween(s.startedAt, end), words: s.wordsWritten, keystrokes: s.keystrokes, pastes: s.pasteEvents, aiInserts, aiPrompts, device: s.device, consented: !!s.consentId });
  }

  const inSession = (at: string) => segments.find((g) => g.start <= at && at <= g.end)?.sessionId;
  for (const it of interactions) {
    events.push({ id: it.id, at: it.timestamp, kind: "ai_prompt", sessionId: it.sessionId || inSession(it.timestamp), interactionId: it.id, mode: it.mode, model: it.model, provider: it.provider, costUsd: it.costUsd, blocked: it.blockedByPolicy });
  }
  for (const s of snapshots) events.push({ id: s.id, at: s.createdAt, kind: "snapshot", sessionId: s.sessionId || inSession(s.createdAt), words: s.wordCount, tabId: s.tabId });
  for (const v of versions) if (v.kind !== "autosave") events.push({ id: v.id, at: v.createdAt, kind: "version", sessionId: inSession(v.createdAt), words: v.wordCount, label: v.label || v.kind });
  events.sort((a, b) => a.at.localeCompare(b.at));

  const scan = scanHtml(thesis.content);
  const times = [...segments.map((g) => g.start), ...events.map((e) => e.at)].sort();
  const totals: TimelineTotals = {
    words: thesis.wordCount,
    ai: thesis.provenance.ai,
    paste: thesis.provenance.paste,
    human: thesis.provenance.human,
    sessions: segments.length,
    minutes: segments.reduce((a, g) => a + g.minutes, 0),
    pastes: events.filter((e) => e.kind === "paste").length,
    aiInserts: events.filter((e) => e.kind === "ai_insert").length,
    aiPrompts: events.filter((e) => e.kind === "ai_prompt").length,
    snapshots: snapshots.length,
    firstActivity: times[0],
    lastActivity: [...segments.map((g) => g.end), ...events.map((e) => e.at)].sort().pop(),
  };
  return { segments, events, chapters: scan.chapters, totals };
}

// ---------------------------------------------------------------------------------------------
// Ledger summary: the numbers the declaration is rendered from. Everything is traceable to an event
// or a mark; nothing is estimated.
// ---------------------------------------------------------------------------------------------

export interface LedgerSummary {
  generatedAt: string;
  thesisId: string;
  thesisTitle: string;
  words: { total: number; ai: number; paste: number; human: number };
  pct: { ai: number; paste: number; human: number };
  aiLimitPct: number;
  interactions: { total: number; blocked: number; copilot: number; byMode: { mode: string; count: number }[]; providers: string[] };
  aiInserts: { events: number; words: number; interactionsWithText: number };
  aiChapters: string[];
  pastes: { events: number; words: number; attributedToSource: number; recognisedFromAssistant: number; declaredAiTool: number; ownText: number; unattributed: number; attributedWords: number };
  budget: { currency: string; institutionUsd: number; institutionLocal: number; requests: number; studentPaidRequests: number } | null;
  scopes: Consent["scopes"] | null;
  consent: { version: string; grantedAt: string } | null;
  sessions: { count: number; minutes: number; firstAt?: string; lastAt?: string };
  snapshots: { count: number; chainOk: boolean; brokenAt?: string };
  notices: { open: number; resolved: number };
  versions: number;
}

export function ledgerSummary(
  thesis: Thesis,
  sessions: WritingSession[],
  interactions: AIInteraction[],
  snapshots: Snapshot[],
  ctx: { policy: Policy; consent?: Consent | null; funding?: { currency: string; usdRate: number } | null; openNotices?: number; resolvedNotices?: number; versions?: number }
): LedgerSummary {
  const timeline = processTimeline(thesis, sessions, interactions, snapshots);
  const scan = scanHtml(thesis.content);
  const total = Math.max(1, thesis.wordCount);
  const pct = (n: number) => Math.round((n / total) * 1000) / 10;

  const modeCounts = new Map<string, number>();
  interactions.forEach((i) => modeCounts.set(i.mode, (modeCounts.get(i.mode) || 0) + 1));
  const byMode = Array.from(modeCounts.entries())
    .map(([mode, count]) => ({ mode, count }))
    .sort((a, b) => b.count - a.count || a.mode.localeCompare(b.mode));
  const providers = Array.from(new Set(interactions.map((i) => i.provider))).sort();

  const inserts = timeline.events.filter((e) => e.kind === "ai_insert");
  const pastes = timeline.events.filter((e) => e.kind === "paste");
  const institution = interactions.filter((i) => i.billedTo === "institution");
  const institutionUsd = institution.reduce((a, i) => a + (i.costUsd || 0), 0);
  const chain = verifyChain(snapshots);

  return {
    generatedAt: new Date().toISOString(),
    thesisId: thesis.id,
    thesisTitle: thesis.title,
    words: { total: thesis.wordCount, ai: thesis.provenance.ai, paste: thesis.provenance.paste, human: thesis.provenance.human },
    pct: { ai: pct(thesis.provenance.ai), paste: pct(thesis.provenance.paste), human: pct(thesis.provenance.human) },
    aiLimitPct: ctx.policy.maxAiUsagePercent,
    interactions: { total: interactions.length, blocked: interactions.filter((i) => i.blockedByPolicy).length, copilot: interactions.filter((i) => i.mode === "copilot").length, byMode, providers },
    aiInserts: { events: inserts.length, words: inserts.reduce((a, e) => a + (e.words || 0), 0), interactionsWithText: Object.keys(scan.aiByInteraction).length },
    aiChapters: scan.chapters.filter((c) => c.ai > 0).map((c) => c.heading),
    pastes: {
      events: pastes.length,
      words: pastes.reduce((a, e) => a + (e.words || 0), 0),
      attributedToSource: pastes.filter((e) => e.attribution === "source").length,
      recognisedFromAssistant: pastes.filter((e) => e.attribution === "assistant" || e.attribution === "copilot").length,
      declaredAiTool: pastes.filter((e) => e.attribution === "ai_tool").length,
      ownText: pastes.filter((e) => e.attribution === "own").length,
      unattributed: pastes.filter((e) => e.attribution === "unattributed").length,
      attributedWords: scan.pasteAttributed,
    },
    budget: institution.length && ctx.funding ? { currency: ctx.funding.currency, institutionUsd: Math.round(institutionUsd * 10000) / 10000, institutionLocal: Math.round(institutionUsd * ctx.funding.usdRate * 100) / 100, requests: institution.length, studentPaidRequests: interactions.filter((i) => i.billedTo === "student").length } : null,
    scopes: ctx.consent?.scopes || null,
    consent: ctx.consent ? { version: ctx.consent.version, grantedAt: ctx.consent.grantedAt } : null,
    sessions: { count: timeline.segments.length, minutes: timeline.totals.minutes, firstAt: timeline.segments[0]?.start, lastAt: timeline.segments[timeline.segments.length - 1]?.end },
    snapshots: { count: snapshots.length, chainOk: chain.ok, brokenAt: chain.brokenAt },
    notices: { open: ctx.openNotices || 0, resolved: ctx.resolvedNotices || 0 },
    versions: ctx.versions || 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Convenience for the API routes: everything the timeline and the summary need, read once.
// ---------------------------------------------------------------------------------------------

export function gatherProcess(thesis: Thesis) {
  const student = db.users.findById(thesis.studentId);
  const university = student?.university || "";
  const policy = db.policies.get(university);
  const sessions = db.sessions.listByThesis(thesis.id);
  const interactions = db.interactions.listByThesis(thesis.id);
  const snapshots = db.snapshots.list(thesis.id, "submission");
  const versions = db.versions.list(thesis.id);
  const flags = db.flags.listByThesis(thesis.id);
  const consent = db.consents.latest(thesis.studentId) || null;
  const funding = db.aiAccess.funding(university);
  return { student, university, policy, sessions, interactions, snapshots, versions, flags, consent, funding };
}

export function buildLedgerSummary(thesis: Thesis): LedgerSummary {
  const g = gatherProcess(thesis);
  return ledgerSummary(thesis, g.sessions, g.interactions, g.snapshots, {
    policy: g.policy,
    consent: g.consent,
    funding: { currency: g.funding.currency, usdRate: g.funding.usdRate },
    openNotices: g.flags.filter((f) => !f.resolved).length,
    resolvedNotices: g.flags.filter((f) => f.resolved).length,
    versions: g.versions.filter((v) => v.kind !== "autosave").length,
  });
}
