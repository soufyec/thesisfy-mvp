import { db, IntegrityFlag, Policy, Thesis, WritingSession } from "./db";

/**
 * Integrity score = 100 minus penalties. It is transparent by design: every
 * deduction maps to something the student can see and fix (attribute a paste,
 * stay under the AI limit, resolve a flag).
 */
export function computeIntegrityScore(thesis: Thesis, policy: Policy, flags: IntegrityFlag[]): number {
  let score = 100;
  const words = Math.max(1, thesis.wordCount);
  const aiPct = (thesis.provenance.ai / words) * 100;
  const pastePct = (thesis.provenance.paste / words) * 100;

  // AI usage beyond the institution limit costs 1 point per percent over.
  if (aiPct > policy.maxAiUsagePercent) score -= Math.min(30, Math.round(aiPct - policy.maxAiUsagePercent));
  // Unattributed pasted text costs 0.5 point per percent (max 20).
  score -= Math.min(20, Math.round(pastePct * 0.5));
  // Open flags.
  for (const f of flags) {
    if (f.resolved) continue;
    score -= f.severity === "high" ? 8 : f.severity === "medium" ? 4 : 1;
  }
  return Math.max(0, Math.min(100, score));
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
    const matched = data.matchedExternal as { provider?: string } | undefined;
    if (matched?.provider) {
      created.push(
        db.flags.create({
          thesisId: session.thesisId,
          sessionId: session.id,
          type: "unattributed_ai",
          severity: words > th.pasteWords ? "high" : "medium",
          description: `${words} words pasted that match text copied from ${matched.provider} (reported by the Thesisfic extension with consent). Attribute it as AI-assisted or rewrite in your own words.`,
        })
      );
    } else if (words > th.pasteWords && !data.attributed) {
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

  if (type === "external_ai_visit" && policy.monitoring.extension) {
    if (!policy.allowExternalAi) {
      created.push(
        db.flags.create({
          thesisId: session.thesisId,
          sessionId: session.id,
          type: "external_source",
          severity: "medium",
          description: `Visited ${data.host} during an active writing session. External AI tools are not permitted by ${policy.university}'s policy.`,
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
