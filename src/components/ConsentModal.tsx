"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Modal, Toggle } from "./ui";
import { api } from "@/lib/client";
import { useT } from "@/lib/i18n/client";
import type { Consent, ConsentScopes, Policy } from "./useUser";

// title / collects / never are translation keys.
const SCOPES: { key: keyof ConsentScopes; title: string; collects: string; never: string; policyKey: keyof Policy["monitoring"] }[] = [
  { key: "aiInteractions", title: "landing.consent.ai.title", collects: "landing.consent.ai.collects", never: "landing.consent.ai.never", policyKey: "aiInteractions" },
  { key: "keystrokes", title: "landing.consent.keys.title", collects: "landing.consent.keys.collects", never: "landing.consent.keys.never", policyKey: "keystrokes" },
  { key: "paste", title: "landing.consent.paste.title", collects: "landing.consent.paste.collects", never: "landing.consent.paste.never", policyKey: "paste" },
  { key: "tabActivity", title: "landing.consent.tabs.title", collects: "landing.consent.tabs.collects", never: "landing.consent.tabs.never", policyKey: "tabActivity" },
];

export const DEFAULT_SCOPES: ConsentScopes = { aiInteractions: true, keystrokes: true, paste: true, tabActivity: true };

export default function ConsentModal({ open, onClose, onGranted, policy, existing, thesisId }: { open: boolean; onClose: () => void; onGranted: (c: Consent) => void; policy: Policy; existing?: Consent | null; thesisId?: string }) {
  const t = useT();
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
      title={t("landing.consent.title")}
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">
            {t("landing.consent.notNow")}
          </button>
          <button onClick={accept} disabled={saving} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-50">
            {saving ? t("landing.consent.saving") : existing ? t("landing.consent.update") : t("landing.consent.accept")}
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3 p-3 bg-brand-50 rounded-xl mb-4">
        <ShieldCheck className="w-5 h-5 text-brand-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-brand-900">
          {t("landing.consent.introA")}
          <em>{t("landing.consent.introEm")}</em>
          {t("landing.consent.introB")}
          <strong>{policy.university}</strong>
          {t("landing.consent.introC")}
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
                    {t(s.title)}
                    {required && <span className="badge-info">{t("landing.consent.requiredByPolicy")}</span>}
                    {!enabledByPolicy && <span className="badge bg-gray-100 text-gray-500">{t("landing.consent.notCollected")}</span>}
                  </div>
                  <p className="text-xs text-gray-600 mt-1 flex gap-1.5">
                    <Eye className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
                    <span>{t(s.collects)}</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-1 flex gap-1.5">
                    <EyeOff className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
                    <span>{t(s.never)}</span>
                  </p>
                </div>
                <Toggle checked={value} disabled={!enabledByPolicy || required || dependsOff} onChange={(v) => setScopes((prev) => ({ ...prev, [s.key]: v }))} label={t(s.title)} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 mt-4">{t("landing.consent.footer")}</p>
    </Modal>
  );
}
