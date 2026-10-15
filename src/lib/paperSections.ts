/**
 * Server helpers for the paper and assignment routes (docs/papers.md §3.1–§3.2): the sections strip of a paper, its
 * last activity, late and overdue rules, roster rows, and the validators shared by `POST /api/theses`,
 * `PUT /api/theses/[id]` and `/api/assignments/**`.
 *
 * No `next/*` import and only relative imports, so it runs standalone under `node -r sucrase/register`. Messages are
 * not built here: routes translate the codes these helpers return with `getT()`.
 */
import type { Assignment, PaperFigures, Thesis, User } from "./db";
import { closedTagsOnly, computeFigures, countableHtml, countWords, htmlToWordText } from "./countable";
import { templateFor } from "./papers/templates";
import type { CitationStyle, PaperSection, PaperStatus, RosterCounts, RosterRow } from "./papers/views";

/** At most this many sections are listed per paper (`GET /api/theses` → `sections`). */
export const MAX_SECTIONS = 12;

/** Longest section title kept (a heading is short; this only guards against a pasted paragraph styled as h2). */
const MAX_SECTION_TITLE = 120;

/**
 * Elements that open a nested context. An h2 inside one of them (a table cell, a list item, a quote) is not a
 * top-level section of the paper.
 */
const CONTAINERS = new Set(["table", "thead", "tbody", "tfoot", "tr", "td", "th", "ul", "ol", "li", "blockquote", "figure", "details", "summary", "div", "section", "aside", "header", "footer", "nav", "dl", "dt", "dd"]);

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g;
const H2_CLOSE_RE = /<\/h2\s*>/gi;

/**
 * `countableHtml` (chart figures, captions, styles, equations and the AI-use declaration left out, in one linear
 * forward pass) moved to src/lib/countable.ts, the scan every server counter shares; re-exported here for callers.
 */
export { countableHtml };

/**
 * Top-level sections of a paper's Final submission (`thesis.content`): one per top-level `<h2>`, in document order,
 * with the words of its body (everything after the heading up to the next top-level h2), counted with the server
 * counter `countWords` (chart figures and image captions excluded, like the paper's word count). The heading's own
 * words are not part of its section, so an untouched template section reads 0. Text before the first h2 (the h1
 * title) belongs to no section. An h2 with no text is not a section boundary. At most `max` sections.
 */
export function paperSections(html: string | undefined | null, max: number = MAX_SECTIONS): PaperSection[] {
  if (!html || !/<h2\b/i.test(html)) return [];
  const src = countableHtml(html);
  const heads: { start: number; bodyStart: number; title: string }[] = [];
  let depth = 0;
  const tagRe = new RegExp(TAG_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(src))) {
    const closing = m[1] === "/";
    const name = m[2].toLowerCase();
    if (CONTAINERS.has(name)) {
      if (m[3] === "/") continue;
      depth = closing ? Math.max(0, depth - 1) : depth + 1;
      continue;
    }
    if (name !== "h2" || closing || depth > 0) continue;
    const closeRe = new RegExp(H2_CLOSE_RE.source, "gi");
    closeRe.lastIndex = tagRe.lastIndex;
    const close = closeRe.exec(src);
    if (!close) break;
    const title = htmlToWordText(src.slice(tagRe.lastIndex, close.index)).slice(0, MAX_SECTION_TITLE).trim();
    const bodyStart = close.index + close[0].length;
    if (title) heads.push({ start: m.index, bodyStart, title });
    tagRe.lastIndex = bodyStart;
  }
  return heads.slice(0, Math.max(0, max)).map((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].start : src.length;
    return { title: h.title, words: countWords(closedTagsOnly(src.slice(h.bodyStart, end))) };
  });
}

/** Sections and figures of one paper, computed once per saved version of its content (see `paperOverview`). */
const overviewCache = new Map<string, { key: string; sections: PaperSection[]; figures: PaperFigures }>();
const MAX_CACHED_PAPERS = 5000;

/**
 * Sections (`paperSections`) and figures of a paper for the lists (`GET /api/theses`), cached per paper until its
 * content changes (keyed by `updatedAt` and the content length), so a list call does not parse every document again.
 * Stored `figures` win, as in the paper itself.
 */
export function paperOverview(t: Pick<Thesis, "id" | "updatedAt" | "content" | "figures">): { sections: PaperSection[]; figures: PaperFigures } {
  const content = t.content || "";
  const key = `${t.updatedAt}|${content.length}`;
  const hit = overviewCache.get(t.id);
  if (hit && hit.key === key) return { sections: hit.sections, figures: t.figures || hit.figures };
  const entry = { key, sections: paperSections(content), figures: t.figures || countChartFigures(content) };
  if (overviewCache.size >= MAX_CACHED_PAPERS) overviewCache.clear();
  overviewCache.set(t.id, entry);
  return { sections: entry.sections, figures: entry.figures };
}

/**
 * Chart figures of stored content without `figures` (papers saved before figures were stored): `computeFigures`
 * (src/lib/countable.ts, by `data-origin`, absent = AI), in one forward pass.
 */
export function countChartFigures(html: string): PaperFigures {
  return computeFigures(html);
}

const time = (iso?: string) => {
  const n = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(n) ? -Infinity : n;
};

/** When the student last worked on the paper: the latest of its sessions' `lastHeartbeatAt` and its `updatedAt`. */
export function lastWorkedAt(t: Pick<Thesis, "updatedAt" | "sessions">): string {
  let best = t.updatedAt;
  for (const s of t.sessions || []) if (time(s.lastHeartbeatAt) > time(best)) best = s.lastHeartbeatAt;
  return best;
}

/** Handed in after the due date: `submittedAt > deadline` (same rule as `isSubmittedLate` in ui.tsx). */
export function isLate(submittedAt?: string, deadline?: string): boolean {
  if (!submittedAt || !deadline) return false;
  const s = Date.parse(submittedAt);
  const d = Date.parse(deadline);
  return !Number.isNaN(s) && !Number.isNaN(d) && s > d;
}

/**
 * The `late` of a paper in API responses: handed in (`isHandedIn`) after its due date. A paper taken back from
 * review keeps `submittedAt` as history but is not late until it is handed in again.
 */
export function isPaperLate(t: Pick<Thesis, "status" | "submittedAt" | "deadline">): boolean {
  return isHandedIn(t) && isLate(t.submittedAt, t.deadline);
}

/** Statuses in which the paper's content is frozen for its owner (approved or submitted). */
export const LOCKED_STATUSES: PaperStatus[] = ["approved", "submitted"];
export const isLockedStatus = (s: string): boolean => (LOCKED_STATUSES as string[]).indexOf(s) !== -1;

/** The paper went to its teacher at least once and is not back in the student's hands as an unsent draft. */
export function isHandedIn(paper: Pick<Thesis, "status" | "submittedAt"> | undefined): boolean {
  if (!paper) return false;
  return paper.status === "under_review" || paper.status === "approved" || paper.status === "submitted" || (paper.status === "revision_requested" && !!paper.submittedAt);
}

export const CITATION_STYLES: CitationStyle[] = ["APA", "MLA", "Chicago", "IEEE", "Harvard"];
export const isCitationStyle = (v: unknown): v is CitationStyle => typeof v === "string" && (CITATION_STYLES as string[]).indexOf(v) !== -1;

export const MIN_TARGET_WORDS = 100;
export const MAX_TARGET_WORDS = 200_000;

/** A word target from a request body (number or numeric string), rounded; null when missing or out of 100–200000. */
export function parseTargetWords(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= MIN_TARGET_WORDS && r <= MAX_TARGET_WORDS ? r : null;
}

/**
 * A due date from a request body, stored as noon UTC of the chosen calendar day (src/lib/deadline.ts). Accepts
 * `YYYY-MM-DD` or an ISO date-time; the calendar day is the date written in the value. `null` or "" clears it
 * (`{ ok: true }` without `value`). Years outside 2000–2100 are refused.
 */
export function parseDeadline(v: unknown): { ok: true; value?: string } | { ok: false } {
  if (v === null || v === "") return { ok: true };
  if (typeof v !== "string") return { ok: false };
  const s = v.trim();
  let day = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)?.[0];
  if (!day) {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return { ok: false };
    day = d.toISOString().slice(0, 10);
  }
  const iso = `${day}T12:00:00.000Z`;
  const check = new Date(iso);
  if (Number.isNaN(check.getTime()) || check.toISOString() !== iso) return { ok: false };
  const year = check.getUTCFullYear();
  if (year < 2000 || year > 2100) return { ok: false };
  return { ok: true, value: iso };
}

export const MAX_ASSIGNMENT_TITLE = 200;
export const MAX_BRIEF = 8000;
export const MAX_ASSIGNMENT_STUDENTS = 300;

/** Effective due date of a student's row: the paper's (written through from the assignment, D7), else the assignment's. */
function rowDeadline(a: Pick<Assignment, "deadline">, paper?: Pick<Thesis, "deadline">): string | undefined {
  return paper ? paper.deadline : a.deadline;
}

/**
 * One roster row (docs/papers.md §3.2). `overdue`: the due date has passed and the paper was not handed in (not
 * started counts). `late`: handed in after the due date. A student who has not started reads status "not_started",
 * 0 words, 0 % AI and an integrity score of 100 (the score a new paper starts with).
 */
export function rosterRow(a: Pick<Assignment, "kind" | "deadline" | "targetWords">, studentId: string, student: Pick<User, "name" | "email"> | undefined, paper: Thesis | undefined, now: number = Date.now()): RosterRow {
  const deadline = rowDeadline(a, paper);
  const due = time(deadline);
  const row: RosterRow = {
    studentId,
    name: student?.name || "",
    email: student?.email || "",
    status: paper ? paper.status : "not_started",
    words: paper ? paper.wordCount : 0,
    targetWords: paper ? paper.targetWords : a.targetWords || templateFor(a.kind).targetWords,
    aiUsagePercent: paper ? paper.aiUsagePercent : 0,
    integrityScore: paper ? paper.integrityScore : 100,
    late: paper ? isPaperLate(paper) : false,
    overdue: Number.isFinite(due) && due < now && !isHandedIn(paper),
  };
  if (paper) row.paperId = paper.id;
  if (paper?.submittedAt) row.submittedAt = paper.submittedAt;
  return row;
}

/** Roster totals: not started; writing (draft, in progress, revision requested); in review; done (approved, submitted). */
export function rosterCounts(rows: Pick<RosterRow, "status">[]): RosterCounts {
  const c: RosterCounts = { notStarted: 0, inProgress: 0, inReview: 0, done: 0 };
  for (const r of rows) {
    if (r.status === "not_started") c.notStarted++;
    else if (r.status === "under_review") c.inReview++;
    else if (r.status === "approved" || r.status === "submitted") c.done++;
    else c.inProgress++;
  }
  return c;
}
