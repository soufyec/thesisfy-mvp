"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import { Modal } from "@/components/ui";
import { api } from "@/lib/client";
import { useT, useFormat } from "@/lib/i18n/client";
import { noticeTypeLabel, timeAgoLabel } from "@/lib/i18n/messages/admin";

interface FlagRow { id: string; thesisId: string; type: string; severity: string; description: string; timestamp: string; resolved: boolean; thesisTitle: string; studentName?: string; resolvedByName?: string; resolutionNote?: string }

const severityColors: Record<string, string> = { low: "badge-info", medium: "badge-warning", high: "badge-danger" };

export default function FlagsPage() {
  const t = useT();
  const fmt = useFormat();
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [resolve, setResolve] = useState<{ id: string; note: string } | null>(null);
  const load = useCallback(() => api<{ flags: FlagRow[] }>("/api/flags").then((d) => setFlags(d.flags)).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);
  const visible = flags.filter((f) => filter === "all" || !f.resolved);

  return (
    <DashboardLayout>
      <div className="max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div><h1 className="text-2xl font-bold">{t("admin.notices.title")}</h1><p className="text-gray-500 mt-1 text-sm">{t("admin.notices.subtitle")}</p></div>
          <div className="flex gap-2">{(["open", "all"] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 text-xs rounded-lg font-medium ${filter === f ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600"}`}>{f === "open" ? t("admin.notices.filterOpen") : t("common.all")}</button>)}</div>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
          <div className="card p-4 text-center"><div className="text-2xl font-bold">{flags.length}</div><div className="text-xs sm:text-sm text-gray-500">{t("admin.notices.total")}</div></div>
          <div className="card p-4 text-center"><div className="text-2xl font-bold text-green-600">{flags.filter((f) => f.resolved).length}</div><div className="text-xs sm:text-sm text-gray-500">{t("admin.notices.resolved")}</div></div>
          <div className="card p-4 text-center"><div className="text-2xl font-bold text-amber-600">{flags.filter((f) => !f.resolved).length}</div><div className="text-xs sm:text-sm text-gray-500">{t("admin.notices.pending")}</div></div>
        </div>
        <div className="card divide-y divide-gray-50">
          {visible.length === 0 && <div className="p-10 text-center text-sm text-gray-400">{t("admin.notices.empty")}</div>}
          {visible.map((f) => (
            <div key={f.id} className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap"><span className={severityColors[f.severity]}>{t(`admin.level.${f.severity}`).toLocaleUpperCase()}</span><span className="text-sm font-medium">{noticeTypeLabel(t, f.type)}</span>{f.resolved && <span className="badge-success">{f.resolvedByName ? t("admin.notices.resolvedBy", { name: f.resolvedByName }) : t("admin.notices.resolved")}</span>}</div>
                  <p className="text-sm text-gray-600 mb-1 whitespace-pre-wrap">{f.description}</p>
                  {f.resolutionNote && <p className="text-xs text-green-700">{t("admin.notices.resolution", { note: f.resolutionNote })}</p>}
                  <div className="text-xs text-gray-400">{f.studentName} · <Link href={`/admin/theses/${f.thesisId}`} className="hover:text-brand-600">{f.thesisTitle}</Link> · {timeAgoLabel(t, fmt.date, f.timestamp)}</div>
                </div>
                {!f.resolved && <button onClick={() => setResolve({ id: f.id, note: "" })} className="text-sm text-brand-600 hover:text-brand-700 font-medium whitespace-nowrap">{t("admin.notices.resolveButton")}</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
      <Modal open={!!resolve} onClose={() => setResolve(null)} title={t("admin.notices.resolveTitle")} size="sm" footer={<><button onClick={() => setResolve(null)} className="btn-outline !py-2 !px-4 text-sm">{t("common.cancel")}</button><button onClick={async () => { if (!resolve) return; await api(`/api/flags/${resolve.id}`, { method: "PATCH", json: { note: resolve.note } }).catch(() => {}); setResolve(null); load(); }} className="btn-primary !py-2 !px-4 text-sm">{t("admin.notices.resolveButton")}</button></>}>
        <textarea autoFocus value={resolve?.note || ""} onChange={(e) => setResolve(resolve && { ...resolve, note: e.target.value })} className="input-field" rows={3} placeholder={t("admin.notices.resolvePlaceholder")} />
      </Modal>
    </DashboardLayout>
  );
}
