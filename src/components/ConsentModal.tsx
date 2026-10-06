"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Modal, Toggle } from "./ui";
import { api } from "@/lib/client";
import type { Consent, ConsentScopes, Policy } from "./useUser";

const SCOPES: { key: keyof ConsentScopes; title: string; collects: string; never: string; policyKey: keyof Policy["monitoring"]}[] = [
  { key: "aiInteractions", title: "AI assistant interactions", collects: "Prompts and answers exchanged with the Thesisfic assistant, the provider/model used, and text you insert from it (marked as AI-assisted in your document).", never: "Your personal AI account credentials are encrypted and never shown to staff.", policyKey: "aiInteractions" },
  { key: "keystrokes", title: "Typing rhythm", collects: "Keystroke counts, words per minute and session duration while the editor is open.", never: "The keys you press or the text you type are never recorded as a log.", policyKey: "keystrokes" },
  { key: "paste", title: "Paste events", collects: "How many words were pasted and an anonymous fingerprint (hash) of the pasted text, used to recognise text copied from the Thesisfic assistant or Research copilot.", never: "The pasted text itself is never sent for monitoring purposes.", policyKey: "paste" },
  { key: "tabActivity", title: "Tab activity", collects: "When the editor tab goes to the background and comes back during a writing session.", never: "Which other sites or apps you use is not visible to Thesisfic.", policyKey: "tabActivity" },
];

export const DEFAULT_SCOPES: ConsentScopes = { aiInteractions: true, keystrokes: true, paste: true, tabActivity: true };

export default function ConsentModal({ open, onClose, onGranted, policy, existing, thesisId }: { open: boolean; onClose: () => void; onGranted: (c: Consent) => void; policy: Policy; existing?: Consent | null; thesisId?: string }) {
  const [scopes, setScopes] = useState<ConsentScopes>(existing?.scopes || DEFAULT_SCOPES);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) setScopes(existing?.scopes || DEFAULT_SCOPES);
  }, [open, existing]);

  const accept = async () => {
    setSaving(true);
    setError("");
    try {
      const data = await api<{ consent: Consent }>("/api/monitor/consent", { method: "POST", json: { scopes, thesisId } });
      onGranted(data.consent);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Your monitoring choices"
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">
            Not now
          </button>
          <button onClick={accept} disabled={saving} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-50">
            {saving ? "Saving…" : existing ? "Update choices" : "Accept & start writing"}
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3 p-3 bg-brand-50 rounded-xl mb-4">
        <ShieldCheck className="w-5 h-5 text-brand-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-brand-900">
          Thesisfic replaces AI <em>detection</em> with transparency. You decide what is recorded while you write; your advisor at <strong>{policy.university}</strong> sees exactly what you agreed to, nothing more. You can change or withdraw these choices any time in Settings &amp; Privacy.
        </p>
      </div>
      {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}
      <div className="space-y-3">
        {SCOPES.map((s) => {
          const enabledByPolicy = policy.monitoring[s.policyKey];
          const required = s.key === "aiInteractions" && policy.requireConsent;
          const dependsOff = false;
          const value = enabledByPolicy && !dependsOff ? scopes[s.key] : false;
          return (
            <div key={s.key} className={`p-3 rounded-xl border ${value ? "border-brand-200 bg-white" : "border-gray-100 bg-gray-50"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                    {s.title}
                    {required && <span className="badge-info">required by policy</span>}
                    {!enabledByPolicy && <span className="badge bg-gray-100 text-gray-500">not collected at your institution</span>}
                  </div>
                  <p className="text-xs text-gray-600 mt-1 flex gap-1.5">
                    <Eye className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
                    <span>{s.collects}</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-1 flex gap-1.5">
                    <EyeOff className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
                    <span>{s.never}</span>
                  </p>
                </div>
                <Toggle checked={value} disabled={!enabledByPolicy || required || dependsOff} onChange={(v) => setScopes((prev) => ({ ...prev, [s.key]: v }))} label={s.title} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 mt-4">Consent version 2026-03. A signed receipt of your choices is available in Settings &amp; Privacy. Data is processed under your institution&apos;s academic-integrity policy and GDPR Art. 6(1)(a).</p>
    </Modal>
  );
}
