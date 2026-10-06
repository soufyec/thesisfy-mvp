"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import { Modal } from "@/components/ui";
import { api, timeAgo } from "@/lib/client";

interface FlagRow { id: string; thesisId: string; type: string; severity: string; description: string; timestamp: string; resolved: boolean; thesisTitle: string; studentName?: string; resolvedByName?: string; resolutionNote?: string }

const severityColors: Record<string, string> = { low: "badge-info", medium: "badge-warning", high: "badge-danger" };
const typeLabels: Record<string, string> = { bulk_paste: "Bulk paste", ai_generation: "AI generation", style_inconsistency: "Style inconsistency", rapid_typing: "Rapid typing", external_source: "External AI tool", unattributed_ai: "Unattributed AI text", policy_limit: "AI limit exceeded" };

export default function FlagsPage() {
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
          <div><h1 className="text-2xl font-bold">Integrity flags</h1><p className="text-gray-500 mt-1 text-sm">Notices raised during writing sessions. Each one is visible to the student too.</p></div>
          <div className="flex gap-2">{(["open", "all"] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 text-xs rounded-lg font-medium capitalize ${filter === f ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600"}`}>{f}</button>)}</div>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
          <div className="card p-4 text-center"><div className="text-2xl font-bold">{flags.length}</div><div className="text-xs sm:text-sm text-gray-500">Total</div></div>
          <div className="card p-4 text-center"><div className="text-2xl font-bold text-green-600">{flags.filter((f) => f.resolved).length}</div><div className="text-xs sm:text-sm text-gray-500">Resolved</div></div>
          <div className="card p-4 text-center"><div className="text-2xl font-bold text-amber-600">{flags.filter((f) => !f.resolved).length}</div><div className="text-xs sm:text-sm text-gray-500">Pending</div></div>
        </div>
        <div className="card divide-y divide-gray-50">
          {visible.length === 0 && <div className="p-10 text-center text-sm text-gray-400">Nothing to review.</div>}
          {visible.map((f) => (
            <div key={f.id} className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap"><span className={severityColors[f.severity]}>{f.severity.toUpperCase()}</span><span className="text-sm font-medium">{typeLabels[f.type] || f.type}</span>{f.resolved && <span className="badge-success">Resolved{f.resolvedByName ? ` by ${f.resolvedByName}` : ""}</span>}</div>
                  <p className="text-sm text-gray-600 mb-1 whitespace-pre-wrap">{f.description}</p>
                  {f.resolutionNote && <p className="text-xs text-green-700">Resolution: {f.resolutionNote}</p>}
                  <div className="text-xs text-gray-400">{f.studentName} · <Link href={`/admin/theses/${f.thesisId}`} className="hover:text-brand-600">{f.thesisTitle}</Link> · {timeAgo(f.timestamp)}</div>
                </div>
                {!f.resolved && <button onClick={() => setResolve({ id: f.id, note: "" })} className="text-sm text-brand-600 hover:text-brand-700 font-medium whitespace-nowrap">Resolve</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
      <Modal open={!!resolve} onClose={() => setResolve(null)} title="Resolve flag" size="sm" footer={<><button onClick={() => setResolve(null)} className="btn-outline !py-2 !px-4 text-sm">Cancel</button><button onClick={async () => { if (!resolve) return; await api(`/api/flags/${resolve.id}`, { method: "PATCH", json: { note: resolve.note } }).catch(() => {}); setResolve(null); load(); }} className="btn-primary !py-2 !px-4 text-sm">Resolve</button></>}>
        <textarea autoFocus value={resolve?.note || ""} onChange={(e) => setResolve(resolve && { ...resolve, note: e.target.value })} className="input-field" rows={3} placeholder="Resolution note (visible to the student)" />
      </Modal>
    </DashboardLayout>
  );
}
