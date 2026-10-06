"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import ConsentModal from "@/components/ConsentModal";
import { Toast } from "@/components/ui";
import { useUser, type Consent } from "@/components/useUser";
import { api } from "@/lib/client";
import { downloadBlob } from "@/lib/export";

const SCOPE_LABELS: Record<string, string> = { aiInteractions: "AI interactions", keystrokes: "Typing rhythm", paste: "Paste events", tabActivity: "Tab activity" };

export default function SettingsPage() {
  const { me, user, policy, consent, refresh } = useUser();
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<"en" | "es" | "fr">("en");
  const [consentOpen, setConsentOpen] = useState(false);
  const [history, setHistory] = useState<Consent[]>([]);
  const [toast, setToast] = useState<{ message: string; kind?: "info" | "success" | "error" } | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

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
    setToast({ message: "Profile saved", kind: "success" });
  };

  const revokeConsent = async () => {
    await api("/api/monitor/consent", { method: "DELETE" }).catch(() => {});
    await refresh();
    setToast({ message: "Consent withdrawn. Monitoring stopped and the assistant is paused until you choose again.", kind: "info" });
  };

  const receipt = () => {
    if (!consent || !user) return;
    downloadBlob(`thesisfic-consent-${consent.id}.json`, new Blob([JSON.stringify({ user: { id: user.id, email: user.email, university: user.university }, consent, policy }, null, 2)], { type: "application/json" }));
  };

  const exportData = async () => {
    const [theses, logs, cons] = await Promise.all([api("/api/theses"), api("/api/ai/logs"), api("/api/monitor/consent")]);
    downloadBlob(`thesisfic-export-${new Date().toISOString().slice(0, 10)}.json`, new Blob([JSON.stringify({ user, theses, aiInteractions: logs, consent: cons, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" }));
  };

  if (!me || !user || !policy) return <DashboardLayout><div className="text-gray-400 text-sm">Loading…</div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="max-w-3xl space-y-6">
        <div><h1 className="text-2xl font-bold">Settings &amp; Privacy</h1><p className="text-gray-500 mt-1 text-sm">Your profile, what Thesisfic records, and your devices.</p></div>

        <section className="card p-5 sm:p-6">
          <h2 className="font-semibold mb-4">Profile</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs text-gray-500">Name<input value={name} onChange={(e) => setName(e.target.value)} className="input-field !py-2 mt-1" /></label>
            <label className="text-xs text-gray-500">Email<input value={user.email} readOnly className="input-field !py-2 mt-1 bg-gray-50" /></label>
            <label className="text-xs text-gray-500">Assistant language<select value={language} onChange={(e) => setLanguage(e.target.value as "en" | "es" | "fr")} className="input-field !py-2 mt-1"><option value="en">Auto / English</option><option value="es">Español</option><option value="fr">Français</option></select></label>
            <label className="text-xs text-gray-500">Institution<input value={user.university} readOnly className="input-field !py-2 mt-1 bg-gray-50" /></label>
          </div>
          <button onClick={saveProfile} className="btn-primary !py-2 !px-4 text-sm mt-4">Save</button>
        </section>

        <section id="privacy" className="card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div><h2 className="font-semibold">Monitoring &amp; consent</h2><p className="text-xs text-gray-500 mt-0.5">{policy.university} · policy updated {new Date(policy.updatedAt).toLocaleDateString()} · AI limit {policy.maxAiUsagePercent}% · Research copilot {policy.researchCopilot ? "offered" : "not offered"}</p></div>
            <button onClick={() => setConsentOpen(true)} className="btn-primary !py-2 !px-3 text-xs whitespace-nowrap">{consent ? "Change choices" : "Set choices"}</button>
          </div>
          {consent ? (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                {Object.entries(consent.scopes).map(([k, v]) => (
                  <span key={k} className={`badge ${v ? "badge-success" : "bg-gray-100 text-gray-500"}`}>{SCOPE_LABELS[k] || k}: {v ? "on" : "off"}</span>
                ))}
              </div>
              <div className="text-xs text-gray-400 mb-3">Granted {new Date(consent.grantedAt).toLocaleString()} · version {consent.version}</div>
              <div className="flex flex-wrap gap-2">
                <button onClick={receipt} className="btn-outline !py-1.5 !px-3 text-xs"><Download className="w-3.5 h-3.5 mr-1" />Download consent receipt</button>
                <button onClick={revokeConsent} className="btn-outline !py-1.5 !px-3 text-xs text-red-600">Withdraw consent</button>
              </div>
            </>
          ) : (
            <div className="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">No active consent. {policy.requireConsent ? "Your institution requires AI interaction logging to use the assistant and the monitored editor." : "Monitoring is optional at your institution."}</div>
          )}
          {history.length > 1 && (
            <details className="mt-3 text-xs text-gray-500"><summary className="cursor-pointer">Consent history ({history.length})</summary>
              <ul className="mt-2 space-y-1">{history.map((h) => <li key={h.id}>{new Date(h.grantedAt).toLocaleString()} → {h.revokedAt ? `withdrawn ${new Date(h.revokedAt).toLocaleString()}` : "active"} · {Object.values(h.scopes).filter(Boolean).length} scopes on</li>)}</ul>
            </details>
          )}
        </section>

        <section id="mobile" className="card p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-1"><Smartphone className="w-5 h-5 text-gray-500" /><h2 className="font-semibold">Mobile app</h2></div>
          {isStandalone ? <p className="text-sm text-green-700">You are using the installed app. 🎉</p> : (
            <div className="text-sm text-gray-600 space-y-2">
              <p>Thesisfic works as an app on your phone: write, review comments and chat with the assistant anywhere. Your writing sessions are logged the same way.</p>
              <ul className="list-disc pl-5 space-y-1"><li><strong>Android (Chrome):</strong> menu ⋮ → <em>Install app</em> / <em>Add to Home screen</em>.</li><li><strong>iPhone / iPad (Safari):</strong> Share → <em>Add to Home Screen</em>.</li><li><strong>Native builds:</strong> see <code className="bg-gray-100 px-1 rounded">mobile/README.md</code> (Capacitor iOS/Android wrapper).</li></ul>
            </div>
          )}
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="font-semibold mb-1">Your data</h2>
          <p className="text-sm text-gray-600 mb-3">Export everything Thesisfic holds about you (theses metadata, AI interaction log, consent records) as JSON.</p>
          <button onClick={exportData} className="btn-outline !py-2 !px-4 text-sm"><Download className="w-4 h-4 mr-1" />Export my data</button>
        </section>
      </div>
      <ConsentModal open={consentOpen} onClose={() => setConsentOpen(false)} policy={policy} existing={consent} onGranted={async () => { await refresh(); api<{ history: Consent[] }>("/api/monitor/consent").then((d) => setHistory(d.history)).catch(() => {}); setToast({ message: "Monitoring choices saved", kind: "success" }); }} />
      {toast && <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}
    </DashboardLayout>
  );
}
