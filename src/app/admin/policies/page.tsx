"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Toggle } from "@/components/ui";
import { useUser, type Policy } from "@/components/useUser";
import { api } from "@/lib/client";
import { useT, useFormat } from "@/lib/i18n/client";
import { modeLabel } from "@/lib/i18n/messages/admin";
import type { RubricCriterion } from "@/lib/db";

const PROVIDERS = [["anthropic", "Claude (Anthropic)"], ["openai", "ChatGPT / GPT (OpenAI)"], ["google", "Gemini (Google)"], ["mistral", "Mistral / Le Chat"]];
const MODES = ["chat", "brainstorm", "outline", "critique", "grammar", "summarize", "explain", "citations", "gaps", "paraphrase_check"];
const MONITORING: [keyof Policy["monitoring"], string, string][] = [["keystrokes", "admin.policies.monKeystrokes", "admin.policies.monKeystrokesDesc"], ["paste", "admin.policies.monPaste", "admin.policies.monPasteDesc"], ["aiInteractions", "admin.policies.monAi", "admin.policies.monAiDesc"], ["tabActivity", "admin.policies.monTabs", "admin.policies.monTabsDesc"]];

export default function PoliciesPage() {
  const { user } = useUser();
  const t = useT();
  const fmt = useFormat();
  const [p, setP] = useState<Policy | null>(null);
  const [saved, setSaved] = useState("");
  const canEdit = user?.role === "admin";

  useEffect(() => {
    api<{ policy: Policy }>("/api/policies").then((d) => setP(d.policy)).catch(() => {});
  }, []);

  const save = async () => {
    if (!p) return;
    try {
      const d = await api<{ policy: Policy }>("/api/policies", { method: "PUT", json: p });
      setP(d.policy);
      setSaved(t("admin.policies.saved"));
    } catch (e) {
      setSaved((e as Error).message);
    }
    setTimeout(() => setSaved(""), 3000);
  };

  if (!p) return <DashboardLayout><div className="text-gray-400 text-sm">{t("common.loading")}…</div></DashboardLayout>;
  const toggleIn = (key: "allowedProviders" | "allowedModes", v: string) => setP({ ...p, [key]: p[key].includes(v) ? p[key].filter((x) => x !== v) : [...p[key], v] });

  return (
    <DashboardLayout>
      <div className="max-w-3xl">
        <div className="mb-6"><h1 className="text-2xl font-bold">{t("admin.policies.title")}</h1><p className="text-gray-500 mt-1 text-sm">{t("admin.policies.updated", { university: p.university, date: fmt.date(p.updatedAt, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) })}{!canEdit && t("admin.policies.readOnly")}</p></div>
        {saved && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">{saved}</div>}
        <div className="space-y-5">
          <div className="card p-5 sm:p-6">
            <h2 className="font-semibold mb-1">{t("admin.policies.maxTitle")}</h2>
            <p className="text-sm text-gray-500 mb-4">{t("admin.policies.maxDesc")}</p>
            <div className="flex items-center gap-4"><input type="range" min={0} max={50} aria-label={t("admin.policies.maxTitle")} disabled={!canEdit} value={p.maxAiUsagePercent} onChange={(e) => setP({ ...p, maxAiUsagePercent: Number(e.target.value) })} className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-600" /><span className="text-2xl font-bold text-brand-600 w-16 text-right">{p.maxAiUsagePercent}%</span></div>
          </div>

          <div className="card p-5 sm:p-6">
            <h2 className="font-semibold mb-1">{t("admin.policies.providersTitle")}</h2>
            <p className="text-sm text-gray-500 mb-4">{t("admin.policies.providersDesc")}</p>
            <div className="space-y-2">
              {PROVIDERS.map(([id, label]) => (
                <div key={id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"><span className="text-sm">{label}</span><Toggle checked={p.allowedProviders.includes(id)} disabled={!canEdit} onChange={() => toggleIn("allowedProviders", id)} /></div>
              ))}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"><div><div className="text-sm font-medium">{t("admin.policies.byokTitle")}</div><div className="text-xs text-gray-500">{t("admin.policies.byokDesc")}</div></div><Toggle checked={p.allowBYOK} disabled={!canEdit} onChange={(v) => setP({ ...p, allowBYOK: v })} /></div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"><div><div className="text-sm font-medium">{t("admin.policies.blockTitle")}</div><div className="text-xs text-gray-500">{t("admin.policies.blockDesc")}</div></div><Toggle checked={p.blockGeneration} disabled={!canEdit} onChange={(v) => setP({ ...p, blockGeneration: v })} /></div>
            </div>
          </div>

          <div className="card p-5 sm:p-6 border-emerald-100">
            <h2 className="font-semibold mb-1">{t("glossary.copilot")}</h2>
            <p className="text-sm text-gray-500 mb-4">{t("admin.policies.copilotDescPre")}<a href="/admin/ai-access" className="text-brand-600 underline">{t("admin.policies.copilotLink")}</a>{t("admin.policies.copilotDescPost")}</p>
            <div className="flex items-center justify-between p-3 bg-emerald-50/60 rounded-xl"><div><div className="text-sm font-medium">{t("admin.policies.copilotOfferTitle")}</div><div className="text-xs text-gray-500">{t("admin.policies.copilotOfferDesc")}</div></div><Toggle checked={!!p.researchCopilot} disabled={!canEdit} onChange={(v) => setP({ ...p, researchCopilot: v })} /></div>
            <ul className="mt-3 text-xs text-gray-500 space-y-1 list-disc pl-5">
              <li>{t("admin.policies.copilotBullet1")}</li>
              <li>{t("admin.policies.copilotBullet2")}</li>
              <li>{t("admin.policies.copilotBullet3")}</li>
            </ul>
          </div>

          <div className="card p-5 sm:p-6">
            <h2 className="font-semibold mb-1">{t("admin.policies.modesTitle")}</h2>
            <p className="text-sm text-gray-500 mb-4">{t("admin.policies.modesDesc")}</p>
            <div className="flex flex-wrap gap-2">
              {MODES.map((id) => <button key={id} disabled={!canEdit} onClick={() => toggleIn("allowedModes", id)} className={`px-3 py-1.5 rounded-full text-xs border ${p.allowedModes.includes(id) ? "bg-brand-600 border-brand-600 text-white" : "border-gray-200 text-gray-600"}`}>{modeLabel(t, id)}</button>)}
            </div>
          </div>

          <div className="card p-5 sm:p-6">
            <h2 className="font-semibold mb-1">{t("admin.policies.sensitivityTitle")}</h2>
            <div className="grid grid-cols-3 gap-3 mt-3">
              {([["low", "admin.level.low", "admin.policies.sensLowDesc"], ["medium", "admin.level.medium", "admin.policies.sensMediumDesc"], ["high", "admin.level.high", "admin.policies.sensHighDesc"]] as const).map(([v, l, d]) => <button key={v} disabled={!canEdit} onClick={() => setP({ ...p, flagSensitivity: v })} className={`p-3 rounded-xl border-2 text-left ${p.flagSensitivity === v ? "border-brand-500 bg-brand-50" : "border-gray-200"}`}><div className="text-sm font-medium">{t(l)}</div><div className="text-xs text-gray-500 mt-0.5">{t(d)}</div></button>)}
            </div>
          </div>

          <div className="card p-5 sm:p-6">
            <h2 className="font-semibold mb-1">{t("admin.policies.monitoringTitle")}</h2>
            <p className="text-sm text-gray-500 mb-4">{t("admin.policies.monitoringDesc")}</p>
            <div className="space-y-2">
              {MONITORING.map(([k, l, d]) => <div key={k} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"><div><div className="text-sm">{t(l)}</div><div className="text-xs text-gray-500">{t(d)}</div></div><Toggle checked={p.monitoring[k]} disabled={!canEdit} onChange={(v) => setP({ ...p, monitoring: { ...p.monitoring, [k]: v } })} /></div>)}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"><div><div className="text-sm font-medium">{t("admin.policies.requireConsent")}</div><div className="text-xs text-gray-500">{t("admin.policies.requireConsentDesc")}</div></div><Toggle checked={p.requireConsent} disabled={!canEdit} onChange={(v) => setP({ ...p, requireConsent: v })} /></div>
            </div>
          </div>

          {canEdit && <button onClick={save} className="btn-primary w-full">{t("admin.policies.save")}</button>}

          <ReviewerRubricCard canEdit={canEdit} />
        </div>
      </div>
    </DashboardLayout>
  );
}

/** Weights 0–3 per reviewer criterion, saved through PUT /api/policies/rubric (0 disables a criterion). */
function ReviewerRubricCard({ canEdit }: { canEdit: boolean }) {
  const t = useT();
  const [rubric, setRubric] = useState<RubricCriterion[] | null>(null);
  const [isDefault, setIsDefault] = useState(true);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ rubric: RubricCriterion[]; isDefault: boolean }>("/api/policies/rubric").then((d) => { setRubric(d.rubric); setIsDefault(d.isDefault); }).catch(() => {});
  }, []);

  const submit = async (body: { rubric: RubricCriterion[] } | { reset: true }) => {
    setSaving(true);
    try {
      const d = await api<{ rubric: RubricCriterion[]; isDefault: boolean }>("/api/policies/rubric", { method: "PUT", json: body });
      setRubric(d.rubric);
      setIsDefault(d.isDefault);
      setMsg(t("admin.policies.rubricSaved"));
    } catch (e) {
      setMsg((e as Error).message);
    }
    setSaving(false);
    setTimeout(() => setMsg(""), 3000);
  };

  if (!rubric) return null;
  return (
    <div className="card p-5 sm:p-6">
      <h2 className="font-semibold mb-1">{t("admin.policies.rubricTitle")}</h2>
      <p className="text-sm text-gray-500 mb-4">{t("admin.policies.rubricDesc")}{isDefault ? t("admin.policies.rubricDefault") : ""}</p>
      {msg && <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">{msg}</div>}
      <div className="space-y-2">
        {rubric.map((c) => (
          <div key={c.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{c.label}</div>
              <div className="text-xs text-gray-500">{c.description}</div>
            </div>
            <div className="flex gap-1" role="group" aria-label={t("admin.policies.weightGroup", { label: c.label })}>
              {[0, 1, 2, 3].map((w) => (
                <button key={w} type="button" disabled={!canEdit} aria-pressed={c.weight === w} aria-label={t("admin.policies.weightButton", { label: c.label, n: w })} onClick={() => setRubric(rubric.map((x) => (x.id === c.id ? { ...x, weight: w } : x)))} className={`w-8 h-8 rounded-lg text-xs border ${c.weight === w ? "bg-brand-600 border-brand-600 text-white" : "border-gray-200 text-gray-600"} disabled:opacity-60`}>
                  {w}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={() => submit({ rubric })} disabled={saving || !rubric.some((c) => c.weight > 0)} className="btn-primary flex-1">{t("admin.policies.rubricSave")}</button>
          <button type="button" onClick={() => submit({ reset: true })} disabled={saving || isDefault} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40">{t("admin.policies.rubricReset")}</button>
        </div>
      )}
    </div>
  );
}
