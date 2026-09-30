"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import { api, statusColors, statusLabels, timeAgo } from "@/lib/client";

interface Thesis { id: string; title: string; status: string; wordCount: number; aiUsagePercent: number; integrityScore: number; studentName: string; professorName: string; updatedAt: string; deadline?: string; openFlags: number; sessionCount: number }

export default function AdminThesesPage() {
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ theses: Thesis[] }>("/api/theses").then((d) => setTheses(d.theses)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = theses.filter((t) => (filter === "all" || (filter === "flagged" ? t.openFlags > 0 : t.status === filter)) && (!q || `${t.title} ${t.studentName}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <DashboardLayout>
      <div className="animate-fade-in max-w-6xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div><h1 className="text-2xl font-bold">All theses</h1><p className="text-gray-500 mt-1 text-sm">Open a thesis to review provenance, sessions and AI logs.</p></div>
          <div className="flex gap-2 flex-wrap items-center">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="input-field !py-1.5 !w-40 text-sm" />
            {["all", "in_progress", "under_review", "flagged", "draft"].map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${filter === f ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{f === "all" ? "All" : f === "flagged" ? "Flagged" : statusLabels[f]}</button>
            ))}
          </div>
        </div>
        {loading ? <div className="card p-12 text-center text-gray-400">Loading…</div> : (
          <div className="card overflow-hidden overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead><tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider"><th className="text-left py-3 px-5">Thesis</th><th className="text-left py-3 px-5">Student</th><th className="text-left py-3 px-5">Status</th><th className="text-center py-3 px-5">Integrity</th><th className="text-center py-3 px-5">AI</th><th className="text-center py-3 px-5">Flags</th><th className="text-right py-3 px-5">Words</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-5"><Link href={`/admin/theses/${t.id}`} className="text-sm font-medium max-w-xs truncate block hover:text-brand-600">{t.title}</Link><div className="text-xs text-gray-400 mt-0.5">Advisor: {t.professorName} · {t.sessionCount} sessions · {timeAgo(t.updatedAt)}</div></td>
                    <td className="py-3 px-5 text-sm text-gray-600">{t.studentName}</td>
                    <td className="py-3 px-5"><span className={statusColors[t.status]}>{statusLabels[t.status]}</span></td>
                    <td className="py-3 px-5 text-center"><span className={`text-sm font-bold ${t.integrityScore >= 90 ? "text-green-600" : t.integrityScore >= 70 ? "text-amber-600" : "text-red-600"}`}>{t.integrityScore}%</span></td>
                    <td className="py-3 px-5 text-center text-sm text-purple-600 font-medium">{t.aiUsagePercent}%</td>
                    <td className="py-3 px-5 text-center">{t.openFlags > 0 ? <span className="badge-warning">{t.openFlags}</span> : <span className="text-gray-300">–</span>}</td>
                    <td className="py-3 px-5 text-right text-sm text-gray-500">{t.wordCount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="p-8 text-center text-sm text-gray-400">No theses match.</div>}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
