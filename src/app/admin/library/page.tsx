"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import DatabaseCard, { ResearchDb } from "@/components/library/DatabaseCard";
import { ConfirmDialog } from "@/components/editor/Dialogs";
import { Modal, Toast } from "@/components/ui";
import { api } from "@/lib/client";
import { ACCESS_INFO } from "@/lib/library";

interface Settings { intro?: string; helpEmail?: string; helpUrl?: string; proxyPrefix?: string }
const EMPTY = { name: "", url: "", loginUrl: "", description: "", subjects: "", access: "sso" as ResearchDb["access"], instructions: "", featured: false };

export default function AdminLibraryPage() {
  const [dbs, setDbs] = useState<ResearchDb[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [university, setUniversity] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [edit, setEdit] = useState<{ id?: string; form: typeof EMPTY } | null>(null);
  const [del, setDel] = useState<ResearchDb | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => api<{ databases: ResearchDb[]; settings: Settings; university: string; canManage: boolean }>("/api/research-databases").then((d) => { setDbs(d.databases); setSettings(d.settings); setUniversity(d.university); setCanManage(d.canManage); }).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!edit) return;
    setError("");
    try {
      if (edit.id) await api(`/api/research-databases/${edit.id}`, { method: "PUT", json: edit.form });
      else await api("/api/research-databases", { method: "POST", json: edit.form });
      setEdit(null);
      setToast(edit.id ? "Database updated" : "Database added: students can see it now");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const saveSettings = async () => {
    try {
      await api("/api/research-databases", { method: "POST", json: { settings } });
      setToast("Library settings saved");
    } catch (e) {
      setToast((e as Error).message);
    }
  };

  const f = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => edit && setEdit({ ...edit, form: { ...edit.form, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value } });
  const totalOpens = dbs.reduce((a, d) => a + (d.opens || 0), 0);

  return (
    <DashboardLayout>
      <div className="max-w-6xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Research databases</h1>
            <p className="text-gray-500 mt-1 text-sm">The databases {university} students see in Thesisfic, with how to sign in. {totalOpens} opens from Thesisfic so far.</p>
          </div>
          {canManage && <button onClick={() => { setError(""); setEdit({ form: { ...EMPTY } }); }} className="btn-primary !px-4"><Plus className="w-4 h-4 mr-1" />Add database</button>}
        </div>

        {canManage && (
          <section className="card p-5 space-y-3">
            <h2 className="font-semibold">Library access settings</h2>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <label className="text-xs text-gray-500 sm:col-span-2">Message shown to students
                <textarea id="lib-intro" value={settings.intro || ""} onChange={(e) => setSettings({ ...settings, intro: e.target.value })} rows={2} className="input-field mt-1" />
              </label>
              <label className="text-xs text-gray-500">Proxy prefix (EZproxy or similar), used for “Library proxy” databases
                <input id="lib-proxy" value={settings.proxyPrefix || ""} onChange={(e) => setSettings({ ...settings, proxyPrefix: e.target.value })} placeholder="https://login.proxy.university.edu/login?url=" className="input-field !py-2 mt-1 font-mono text-xs" />
              </label>
              <label className="text-xs text-gray-500">Library help email
                <input id="lib-email" value={settings.helpEmail || ""} onChange={(e) => setSettings({ ...settings, helpEmail: e.target.value })} placeholder="library-help@university.edu" className="input-field !py-2 mt-1" />
              </label>
              <label className="text-xs text-gray-500 sm:col-span-2">Library help page
                <input id="lib-help" value={settings.helpUrl || ""} onChange={(e) => setSettings({ ...settings, helpUrl: e.target.value })} placeholder="https://library.university.edu/help" className="input-field !py-2 mt-1" />
              </label>
            </div>
            <button onClick={saveSettings} className="btn-outline !py-2 !px-4 text-sm">Save settings</button>
          </section>
        )}

        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          {dbs.map((d) => (
            <DatabaseCard
              key={d.id}
              d={d}
              university={university}
              proxyPrefix={settings.proxyPrefix}
              admin={
                canManage ? (
                  <div className="flex gap-1">
                    <button onClick={() => { setError(""); setEdit({ id: d.id, form: { name: d.name, url: d.url, loginUrl: d.loginUrl || "", description: d.description, subjects: d.subjects.join(", "), access: d.access, instructions: d.instructions || "", featured: d.featured } }); }} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100" aria-label={`Edit ${d.name}`}><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => setDel(d)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" aria-label={`Delete ${d.name}`}><Trash2 className="w-4 h-4" /></button>
                  </div>
                ) : undefined
              }
            />
          ))}
        </div>
        {dbs.length === 0 && <div className="card p-10 text-center text-sm text-gray-500">No databases yet. Add the ones your library subscribes to.</div>}
        <p className="text-xs text-gray-400">Coming next: connecting these databases to the AI assistant (MCP) so students can search them from inside the editor, still with their own university login.</p>
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit database" : "Add database"} size="lg" footer={<><button onClick={() => setEdit(null)} className="btn-outline !py-2 !px-4 text-sm">Cancel</button><button onClick={save} disabled={!edit?.form.name || !edit?.form.url} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40">Save</button></>}>
        {edit && (
          <div className="space-y-3 text-sm">
            {error && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs">{error}</div>}
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-xs text-gray-500">Name<input id="db-name" value={edit.form.name} onChange={f("name")} className="input-field !py-2 mt-1" placeholder="JSTOR" /></label>
              <label className="text-xs text-gray-500">How students sign in
                <select id="db-access" value={edit.form.access} onChange={f("access")} className="input-field !py-2 mt-1">
                  {(Object.keys(ACCESS_INFO) as ResearchDb["access"][]).map((k) => <option key={k} value={k}>{ACCESS_INFO[k].label}</option>)}
                </select>
              </label>
              <label className="text-xs text-gray-500">Database link<input id="db-url" value={edit.form.url} onChange={f("url")} className="input-field !py-2 mt-1" placeholder="https://www.jstor.org/" /></label>
              <label className="text-xs text-gray-500">Direct institutional login link (optional)<input id="db-login" value={edit.form.loginUrl} onChange={f("loginUrl")} className="input-field !py-2 mt-1" placeholder="https://…/institutional-login" /></label>
              <label className="text-xs text-gray-500 sm:col-span-2">Short description<input id="db-desc" value={edit.form.description} onChange={f("description")} className="input-field !py-2 mt-1" /></label>
              <label className="text-xs text-gray-500 sm:col-span-2">Subjects (comma-separated)<input id="db-subjects" value={edit.form.subjects} onChange={f("subjects")} className="input-field !py-2 mt-1" placeholder="Humanities, Social sciences" /></label>
              <label className="text-xs text-gray-500 sm:col-span-2">Special access instructions (optional)
                <textarea id="db-instr" value={edit.form.instructions} onChange={f("instructions")} rows={3} className="input-field mt-1" placeholder={ACCESS_INFO[edit.form.access].how(university)} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.form.featured} onChange={f("featured")} />Recommended by the library (shown first)</label>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title="Remove database?" danger confirmLabel="Remove" body={<>Students will no longer see “{del?.name}” in Thesisfic. Your subscription is not affected.</>} onConfirm={async () => { if (del) { await api(`/api/research-databases/${del.id}`, { method: "DELETE" }).catch(() => {}); load(); } }} />
      {toast && <Toast message={toast} kind="success" onClose={() => setToast(null)} />}
    </DashboardLayout>
  );
}
