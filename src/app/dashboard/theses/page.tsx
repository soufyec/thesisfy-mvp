"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import DashboardLayout, { useTimeAgo } from "@/components/DashboardLayout";
import { ConfirmDialog } from "@/components/editor/Dialogs";
import { DeadlineChip, DeadlineDialog, Modal, ScoreRing } from "@/components/ui";
import { api, statusColors } from "@/lib/client";
import { useFormat, useT } from "@/lib/i18n/client";

interface Thesis {
  id: string;
  title: string;
  description: string;
  status: string;
  wordCount: number;
  targetWords: number;
  aiUsagePercent: number;
  integrityScore: number;
  deadline?: string;
  updatedAt: string;
  professorName: string;
  openFlags: number;
  sessionCount: number;
}

function ThesesInner() {
  const t = useT();
  const format = useFormat();
  const timeAgo = useTimeAgo();
  const router = useRouter();
  const params = useSearchParams();
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<Thesis | null>(null);
  const [deadlineFor, setDeadlineFor] = useState<Thesis | null>(null);

  const saveDeadline = async (iso: string | undefined) => {
    if (!deadlineFor) return;
    await api(`/api/theses/${deadlineFor.id}`, { method: "PUT", json: { deadline: iso || "" } });
    setTheses((list) => list.map((x) => (x.id === deadlineFor.id ? { ...x, deadline: iso } : x)));
  };
  const [form, setForm] = useState({ title: "", description: "", deadline: "", targetWords: 20000, citationStyle: "APA" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => api<{ theses: Thesis[] }>("/api/theses").then((d) => setTheses(d.theses)).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (params.get("new") === "1") setOpen(true);
  }, [params]);

  const create = async () => {
    setSaving(true);
    setError("");
    try {
      const d = await api<{ thesis: { id: string } }>("/api/theses", { method: "POST", json: { ...form, deadline: form.deadline ? `${form.deadline}T12:00:00.000Z` : undefined } });
      router.push(`/dashboard/editor/${d.thesis.id}`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold">{t("dashboard.theses.title")}</h1><p className="text-gray-500 mt-1 text-sm">{t("dashboard.theses.subtitle")}</p></div>
        <button onClick={() => setOpen(true)} className="btn-primary !px-4"><Plus className="w-4 h-4 mr-1" />{t("dashboard.theses.new")}</button>
      </div>
      {loading ? <div className="card p-12 text-center text-gray-400">{t("common.loading")}…</div> : theses.length === 0 ? (
        <div className="card p-12 text-center"><div className="text-gray-400 mb-4">{t("dashboard.theses.empty")}</div><button onClick={() => setOpen(true)} className="btn-primary">{t("dashboard.theses.createFirst")}</button></div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
          {theses.map((th) => (
            <div key={th.id} className="card p-5 sm:p-6 hover:shadow-lg transition-all group relative min-w-0">
              <Link href={`/dashboard/editor/${th.id}`} className="absolute inset-0" aria-label={th.title} />
              <div className="flex items-start justify-between gap-3 sm:gap-4 min-w-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap"><h3 className="font-semibold group-hover:text-brand-600 transition-colors truncate max-w-full break-words">{th.title}</h3><span className={statusColors[th.status]}>{t(`dashboard.status.${th.status}`)}</span>{th.openFlags > 0 && <span className="badge-warning">{th.openFlags === 1 ? t("dashboard.notices_one") : t("dashboard.notices", { n: th.openFlags })}</span>}</div>
                  <p className="text-sm text-gray-500 line-clamp-2 mb-2 break-words">{th.description}</p>
                  <div className="flex items-center gap-x-3 gap-y-1 text-xs text-gray-400 flex-wrap"><span>{t("dashboard.advisorLine", { name: th.professorName })}</span><span>{t("dashboard.progressWords", { n: format.number(th.wordCount), target: format.number(th.targetWords) })}</span><span>{t("dashboard.theses.aiPct", { n: th.aiUsagePercent })}</span><span>{th.sessionCount === 1 ? t("dashboard.theses.sessions_one") : t("dashboard.theses.sessions", { n: th.sessionCount })}</span><span>{t("dashboard.theses.updated", { time: timeAgo(th.updatedAt) })}</span></div>
                  <div className="mt-3 flex items-center gap-2 flex-wrap relative z-10"><DeadlineChip deadline={th.deadline} wordCount={th.wordCount} targetWords={th.targetWords} onClick={() => setDeadlineFor(th)} withDate />{th.deadline && <button type="button" onClick={() => setDeadlineFor(th)} className="text-[11px] text-brand-600 font-medium hover:underline">{t("deadline.change")}</button>}</div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 mt-3"><div className="bg-brand-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (th.wordCount / th.targetWords) * 100)}%` }} /></div>
                </div>
                <div className="flex flex-col items-center gap-2 flex-shrink-0 relative z-10"><ScoreRing value={th.integrityScore} /><button onClick={() => setDel(th)} className="text-gray-300 hover:text-red-500 p-1" title={t("common.delete")} aria-label={t("common.delete")}><Trash2 className="w-4 h-4" /></button></div>
              </div>
            </div>
          ))}
        </div>
      )}

      <DeadlineDialog open={!!deadlineFor} onClose={() => setDeadlineFor(null)} deadline={deadlineFor?.deadline} onSave={saveDeadline} />
      <Modal open={open} onClose={() => setOpen(false)} title={t("dashboard.theses.new")} footer={<><button onClick={() => setOpen(false)} className="btn-outline !py-2 !px-4 text-sm">{t("common.cancel")}</button><button disabled={!form.title.trim() || saving} onClick={create} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40">{saving ? t("dashboard.theses.creating") : t("dashboard.theses.create")}</button></>}>
        <div className="space-y-3">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl">{error}</div>}
          <input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input-field" placeholder={t("dashboard.theses.workingTitle")} />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field" rows={3} placeholder={t("dashboard.theses.descriptionPlaceholder")} />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-gray-500">{t("dashboard.theses.deadline")}<input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="input-field !py-2 mt-1" /></label>
            <label className="text-xs text-gray-500">{t("dashboard.theses.targetWords")}<input type="number" min={1000} step={1000} value={form.targetWords} onChange={(e) => setForm({ ...form, targetWords: Number(e.target.value) })} className="input-field !py-2 mt-1" /></label>
          </div>
          <label className="text-xs text-gray-500 block">{t("dashboard.theses.citationStyle")}<select value={form.citationStyle} onChange={(e) => setForm({ ...form, citationStyle: e.target.value })} className="input-field !py-2 mt-1">{["APA", "MLA", "Chicago", "IEEE", "Harvard"].map((s) => <option key={s}>{s}</option>)}</select></label>
        </div>
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title={t("dashboard.theses.deleteTitle")} danger confirmLabel={t("common.delete")} body={<>{t("dashboard.theses.deleteBody", { title: del?.title })}</>} onConfirm={async () => { if (del) { await api(`/api/theses/${del.id}`, { method: "DELETE" }).catch(() => {}); load(); } }} />
    </div>
  );
}

export default function ThesesPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={null}>
        <ThesesInner />
      </Suspense>
    </DashboardLayout>
  );
}
