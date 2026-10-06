"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import DatabaseCard, { ResearchDb } from "@/components/library/DatabaseCard";
import { ConfirmDialog } from "@/components/editor/Dialogs";
import { Modal, Toast } from "@/components/ui";
import { api } from "@/lib/client";
import { useT, useFormat } from "@/lib/i18n/client";
import { ACCESS_INFO } from "@/lib/library";

interface Settings { intro?: string; helpEmail?: string; helpUrl?: string; proxyPrefix?: string }
const EMPTY = { name: "", url: "", loginUrl: "", description: "", subjects: "", access: "sso" as ResearchDb["access"], instructions: "", featured: false };

export default function AdminLibraryPage() {
  const t = useT();
  const fmt = useFormat();
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
      setToast(edit.id ? t("admin.library.updated") : t("admin.library.added"));
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const saveSettings = async () => {
    try {
      await api("/api/research-databases", { method: "POST", json: { settings } });
      setToast(t("admin.library.settingsSaved"));
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
            <h1 className="text-2xl font-bold">{t("admin.library.title")}</h1>
            <p className="text-gray-500 mt-1 text-sm">{t("admin.library.subtitle", { university, n: fmt.number(totalOpens) })}</p>
          </div>
          {canManage && <button onClick={() => { setError(""); setEdit({ form: { ...EMPTY } }); }} className="btn-primary !px-4"><Plus className="w-4 h-4 mr-1" />{t("admin.library.addDatabase")}</button>}
        </div>

        {canManage && (
          <section className="card p-5 space-y-3">
            <h2 className="font-semibold">{t("admin.library.settingsTitle")}</h2>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <label className="text-xs text-gray-500 sm:col-span-2">{t("admin.library.message")}
                <textarea id="lib-intro" value={settings.intro || ""} onChange={(e) => setSettings({ ...settings, intro: e.target.value })} rows={2} className="input-field mt-1" />
              </label>
              <label className="text-xs text-gray-500">{t("admin.library.proxy")}
                <input id="lib-proxy" value={settings.proxyPrefix || ""} onChange={(e) => setSettings({ ...settings, proxyPrefix: e.target.value })} placeholder="https://login.proxy.university.edu/login?url=" className="input-field !py-2 mt-1 font-mono text-xs" />
              </label>
              <label className="text-xs text-gray-500">{t("admin.library.helpEmail")}
                <input id="lib-email" value={settings.helpEmail || ""} onChange={(e) => setSettings({ ...settings, helpEmail: e.target.value })} placeholder="library-help@university.edu" className="input-field !py-2 mt-1" />
              </label>
              <label className="text-xs text-gray-500 sm:col-span-2">{t("admin.library.helpPage")}
                <input id="lib-help" value={settings.helpUrl || ""} onChange={(e) => setSettings({ ...settings, helpUrl: e.target.value })} placeholder="https://library.university.edu/help" className="input-field !py-2 mt-1" />
              </label>
            </div>
            <button onClick={saveSettings} className="btn-outline !py-2 !px-4 text-sm">{t("admin.library.saveSettings")}</button>
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
                    <button onClick={() => { setError(""); setEdit({ id: d.id, form: { name: d.name, url: d.url, loginUrl: d.loginUrl || "", description: d.description, subjects: d.subjects.join(", "), access: d.access, instructions: d.instructions || "", featured: d.featured } }); }} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100" aria-label={t("admin.library.editAria", { name: d.name })}><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => setDel(d)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" aria-label={t("admin.library.deleteAria", { name: d.name })}><Trash2 className="w-4 h-4" /></button>
                  </div>
                ) : undefined
              }
            />
          ))}
        </div>
        {dbs.length === 0 && <div className="card p-10 text-center text-sm text-gray-500">{t("admin.library.empty")}</div>}
        <p className="text-xs text-gray-400">{t("admin.library.comingNext")}</p>
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? t("admin.library.modalEdit") : t("admin.library.modalAdd")} size="lg" footer={<><button onClick={() => setEdit(null)} className="btn-outline !py-2 !px-4 text-sm">{t("common.cancel")}</button><button onClick={save} disabled={!edit?.form.name || !edit?.form.url} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40">{t("common.save")}</button></>}>
        {edit && (
          <div className="space-y-3 text-sm">
            {error && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs">{error}</div>}
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-xs text-gray-500">{t("common.name")}<input id="db-name" value={edit.form.name} onChange={f("name")} className="input-field !py-2 mt-1" placeholder="JSTOR" /></label>
              <label className="text-xs text-gray-500">{t("admin.library.howSignIn")}
                <select id="db-access" value={edit.form.access} onChange={f("access")} className="input-field !py-2 mt-1">
                  {(Object.keys(ACCESS_INFO) as ResearchDb["access"][]).map((k) => <option key={k} value={k}>{ACCESS_INFO[k].label}</option>)}
                </select>
              </label>
              <label className="text-xs text-gray-500">{t("admin.library.link")}<input id="db-url" value={edit.form.url} onChange={f("url")} className="input-field !py-2 mt-1" placeholder="https://www.jstor.org/" /></label>
              <label className="text-xs text-gray-500">{t("admin.library.loginLink")}<input id="db-login" value={edit.form.loginUrl} onChange={f("loginUrl")} className="input-field !py-2 mt-1" placeholder="https://…/institutional-login" /></label>
              <label className="text-xs text-gray-500 sm:col-span-2">{t("admin.library.shortDesc")}<input id="db-desc" value={edit.form.description} onChange={f("description")} className="input-field !py-2 mt-1" /></label>
              <label className="text-xs text-gray-500 sm:col-span-2">{t("admin.library.subjects")}<input id="db-subjects" value={edit.form.subjects} onChange={f("subjects")} className="input-field !py-2 mt-1" placeholder={t("admin.library.subjectsPlaceholder")} /></label>
              <label className="text-xs text-gray-500 sm:col-span-2">{t("admin.library.instructions")}
                <textarea id="db-instr" value={edit.form.instructions} onChange={f("instructions")} rows={3} className="input-field mt-1" placeholder={ACCESS_INFO[edit.form.access].how(university)} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.form.featured} onChange={f("featured")} />{t("admin.library.featured")}</label>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title={t("admin.library.removeTitle")} danger confirmLabel={t("common.remove")} body={t("admin.library.removeBody", { name: del?.name || "" })} onConfirm={async () => { if (del) { await api(`/api/research-databases/${del.id}`, { method: "DELETE" }).catch(() => {}); load(); } }} />
      {toast && <Toast message={toast} kind="success" onClose={() => setToast(null)} />}
    </DashboardLayout>
  );
}
