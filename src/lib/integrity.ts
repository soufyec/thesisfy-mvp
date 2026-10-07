import { countWords, db, IntegrityFlag, Policy, Thesis, WritingSession } from "./db";

export type IntegrityFix = "attribute_paste" | "reduce_ai" | "open_notice" | "none";

/** Stable identifiers for ledger rows; the client translates by code (`editor.ledger.line.<code>`). */
export type IntegrityLineCode = "ai_share" | "paste_unattributed" | "paste_attributed" | "open_notice" | "floor";

export interface IntegrityLine {
  code: IntegrityLineCode;
  /** Values the translated row interpolates (percentages already formatted, counts as numbers, notice type as-is). */
  vars: Record<string, string | number>;
  /** English fallback for consumers without the dictionary (exports, API clients). */
  reason: string;
  /** Points deducted from the starting score. 0 for a row that costs nothing; negative only for the floor adjustment. */
  points: number;
  fix?: IntegrityFix;
  noticeId?: string;
}

export interface IntegrityBreakdown {
  score: number;
  starting: 100;
  lines: IntegrityLine[];
}

const NOTICE_LABELS: Record<IntegrityFlag["type"], string> = {
  bulk_paste: "large paste without attribution",
  unattributed_ai: "AI text pasted without attribution",
  policy_limit: "AI share above the limit",
  rapid_typing: "typing speed",
  ai_generation: "AI generation request",
  style_inconsistency: "style change",
};

/**
 * Percentage for display. Whole numbers stay whole; a value that would round onto the limit while being above
 * it keeps a decimal, so "25% above the 25% limit" can never appear.
 */
export function formatPercent(value: number, limit?: number): string {
  const whole = Math.round(value);
  if (limit === undefined || whole !== limit || value <= limit) return String(whole);
  const one = value.toFixed(1);
  return Number(one) !== limit ? one.replace(/\.0$/, "") : value.toFixed(2);
}

/** Pasted words that carry no attribution: `data-provenance="paste"` spans without a `data-source` label. */
export function countUnattributedPaste(rawHtml: string): number {
  // The AI-use declaration appendix (data-declaration="true") is a record, not thesis text.
  const html = rawHtml.replace(/<span[^>]*data-declaration="true"[^>]*>[\s\S]*?<\/span>/gi, "");
  let words = 0;
  const re = /<span([^>]*)data-provenance="paste"([^>]*)>([\s\S]*?)<\/span>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs = `${m[1]} ${m[2]}`;
    if (!/data-source="[^"]+"/i.test(attrs)) words += countWords(m[3]);
  }
  return words;
}

/**
 * Integrity ledger: the score is 100 minus a list of visible deductions. Every row maps to something the
 * student can see and fix (attribute a paste, stay under the AI limit, answer a notice). Rows are listed
 * even when they cost 0 points, and `100 - sum(points) === score` always holds.
 */
export function integrityBreakdown(thesis: Thesis, policy: Policy, flags: IntegrityFlag[]): IntegrityBreakdown {
  const words = Math.max(1, thesis.wordCount);
  const aiPct = (thesis.provenance.ai / words) * 100;
  const limit = policy.maxAiUsagePercent;
  const lines: IntegrityLine[] = [];

  // AI usage beyond the institution limit costs 1 point per percent over (max 30). Compared unrounded.
  const aiPoints = aiPct > limit ? Math.min(30, Math.max(1, Math.round(aiPct - limit))) : 0;
  const aiShown = formatPercent(aiPct, limit);
  lines.push({ code: "ai_share", vars: { pct: aiShown, limit }, reason: `AI share ${aiShown}% of ${limit}% limit`, points: aiPoints, fix: aiPoints > 0 ? "reduce_ai" : "none" });

  // Pasted text costs only while it has no attribution: 0.5 point per percent of the document (max 20).
  // Quoted text with a named source (or recognised from the copilot) is shown for information at 0 points.
  const unattributed = Math.min(thesis.provenance.paste, countUnattributedPaste(thesis.content));
  const attributed = Math.max(0, thesis.provenance.paste - unattributed);
  if (unattributed > 0) {
    const pct = (unattributed / words) * 100;
    const pastePoints = Math.min(20, Math.max(1, Math.round(pct * 0.5)));
    const shown = formatPercent(pct);
    lines.push({ code: "paste_unattributed", vars: { pct: shown, words: unattributed }, reason: `Pasted text without attribution (${shown}% of the document)`, points: pastePoints, fix: "attribute_paste" });
  }
  if (attributed > 0) {
    const shown = formatPercent((attributed / words) * 100);
    lines.push({ code: "paste_attributed", vars: { pct: shown, words: attributed }, reason: `Quoted or pasted text, attributed (${shown}% of the document)`, points: 0, fix: "none" });
  }

  // Open notices.
  for (const f of flags) {
    if (f.resolved) continue;
    const wordsMatch = f.description.match(/(\d[\d,]*)\s+words/);
    const label = NOTICE_LABELS[f.type] || f.type.replace(/_/g, " ");
    const vars: Record<string, string | number> = { type: f.type };
    if (wordsMatch) vars.words = Number(wordsMatch[1].replace(/,/g, ""));
    lines.push({ code: "open_notice", vars, reason: `Open notice · ${label}${wordsMatch ? ` (${wordsMatch[1]} words)` : ""}`, points: f.severity === "high" ? 8 : f.severity === "medium" ? 4 : 1, fix: "open_notice", noticeId: f.id });
  }

  const raw = 100 - lines.reduce((a, l) => a + l.points, 0);
  if (raw < 0) lines.push({ code: "floor", vars: {}, reason: "The score does not go below 0", points: raw, fix: "none" });
  const score = Math.max(0, Math.min(100, raw));
  return { score, starting: 100, lines };
}

/**
 * Integrity score = 100 minus penalties. It is transparent by design: every
 * deduction maps to something the student can see and fix (attribute a paste,
 * stay under the AI limit, resolve a notice). See `integrityBreakdown` for the rows.
 */
export function computeIntegrityScore(thesis: Thesis, policy: Policy, flags: IntegrityFlag[]): number {
  return integrityBreakdown(thesis, policy, flags).score;
}

export function policyFor(thesis: Thesis): Policy {
  const student = db.users.findById(thesis.studentId);
  return db.policies.get(student?.university || "Stanford University");
}

export function refreshThesisMetrics(thesisId: string) {
  const thesis = db.theses.findById(thesisId);
  if (!thesis) return null;
  const policy = policyFor(thesis);
  const flags = db.flags.listByThesis(thesisId);
  const words = Math.max(1, thesis.wordCount);
  thesis.aiUsagePercent = Math.round((thesis.provenance.ai / words) * 100);
  thesis.integrityScore = computeIntegrityScore(thesis, policy, flags);
  db.persist();
  return thesis;
}

/** The metrics the editor shows after any event that can move the score: pill and ledger read the same object. */
export function thesisMetrics(thesisId: string) {
  const thesis = refreshThesisMetrics(thesisId);
  if (!thesis) return null;
  return { integrityScore: thesis.integrityScore, aiUsagePercent: thesis.aiUsagePercent, integrityBreakdown: integrityBreakdown(thesis, policyFor(thesis), db.flags.listByThesis(thesisId)) };
}

/** A session that recorded nothing and lasted under this is an editor opened and closed again, not writing time. */
const EMPTY_SESSION_MAX_MS = 60 * 1000;

/** True when the session holds no student activity (only heartbeats) and barely lasted. */
export function isEmptySession(s: Pick<WritingSession, "events" | "keystrokes" | "startedAt" | "endedAt" | "lastHeartbeatAt">) {
  const ms = new Date(s.endedAt || s.lastHeartbeatAt).getTime() - new Date(s.startedAt).getTime();
  return s.events.length === 0 && s.keystrokes === 0 && ms < EMPTY_SESSION_MAX_MS;
}

const SENSITIVITY: Record<Policy["flagSensitivity"], { pasteWords: number }> = {
  low: { pasteWords: 400 },
  medium: { pasteWords: 200 },
  high: { pasteWords: 80 },
};

const DECLARED = ["own", "source", "ai"];

function notifyFlags(session: WritingSession, created: IntegrityFlag[]) {
  for (const f of created) {
    db.sessions.addEvent(session.id, "flag", { flagId: f.id, type: f.type, severity: f.severity });
    const thesis = db.theses.findById(session.thesisId);
    if (thesis) {
      db.notifications.create({ userId: thesis.studentId, title: "Integrity notice", message: f.description, type: "flag", link: `/dashboard/editor/${thesis.id}` });
      if (thesis.professorId) db.notifications.create({ userId: thesis.professorId, title: `Notice on "${thesis.title.slice(0, 40)}…"`, message: f.description, type: "flag", link: `/admin/theses/${thesis.id}` });
    }
  }
  if (created.length) refreshThesisMetrics(session.thesisId);
}

/**
 * Opens a `policy_limit` notice when the saved document's AI share is above the institution limit and no such
 * notice is open. Called after AI insertions and after each save, so the notice follows the real document.
 */
export function evaluatePolicyLimit(session: WritingSession, policy: Policy): IntegrityFlag[] {
  const thesis = db.theses.findById(session.thesisId);
  if (!thesis) return [];
  const aiPct = (thesis.provenance.ai / Math.max(1, thesis.wordCount)) * 100;
  if (!(aiPct > policy.maxAiUsagePercent)) return [];
  if (db.flags.listByThesis(thesis.id).some((f) => f.type === "policy_limit" && !f.resolved)) return [];
  const created = [
    db.flags.create({
      thesisId: session.thesisId,
      sessionId: session.id,
      type: "policy_limit",
      severity: "high",
      description: `AI-assisted content is ${formatPercent(aiPct, policy.maxAiUsagePercent)}% of the document, above the ${policy.maxAiUsagePercent}% institutional limit.`,
    }),
  ];
  notifyFlags(session, created);
  return created;
}

/**
 * Evaluates a session event and creates notices when a real, undeclared event crosses a threshold. Returns
 * created notices. Nothing here infers authorship: typing speed is recorded as a count and never judged.
 */
export function evaluateEvent(session: WritingSession, type: string, data: Record<string, unknown>, policy: Policy): IntegrityFlag[] {
  const created: IntegrityFlag[] = [];
  const th = SENSITIVITY[policy.flagSensitivity];

  if (type === "paste" && policy.monitoring.paste) {
    const words = Number(data.words || 0);
    const attribution = typeof data.attribution === "string" ? data.attribution : data.attributed ? "own" : "none";
    // Recognised from an assistant answer or a library source: attributed automatically, already marked.
    // Declared by the student (own writing, a source, an AI tool): attributed, no notice.
    // Pending: the dialog is open; judged when the declaration arrives.
    if (data.matchedAi || data.matchedSource || DECLARED.indexOf(attribution) !== -1 || attribution === "pending") return created;
    if (words > th.pasteWords) {
      created.push(
        db.flags.create({
          thesisId: session.thesisId,
          sessionId: session.id,
          type: "bulk_paste",
          severity: words > th.pasteWords * 2 ? "high" : "medium",
          description: `Large text block pasted (${words} words) without attribution.`,
        })
      );
    }
  }

  if (type === "ai_insert") created.push(...evaluatePolicyLimit(session, policy));

  notifyFlags(session, created.filter((f) => f.type !== "policy_limit"));
  return created;
}
