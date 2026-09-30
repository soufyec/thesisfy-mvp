"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { ConfirmDialog } from "@/components/editor/Dialogs";
import { Modal, ScoreRing } from "@/components/ui";
import { api, statusColors, statusLabels, timeAgo } from "@/lib/client";

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
  const router = useRouter();
  const params = useSearchParams();
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<Thesis | null>(null);
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
      const d = await api<{ thesis: { id: string } }>("/api/theses", { method: "POST", json: { ...form, deadline: form.deadline ? new Date(form.deadline).toISOString() : undefined } });
      router.push(`/dashboard/editor/${d.thesis.id}`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold">My Theses</h1><p className="text-gray-500 mt-1 text-sm">Manage and track all your thesis projects.</p></div>
        <button onClick={() => setOpen(true)} className="btn-primary !px-4"><Plus className="w-4 h-4 mr-1" />New thesis</button>
      </div>
      {loading ? <div className="card p-12 text-center text-gray-400">Loading…</div> : theses.length === 0 ? (
        <div className="card p-12 text-center"><div className="text-gray-400 mb-4">No theses yet</div><button onClick={() => setOpen(true)} className="btn-primary">Create your first thesis</button></div>
      ) : (
        <div className="grid gap-4">
          {theses.map((t) => (
            <div key={t.id} className="card p-5 sm:p-6 hover:shadow-lg transition-all group relative">
              <Link href={`/dashboard/editor/${t.id}`} className="absolute inset-0" aria-label={t.title} />
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap"><h3 className="font-semibold group-hover:text-brand-600 transition-colors truncate">{t.title}</h3><span className={statusColors[t.status]}>{statusLabels[t.status]}</span>{t.openFlags > 0 && <span className="badge-warning">{t.openFlags} notice{t.openFlags > 1 ? "s" : ""}</span>}</div>
                  <p className="text-sm text-gray-500 line-clamp-2 mb-2">{t.description}</p>
                  <div className="flex items-center gap-x-3 gap-y-1 text-xs text-gray-400 flex-wrap"><span>Advisor: {t.professorName}</span><span>{t.wordCount.toLocaleString()} / {t.targetWords.toLocaleString()} words</span><span>AI {t.aiUsagePercent}%</span><span>{t.sessionCount} sessions</span>{t.deadline && <span>Due {new Date(t.deadline).toLocaleDateString()}</span>}<span>Updated {timeAgo(t.updatedAt)}</span></div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 mt-3"><div className="bg-brand-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (t.wordCount / t.targetWords) * 100)}%` }} /></div>
                </div>
                <div className="flex flex-col items-center gap-2 flex-shrink-0 relative z-10"><ScoreRing value={t.integrityScore} /><button onClick={() => setDel(t)} className="text-gray-300 hover:text-red-500 p-1" title="Delete"><Trash2 className="w-4 h-4" /></button></div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New thesis" footer={<><button onClick={() => setOpen(false)} className="btn-outline !py-2 !px-4 text-sm">Cancel</button><button disabled={!form.title.trim() || saving} onClick={create} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40">{saving ? "Creating…" : "Create & open editor"}</button></>}>
        <div className="space-y-3">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl">{error}</div>}
          <input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input-field" placeholder="Working title" />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field" rows={3} placeholder="One-paragraph description or research question" />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-gray-500">Deadline<input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="input-field !py-2 mt-1" /></label>
            <label className="text-xs text-gray-500">Target words<input type="number" min={1000} step={1000} value={form.targetWords} onChange={(e) => setForm({ ...form, targetWords: Number(e.target.value) })} className="input-field !py-2 mt-1" /></label>
          </div>
          <label className="text-xs text-gray-500 block">Citation style<select value={form.citationStyle} onChange={(e) => setForm({ ...form, citationStyle: e.target.value })} className="input-field !py-2 mt-1">{["APA", "MLA", "Chicago", "IEEE", "Harvard"].map((s) => <option key={s}>{s}</option>)}</select></label>
        </div>
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title="Delete thesis?" danger confirmLabel="Delete" body={<>“{del?.title}” and all its versions, comments and session logs will be removed. This cannot be undone.</>} onConfirm={async () => { if (del) { await api(`/api/theses/${del.id}`, { method: "DELETE" }).catch(() => {}); load(); } }} />
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
