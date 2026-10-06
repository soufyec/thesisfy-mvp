"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Bot, Flag, ShieldCheck, Users } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useUser } from "@/components/useUser";
import { api, statusColors, statusLabels, timeAgo } from "@/lib/client";

interface Stats {
  total: number; inProgress: number; underReview: number; approved: number; avgIntegrity: number; avgAiUsage: number; totalStudents: number; totalProfessors: number; activeSessions: number; totalSessions: number; flagsThisWeek: number; openFlags: number; totalWords: number;
  provenance: { human: number; paste: number; ai: number }; aiInteractions: number; aiByMode: Record<string, number>; aiByProvider: Record<string, number>; distribution: { range: string; count: number }[];
}
interface Thesis { id: string; title: string; status: string; wordCount: number; aiUsagePercent: number; integrityScore: number; studentName: string; professorName: string; updatedAt: string; openFlags: number }
interface Interaction { id: string; userName?: string; thesisTitle?: string; provider: string; model: string; mode: string; source: string; blockedByPolicy: boolean; timestamp: string; promptPreview: string }

export default function AdminDashboard() {
  const { user, policy } = useUser();
  const [stats, setStats] = useState<Stats | null>(null);
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [logs, setLogs] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api<{ stats: Stats }>("/api/stats"), api<{ theses: Thesis[] }>("/api/theses"), api<{ interactions: Interaction[] }>("/api/ai/logs")])
      .then(([s, t, l]) => { setStats(s.stats); setTheses(t.theses); setLogs(l.interactions.slice(0, 8)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const total = stats ? Math.max(1, stats.provenance.human + stats.provenance.paste + stats.provenance.ai) : 1;
  const maxDist = Math.max(1, ...(stats?.distribution || []).map((d) => d.count));

  return (
    <DashboardLayout>
      <div className="max-w-6xl">
        <div className="mb-6"><h1 className="text-2xl font-bold">{user?.role === "professor" ? "Advisor dashboard" : "Institution dashboard"}</h1><p className="text-gray-500 mt-1 text-sm">{user?.university}: transparent AI use across {stats?.total ?? "…"} theses.</p></div>
        {loading ? <div className="p-12 text-center text-gray-400">Loading…</div> : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
              {[
                { label: "Theses", value: stats?.total, sub: `${stats?.inProgress} active · ${stats?.underReview} in review`, icon: <ShieldCheck className="w-5 h-5 text-brand-600" />, bg: "bg-brand-50" },
                { label: "Avg integrity", value: `${stats?.avgIntegrity}%`, sub: `AI-assisted avg ${stats?.avgAiUsage}% (limit ${policy?.maxAiUsagePercent}%)`, icon: <Activity className="w-5 h-5 text-green-600" />, bg: "bg-green-50" },
                { label: "Students", value: stats?.totalStudents, sub: `${stats?.activeSessions} writing right now`, icon: <Users className="w-5 h-5 text-blue-600" />, bg: "bg-blue-50" },
                { label: "Open flags", value: stats?.openFlags, sub: `${stats?.flagsThisWeek} this week`, icon: <Flag className="w-5 h-5 text-amber-600" />, bg: "bg-amber-50" },
              ].map((c) => (
                <div key={c.label} className="card p-4 sm:p-5"><div className="flex items-center justify-between"><div><div className="text-xs sm:text-sm text-gray-500 mb-1">{c.label}</div><div className="text-xl sm:text-2xl font-bold">{c.value ?? 0}</div></div><div className={`w-10 h-10 ${c.bg} rounded-xl flex items-center justify-center`}>{c.icon}</div></div><div className="mt-2 text-xs text-gray-500">{c.sub}</div></div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <div className="card p-5">
                <h2 className="font-semibold mb-4">AI usage distribution</h2>
                <div className="space-y-3">
                  {(stats?.distribution || []).map((d, i) => (
                    <div key={d.range}><div className="flex justify-between text-sm mb-1"><span className="text-gray-600">{d.range}</span><span className="text-gray-400">{d.count} theses</span></div><div className="w-full bg-gray-100 rounded-full h-2"><div className={`${["bg-green-500", "bg-blue-500", "bg-amber-500", "bg-red-500"][i]} h-2 rounded-full`} style={{ width: `${(d.count / maxDist) * 100}%` }} /></div></div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="text-xs text-gray-500 mb-1">Provenance across all theses</div>
                  <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100"><div className="bg-green-500" style={{ width: `${((stats?.provenance.human || 0) / total) * 100}%` }} /><div className="bg-amber-400" style={{ width: `${((stats?.provenance.paste || 0) / total) * 100}%` }} /><div className="bg-purple-500" style={{ width: `${((stats?.provenance.ai || 0) / total) * 100}%` }} /></div>
                  <div className="flex gap-3 text-[11px] text-gray-500 mt-1"><span>● Students</span><span className="text-amber-500">● Pasted</span><span className="text-purple-600">● AI</span></div>
                </div>
              </div>
              <div className="card p-5 lg:col-span-2">
                <div className="flex items-center justify-between mb-4"><h2 className="font-semibold">Theses overview</h2><Link href="/admin/theses" className="text-sm text-brand-600">All theses</Link></div>
                <div className="space-y-2">
                  {theses.slice(0, 6).map((t) => (
                    <Link key={t.id} href={`/admin/theses/${t.id}`} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                      <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{t.title}</div><div className="flex items-center gap-2 mt-1 flex-wrap"><span className="text-xs text-gray-500">{t.studentName}</span><span className={`${statusColors[t.status]} !text-[10px]`}>{statusLabels[t.status]}</span>{t.openFlags > 0 && <span className="badge-warning !text-[10px]">{t.openFlags} flags</span>}<span className="text-[11px] text-gray-400">{timeAgo(t.updatedAt)}</span></div></div>
                      <div className="flex items-center gap-4 ml-4"><div className="text-right"><div className={`text-sm font-bold ${t.integrityScore >= 90 ? "text-green-600" : t.integrityScore >= 70 ? "text-amber-600" : "text-red-600"}`}>{t.integrityScore}%</div><div className="text-xs text-gray-400">integrity</div></div><div className="text-right"><div className="text-sm font-medium text-purple-600">{t.aiUsagePercent}%</div><div className="text-xs text-gray-400">AI</div></div></div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="card p-5 lg:col-span-2">
                <div className="flex items-center gap-2 mb-4"><Bot className="w-4 h-4 text-gray-500" /><h2 className="font-semibold">Recent AI activity</h2></div>
                <div className="divide-y divide-gray-50">
                  {logs.length === 0 && <div className="text-sm text-gray-400 py-4">No AI interactions yet.</div>}
                  {logs.map((i) => (
                    <div key={i.id} className="py-2.5 text-sm flex items-start gap-3"><span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${i.blockedByPolicy ? "bg-red-500" : i.mode === "copilot" ? "bg-emerald-500" : "bg-brand-500"}`} /><div className="min-w-0"><div className="flex items-center gap-2 flex-wrap"><span className="font-medium">{i.userName}</span><span className="text-xs text-gray-400 capitalize">{i.mode.replace("_", " ")} · {i.provider}</span>{i.mode === "copilot" && <span className="badge bg-emerald-50 text-emerald-700 !text-[10px]">copilot</span>}{i.blockedByPolicy && <span className="badge-danger !text-[10px]">blocked</span>}</div><div className="text-gray-500 truncate text-xs">{i.promptPreview}</div><div className="text-[11px] text-gray-400">{i.thesisTitle} · {timeAgo(i.timestamp)}</div></div></div>
                  ))}
                </div>
              </div>
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4"><h2 className="font-semibold">Active AI policy</h2><Link href="/admin/policies" className="text-sm text-brand-600">Edit</Link></div>
                {policy && (
                  <div className="space-y-3 text-sm">
                    <div className="p-3 bg-green-50 rounded-xl"><div className="text-xs text-green-800">Max AI-assisted content</div><div className="text-xl font-bold text-green-700">{policy.maxAiUsagePercent}%</div></div>
                    <div className="p-3 bg-blue-50 rounded-xl"><div className="text-xs text-blue-800">Permitted providers</div><div className="font-medium text-blue-700 capitalize">{policy.allowedProviders.join(", ")}</div><div className="text-xs text-blue-600 mt-0.5">{policy.allowBYOK ? "Students may connect their own accounts" : "Institution assistant only"}</div></div>
                    <div className="p-3 bg-emerald-50 rounded-xl"><div className="text-xs text-emerald-800">Research copilot</div><div className="font-medium text-emerald-700">{policy.researchCopilot ? "Offered on university models, history kept" : "Not offered"}</div><div className="text-xs text-emerald-600 mt-0.5">Flag sensitivity: {policy.flagSensitivity}</div></div>
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
