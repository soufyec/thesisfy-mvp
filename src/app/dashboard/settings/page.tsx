"use client";

import { useCallback, useEffect, useState } from "react";
import { Chrome, Download, KeyRound, Smartphone, Trash2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import ConsentModal from "@/components/ConsentModal";
import { Toast } from "@/components/ui";
import { useUser, type Consent } from "@/components/useUser";
import { api } from "@/lib/client";
import { downloadBlob } from "@/lib/export";

interface Token {
  name: string;
  createdAt: string;
  lastSeenAt?: string;
  tokenHint: string;
}

const SCOPE_LABELS: Record<string, string> = { aiInteractions: "AI interactions", keystrokes: "Typing rhythm", paste: "Paste events", tabActivity: "Tab activity", extensionActivity: "External AI (extension)", extensionPromptText: "Prompt text (extension)" };

export default function SettingsPage() {
  const { me, user, policy, consent, refresh } = useUser();
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<"en" | "es" | "fr">("en");
  const [consentOpen, setConsentOpen] = useState(false);
  const [history, setHistory] = useState<Consent[]>([]);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [toast, setToast] = useState<{ message: string; kind?: "info" | "success" | "error" } | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setLanguage(user.preferences.language);
    }
  }, [user]);
  const loadTokens = useCallback(() => api<{ tokens: Token[] }>("/api/monitor/pair").then((d) => setTokens(d.tokens)).catch(() => {}), []);
  useEffect(() => {
    loadTokens();
    api<{ history: Consent[] }>("/api/monitor/consent").then((d) => setHistory(d.history)).catch(() => {});
    setIsStandalone(window.matchMedia("(display-mode: standalone)").matches);
  }, [loadTokens]);

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
    downloadBlob(`thesisfy-consent-${consent.id}.json`, new Blob([JSON.stringify({ user: { id: user.id, email: user.email, university: user.university }, consent, policy }, null, 2)], { type: "application/json" }));
  };

  const exportData = async () => {
    const [theses, logs, cons] = await Promise.all([api("/api/theses"), api("/api/ai/logs"), api("/api/monitor/consent")]);
    downloadBlob(`thesisfy-export-${new Date().toISOString().slice(0, 10)}.json`, new Blob([JSON.stringify({ user, theses, aiInteractions: logs, consent: cons, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" }));
  };

  const pair = async () => {
    const d = await api<{ code: string; expiresAt: string }>("/api/monitor/pair", { method: "POST" }).catch(() => null);
    if (d) setCode(d);
  };

  if (!me || !user || !policy) return <DashboardLayout><div className="text-gray-400 text-sm">Loading…</div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="animate-fade-in max-w-3xl space-y-6">
        <div><h1 className="text-2xl font-bold">Settings &amp; Privacy</h1><p className="text-gray-500 mt-1 text-sm">Your profile, what Thesisfy records, and your devices.</p></div>

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
            <div><h2 className="font-semibold">Monitoring &amp; consent</h2><p className="text-xs text-gray-500 mt-0.5">{policy.university} · policy updated {new Date(policy.updatedAt).toLocaleDateString()} · AI limit {policy.maxAiUsagePercent}% · external AI tools {policy.allowExternalAi ? "allowed when reported" : "not allowed"}</p></div>
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

        <section id="extension" className="card p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-1"><Chrome className="w-5 h-5 text-gray-500" /><h2 className="font-semibold">Browser extension: transparent AI use</h2></div>
          <p className="text-sm text-gray-600 mb-4">When you use ChatGPT, Claude, Gemini or Le Chat in another tab during a writing session, the Thesisfy Companion reports the visit and a fingerprint of what you copy, so a paste into your thesis is attributed to that tool instead of being flagged as an unknown source. Nothing is reported outside an active session, and only with the scopes you chose above.</p>
          <ol className="text-sm text-gray-600 list-decimal pl-5 space-y-1 mb-4">
            <li>Load the extension from the repository&apos;s <code className="bg-gray-100 px-1 rounded">extension/</code> folder (chrome://extensions → Developer mode → Load unpacked).</li>
            <li>Generate a pairing code below and enter it in the extension together with this site&apos;s URL.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={pair} className="btn-primary !py-2 !px-4 text-sm"><KeyRound className="w-4 h-4 mr-1" />Generate pairing code</button>
            {code && <div className="font-mono text-2xl tracking-widest bg-gray-900 text-white px-4 py-2 rounded-xl">{code.code}</div>}
            {code && <span className="text-xs text-gray-400">expires {new Date(code.expiresAt).toLocaleTimeString()}</span>}
          </div>
          {tokens.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-medium text-gray-500 mb-2">Paired devices</div>
              <ul className="space-y-2">
                {tokens.map((t) => (
                  <li key={t.tokenHint} className="flex items-center justify-between text-sm bg-gray-50 rounded-xl px-3 py-2">
                    <div><div className="font-medium">{t.name}</div><div className="text-xs text-gray-400">paired {new Date(t.createdAt).toLocaleDateString()}{t.lastSeenAt ? ` · last seen ${new Date(t.lastSeenAt).toLocaleString()}` : " · never seen"} · ···{t.tokenHint}</div></div>
                    <button onClick={async () => { await api("/api/monitor/pair", { method: "DELETE", json: { tokenHint: t.tokenHint } }); loadTokens(); }} className="text-gray-400 hover:text-red-500" title="Revoke"><Trash2 className="w-4 h-4" /></button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section id="mobile" className="card p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-1"><Smartphone className="w-5 h-5 text-gray-500" /><h2 className="font-semibold">Mobile app</h2></div>
          {isStandalone ? <p className="text-sm text-green-700">You are using the installed app. 🎉</p> : (
            <div className="text-sm text-gray-600 space-y-2">
              <p>Thesisfy works as an app on your phone: write, review comments and chat with the assistant anywhere. Your writing sessions are logged the same way.</p>
              <ul className="list-disc pl-5 space-y-1"><li><strong>Android (Chrome):</strong> menu ⋮ → <em>Install app</em> / <em>Add to Home screen</em>.</li><li><strong>iPhone / iPad (Safari):</strong> Share → <em>Add to Home Screen</em>.</li><li><strong>Native builds:</strong> see <code className="bg-gray-100 px-1 rounded">mobile/README.md</code> (Capacitor iOS/Android wrapper).</li></ul>
            </div>
          )}
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="font-semibold mb-1">Your data</h2>
          <p className="text-sm text-gray-600 mb-3">Export everything Thesisfy holds about you (theses metadata, AI interaction log, consent records) as JSON.</p>
          <button onClick={exportData} className="btn-outline !py-2 !px-4 text-sm"><Download className="w-4 h-4 mr-1" />Export my data</button>
        </section>
      </div>
      <ConsentModal open={consentOpen} onClose={() => setConsentOpen(false)} policy={policy} existing={consent} onGranted={async () => { await refresh(); api<{ history: Consent[] }>("/api/monitor/consent").then((d) => setHistory(d.history)).catch(() => {}); setToast({ message: "Monitoring choices saved", kind: "success" }); }} />
      {toast && <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}
    </DashboardLayout>
  );
}
