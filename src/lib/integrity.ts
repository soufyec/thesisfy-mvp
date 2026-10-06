import { db, IntegrityFlag, Policy, Thesis, WritingSession } from "./db";

export type IntegrityFix = "attribute_paste" | "reduce_ai" | "open_notice" | "none";

export interface IntegrityLine {
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
  bulk_paste: "bulk paste",
  unattributed_ai: "AI text pasted without attribution",
  policy_limit: "AI share above the limit",
  rapid_typing: "typing burst",
  ai_generation: "AI generation request",
  style_inconsistency: "style change",
};

function noticeReason(f: IntegrityFlag) {
  const words = f.description.match(/(\d[\d,]*)\s+words/);
  return `Open notice · ${NOTICE_LABELS[f.type] || f.type.replace(/_/g, " ")}${words ? ` (${words[1]} words)` : ""}`;
}

/**
 * Integrity ledger: the score is 100 minus a list of visible deductions. Every row maps to something the
 * student can see and fix (attribute a paste, stay under the AI limit, answer a notice). Rows are listed
 * even when they cost 0 points, and `100 - sum(points) === score` always holds.
 */
export function integrityBreakdown(thesis: Thesis, policy: Policy, flags: IntegrityFlag[]): IntegrityBreakdown {
  const words = Math.max(1, thesis.wordCount);
  const aiPct = (thesis.provenance.ai / words) * 100;
  const pastePct = (thesis.provenance.paste / words) * 100;
  const lines: IntegrityLine[] = [];

  // AI usage beyond the institution limit costs 1 point per percent over (max 30).
  const aiPoints = aiPct > policy.maxAiUsagePercent ? Math.min(30, Math.round(aiPct - policy.maxAiUsagePercent)) : 0;
  lines.push({ reason: `AI share ${Math.round(aiPct)}% of ${policy.maxAiUsagePercent}% limit`, points: aiPoints, fix: aiPoints > 0 ? "reduce_ai" : "none" });

  // Pasted text costs 0.5 point per percent of the document (max 20).
  const pastePoints = Math.min(20, Math.round(pastePct * 0.5));
  lines.push({ reason: `Pasted text attributed (${Math.round(pastePct)}% of the document)`, points: pastePoints, fix: pastePoints > 0 ? "attribute_paste" : "none" });

  // Open notices.
  for (const f of flags) {
    if (f.resolved) continue;
    lines.push({ reason: noticeReason(f), points: f.severity === "high" ? 8 : f.severity === "medium" ? 4 : 1, fix: "open_notice", noticeId: f.id });
  }

  const raw = 100 - lines.reduce((a, l) => a + l.points, 0);
  if (raw < 0) lines.push({ reason: "The score does not go below 0", points: raw, fix: "none" });
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

export function refreshThesisMetrics(thesisId: string) {
  const thesis = db.theses.findById(thesisId);
  if (!thesis) return null;
  const student = db.users.findById(thesis.studentId);
  const policy = db.policies.get(student?.university || "Stanford University");
  const flags = db.flags.listByThesis(thesisId);
  const words = Math.max(1, thesis.wordCount);
  thesis.aiUsagePercent = Math.round((thesis.provenance.ai / words) * 100);
  thesis.integrityScore = computeIntegrityScore(thesis, policy, flags);
  db.persist();
  return thesis;
}

const SENSITIVITY: Record<Policy["flagSensitivity"], { pasteWords: number; burstWpm: number }> = {
  low: { pasteWords: 400, burstWpm: 220 },
  medium: { pasteWords: 200, burstWpm: 180 },
  high: { pasteWords: 80, burstWpm: 140 },
};

/** Evaluates a session event and creates flags when thresholds are crossed. Returns created flags. */
export function evaluateEvent(session: WritingSession, type: string, data: Record<string, unknown>, policy: Policy): IntegrityFlag[] {
  const created: IntegrityFlag[] = [];
  const th = SENSITIVITY[policy.flagSensitivity];

  if (type === "paste" && policy.monitoring.paste) {
    const words = Number(data.words || 0);
    // Text recognised from an assistant answer is attributed automatically: no notice, it is already marked.
    if (data.matchedAi) return created;
    if (words > th.pasteWords && !data.attributed) {
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

  if (type === "typing" && policy.monitoring.keystrokes) {
    const wpm = Number(data.wpm || 0);
    if (wpm > th.burstWpm && Number(data.words || 0) > 60) {
      created.push(
        db.flags.create({
          thesisId: session.thesisId,
          sessionId: session.id,
          type: "rapid_typing",
          severity: "low",
          description: `Typing burst of ${Math.round(wpm)} words/min sustained over ${data.words} words, unusual for original composition.`,
        })
      );
    }
  }

  if (type === "ai_insert") {
    const thesis = db.theses.findById(session.thesisId);
    if (thesis) {
      const aiPct = (thesis.provenance.ai / Math.max(1, thesis.wordCount)) * 100;
      if (aiPct > policy.maxAiUsagePercent && !db.flags.listByThesis(thesis.id).some((f) => f.type === "policy_limit" && !f.resolved)) {
        created.push(
          db.flags.create({
            thesisId: session.thesisId,
            sessionId: session.id,
            type: "policy_limit",
            severity: "high",
            description: `AI-assisted content is ${Math.round(aiPct)}% of the document, above the ${policy.maxAiUsagePercent}% institutional limit.`,
          })
        );
      }
    }
  }

  for (const f of created) {
    db.sessions.addEvent(session.id, "flag", { flagId: f.id, type: f.type, severity: f.severity });
    const thesis = db.theses.findById(session.thesisId);
    if (thesis) {
      db.notifications.create({ userId: thesis.studentId, title: "Integrity notice", message: f.description, type: "flag", link: `/dashboard/editor/${thesis.id}` });
      if (thesis.professorId) db.notifications.create({ userId: thesis.professorId, title: `Flag on "${thesis.title.slice(0, 40)}…"`, message: f.description, type: "flag", link: `/admin/theses/${thesis.id}` });
    }
  }
  if (created.length) refreshThesisMetrics(session.thesisId);
  return created;
}
