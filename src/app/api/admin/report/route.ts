import { NextRequest } from "next/server";
import { db, IntegrityFlag, Thesis } from "@/lib/db";
import { error, json, requireStaff } from "@/lib/api";

/**
 * Pilot report: aggregated, attributed counts for a period, built from the same records the student sees in
 * the editor (sessions, interactions, notices, consents, declarations, snapshots). Nothing here is inferred;
 * every number is a count over stored events. Administrators see their university, advisors only their theses.
 */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(v: string | null, fallback: Date): Date {
  if (!v || !DAY_RE.test(v)) return fallback;
  const d = new Date(v + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? fallback : d;
}

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Monday 00:00 UTC of the week containing `d`. */
function weekStart(d: Date) {
  const w = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (w.getUTCDay() + 6) % 7;
  w.setUTCDate(w.getUTCDate() - dow);
  return w;
}

function minutesOf(s: { startedAt: string; endedAt?: string; lastHeartbeatAt: string }) {
  const ms = new Date(s.endedAt || s.lastHeartbeatAt).getTime() - new Date(s.startedAt).getTime();
  return ms > 0 ? Math.round(ms / 60000) : 0;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const v = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : Math.round(((v[mid - 1] + v[mid]) / 2) * 10) / 10;
}

function bump(map: Record<string, number>, key: string, by = 1) {
  map[key] = (map[key] || 0) + by;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function GET(request: NextRequest) {
  const r = await requireStaff(request);
  if ("response" in r) return r.response;
  const user = r.user;

  const today = new Date();
  const defaultFrom = new Date(today.getTime() - 89 * 86400000);
  const from = parseDay(request.nextUrl.searchParams.get("from"), defaultFrom);
  const to = parseDay(request.nextUrl.searchParams.get("to"), today);
  if (from.getTime() > to.getTime()) return error("The period start must be before its end", 400);
  if (to.getTime() - from.getTime() > 3 * 366 * 86400000) return error("The period cannot exceed three years", 400);
  const fromIso = dayKey(from) + "T00:00:00.000Z";
  const toIso = dayKey(to) + "T23:59:59.999Z";
  const inRange = (iso?: string) => !!iso && iso >= fromIso && iso <= toIso;

  // ---- scope ----
  const scope: "institution" | "advisor" = user.role === "admin" ? "institution" : "advisor";
  const theses: Thesis[] = scope === "institution" ? db.theses.getByUniversity(user.university) : db.theses.getByProfessor(user.id);
  const thesisIds = new Set(theses.map((t) => t.id));
  const universityUsers = db.users.getByUniversity(user.university);
  const studentIds = new Set(theses.map((t) => t.studentId));
  const users = scope === "institution" ? universityUsers : universityUsers.filter((u) => studentIds.has(u.id) || u.id === user.id);
  const students = users.filter((u) => u.role === "student");
  const policy = db.policies.get(user.university);
  const funding = db.aiAccess.funding(user.university);
  const toLocal = (usd: number) => round2(usd * funding.usdRate);

  const allSessions = theses.flatMap((t) => t.sessions);
  const sessions = allSessions.filter((s) => inRange(s.startedAt));
  const allInteractions = (scope === "institution" ? db.interactions.listByUniversity(user.university) : db.interactions.listByUniversity(user.university).filter((i) => (i.thesisId && thesisIds.has(i.thesisId)) || studentIds.has(i.userId)));
  const interactions = allInteractions.filter((i) => inRange(i.timestamp));
  const allFlags: IntegrityFlag[] = theses.flatMap((t) => db.flags.listByThesis(t.id));
  const flags = allFlags.filter((f) => inRange(f.timestamp));

  // ---- adoption ----
  const usersByRole: Record<string, number> = { student: 0, professor: 0, admin: 0 };
  for (const u of users) bump(usersByRole, u.role);
  const activeStudentIds = new Set(sessions.map((s) => s.userId));
  const activeThesisIds = new Set(sessions.map((s) => s.thesisId));
  const devices: Record<string, number> = {};
  for (const s of sessions) bump(devices, s.device || "desktop");
  const adoption = {
    usersByRole,
    students: students.length,
    activeStudents: students.filter((u) => activeStudentIds.has(u.id)).length,
    newStudents: students.filter((u) => inRange(u.createdAt)).length,
    theses: {
      total: theses.length,
      active: theses.filter((t) => activeThesisIds.has(t.id)).length,
      created: theses.filter((t) => inRange(t.createdAt)).length,
      submitted: theses.filter((t) => t.status === "submitted" || t.status === "approved").length,
      underReview: theses.filter((t) => t.status === "under_review" || t.status === "revision_requested").length,
      byStatus: theses.reduce((acc, t) => (bump(acc, t.status), acc), {} as Record<string, number>),
    },
    sessions: sessions.length,
    minutes: sessions.reduce((a, s) => a + minutesOf(s), 0),
    devices,
  };

  // ---- writing ----
  const prov = theses.reduce((acc, t) => ({ human: acc.human + t.provenance.human, ai: acc.ai + t.provenance.ai, paste: acc.paste + t.provenance.paste }), { human: 0, ai: 0, paste: 0 });
  const provTotal = Math.max(1, prov.human + prov.ai + prov.paste);
  const aiPercents = theses.map((t) => t.aiUsagePercent);
  const histogram = [0, 10, 20, 30].map((lo, idx, arr) => {
    const hi = arr[idx + 1];
    return { range: hi === undefined ? `${lo}+` : `${lo}-${hi}`, lo, hi: hi ?? null, count: theses.filter((t) => t.aiUsagePercent >= lo && (hi === undefined || t.aiUsagePercent < hi)).length };
  });
  const writing = {
    wordsWritten: sessions.reduce((a, s) => a + s.wordsWritten, 0),
    documentWords: theses.reduce((a, t) => a + t.wordCount, 0),
    provenance: {
      human: { words: prov.human, percent: Math.round((prov.human / provTotal) * 100) },
      ai: { words: prov.ai, percent: Math.round((prov.ai / provTotal) * 100) },
      paste: { words: prov.paste, percent: Math.round((prov.paste / provTotal) * 100) },
    },
    aiPercent: { mean: aiPercents.length ? Math.round((aiPercents.reduce((a, b) => a + b, 0) / aiPercents.length) * 10) / 10 : 0, median: median(aiPercents) },
    histogram,
    aboveLimit: theses.filter((t) => t.aiUsagePercent > policy.maxAiUsagePercent).length,
    limit: policy.maxAiUsagePercent,
    avgIntegrity: theses.length ? Math.round(theses.reduce((a, t) => a + t.integrityScore, 0) / theses.length) : 0,
  };

  // ---- ai ----
  const byMode: Record<string, number> = {};
  const byProvider: Record<string, number> = {};
  const byFunding: Record<"institution" | "student" | "platform", { requests: number; cost: number }> = { institution: { requests: 0, cost: 0 }, student: { requests: 0, cost: 0 }, platform: { requests: 0, cost: 0 } };
  const modelMap: Record<string, { id: string; label: string; backend: string; requests: number; cost: number; students: Set<string> }> = {};
  const copilotStudents = new Set<string>();
  let blocked = 0;
  for (const i of interactions) {
    bump(byMode, i.mode);
    bump(byProvider, i.provider);
    if (i.blockedByPolicy) blocked++;
    if (i.mode === "copilot") copilotStudents.add(i.userId);
    const bucket = i.billedTo === "institution" ? "institution" : i.billedTo === "student" ? "student" : "platform";
    byFunding[bucket].requests++;
    byFunding[bucket].cost += i.costUsd || 0;
    if (i.institutionModelId) {
      const m = db.aiAccess.findModel(i.institutionModelId);
      const key = i.institutionModelId;
      if (!modelMap[key]) modelMap[key] = { id: key, label: m?.label || i.model, backend: m?.backend || "", requests: 0, cost: 0, students: new Set<string>() };
      modelMap[key].requests++;
      modelMap[key].cost += i.costUsd || 0;
      modelMap[key].students.add(i.userId);
    }
  }
  const insertEvents = sessions.flatMap((s) => s.events.filter((e) => e.type === "ai_insert" && inRange(e.timestamp)));
  const ai = {
    interactions: interactions.length,
    studentsUsingAi: new Set(interactions.map((i) => i.userId)).size,
    byMode,
    byProvider,
    insertions: insertEvents.length,
    insertedWords: insertEvents.reduce((a, e) => a + (Number(e.data.words) || 0), 0),
    currency: funding.currency,
    institutionPays: funding.institutionPays,
    cost: toLocal(byFunding.institution.cost),
    byFunding: {
      institution: { requests: byFunding.institution.requests, cost: toLocal(byFunding.institution.cost) },
      student: { requests: byFunding.student.requests, cost: toLocal(byFunding.student.cost) },
      platform: { requests: byFunding.platform.requests, cost: toLocal(byFunding.platform.cost) },
    },
    byModel: Object.keys(modelMap)
      .map((k) => ({ id: modelMap[k].id, label: modelMap[k].label, backend: modelMap[k].backend, requests: modelMap[k].requests, cost: toLocal(modelMap[k].cost), students: modelMap[k].students.size }))
      .sort((a, b) => b.requests - a.requests),
    blockedByPolicy: blocked,
    copilotEnabled: policy.researchCopilot,
    copilotStudents: copilotStudents.size,
    copilotInteractions: byMode.copilot || 0,
  };

  // ---- notices ----
  const byType: Record<string, { open: number; resolved: number }> = {};
  const bySeverity: Record<string, { open: number; resolved: number }> = { low: { open: 0, resolved: 0 }, medium: { open: 0, resolved: 0 }, high: { open: 0, resolved: 0 } };
  const resolutionHours: number[] = [];
  for (const f of flags) {
    if (!byType[f.type]) byType[f.type] = { open: 0, resolved: 0 };
    byType[f.type][f.resolved ? "resolved" : "open"]++;
    bySeverity[f.severity][f.resolved ? "resolved" : "open"]++;
    if (f.resolved && f.resolvedAt) resolutionHours.push(Math.max(0, (new Date(f.resolvedAt).getTime() - new Date(f.timestamp).getTime()) / 3600000));
  }
  const pasteEvents = sessions.flatMap((s) => s.events.filter((e) => e.type === "paste" && inRange(e.timestamp)));
  const pasteBucket = (e: { data: Record<string, unknown> }) => (e.data.matchedAi ? "assistant" : e.data.matchedSource ? "source" : e.data.attributed ? "declared" : "unattributed");
  const pastes = { assistant: { count: 0, words: 0 }, source: { count: 0, words: 0 }, declared: { count: 0, words: 0 }, unattributed: { count: 0, words: 0 } };
  for (const e of pasteEvents) {
    const b = pastes[pasteBucket(e)];
    b.count++;
    b.words += Number(e.data.words) || 0;
  }
  const notices = {
    total: flags.length,
    open: flags.filter((f) => !f.resolved).length,
    resolved: flags.filter((f) => f.resolved).length,
    byType,
    bySeverity,
    /** Hours from notice to resolution, over notices that record a resolution time. Null when none do. */
    meanResolutionHours: resolutionHours.length ? Math.round((resolutionHours.reduce((a, b) => a + b, 0) / resolutionHours.length) * 10) / 10 : null,
    resolutionSample: resolutionHours.length,
    thesesWithOpenNotices: new Set(flags.filter((f) => !f.resolved).map((f) => f.thesisId)).size,
    pastes,
  };

  // ---- consent ----
  const scopeCounts: Record<string, number> = { keystrokes: 0, paste: 0, aiInteractions: 0, tabActivity: 0 };
  let withConsent = 0;
  let revocations = 0;
  let grants = 0;
  for (const s of students) {
    const all = db.consents.list(s.id);
    const active = all.find((c) => !c.revokedAt);
    if (active) {
      withConsent++;
      (Object.keys(scopeCounts) as (keyof typeof active.scopes)[]).forEach((k) => active.scopes[k] && bump(scopeCounts, k));
    }
    revocations += all.filter((c) => inRange(c.revokedAt)).length;
    grants += all.filter((c) => inRange(c.grantedAt)).length;
  }
  const consent = {
    required: policy.requireConsent,
    students: students.length,
    withConsent,
    withoutConsent: students.length - withConsent,
    byScope: scopeCounts,
    grants,
    revocations,
    sessionsWithConsent: sessions.filter((s) => !!s.consentId).length,
  };

  // ---- process ----
  let declarations = 0;
  let declarationsSigned = 0;
  let snapshots = 0;
  let reviewRuns = 0;
  let reviewComments = 0;
  let evidenceChecks = 0;
  let citationsVerified = 0;
  for (const t of theses) {
    const decls = db.declarations.list(t.id).filter((d) => inRange(d.createdAt));
    declarations += decls.length;
    declarationsSigned += decls.filter((d) => !!d.signedAt).length;
    snapshots += db.snapshots.list(t.id).filter((s) => inRange(s.createdAt)).length;
    const runs = db.reviewRuns.list(t.id).filter((x) => inRange(x.createdAt));
    reviewRuns += runs.length;
    reviewComments += runs.reduce((a, x) => a + x.commentCount, 0);
    evidenceChecks += db.evidenceChecks.list(t.id).filter((e) => inRange(e.createdAt)).length;
    citationsVerified += t.references.filter((ref) => ref.verification && inRange(ref.verification.checkedAt)).length;
  }
  // Language reviews with the AI style layer are logged as "grammar" interactions with a fixed prompt prefix (see /api/language/check).
  const languageReviews = interactions.filter((i) => i.mode === "grammar" && i.promptPreview.indexOf("Language review:") === 0).length;
  const process = { declarations, declarationsSigned, snapshots, reviewRuns, reviewComments, languageReviews, evidenceChecks, citationsVerified, thesesWithDeclaration: theses.filter((t) => db.declarations.list(t.id).length > 0).length };

  // ---- weekly ----
  const weekly: { week: string; words: number; sessions: number; interactions: number; notices: number }[] = [];
  const firstWeek = weekStart(from);
  const lastWeek = weekStart(to);
  for (let w = new Date(firstWeek); w.getTime() <= lastWeek.getTime(); w.setUTCDate(w.getUTCDate() + 7)) {
    const startIso = w.toISOString();
    const end = new Date(w);
    end.setUTCDate(end.getUTCDate() + 7);
    const endIso = end.toISOString();
    const within = (iso: string) => iso >= startIso && iso < endIso;
    const ws = sessions.filter((s) => within(s.startedAt));
    weekly.push({ week: dayKey(w), words: ws.reduce((a, s) => a + s.wordsWritten, 0), sessions: ws.length, interactions: interactions.filter((i) => within(i.timestamp)).length, notices: flags.filter((f) => within(f.timestamp)).length });
    if (weekly.length > 160) break;
  }

  return json({
    report: {
      meta: { university: user.university, scope, from: dayKey(from), to: dayKey(to), generatedAt: new Date().toISOString(), generatedBy: user.name, currency: funding.currency, aiLimit: policy.maxAiUsagePercent, theses: theses.length },
      adoption,
      writing,
      ai,
      notices,
      consent,
      process,
      weekly,
    },
  });
}
