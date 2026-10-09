import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, requireUser } from "@/lib/api";

export async function GET(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const user = r.user;
  const theses = user.role === "student" ? db.theses.getByStudent(user.id) : user.role === "professor" ? db.theses.getByProfessor(user.id) : db.theses.getByUniversity(user.university);
  // A student sees only their own figures: the institution's people counts are staff information.
  const users = user.role === "student" ? [user] : db.users.getByUniversity(user.university);
  const flags = theses.flatMap((t) => db.flags.listByThesis(t.id));
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const sessions = theses.flatMap((t) => t.sessions);
  const interactions = user.role === "student" ? db.interactions.listByUser(user.id) : db.interactions.listByUniversity(user.university);

  const byMode: Record<string, number> = {};
  const byProvider: Record<string, number> = {};
  for (const i of interactions) {
    byMode[i.mode] = (byMode[i.mode] || 0) + 1;
    byProvider[i.provider] = (byProvider[i.provider] || 0) + 1;
  }
  const distribution = [0, 10, 20, 30].map((lo, idx, arr) => {
    const hi = arr[idx + 1] ?? 101;
    return { range: hi > 100 ? `${lo}%+` : `${lo}-${hi}%`, count: theses.filter((t) => t.aiUsagePercent >= lo && t.aiUsagePercent < hi).length };
  });

  // words per day for the last 7 days from session data
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    const daySessions = sessions.filter((s) => s.startedAt.slice(0, 10) === key);
    return { day: d.toLocaleDateString("en-US", { weekday: "short" }), date: key, words: daySessions.reduce((a, s) => a + s.wordsWritten, 0), ai: daySessions.reduce((a, s) => a + s.aiAssists, 0), minutes: daySessions.reduce((a, s) => a + Math.round((new Date(s.endedAt || s.lastHeartbeatAt).getTime() - new Date(s.startedAt).getTime()) / 60000), 0) };
  });

  return json({
    stats: {
      ...db.theses.getStats(theses),
      totalStudents: users.filter((u) => u.role === "student").length,
      totalProfessors: users.filter((u) => u.role === "professor").length,
      totalUsers: users.length,
      activeSessions: db.sessions.active().filter((s) => theses.some((t) => t.id === s.thesisId)).length,
      totalSessions: sessions.length,
      flagsThisWeek: flags.filter((f) => new Date(f.timestamp).getTime() > weekAgo).length,
      openFlags: flags.filter((f) => !f.resolved).length,
      totalWords: theses.reduce((a, t) => a + t.wordCount, 0),
      provenance: theses.reduce((acc, t) => ({ human: acc.human + t.provenance.human, paste: acc.paste + t.provenance.paste, ai: acc.ai + t.provenance.ai }), { human: 0, paste: 0, ai: 0 }),
      aiInteractions: interactions.length,
      aiByMode: byMode,
      aiByProvider: byProvider,
      distribution,
      weekly: days,
      connectedProviders: user.role === "student" ? db.connections.listByUser(user.id).map((c) => c.provider) : undefined,
    },
  });
}
