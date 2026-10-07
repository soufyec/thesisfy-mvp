"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import ConsentModal from "@/components/ConsentModal";
import { Toast } from "@/components/ui";
import { useUser, type Consent } from "@/components/useUser";
import { api, ApiError } from "@/lib/client";
import { MIN_PASSWORD, PasswordField } from "@/components/accounts/PasswordField";
import { LOCALES, LOCALE_NAMES, Locale } from "@/lib/i18n";
import { useFormat, useLocale, useT } from "@/lib/i18n/client";
import { downloadBlob } from "@/lib/export";

const SCOPE_IDS = ["aiInteractions", "keystrokes", "paste", "tabActivity"];

export default function SettingsPage() {
  const { me, user, policy, consent, refresh } = useUser();
  const t = useT();
  const format = useFormat();
  const { setLocale } = useLocale();
  const dateTime = (d: string) => format.date(d, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<Locale>("en");
  const [consentOpen, setConsentOpen] = useState(false);
  const [history, setHistory] = useState<Consent[]>([]);
  const [toast, setToast] = useState<{ message: string; kind?: "info" | "success" | "error" } | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setLanguage(user.preferences.language);
    }
  }, [user]);
  useEffect(() => {
    api<{ history: Consent[] }>("/api/monitor/consent").then((d) => setHistory(d.history)).catch(() => {});
    setIsStandalone(window.matchMedia("(display-mode: standalone)").matches);
  }, []);

  const saveProfile = async () => {
    await api("/api/auth/me", { method: "PATCH", json: { name, preferences: { language } } }).catch(() => {});
    await refresh();
    setLocale(language);
    setToast({ message: t("dashboard.settings.profileSaved"), kind: "success" });
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < MIN_PASSWORD) return setToast({ message: t("accounts.password.tooShort"), kind: "error" });
    setPasswordBusy(true);
    try {
      const d = await api<{ ok: true; demoPasswordStillValid: boolean }>("/api/auth/password", { method: "POST", json: { currentPassword, newPassword } });
      setCurrentPassword("");
      setNewPassword("");
      setToast({ message: t(d.demoPasswordStillValid ? "accounts.password.savedDemo" : "accounts.password.saved"), kind: "success" });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setToast({ message: code === "wrong_password" ? t("accounts.password.wrongCurrent") : code === "password_short" ? t("accounts.password.tooShort") : t("common.error"), kind: "error" });
    } finally {
      setPasswordBusy(false);
    }
  };

  const revokeConsent = async () => {
    await api("/api/monitor/consent", { method: "DELETE" }).catch(() => {});
    await refresh();
    setToast({ message: t("dashboard.settings.consentWithdrawn"), kind: "info" });
  };

  const receipt = () => {
    if (!consent || !user) return;
    downloadBlob(`thesisfic-consent-${consent.id}.json`, new Blob([JSON.stringify({ user: { id: user.id, email: user.email, university: user.university }, consent, policy }, null, 2)], { type: "application/json" }));
  };

  const exportData = async () => {
    const [theses, logs, cons] = await Promise.all([api("/api/theses"), api("/api/ai/logs"), api("/api/monitor/consent")]);
    downloadBlob(`thesisfic-export-${new Date().toISOString().slice(0, 10)}.json`, new Blob([JSON.stringify({ user, theses, aiInteractions: logs, consent: cons, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" }));
  };

  if (!me || !user || !policy) return <DashboardLayout><div className="text-gray-400 text-sm">{t("common.loading")}…</div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="max-w-3xl space-y-6">
        <div><h1 className="text-2xl font-bold">{t("dashboard.settings.title")}</h1><p className="text-gray-500 mt-1 text-sm">{t("dashboard.settings.subtitle")}</p></div>

        <section className="card p-5 sm:p-6">
          <h2 className="font-semibold mb-4">{t("dashboard.settings.profile")}</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs text-gray-500">{t("common.name")}<input value={name} onChange={(e) => setName(e.target.value)} className="input-field !py-2 mt-1" /></label>
            <label className="text-xs text-gray-500">{t("common.email")}<input value={user.email} readOnly className="input-field !py-2 mt-1 bg-gray-50" /></label>
            <label className="text-xs text-gray-500">{t("common.language")}<select value={language} onChange={(e) => setLanguage(e.target.value as Locale)} className="input-field !py-2 mt-1">{LOCALES.map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}</select></label>
            <label className="text-xs text-gray-500">{t("dashboard.settings.institution")}<input value={user.university} readOnly className="input-field !py-2 mt-1 bg-gray-50" /></label>
          </div>
          <button onClick={saveProfile} className="btn-primary !py-2 !px-4 text-sm mt-4">{t("common.save")}</button>
        </section>

        <section id="password" className="card p-5 sm:p-6">
          <h2 className="font-semibold mb-1">{t("accounts.password.title")}</h2>
          <p className="text-xs text-gray-500 mb-4">{t("accounts.password.subtitle")}</p>
          <form onSubmit={changePassword} className="grid sm:grid-cols-2 gap-3" noValidate>
            <div>
              <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 mb-1">{t("accounts.password.current")}</label>
              <input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="input-field" required autoComplete="current-password" />
            </div>
            <PasswordField id="new-password" value={newPassword} onChange={setNewPassword} label={t("accounts.password.new")} />
            <div className="sm:col-span-2"><button type="submit" disabled={passwordBusy || !currentPassword || !newPassword} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40 disabled:cursor-not-allowed">{t("accounts.password.save")}</button></div>
          </form>
        </section>

        <section id="privacy" className="card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div><h2 className="font-semibold">{t("dashboard.settings.monitoring")}</h2><p className="text-xs text-gray-500 mt-0.5">{t("dashboard.settings.policyLine", { university: policy.university, date: format.date(policy.updatedAt), pct: policy.maxAiUsagePercent, state: policy.researchCopilot ? t("dashboard.settings.offered") : t("dashboard.settings.notOffered") })}</p></div>
            <button onClick={() => setConsentOpen(true)} className="btn-primary !py-2 !px-3 text-xs whitespace-nowrap">{consent ? t("dashboard.settings.changeChoices") : t("dashboard.settings.setChoices")}</button>
          </div>
          {consent ? (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                {Object.entries(consent.scopes).map(([k, v]) => (
                  <span key={k} className={`badge ${v ? "badge-success" : "bg-gray-100 text-gray-500"}`}>{SCOPE_IDS.indexOf(k) !== -1 ? t(`dashboard.settings.scope.${k}`) : k}: {v ? t("common.on") : t("common.off")}</span>
                ))}
              </div>
              <div className="text-xs text-gray-400 mb-3">{t("dashboard.settings.granted", { date: dateTime(consent.grantedAt), version: consent.version })}</div>
              <div className="flex flex-wrap gap-2">
                <button onClick={receipt} className="btn-outline !py-1.5 !px-3 text-xs"><Download className="w-3.5 h-3.5 mr-1" />{t("dashboard.settings.receipt")}</button>
                <button onClick={revokeConsent} className="btn-outline !py-1.5 !px-3 text-xs text-red-600">{t("dashboard.settings.withdraw")}</button>
              </div>
            </>
          ) : (
            <div className="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">{t("dashboard.settings.noConsent")} {policy.requireConsent ? t("dashboard.settings.consentRequired") : t("dashboard.settings.consentOptional")}</div>
          )}
          {history.length > 1 && (
            <details className="mt-3 text-xs text-gray-500"><summary className="cursor-pointer">{t("dashboard.settings.history", { n: history.length })}</summary>
              <ul className="mt-2 space-y-1">{history.map((h) => <li key={h.id}>{(() => { const n = Object.values(h.scopes).filter(Boolean).length; return t(n === 1 ? "dashboard.settings.historyRow_one" : "dashboard.settings.historyRow", { from: dateTime(h.grantedAt), to: h.revokedAt ? t("dashboard.settings.historyWithdrawn", { date: dateTime(h.revokedAt) }) : t("dashboard.settings.historyActive"), n }); })()}</li>)}</ul>
            </details>
          )}
        </section>

        <section id="mobile" className="card p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-1"><Smartphone className="w-5 h-5 text-gray-500" /><h2 className="font-semibold">{t("dashboard.settings.mobile")}</h2></div>
          {isStandalone ? <p className="text-sm text-green-700">{t("dashboard.settings.installed")}</p> : (
            <div className="text-sm text-gray-600 space-y-2">
              <p>{t("dashboard.settings.mobileIntro")}</p>
              <ul className="list-disc pl-5 space-y-1"><li><strong>Android (Chrome):</strong> {t("dashboard.settings.androidLead")} <em>{t("dashboard.settings.installApp")}</em> / <em>{t("dashboard.settings.addHome")}</em>.</li><li><strong>iPhone / iPad (Safari):</strong> {t("dashboard.settings.iosLead")} <em>{t("dashboard.settings.addHome")}</em>.</li><li><strong>{t("dashboard.settings.nativeLabel")}</strong> {t("dashboard.settings.nativeSee")} <code className="bg-gray-100 px-1 rounded">mobile/README.md</code> {t("dashboard.settings.nativeNote")}</li></ul>
            </div>
          )}
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="font-semibold mb-1">{t("dashboard.settings.yourData")}</h2>
          <p className="text-sm text-gray-600 mb-3">{t("dashboard.settings.dataBody")}</p>
          <button onClick={exportData} className="btn-outline !py-2 !px-4 text-sm"><Download className="w-4 h-4 mr-1" />{t("dashboard.settings.export")}</button>
        </section>
      </div>
      <ConsentModal open={consentOpen} onClose={() => setConsentOpen(false)} policy={policy} existing={consent} onGranted={async () => { await refresh(); api<{ history: Consent[] }>("/api/monitor/consent").then((d) => setHistory(d.history)).catch(() => {}); setToast({ message: t("dashboard.settings.choicesSaved"), kind: "success" }); }} />
      {toast && <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}
    </DashboardLayout>
  );
}
