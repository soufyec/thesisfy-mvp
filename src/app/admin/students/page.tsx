"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Modal, Toast } from "@/components/ui";
import InvitePeople, { copyText } from "@/components/accounts/InvitePeople";
import { useUser } from "@/components/useUser";
import { api } from "@/lib/client";
import { useT, useFormat } from "@/lib/i18n/client";
import { plural, timeAgoLabel } from "@/lib/i18n/messages/admin";

interface Student { id: string; name: string; email: string; university: string; theses: number; avgIntegrity: number; avgAiUsage: number; openFlags: number; sessions: number; connections: string[]; consent: boolean; activeNow: boolean; lastActiveAt?: string }

export default function StudentsPage() {
  const { user } = useUser();
  const t = useT();
  const fmt = useFormat();
  const [students, setStudents] = useState<Student[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "student" });
  const [created, setCreated] = useState<{ email: string; temporaryPassword: string } | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ message: string; kind?: "info" | "success" | "error" } | null>(null);
  const [resetShown, setResetShown] = useState<{ email: string; link: string } | null>(null);
  const load = useCallback(() => api<{ students: Student[] }>("/api/users").then((d) => setStudents(d.students)).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);

  const showToast = useCallback((message: string, kind?: "info" | "success" | "error") => setToast({ message, kind }), []);

  /** Admin only: creates a 48-hour reset link for the student and copies it; shown inline when the clipboard is unavailable. */
  const resetLink = async (s: Student) => {
    try {
      const d = await api<{ link: string }>(`/api/users/${s.id}/reset-link`, { method: "POST" });
      if (await copyText(d.link)) showToast(t("accounts.admin.resetLinkCopied"), "success");
      else showToast(t("accounts.admin.copyFailed"), "error");
      setResetShown({ email: s.email, link: d.link });
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  const invite = async () => {
    setError("");
    try {
      const d = await api<{ user: { email: string }; temporaryPassword: string }>("/api/users", { method: "POST", json: form });
      setCreated({ email: d.user.email, temporaryPassword: d.temporaryPassword });
      setForm({ name: "", email: "", role: "student" });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div><h1 className="text-2xl font-bold">{t("admin.students.title")}</h1><p className="text-gray-500 mt-1 text-sm">{t("admin.students.subtitle")}</p></div>
          {/* Advisors have no invitation links, so they keep the direct button; admins use the Invite people block below. */}
          {user?.role === "professor" && <button onClick={() => { setOpen(true); setCreated(null); }} className="btn-primary !px-4"><Plus className="w-4 h-4 mr-1" />{t("admin.students.invite")}</button>}
        </div>
        {user?.role === "admin" && <div className="mb-6"><InvitePeople onToast={showToast} onCreateManually={() => { setOpen(true); setCreated(null); }} /></div>}
        {resetShown && (
          <div className="mb-4 bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-xs">
            <p className="text-gray-600 mb-2">{t("accounts.admin.resetLinkShown", { email: resetShown.email })}</p>
            <div className="flex items-center gap-2">
              <input readOnly value={resetShown.link} onFocus={(e) => e.currentTarget.select()} aria-label={t("accounts.admin.resetLink")} className="input-field !py-1.5 font-mono text-xs" />
              <button type="button" onClick={() => setResetShown(null)} className="btn-outline !py-1.5 !px-3 text-xs">{t("accounts.admin.hideLink")}</button>
            </div>
          </div>
        )}
        <div className="grid gap-3">
          {students.map((s) => (
            <div key={s.id} className="card p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-11 h-11 bg-brand-100 rounded-full flex items-center justify-center text-brand-700 font-semibold flex-shrink-0">{s.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}</div>
                  <div className="min-w-0"><div className="font-semibold flex items-center gap-2">{s.name}{s.activeNow && <span className="badge-success !text-[10px]">{t("admin.students.writingNow")}</span>}</div><div className="text-sm text-gray-500 truncate">{s.email}</div><div className="text-xs text-gray-400 mt-0.5 flex gap-2 flex-wrap"><span>{s.lastActiveAt ? t("admin.students.activeAgo", { ago: timeAgoLabel(t, fmt.date, s.lastActiveAt) }) : t("admin.students.neverActive")}</span><span>· {plural(t, "admin.sessions", s.sessions)}</span><span>· {t("admin.students.consent", { mark: s.consent ? "✓" : "✗" })}</span>{s.connections.length > 0 && <span>· {t("admin.students.ownAi", { list: s.connections.join(", ") })}</span>}</div></div>
                </div>
                <div className="flex items-center gap-6 sm:gap-8 text-center">
                  <div><div className="text-lg font-bold">{s.theses}</div><div className="text-xs text-gray-400">{t("admin.students.statTheses")}</div></div>
                  <div><div className={`text-lg font-bold ${s.avgIntegrity >= 90 ? "text-green-600" : s.avgIntegrity >= 70 ? "text-amber-600" : "text-red-600"}`}>{s.avgIntegrity}%</div><div className="text-xs text-gray-400">{t("glossary.integrity")}</div></div>
                  <div><div className="text-lg font-bold text-purple-600">{s.avgAiUsage}%</div><div className="text-xs text-gray-400">{t("admin.ai")}</div></div>
                  <div><div className={`text-lg font-bold ${s.openFlags ? "text-amber-600" : "text-gray-300"}`}>{s.openFlags}</div><div className="text-xs text-gray-400">{t("admin.students.statNotices")}</div></div>
                </div>
                {user?.role === "admin" && (
                  <button type="button" onClick={() => resetLink(s)} title={t("accounts.admin.resetLinkTitle")} aria-label={`${t("accounts.admin.resetLink")}: ${s.email}`} className="btn-outline !py-1.5 !px-3 text-xs whitespace-nowrap self-start sm:self-center"><KeyRound className="w-3.5 h-3.5 mr-1" aria-hidden />{t("accounts.admin.resetLink")}</button>
                )}
              </div>
            </div>
          ))}
          {students.length === 0 && <div className="card p-10 text-center text-sm text-gray-400">{t("admin.students.empty", { university: user?.university || "" })}</div>}
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={t("admin.students.modalTitle")} size="sm" footer={created ? <button onClick={() => setOpen(false)} className="btn-primary !py-2 !px-4 text-sm">{t("common.done")}</button> : <><button onClick={() => setOpen(false)} className="btn-outline !py-2 !px-4 text-sm">{t("common.cancel")}</button><button disabled={!form.name || !form.email} onClick={invite} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40">{t("common.register")}</button></>}>
        {created ? (
          <div className="text-sm space-y-2"><p>{t("admin.students.createdPre")} <strong>{created.email}</strong>. {t("admin.students.createdPost")}</p><div className="font-mono text-lg bg-gray-900 text-white rounded-xl px-4 py-2 text-center">{created.temporaryPassword}</div></div>
        ) : (
          <div className="space-y-3">
            {error && <div className="p-3 bg-red-50 text-red-600 text-xs rounded-xl">{error}</div>}
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field !py-2" placeholder={t("admin.students.fullName")} aria-label={t("admin.students.fullName")} />
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-field !py-2" placeholder={t("common.email")} aria-label={t("common.email")} />
            {user?.role === "admin" && <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input-field !py-2"><option value="student">{t("common.role.student")}</option><option value="professor">{t("admin.students.roleProfessor")}</option></select>}
          </div>
        )}
      </Modal>
      {toast && <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}
    </DashboardLayout>
  );
}
