"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Bot, FileBarChart, Flag, ShieldCheck, Users } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useUser } from "@/components/useUser";
import { api, statusColors } from "@/lib/client";
import { useT, useFormat } from "@/lib/i18n/client";
import { modeLabel, plural, statusLabel, timeAgoLabel } from "@/lib/i18n/messages/admin";

interface Stats {
  total: number; inProgress: number; underReview: number; approved: number; avgIntegrity: number; avgAiUsage: number; totalStudents: number; totalProfessors: number; activeSessions: number; totalSessions: number; flagsThisWeek: number; openFlags: number; totalWords: number;
  provenance: { human: number; paste: number; ai: number }; aiInteractions: number; aiByMode: Record<string, number>; aiByProvider: Record<string, number>; distribution: { range: string; count: number }[];
}
interface Thesis { id: string; title: string; status: string; wordCount: number; aiUsagePercent: number; integrityScore: number; studentName: string; professorName: string; updatedAt: string; openFlags: number }
interface Interaction { id: string; userName?: string; thesisTitle?: string; provider: string; model: string; mode: string; source: string; blockedByPolicy: boolean; timestamp: string; promptPreview: string }

export default function AdminDashboard() {
  const { user, policy } = useUser();
  const t = useT();
  const fmt = useFormat();
  const ago = (iso: string) => timeAgoLabel(t, fmt.date, iso);
  const [stats, setStats] = useState<Stats | null>(null);
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [logs, setLogs] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api<{ stats: Stats }>("/api/stats"), api<{ theses: Thesis[] }>("/api/theses"), api<{ interactions: Interaction[] }>("/api/ai/logs")])
      .then(([s, th, l]) => { setStats(s.stats); setTheses(th.theses); setLogs(l.interactions.slice(0, 8)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const total = stats ? Math.max(1, stats.provenance.human + stats.provenance.paste + stats.provenance.ai) : 1;
  const maxDist = Math.max(1, ...(stats?.distribution || []).map((d) => d.count));

  return (
    <DashboardLayout>
      <div className="max-w-6xl">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div><h1 className="text-2xl font-bold">{user?.role === "professor" ? t("admin.dashboard.titleAdvisor") : t("admin.dashboard.titleInstitution")}</h1><p className="text-gray-500 mt-1 text-sm">{t("admin.dashboard.subtitle", { university: user?.university || "", n: stats?.total ?? "…" })}</p></div>
          <Link href="/admin/report" className="btn-outline !py-2 !px-3 text-sm gap-1.5 self-start" title={t("report.overview.linkHelp")}><FileBarChart className="w-4 h-4" />{t("report.overview.link")}</Link>
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
              <div className="card p-5">
                <h2 className="font-semibold mb-4">{t("admin.dashboard.distribution")}</h2>
                <div className="space-y-3">
                  {(stats?.distribution || []).map((d, i) => (
                    <div key={d.range}><div className="flex justify-between text-sm mb-1"><span className="text-gray-600">{d.range}</span><span className="text-gray-400">{plural(t, "admin.dashboard.distCount", d.count)}</span></div><div className="w-full bg-gray-100 rounded-full h-2"><div className={`${["bg-green-500", "bg-blue-500", "bg-amber-500", "bg-red-500"][i]} h-2 rounded-full`} style={{ width: `${(d.count / maxDist) * 100}%` }} /></div></div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="text-xs text-gray-500 mb-1">{t("admin.dashboard.provenanceAll")}</div>
                  <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100"><div className="bg-green-500" style={{ width: `${((stats?.provenance.human || 0) / total) * 100}%` }} /><div className="bg-amber-400" style={{ width: `${((stats?.provenance.paste || 0) / total) * 100}%` }} /><div className="bg-purple-500" style={{ width: `${((stats?.provenance.ai || 0) / total) * 100}%` }} /></div>
                  <div className="flex gap-3 text-[11px] text-gray-500 mt-1"><span>● {t("glossary.written")}</span><span className="text-amber-500">● {t("glossary.quotedOrPasted")}</span><span className="text-purple-600">● {t("glossary.aiAssisted")}</span></div>
                </div>
              </div>
              <div className="card p-5 lg:col-span-2">
                <div className="flex items-center justify-between mb-4"><h2 className="font-semibold">{t("admin.dashboard.overview")}</h2><Link href="/admin/theses" className="text-sm text-brand-600">{t("admin.dashboard.allTheses")}</Link></div>
                <div className="space-y-2">
                  {theses.slice(0, 6).map((th) => (
                    <Link key={th.id} href={`/admin/theses/${th.id}`} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                      <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{th.title}</div><div className="flex items-center gap-2 mt-1 flex-wrap"><span className="text-xs text-gray-500">{th.studentName}</span><span className={`${statusColors[th.status]} !text-[10px]`}>{statusLabel(t, th.status)}</span>{th.openFlags > 0 && <span className="badge-warning !text-[10px]">{plural(t, "admin.notices", th.openFlags)}</span>}<span className="text-[11px] text-gray-400">{ago(th.updatedAt)}</span></div></div>
                      <div className="flex items-center gap-4 ml-4"><div className="text-right"><div className={`text-sm font-bold ${th.integrityScore >= 90 ? "text-green-600" : th.integrityScore >= 70 ? "text-amber-600" : "text-red-600"}`}>{th.integrityScore}%</div><div className="text-xs text-gray-400">{t("glossary.integrity")}</div></div><div className="text-right"><div className="text-sm font-medium text-purple-600">{th.aiUsagePercent}%</div><div className="text-xs text-gray-400">{t("admin.ai")}</div></div></div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="card p-5 lg:col-span-2">
                <div className="flex items-center gap-2 mb-4"><Bot className="w-4 h-4 text-gray-500" /><h2 className="font-semibold">{t("admin.dashboard.recentAi")}</h2></div>
                <div className="divide-y divide-gray-50">
                  {logs.length === 0 && <div className="text-sm text-gray-400 py-4">{t("admin.dashboard.noAi")}</div>}
                  {logs.map((i) => (
                    <div key={i.id} className="py-2.5 text-sm flex items-start gap-3"><span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${i.blockedByPolicy ? "bg-red-500" : i.mode === "copilot" ? "bg-emerald-500" : "bg-brand-500"}`} /><div className="min-w-0"><div className="flex items-center gap-2 flex-wrap"><span className="font-medium">{i.userName}</span><span className="text-xs text-gray-400 capitalize">{modeLabel(t, i.mode)} · {i.provider}</span>{i.mode === "copilot" && <span className="badge bg-emerald-50 text-emerald-700 !text-[10px]">{t("admin.dashboard.copilotBadge")}</span>}{i.blockedByPolicy && <span className="badge-danger !text-[10px]">{t("admin.dashboard.blocked")}</span>}</div><div className="text-gray-500 truncate text-xs">{i.promptPreview}</div><div className="text-[11px] text-gray-400">{i.thesisTitle} · {ago(i.timestamp)}</div></div></div>
                  ))}
                </div>
              </div>
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4"><h2 className="font-semibold">{t("admin.dashboard.policyTitle")}</h2><Link href="/admin/policies" className="text-sm text-brand-600">{t("common.edit")}</Link></div>
                {policy && (
                  <div className="space-y-3 text-sm">
                    <div className="p-3 bg-green-50 rounded-xl"><div className="text-xs text-green-800">{t("admin.dashboard.maxAi")}</div><div className="text-xl font-bold text-green-700">{policy.maxAiUsagePercent}%</div></div>
                    <div className="p-3 bg-blue-50 rounded-xl"><div className="text-xs text-blue-800">{t("admin.dashboard.providers")}</div><div className="font-medium text-blue-700 capitalize">{policy.allowedProviders.join(", ")}</div><div className="text-xs text-blue-600 mt-0.5">{policy.allowBYOK ? t("admin.dashboard.byokOn") : t("admin.dashboard.byokOff")}</div></div>
                    <div className="p-3 bg-emerald-50 rounded-xl"><div className="text-xs text-emerald-800">{t("glossary.copilot")}</div><div className="font-medium text-emerald-700">{policy.researchCopilot ? t("admin.dashboard.copilotOn") : t("admin.dashboard.copilotOff")}</div><div className="text-xs text-emerald-600 mt-0.5">{t("admin.dashboard.sensitivity", { level: t(`admin.level.${policy.flagSensitivity}`) })}</div></div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
