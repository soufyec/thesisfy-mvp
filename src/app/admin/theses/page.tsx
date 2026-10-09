"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import { DeadlineChip } from "@/components/ui";
import { api, statusColors } from "@/lib/client";
import { useT, useFormat } from "@/lib/i18n/client";
import { plural, statusLabel, timeAgoLabel } from "@/lib/i18n/messages/admin";

interface Thesis { id: string; title: string; status: string; wordCount: number; targetWords: number; aiUsagePercent: number; integrityScore: number; studentName: string; professorName: string; updatedAt: string; deadline?: string; openFlags: number; sessionCount: number }

export default function AdminThesesPage() {
  const t = useT();
  const fmt = useFormat();
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ theses: Thesis[] }>("/api/theses").then((d) => setTheses(d.theses)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = theses.filter((th) => (filter === "all" || (filter === "flagged" ? th.openFlags > 0 : th.status === filter)) && (!q || `${th.title} ${th.studentName}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <DashboardLayout>
      <div className="max-w-6xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div><h1 className="text-2xl font-bold">{t("admin.theses.title")}</h1><p className="text-gray-500 mt-1 text-sm">{t("admin.theses.subtitle")}</p></div>
          <div className="flex gap-2 flex-wrap items-center">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${t("common.search")}…`} aria-label={t("common.search")} className="input-field !py-1.5 !w-40 text-sm" />
            {["all", "in_progress", "under_review", "flagged", "draft"].map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${filter === f ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{f === "all" ? t("common.all") : f === "flagged" ? t("admin.theses.filterWithNotices") : statusLabel(t, f)}</button>
            ))}
          </div>
        </div>
        {loading ? <div className="card p-12 text-center text-gray-400">{t("common.loading")}…</div> : (
          <div className="card overflow-hidden overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead><tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider"><th className="text-left py-3 px-5">{t("admin.theses.colThesis")}</th><th className="text-left py-3 px-5">{t("admin.theses.colStudent")}</th><th className="text-left py-3 px-5">{t("admin.theses.colStatus")}</th><th className="text-center py-3 px-5">{t("glossary.integrity")}</th><th className="text-center py-3 px-5">{t("admin.ai")}</th><th className="text-center py-3 px-5">{t("admin.theses.colNotices")}</th><th className="text-right py-3 px-5">{t("admin.theses.colWords")}</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((th) => (
                  <tr key={th.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-5"><Link href={`/admin/theses/${th.id}`} className="text-sm font-medium max-w-xs truncate block hover:text-brand-600">{th.title}</Link><div className="text-xs text-gray-400 mt-0.5">{t("admin.theses.meta", { advisor: th.professorName, sessions: plural(t, "admin.sessions", th.sessionCount), ago: timeAgoLabel(t, fmt.date, th.updatedAt) })}</div>{th.deadline && <div className="mt-1"><DeadlineChip deadline={th.deadline} wordCount={th.wordCount} targetWords={th.targetWords} withDate /></div>}</td>
                    <td className="py-3 px-5 text-sm text-gray-600">{th.studentName}</td>
                    <td className="py-3 px-5"><span className={statusColors[th.status]}>{statusLabel(t, th.status)}</span></td>
                    <td className="py-3 px-5 text-center"><span className={`text-sm font-bold ${th.integrityScore >= 90 ? "text-green-600" : th.integrityScore >= 70 ? "text-amber-600" : "text-red-600"}`}>{th.integrityScore}%</span></td>
                    <td className="py-3 px-5 text-center text-sm text-purple-600 font-medium">{th.aiUsagePercent}%</td>
                    <td className="py-3 px-5 text-center">{th.openFlags > 0 ? <span className="badge-warning">{th.openFlags}</span> : <span className="text-gray-300">–</span>}</td>
                    <td className="py-3 px-5 text-right text-sm text-gray-500">{fmt.number(th.wordCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="p-8 text-center text-sm text-gray-400">{t("admin.theses.empty")}</div>}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
