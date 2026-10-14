"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Bot, ClipboardList, FileBarChart, Flag, Plus, ShieldCheck, Users } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { KindChip, KindTile, Toast } from "@/components/ui";
import { useUser } from "@/components/useUser";
import { AssignmentDue } from "@/components/assignments/AssignmentCard";
import { AssignmentStatusBar } from "@/components/assignments/AssignmentStatusBar";
import { NewAssignmentModal } from "@/components/assignments/NewAssignmentModal";
import { byNearestDue, handedIn, rosterTotal, type StaffAssignment } from "@/components/assignments/types";
import { api, statusColors } from "@/lib/client";
import type { PaperKind } from "@/lib/papers/kinds";
import { useT, useFormat } from "@/lib/i18n/client";
import { modeLabel, plural, statusLabel, timeAgoLabel } from "@/lib/i18n/messages/admin";

interface Stats {
  total: number; inProgress: number; underReview: number; approved: number; avgIntegrity: number; avgAiUsage: number; totalStudents: number; totalProfessors: number; activeSessions: number; totalSessions: number; flagsThisWeek: number; openFlags: number; totalWords: number;
  provenance: { human: number; paste: number; ai: number }; aiInteractions: number; aiByMode: Record<string, number>; aiByProvider: Record<string, number>; distribution: { range: string; count: number }[];
}
interface Thesis { id: string; title: string; status: string; wordCount: number; aiUsagePercent: number; integrityScore: number; studentName: string; professorName: string; updatedAt: string; openFlags: number; kind?: PaperKind }
interface Interaction { id: string; userName?: string; thesisTitle?: string; provider: string; model: string; mode: string; source: string; blockedByPolicy: boolean; timestamp: string; promptPreview: string }

export default function AdminDashboard() {
  const { user, policy } = useUser();
  const t = useT();
  const fmt = useFormat();
  const ago = (iso: string) => timeAgoLabel(t, fmt.date, iso);
  const [stats, setStats] = useState<Stats | null>(null);
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [logs, setLogs] = useState<Interaction[]>([]);
  const [assignments, setAssignments] = useState<StaffAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api<{ stats: Stats }>("/api/stats"), api<{ theses: Thesis[] }>("/api/theses"), api<{ interactions: Interaction[] }>("/api/ai/logs")])
      .then(([s, th, l]) => { setStats(s.stats); setTheses(th.theses); setLogs(l.interactions.slice(0, 8)); })
      .catch(() => {})
      .finally(() => setLoading(false));
    api<{ assignments: StaffAssignment[] }>("/api/assignments").then((d) => setAssignments(d.assignments)).catch(() => {});
  }, []);

  // The three open assignments with the nearest due dates (docs/papers.md §4.3).
  const upcoming = assignments.filter((a) => a.status === "open").sort(byNearestDue).slice(0, 3);

  const total = stats ? Math.max(1, stats.provenance.human + stats.provenance.paste + stats.provenance.ai) : 1;
  const maxDist = Math.max(1, ...(stats?.distribution || []).map((d) => d.count));

  return (
    <DashboardLayout>
      <div className="max-w-6xl">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div><h1 className="text-2xl font-bold">{user?.role === "professor" ? t("admin.dashboard.titleAdvisor") : t("admin.dashboard.titleInstitution")}</h1><p className="text-gray-500 mt-1 text-sm">{t("admin.dashboard.subtitle", { university: user?.university || "", n: stats?.total ?? "…" })}</p></div>
          <div className="flex flex-wrap gap-2 self-start">
            <Link href="/admin/report" className="btn-outline !py-2 !px-3 text-sm gap-1.5" title={t("report.overview.linkHelp")}><FileBarChart className="w-4 h-4" aria-hidden="true" />{t("report.overview.link")}</Link>
            <button type="button" onClick={() => setCreating(true)} className="btn-primary !py-2 !px-4 text-sm"><Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />{t("assignments.new.button")}</button>
          </div>
        </div>
        {loading ? <div className="p-12 text-center text-gray-400">{t("common.loading")}…</div> : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
              {[
                { label: t("admin.dashboard.theses"), value: stats?.total, sub: t("admin.dashboard.thesesSub", { active: stats?.inProgress, review: stats?.underReview }), icon: <ShieldCheck className="w-5 h-5 text-brand-600" />, bg: "bg-brand-50" },
                { label: t("admin.dashboard.avgIntegrity"), value: `${stats?.avgIntegrity}%`, sub: t("admin.dashboard.avgIntegritySub", { avg: stats?.avgAiUsage, limit: policy?.maxAiUsagePercent }), icon: <Activity className="w-5 h-5 text-green-600" />, bg: "bg-green-50" },
                { label: t("admin.dashboard.students"), value: stats?.totalStudents, sub: t("admin.dashboard.studentsSub", { n: stats?.activeSessions }), icon: <Users className="w-5 h-5 text-blue-600" />, bg: "bg-blue-50" },
                { label: t("admin.dashboard.openNotices"), value: stats?.openFlags, sub: t("admin.dashboard.openNoticesSub", { n: stats?.flagsThisWeek }), icon: <Flag className="w-5 h-5 text-amber-600" />, bg: "bg-amber-50" },
              ].map((c) => (
                <div key={c.label} className="card p-4 sm:p-5"><div className="flex items-center justify-between"><div><div className="text-xs sm:text-sm text-gray-500 mb-1">{c.label}</div><div className="text-xl sm:text-2xl font-bold">{c.value ?? 0}</div></div><div className={`w-10 h-10 ${c.bg} rounded-xl flex items-center justify-center`}>{c.icon}</div></div><div className="mt-2 text-xs text-gray-500">{c.sub}</div></div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <div className="card p-5 lg:col-span-2 min-w-0">
                <div className="flex items-center justify-between gap-3 mb-4"><h2 className="font-semibold">{t("admin.dashboard.overview")}</h2><Link href="/admin/theses" className="text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline">{t("admin.dashboard.allTheses")}</Link></div>
                <div className="space-y-2">
                  {theses.slice(0, 6).map((th) => (
                    <Link key={th.id} href={`/admin/theses/${th.id}`} className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                      <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{th.title}</div><div className="flex items-center gap-2 mt-1 flex-wrap">{th.kind && <KindChip kind={th.kind} />}<span className="text-xs text-gray-500">{th.studentName}</span><span className={`${statusColors[th.status]} !text-[10px]`}>{statusLabel(t, th.status)}</span>{th.openFlags > 0 && <span className="badge-warning !text-[10px]">{plural(t, "admin.notices", th.openFlags)}</span>}<span className="text-[11px] text-gray-500">{ago(th.updatedAt)}</span></div></div>
                      <div className="flex items-center gap-4 flex-shrink-0"><div className="text-right"><div className={`text-sm font-bold ${th.integrityScore >= 90 ? "text-green-700" : th.integrityScore >= 70 ? "text-amber-700" : "text-red-700"}`}>{th.integrityScore}%</div><div className="text-xs text-gray-500">{t("glossary.integrity")}</div></div><div className="text-right"><div className="text-sm font-medium text-prov-ai">{th.aiUsagePercent}%</div><div className="text-xs text-gray-500">{t("admin.ai")}</div></div></div>
                    </Link>
                  ))}
                </div>
              </div>

              <section className="card p-5 min-w-0 flex flex-col" aria-labelledby="overview-assignments">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h2 id="overview-assignments" className="font-semibold">{t("assignments.page.title")}</h2>
                  <Link href="/admin/assignments" className="text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline">{t("assignments.overview.viewAll")}</Link>
                </div>
                {upcoming.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700" aria-hidden="true"><ClipboardList className="h-5 w-5" /></span>
                    <p className="mt-3 text-sm font-medium text-gray-900">{t("assignments.overview.empty")}</p>
                    <p className="mt-1 text-xs text-gray-500">{t("assignments.overview.emptyHelp")}</p>
                    <button type="button" onClick={() => setCreating(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-brand-300 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><Plus className="h-3.5 w-3.5" aria-hidden="true" />{t("assignments.new.button")}</button>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {upcoming.map((a) => {
                      const n = rosterTotal(a.counts);
                      return (
                        <li key={a.id}>
                          <Link href={`/admin/assignments/${a.id}`} className="block rounded-xl bg-gray-50 p-3 hover:bg-gray-100 transition-colors">
                            <div className="flex items-start gap-2.5">
                              <KindTile kind={a.kind} size="sm" className="mt-0.5" />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-gray-900">{a.title}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <AssignmentDue deadline={a.deadline} withDate={false} />
                                  <span className="text-xs font-medium text-gray-700">{t("assignments.card.submitted", { n: fmt.number(handedIn(a.counts)), total: fmt.number(n) })}</span>
                                </div>
                              </div>
                            </div>
                            <AssignmentStatusBar counts={a.counts} legend={false} className="mt-2.5" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="card p-5 lg:col-span-2 min-w-0">
                <div className="flex items-center gap-2 mb-4"><Bot className="w-4 h-4 text-gray-500" /><h2 className="font-semibold">{t("admin.dashboard.recentAi")}</h2></div>
                <div className="divide-y divide-gray-50">
                  {logs.length === 0 && <div className="text-sm text-gray-500 py-4">{t("admin.dashboard.noAi")}</div>}
                  {logs.map((i) => (
                    <div key={i.id} className="py-2.5 text-sm flex items-start gap-3"><span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${i.blockedByPolicy ? "bg-red-500" : i.mode === "copilot" ? "bg-emerald-500" : "bg-brand-500"}`} /><div className="min-w-0"><div className="flex items-center gap-2 flex-wrap"><span className="font-medium">{i.userName}</span><span className="text-xs text-gray-500 capitalize">{modeLabel(t, i.mode)} · {i.provider}</span>{i.mode === "copilot" && <span className="badge bg-emerald-50 text-emerald-700 !text-[10px]">{t("admin.dashboard.copilotBadge")}</span>}{i.blockedByPolicy && <span className="badge-danger !text-[10px]">{t("admin.dashboard.blocked")}</span>}</div><div className="text-gray-500 truncate text-xs">{i.promptPreview}</div><div className="text-[11px] text-gray-500">{i.thesisTitle} · {ago(i.timestamp)}</div></div></div>
                  ))}
                </div>
              </div>
              <div className="space-y-6 min-w-0">
                <div className="card p-5">
                  <h2 className="font-semibold mb-4">{t("admin.dashboard.distribution")}</h2>
                  <div className="space-y-3">
                    {(stats?.distribution || []).map((d, i) => (
                      <div key={d.range}><div className="flex justify-between text-sm mb-1"><span className="text-gray-600">{d.range}</span><span className="text-gray-500">{plural(t, "admin.dashboard.distCount", d.count)}</span></div><div className="w-full bg-gray-100 rounded-full h-2"><div className={`${["bg-green-500", "bg-blue-500", "bg-amber-500", "bg-red-500"][i]} h-2 rounded-full`} style={{ width: `${(d.count / maxDist) * 100}%` }} /></div></div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="text-xs text-gray-500 mb-1">{t("admin.dashboard.provenanceAll")}</div>
                    <div className="flex h-2.5 gap-0.5 rounded-full overflow-hidden bg-gray-100"><div className="bg-prov-human" style={{ width: `${((stats?.provenance.human || 0) / total) * 100}%` }} /><div className="bg-prov-paste" style={{ width: `${((stats?.provenance.paste || 0) / total) * 100}%` }} /><div className="bg-prov-ai" style={{ width: `${((stats?.provenance.ai || 0) / total) * 100}%` }} /></div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600 mt-1.5"><span className="inline-flex items-center gap-1"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-prov-human" />{t("glossary.written")}</span><span className="inline-flex items-center gap-1"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-prov-paste" />{t("glossary.quotedOrPasted")}</span><span className="inline-flex items-center gap-1"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-prov-ai" />{t("glossary.aiAssisted")}</span></div>
                  </div>
                </div>
                <div className="card p-5">
                  <div className="flex items-center justify-between mb-4"><h2 className="font-semibold">{t("admin.dashboard.policyTitle")}</h2><Link href="/admin/policies" className="text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline">{t("common.edit")}</Link></div>
                  {policy && (
                    <div className="space-y-3 text-sm">
                      <div className="p-3 bg-green-50 rounded-xl"><div className="text-xs text-green-800">{t("admin.dashboard.maxAi")}</div><div className="text-xl font-bold text-green-700">{policy.maxAiUsagePercent}%</div></div>
                      <div className="p-3 bg-blue-50 rounded-xl"><div className="text-xs text-blue-800">{t("admin.dashboard.providers")}</div><div className="font-medium text-blue-700 capitalize">{policy.allowedProviders.join(", ")}</div><div className="text-xs text-blue-700 mt-0.5">{policy.allowBYOK ? t("admin.dashboard.byokOn") : t("admin.dashboard.byokOff")}</div></div>
                      <div className="p-3 bg-emerald-50 rounded-xl"><div className="text-xs text-emerald-800">{t("glossary.copilot")}</div><div className="font-medium text-emerald-700">{policy.researchCopilot ? t("admin.dashboard.copilotOn") : t("admin.dashboard.copilotOff")}</div><div className="text-xs text-emerald-700 mt-0.5">{t("admin.dashboard.sensitivity", { level: t(`admin.level.${policy.flagSensitivity}`) })}</div></div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      <NewAssignmentModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(a) => {
          setAssignments((list) => [a, ...list]);
          const n = rosterTotal(a.counts);
          setToast(n === 1 ? t("assignments.new.sent_one") : t("assignments.new.sent", { n: fmt.number(n) }));
        }}
      />
      {toast && <Toast message={toast} kind="success" onClose={() => setToast(null)} />}
    </DashboardLayout>
  );
}
