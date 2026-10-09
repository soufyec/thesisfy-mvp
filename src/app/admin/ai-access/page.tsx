"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { ConfirmDialog } from "@/components/editor/Dialogs";
import { Modal, Toast, Toggle } from "@/components/ui";
import { api } from "@/lib/client";
import { useT, useFormat } from "@/lib/i18n/client";
import { plural } from "@/lib/i18n/messages/admin";

type Backend = "thesisfic" | "anthropic" | "openai" | "mistral" | "google" | "azure_openai" | "foundry_claude";

interface IModel {
  id: string;
  provider: string;
  backend: Backend;
  backendName: string;
  billedBy: string;
  label: string;
  model: string;
  endpoint?: string;
  secretHint?: string;
  hasKey: boolean;
  region: string;
  inputPrice: number;
  outputPrice: number;
  enabled: boolean;
  isDefault: boolean;
  ready: boolean;
  lastTestedAt?: string;
  lastError?: string;
}

interface Funding {
  institutionPays: boolean;
  currency: "EUR" | "USD" | "GBP" | "CHF";
  usdRate: number;
  monthlyBudget: number;
  perStudentMonthly: number;
  atLimit: "block" | "own_account";
  alertPercent: number;
  updatedAt: string;
}

interface Spend {
  currency: string;
  monthlyBudget: number;
  perStudentMonthly: number;
  spent: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  projected: number;
  byModel: { id: string; label: string; backend: string; requests: number; spent: number; students: number }[];
  byStudent: { userId: string; name: string; requests: number; spent: number; allowanceUsed: number | null; lastAt: string }[];
  byDay: { day: string; spent: number; requests: number }[];
}

interface BackendDef { id: Backend; name: string; who: string; providers: string[]; endpointLabel?: string; endpointHint?: string; modelLabel: string; modelHint: string; keyLabel?: string; keyHint?: string; keyHintKey?: string }
/** `name`, `who`, `endpointLabel`, `modelLabel`, `keyLabel` and `keyHintKey` are message keys; hints are literal examples. */
const BACKENDS: BackendDef[] = [
  { id: "thesisfic", name: "admin.access.backend.thesisfic.name", who: "admin.access.backend.thesisfic.who", providers: ["anthropic", "openai", "google", "mistral"], modelLabel: "admin.access.modelId", modelHint: "claude-sonnet-5-5" },
  { id: "foundry_claude", name: "admin.access.backend.foundry.name", who: "admin.access.backend.microsoft.who", providers: ["anthropic"], endpointLabel: "admin.access.backend.foundry.endpoint", endpointHint: "my-university-ai", modelLabel: "admin.access.modelId", modelHint: "claude-sonnet-5-5", keyLabel: "admin.access.backend.foundry.key", keyHintKey: "admin.access.backend.foundry.keyHint" },
  { id: "azure_openai", name: "admin.access.backend.azure.name", who: "admin.access.backend.microsoft.who", providers: ["openai", "mistral"], endpointLabel: "admin.access.backend.azure.endpoint", endpointHint: "https://my-university-ai.openai.azure.com", modelLabel: "admin.access.deploymentName", modelHint: "gpt-4-1-students", keyLabel: "admin.access.backend.azure.key", keyHintKey: "admin.access.backend.azure.keyHint" },
  { id: "anthropic", name: "admin.access.backend.anthropic.name", who: "admin.access.backend.anthropic.who", providers: ["anthropic"], modelLabel: "admin.access.modelId", modelHint: "claude-sonnet-5-5", keyLabel: "admin.access.apiKey", keyHint: "sk-ant-…" },
  { id: "openai", name: "admin.access.backend.openai.name", who: "admin.access.backend.openai.who", providers: ["openai"], modelLabel: "admin.access.modelId", modelHint: "gpt-4.1", keyLabel: "admin.access.apiKey", keyHint: "sk-…" },
  { id: "mistral", name: "admin.access.backend.mistral.name", who: "admin.access.backend.mistral.who", providers: ["mistral"], modelLabel: "admin.access.modelId", modelHint: "mistral-medium-latest", keyLabel: "admin.access.apiKey" },
  { id: "google", name: "admin.access.backend.google.name", who: "admin.access.backend.google.who", providers: ["google"], modelLabel: "admin.access.modelId", modelHint: "gemini-2.5-flash", keyLabel: "admin.access.apiKey", keyHint: "AIza…" },
];
const FAMILIES: Record<string, string> = { anthropic: "Claude", openai: "GPT", google: "Gemini", mistral: "Mistral" };
const PRESET_PRICES: Record<string, [number, number]> = { "claude-opus-5-5": [4, 20], "claude-sonnet-5-5": [2, 10], "claude-haiku-4-5": [1, 5], "gpt-4.1": [2, 8], "gpt-4.1-mini": [0.4, 1.6], "gpt-4o": [2.5, 10], "gpt-4o-mini": [0.15, 0.6], "mistral-medium-latest": [0.4, 2], "mistral-large-latest": [2, 6], "mistral-small-latest": [0.1, 0.3], "gemini-2.5-pro": [1.25, 10], "gemini-2.5-flash": [0.3, 2.5] };

const EMPTY = { backend: "thesisfic" as Backend, provider: "anthropic", label: "", model: "claude-sonnet-5-5", endpoint: "", apiKey: "", region: "EU", inputPrice: 2, outputPrice: 10, enabled: true, isDefault: false };

export default function AdminAIAccessPage() {
  const t = useT();
  const fmt = useFormat();
  const money = (n: number) => fmt.number(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // The API sends the backend's English name and billing line; the page translates them by backend id.
  const backendName = (m: IModel) => (BACKENDS.some((b) => b.id === m.backend) ? t(`admin.access.backendMeta.${m.backend}.name`) : m.backendName);
  const billedBy = (m: IModel) => (BACKENDS.some((b) => b.id === m.backend) ? t(`admin.access.backendMeta.${m.backend}.billedBy`) : m.billedBy);
  const [funding, setFunding] = useState<Funding | null>(null);
  const [models, setModels] = useState<IModel[]>([]);
  const [spend, setSpend] = useState<Spend | null>(null);
  const [university, setUniversity] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [edit, setEdit] = useState<{ id?: string; form: typeof EMPTY } | null>(null);
  const [del, setDel] = useState<IModel | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ message: string; kind?: "info" | "success" | "error" } | null>(null);

  const load = useCallback(
    () =>
      api<{ funding: Funding; models: IModel[]; spend?: Spend; university: string; canManage: boolean }>("/api/ai/access")
        .then((d) => {
          setFunding(d.funding);
          setModels(d.models);
          setSpend(d.spend || null);
          setUniversity(d.university);
          setCanManage(d.canManage);
        })
        .catch(() => {}),
    []
  );
  useEffect(() => {
    load();
  }, [load]);

  const saveFunding = async () => {
    if (!funding) return;
    try {
      const d = await api<{ funding: Funding }>("/api/ai/access", { method: "PUT", json: funding });
      setFunding(d.funding);
      setToast({ message: t("admin.access.fundingSaved"), kind: "success" });
      load();
    } catch (e) {
      setToast({ message: (e as Error).message, kind: "error" });
    }
  };

  const saveModel = async (skipTest = false) => {
    if (!edit) return;
    setBusy(true);
    setError("");
    try {
      const body = { ...edit.form, apiKey: edit.form.apiKey || undefined, endpoint: edit.form.endpoint || undefined, skipTest };
      if (edit.id) await api(`/api/ai/access/models/${edit.id}`, { method: "PUT", json: body });
      else await api("/api/ai/access/models", { method: "POST", json: body });
      setEdit(null);
      setToast({ message: edit.id ? t("admin.access.modelUpdated") : t("admin.access.modelAdded"), kind: "success" });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const test = async (m: IModel) => {
    const r = await api<{ ok: boolean; error?: string }>(`/api/ai/access/models/${m.id}`, { method: "POST" }).catch((e) => ({ ok: false, error: (e as Error).message }));
    setToast({ message: r.ok ? t("admin.access.answered", { label: m.label }) : t("admin.access.testFailed", { error: r.error }), kind: r.ok ? "success" : "error" });
    load();
  };
  const toggle = async (m: IModel, patch: Partial<IModel>) => {
    await api(`/api/ai/access/models/${m.id}`, { method: "PUT", json: { ...patch, skipTest: true } }).catch((e) => setToast({ message: (e as Error).message, kind: "error" }));
    load();
  };
  const remove = () => {
    if (!del) return;
    api(`/api/ai/access/models/${del.id}`, { method: "DELETE" }).catch(() => {}).then(load);
  };

  const f = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (!edit) return;
    const raw = e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.type === "number" ? Number(e.target.value) : e.target.value;
    let form = { ...edit.form, [k]: raw };
    if (k === "backend") {
      const b = BACKENDS.find((x) => x.id === raw)!;
      if (!b.providers.includes(form.provider)) form = { ...form, provider: b.providers[0] };
    }
    if (k === "model" && PRESET_PRICES[String(raw)]) form = { ...form, inputPrice: PRESET_PRICES[String(raw)][0], outputPrice: PRESET_PRICES[String(raw)][1] };
    setEdit({ ...edit, form });
  };

  if (!funding) return <DashboardLayout><div className="text-gray-400 text-sm">{t("common.loading")}…</div></DashboardLayout>;
  const cur = funding.currency;
  const pct = spend && spend.monthlyBudget > 0 ? Math.min(100, Math.round((spend.spent / spend.monthlyBudget) * 100)) : null;
  const maxDay = spend ? Math.max(0.01, ...spend.byDay.map((d) => d.spent)) : 1;
  const backendDef = edit ? BACKENDS.find((b) => b.id === edit.form.backend)! : null;

  return (
    <DashboardLayout>
      <div className="max-w-6xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{t("admin.access.title")}</h1>
            <p className="text-gray-500 mt-1 text-sm">{t("admin.access.subtitle", { university })}</p>
          </div>
          {canManage && <button onClick={() => { setError(""); setEdit({ form: { ...EMPTY } }); }} className="btn-primary !px-4"><Plus className="w-4 h-4 mr-1" />{t("admin.access.addModel")}</button>}
        </div>

        {/* Spend this month */}
        {spend && (
          <section className="grid sm:grid-cols-4 gap-3">
            <div className="card p-4"><div className="text-xs text-gray-500">{t("admin.access.spent")}</div><div className="text-2xl font-bold mt-1">{money(spend.spent)} <span className="text-sm font-normal text-gray-400">{cur}</span></div>{pct !== null && <div className="mt-2"><div className="h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full ${pct >= 100 ? "bg-red-500" : pct >= funding.alertPercent ? "bg-amber-400" : "bg-brand-500"}`} style={{ width: `${pct}%` }} /></div><div className="text-[11px] text-gray-400 mt-1">{t("admin.access.budgetPct", { pct, budget: fmt.number(spend.monthlyBudget), cur })}</div></div>}</div>
            <div className="card p-4"><div className="text-xs text-gray-500">{t("admin.access.projected")}</div><div className="text-2xl font-bold mt-1">{money(spend.projected)} <span className="text-sm font-normal text-gray-400">{cur}</span></div><div className="text-[11px] text-gray-400 mt-2">{spend.monthlyBudget > 0 && spend.projected > spend.monthlyBudget ? <span className="text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{t("admin.access.overBudget")}</span> : t("admin.access.linear")}</div></div>
            <div className="card p-4"><div className="text-xs text-gray-500">{t("admin.access.requestsLabel")}</div><div className="text-2xl font-bold mt-1">{fmt.number(spend.requests)}</div><div className="text-[11px] text-gray-400 mt-2">{t("admin.access.tokens", { input: fmt.number(spend.inputTokens / 1000, { maximumFractionDigits: 0 }), output: fmt.number(spend.outputTokens / 1000, { maximumFractionDigits: 0 }) })}</div></div>
            <div className="card p-4"><div className="text-xs text-gray-500">{t("admin.access.studentsUsing")}</div><div className="text-2xl font-bold mt-1">{spend.byStudent.length}</div><div className="text-[11px] text-gray-400 mt-2">{spend.byStudent.length ? t("admin.access.avgEach", { avg: money(spend.spent / spend.byStudent.length), cur }) : t("admin.access.noUsage")}</div></div>
          </section>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Funding settings */}
          <section className="card p-5 space-y-4 lg:col-span-1">
            <h2 className="font-semibold">{t("admin.access.whoPays")}</h2>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"><div><div className="text-sm font-medium">{t("admin.access.uniProvides")}</div><div className="text-xs text-gray-500">{t("admin.access.uniProvidesDesc")}</div></div><Toggle checked={funding.institutionPays} disabled={!canManage} onChange={(v) => setFunding({ ...funding, institutionPays: v })} /></div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="text-xs text-gray-500">{t("admin.access.currency")}<select disabled={!canManage} value={funding.currency} onChange={(e) => setFunding({ ...funding, currency: e.target.value as Funding["currency"] })} className="input-field !py-2 mt-1">{["EUR", "USD", "GBP", "CHF"].map((c) => <option key={c}>{c}</option>)}</select></label>
              <label className="text-xs text-gray-500">{funding.currency === "USD" ? t("admin.access.usdRateUsd") : t("admin.access.usdRate", { cur: funding.currency })}<input type="number" step="0.01" disabled={!canManage} value={funding.usdRate} onChange={(e) => setFunding({ ...funding, usdRate: Number(e.target.value) })} className="input-field !py-2 mt-1" /></label>
              <label className="text-xs text-gray-500">{t("admin.access.monthlyBudget", { cur })}<input type="number" min={0} disabled={!canManage} value={funding.monthlyBudget} onChange={(e) => setFunding({ ...funding, monthlyBudget: Number(e.target.value) })} className="input-field !py-2 mt-1" /></label>
              <label className="text-xs text-gray-500">{t("admin.access.perStudent", { cur })}<input type="number" min={0} step="0.5" disabled={!canManage} value={funding.perStudentMonthly} onChange={(e) => setFunding({ ...funding, perStudentMonthly: Number(e.target.value) })} className="input-field !py-2 mt-1" /></label>
              <label className="text-xs text-gray-500 col-span-2">{t("admin.access.atLimit")}<select disabled={!canManage} value={funding.atLimit} onChange={(e) => setFunding({ ...funding, atLimit: e.target.value as Funding["atLimit"] })} className="input-field !py-2 mt-1"><option value="own_account">{t("admin.access.atLimitOwn")}</option><option value="block">{t("admin.access.atLimitBlock")}</option></select></label>
              <label className="text-xs text-gray-500 col-span-2">{t("admin.access.alertAt", { pct: funding.alertPercent })}<input type="range" min={0} max={100} step={5} disabled={!canManage} value={funding.alertPercent} onChange={(e) => setFunding({ ...funding, alertPercent: Number(e.target.value) })} className="w-full accent-brand-600 mt-1" /></label>
            </div>
            <p className="text-[11px] text-gray-400">{t("admin.access.sessionCost", { low: money(0.03 * funding.usdRate * 1.5), high: money(0.3 * funding.usdRate), cur })}</p>
            {canManage && <button onClick={saveFunding} className="btn-primary w-full !py-2 text-sm">{t("admin.access.saveFunding")}</button>}
          </section>

          {/* Models */}
          <section className="lg:col-span-2 space-y-3">
            <h2 className="font-semibold">{t("admin.access.modelsTitle")}</h2>
            {models.length === 0 && <div className="card p-6 text-sm text-gray-500">{t("admin.access.noModels")}</div>}
            {models.map((m) => (
              <div key={m.id} className={`card p-4 ${!m.enabled ? "opacity-60" : ""}`}>
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0" style={{ background: { anthropic: "#d97757", openai: "#10a37f", google: "#4285f4", mistral: "#ff7000" }[m.provider] }}>{FAMILIES[m.provider]?.[0]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{m.label}</h3>
                      {m.isDefault && <span className="badge bg-emerald-50 text-emerald-700">{t("admin.access.defaultAuto")}</span>}
                      {m.ready ? <span className="badge-success flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{t("admin.access.ready")}</span> : <span className="badge-warning">{!m.enabled ? t("admin.access.disabledBadge") : m.lastError ? t("admin.access.lastError") : m.backend === "thesisfic" ? t("admin.access.keyMissingServer") : t("admin.access.keyMissing")}</span>}
                      {m.lastError && <span className="badge-danger">{t("admin.access.lastError")}</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{backendName(m)} · <span className="font-mono">{m.model}</span>{m.endpoint && <> · <span className="font-mono">{m.endpoint}</span></>} · {m.region}</div>
                    <div className="text-xs text-gray-500">{t("admin.access.listPrice", { billedBy: billedBy(m), input: m.inputPrice, output: m.outputPrice })}{m.secretHint && <> · {t("admin.access.keyHint", { hint: m.secretHint })}</>}{m.lastTestedAt && <> · {t("admin.access.tested", { date: fmt.date(m.lastTestedAt) })}</>}</div>
                    {m.lastError && <div className="text-xs text-red-600 mt-1">{m.lastError}</div>}
                    {spend && (() => { const u = spend.byModel.find((x) => x.id === m.id); return u && u.requests ? <div className="text-xs text-gray-400 mt-1">{t("admin.access.thisMonth", { requests: plural(t, "admin.requests", u.requests), spent: money(u.spent), cur, students: plural(t, "admin.students", u.students) })}</div> : null; })()}
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1 flex-shrink-0 sm:ml-auto">
                      <Toggle checked={m.enabled} onChange={(v) => toggle(m, { enabled: v })} />
                      {!m.isDefault && <button onClick={() => toggle(m, { isDefault: true })} className="text-xs px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200" title={t("admin.access.useForAuto")}>{t("admin.access.makeDefault")}</button>}
                      <button onClick={() => test(m)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title={t("admin.access.test")} aria-label={t("admin.access.test")}><RefreshCw className="w-4 h-4" /></button>
                      <button onClick={() => { setError(""); setEdit({ id: m.id, form: { backend: m.backend, provider: m.provider, label: m.label, model: m.model, endpoint: m.endpoint || "", apiKey: "", region: m.region, inputPrice: m.inputPrice, outputPrice: m.outputPrice, enabled: m.enabled, isDefault: m.isDefault } }); }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title={t("common.edit")} aria-label={t("common.edit")}><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => setDel(m)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" title={t("common.remove")} aria-label={t("common.remove")}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div className="card p-4 text-xs text-gray-500 space-y-1">
              <div className="font-medium text-gray-700">{t("admin.access.waysTitle")}</div>
              <p><strong>{t("admin.access.way1Name")}</strong>{t("admin.access.way1Desc")}</p>
              <p><strong>{t("admin.access.way2Name")}</strong>{t("admin.access.way2Desc")}</p>
              <p><strong>{t("admin.access.way3Name")}</strong>{t("admin.access.way3Desc")}</p>
            </div>
          </section>
        </div>

        {/* Usage detail */}
        {spend && (spend.byDay.length > 0 || spend.byStudent.length > 0) && (
          <div className="grid lg:grid-cols-2 gap-6">
            <section className="card p-5">
              <h2 className="font-semibold mb-3">{t("admin.access.dailyTitle", { cur })}</h2>
              <div className="flex items-end gap-1 h-32">
                {spend.byDay.map((d) => (
                  <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full" title={t("admin.access.dayTitle", { day: d.day, spent: money(d.spent), cur, requests: plural(t, "admin.requests", d.requests) })}>
                    <div className="w-full bg-brand-500/80 rounded-t" style={{ height: `${Math.max(2, (d.spent / maxDay) * 100)}%` }} />
                    <div className="text-[9px] text-gray-400 mt-1">{d.day.slice(8)}</div>
                  </div>
                ))}
              </div>
            </section>
            <section className="card p-5">
              <h2 className="font-semibold mb-3">{t("admin.access.byStudent")}</h2>
              <div className="divide-y divide-gray-100 text-sm max-h-64 overflow-y-auto">
                {spend.byStudent.map((s) => (
                  <div key={s.userId} className="py-2 flex items-center gap-3">
                    <div className="flex-1 min-w-0"><div className="font-medium truncate">{s.name}</div><div className="text-[11px] text-gray-400">{t("admin.access.lastUsed", { requests: plural(t, "admin.requests", s.requests), date: fmt.date(s.lastAt) })}</div></div>
                    <div className="text-right"><div className="font-medium">{money(s.spent)} {cur}</div>{s.allowanceUsed !== null && <div className={`text-[11px] ${s.allowanceUsed >= 100 ? "text-red-600" : "text-gray-400"}`}>{t("admin.access.allowanceUsed", { n: s.allowanceUsed })}</div>}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? t("admin.access.modalEdit") : t("admin.access.modalAdd")} size="lg" footer={<><button onClick={() => setEdit(null)} className="btn-outline !py-2 !px-4 text-sm">{t("common.cancel")}</button>{backendDef?.id !== "thesisfic" && <button disabled={busy} onClick={() => saveModel(true)} className="btn-outline !py-2 !px-4 text-sm">{t("admin.access.saveWithoutTest")}</button>}<button disabled={busy} onClick={() => saveModel(false)} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40">{busy ? t("admin.access.testing") : edit?.id ? t("common.save") : t("admin.access.testAndAdd")}</button></>}>
        {edit && backendDef && (
          <div className="space-y-3 text-sm">
            {error && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs">{error}</div>}
            <label className="block text-xs text-gray-500">{t("admin.access.whoRuns")}<select value={edit.form.backend} onChange={f("backend")} className="input-field !py-2 mt-1">{BACKENDS.map((b) => <option key={b.id} value={b.id}>{t(b.name)}</option>)}</select><span className="block mt-1 text-[11px] text-gray-400">{t(backendDef.who)}</span></label>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-xs text-gray-500">{t("admin.access.family")}<select value={edit.form.provider} onChange={f("provider")} className="input-field !py-2 mt-1">{backendDef.providers.map((p) => <option key={p} value={p}>{FAMILIES[p]}</option>)}</select></label>
              <label className="block text-xs text-gray-500">{t("admin.access.labelStudents")}<input value={edit.form.label} onChange={f("label")} placeholder={t("admin.access.labelPlaceholder", { family: FAMILIES[edit.form.provider] })} className="input-field !py-2 mt-1" /></label>
              <label className="block text-xs text-gray-500">{t(backendDef.modelLabel)}<input list="model-presets" value={edit.form.model} onChange={f("model")} placeholder={backendDef.modelHint} className="input-field !py-2 mt-1 font-mono text-xs" /><datalist id="model-presets">{Object.keys(PRESET_PRICES).map((m) => <option key={m} value={m} />)}</datalist></label>
              <label className="block text-xs text-gray-500">{t("admin.access.region")}<input value={edit.form.region} onChange={f("region")} placeholder="EU (France Central)" className="input-field !py-2 mt-1" /></label>
              {backendDef.endpointLabel && <label className="block text-xs text-gray-500 sm:col-span-2">{t(backendDef.endpointLabel)}<input value={edit.form.endpoint} onChange={f("endpoint")} placeholder={backendDef.endpointHint} className="input-field !py-2 mt-1 font-mono text-xs" /></label>}
              {backendDef.keyLabel && <label className="block text-xs text-gray-500 sm:col-span-2">{t(backendDef.keyLabel)}{edit.id && <span className="text-gray-400">{t("admin.access.keepKey")}</span>}<input type="password" autoComplete="off" value={edit.form.apiKey} onChange={f("apiKey")} placeholder={backendDef.keyHintKey ? t(backendDef.keyHintKey) : backendDef.keyHint || ""} className="input-field !py-2 mt-1 font-mono text-xs" /></label>}
              <label className="block text-xs text-gray-500">{t("admin.access.inputPrice")}<input type="number" step="0.01" min={0} value={edit.form.inputPrice} onChange={f("inputPrice")} className="input-field !py-2 mt-1" /></label>
              <label className="block text-xs text-gray-500">{t("admin.access.outputPrice")}<input type="number" step="0.01" min={0} value={edit.form.outputPrice} onChange={f("outputPrice")} className="input-field !py-2 mt-1" /></label>
            </div>
            <div className="flex items-center gap-6 pt-1">
              <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={edit.form.enabled} onChange={f("enabled")} />{t("admin.access.enabledForStudents")}</label>
              <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={edit.form.isDefault} onChange={f("isDefault")} />{t("admin.access.useForAutoQuoted")}</label>
            </div>
            <p className="text-[11px] text-gray-400">{t("admin.access.pricesNote")}</p>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={!!del} title={t("admin.access.removeTitle")} body={t("admin.access.removeBody", { label: del?.label || "" })} confirmLabel={t("common.remove")} danger onConfirm={remove} onClose={() => setDel(null)} />
      {toast && <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}
    </DashboardLayout>
  );
}
