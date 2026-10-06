"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { ConfirmDialog } from "@/components/editor/Dialogs";
import { Modal, Toast, Toggle } from "@/components/ui";
import { api } from "@/lib/client";

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

const BACKENDS: { id: Backend; name: string; who: string; providers: string[]; endpointLabel?: string; endpointHint?: string; modelLabel: string; modelHint: string; keyLabel?: string; keyHint?: string }[] = [
  { id: "thesisfic", name: "Thesisfic contract", who: "Thesisfic invoices the university at provider list price. Nothing to configure.", providers: ["anthropic", "openai", "google", "mistral"], modelLabel: "Model id", modelHint: "claude-sonnet-5-5" },
  { id: "foundry_claude", name: "Claude in Microsoft Foundry", who: "Runs in your Azure subscription; Microsoft bills it, like Copilot.", providers: ["anthropic"], endpointLabel: "Foundry resource name", endpointHint: "my-university-ai", modelLabel: "Model id", modelHint: "claude-sonnet-5-5", keyLabel: "Foundry API key", keyHint: "From the resource's Keys and Endpoint page" },
  { id: "azure_openai", name: "Azure OpenAI (GPT)", who: "Runs in your Azure subscription; Microsoft bills it, like Copilot.", providers: ["openai", "mistral"], endpointLabel: "Azure resource URL", endpointHint: "https://my-university-ai.openai.azure.com", modelLabel: "Deployment name", modelHint: "gpt-4-1-students", keyLabel: "Azure OpenAI key", keyHint: "Key 1 or Key 2 of the resource" },
  { id: "anthropic", name: "Anthropic (university account)", who: "Anthropic invoices the university's own API account.", providers: ["anthropic"], modelLabel: "Model id", modelHint: "claude-sonnet-5-5", keyLabel: "API key", keyHint: "sk-ant-…" },
  { id: "openai", name: "OpenAI (university account)", who: "OpenAI invoices the university's own API account.", providers: ["openai"], modelLabel: "Model id", modelHint: "gpt-4.1", keyLabel: "API key", keyHint: "sk-…" },
  { id: "mistral", name: "Mistral (university account)", who: "Mistral invoices the university's own API account. EU-hosted.", providers: ["mistral"], modelLabel: "Model id", modelHint: "mistral-medium-latest", keyLabel: "API key" },
  { id: "google", name: "Google AI (university account)", who: "Google invoices the university's own account.", providers: ["google"], modelLabel: "Model id", modelHint: "gemini-2.5-flash", keyLabel: "API key", keyHint: "AIza…" },
];
const FAMILIES: Record<string, string> = { anthropic: "Claude", openai: "GPT", google: "Gemini", mistral: "Mistral" };
const PRESET_PRICES: Record<string, [number, number]> = { "claude-opus-5-5": [4, 20], "claude-sonnet-5-5": [2, 10], "claude-haiku-4-5": [1, 5], "gpt-4.1": [2, 8], "gpt-4.1-mini": [0.4, 1.6], "gpt-4o": [2.5, 10], "gpt-4o-mini": [0.15, 0.6], "mistral-medium-latest": [0.4, 2], "mistral-large-latest": [2, 6], "mistral-small-latest": [0.1, 0.3], "gemini-2.5-pro": [1.25, 10], "gemini-2.5-flash": [0.3, 2.5] };

const EMPTY = { backend: "thesisfic" as Backend, provider: "anthropic", label: "", model: "claude-sonnet-5-5", endpoint: "", apiKey: "", region: "EU", inputPrice: 2, outputPrice: 10, enabled: true, isDefault: false };

export default function AdminAIAccessPage() {
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
      setToast({ message: "Funding settings saved. Students see the change on their next request.", kind: "success" });
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
      setToast({ message: edit.id ? "Model updated" : "Model added: students can pick it now", kind: "success" });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const test = async (m: IModel) => {
    const r = await api<{ ok: boolean; error?: string }>(`/api/ai/access/models/${m.id}`, { method: "POST" }).catch((e) => ({ ok: false, error: (e as Error).message }));
    setToast({ message: r.ok ? `${m.label} answered.` : `Test failed: ${r.error}`, kind: r.ok ? "success" : "error" });
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

  if (!funding) return <DashboardLayout><div className="text-gray-400 text-sm">Loading…</div></DashboardLayout>;
  const cur = funding.currency;
  const pct = spend && spend.monthlyBudget > 0 ? Math.min(100, Math.round((spend.spent / spend.monthlyBudget) * 100)) : null;
  const maxDay = spend ? Math.max(0.01, ...spend.byDay.map((d) => d.spent)) : 1;
  const backendDef = edit ? BACKENDS.find((b) => b.id === edit.form.backend)! : null;

  return (
    <DashboardLayout>
      <div className="max-w-6xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">AI access &amp; billing</h1>
            <p className="text-gray-500 mt-1 text-sm">The models {university} offers its students and pays for, like Copilot inside a company. Students can still bring their own account; the university never pays for that.</p>
          </div>
          {canManage && <button onClick={() => { setError(""); setEdit({ form: { ...EMPTY } }); }} className="btn-primary !px-4"><Plus className="w-4 h-4 mr-1" />Add model</button>}
        </div>

        {/* Spend this month */}
        {spend && (
          <section className="grid sm:grid-cols-4 gap-3">
            <div className="card p-4"><div className="text-xs text-gray-500">Spent this month</div><div className="text-2xl font-bold mt-1">{spend.spent.toFixed(2)} <span className="text-sm font-normal text-gray-400">{cur}</span></div>{pct !== null && <div className="mt-2"><div className="h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full ${pct >= 100 ? "bg-red-500" : pct >= funding.alertPercent ? "bg-amber-400" : "bg-brand-500"}`} style={{ width: `${pct}%` }} /></div><div className="text-[11px] text-gray-400 mt-1">{pct}% of {spend.monthlyBudget} {cur} budget</div></div>}</div>
            <div className="card p-4"><div className="text-xs text-gray-500">Projected month end</div><div className="text-2xl font-bold mt-1">{spend.projected.toFixed(2)} <span className="text-sm font-normal text-gray-400">{cur}</span></div><div className="text-[11px] text-gray-400 mt-2">{spend.monthlyBudget > 0 && spend.projected > spend.monthlyBudget ? <span className="text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Over budget at this pace</span> : "Linear projection from days so far"}</div></div>
            <div className="card p-4"><div className="text-xs text-gray-500">Requests</div><div className="text-2xl font-bold mt-1">{spend.requests}</div><div className="text-[11px] text-gray-400 mt-2">{(spend.inputTokens / 1000).toFixed(0)}k in · {(spend.outputTokens / 1000).toFixed(0)}k out tokens</div></div>
            <div className="card p-4"><div className="text-xs text-gray-500">Students using it</div><div className="text-2xl font-bold mt-1">{spend.byStudent.length}</div><div className="text-[11px] text-gray-400 mt-2">{spend.byStudent.length ? `${(spend.spent / spend.byStudent.length).toFixed(2)} ${cur} each on average` : "No usage yet this month"}</div></div>
          </section>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Funding settings */}
          <section className="card p-5 space-y-4 lg:col-span-1">
            <h2 className="font-semibold">Who pays</h2>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"><div><div className="text-sm font-medium">University provides models</div><div className="text-xs text-gray-500">Students use them first; their own accounts are optional.</div></div><Toggle checked={funding.institutionPays} disabled={!canManage} onChange={(v) => setFunding({ ...funding, institutionPays: v })} /></div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="text-xs text-gray-500">Currency<select disabled={!canManage} value={funding.currency} onChange={(e) => setFunding({ ...funding, currency: e.target.value as Funding["currency"] })} className="input-field !py-2 mt-1">{["EUR", "USD", "GBP", "CHF"].map((c) => <option key={c}>{c}</option>)}</select></label>
              <label className="text-xs text-gray-500">1 USD in {funding.currency}<input type="number" step="0.01" disabled={!canManage} value={funding.usdRate} onChange={(e) => setFunding({ ...funding, usdRate: Number(e.target.value) })} className="input-field !py-2 mt-1" /></label>
              <label className="text-xs text-gray-500">Monthly budget ({cur}, 0 = none)<input type="number" min={0} disabled={!canManage} value={funding.monthlyBudget} onChange={(e) => setFunding({ ...funding, monthlyBudget: Number(e.target.value) })} className="input-field !py-2 mt-1" /></label>
              <label className="text-xs text-gray-500">Per student / month ({cur}, 0 = none)<input type="number" min={0} step="0.5" disabled={!canManage} value={funding.perStudentMonthly} onChange={(e) => setFunding({ ...funding, perStudentMonthly: Number(e.target.value) })} className="input-field !py-2 mt-1" /></label>
              <label className="text-xs text-gray-500 col-span-2">When an allowance runs out<select disabled={!canManage} value={funding.atLimit} onChange={(e) => setFunding({ ...funding, atLimit: e.target.value as Funding["atLimit"] })} className="input-field !py-2 mt-1"><option value="own_account">Fall back to the student&apos;s own account</option><option value="block">Pause the assistant until next month</option></select></label>
              <label className="text-xs text-gray-500 col-span-2">Alert administrators at {funding.alertPercent}% of budget<input type="range" min={0} max={100} step={5} disabled={!canManage} value={funding.alertPercent} onChange={(e) => setFunding({ ...funding, alertPercent: Number(e.target.value) })} className="w-full accent-brand-600 mt-1" /></label>
            </div>
            <p className="text-[11px] text-gray-400">A typical thesis session (10 questions, ~30k tokens) costs about {(0.03 * funding.usdRate * 1.5).toFixed(2)}–{(0.3 * funding.usdRate).toFixed(2)} {cur} depending on the model. Allowances reset on the 1st (UTC).</p>
            {canManage && <button onClick={saveFunding} className="btn-primary w-full !py-2 text-sm">Save funding settings</button>}
          </section>

          {/* Models */}
          <section className="lg:col-span-2 space-y-3">
            <h2 className="font-semibold">Models offered to students</h2>
            {models.length === 0 && <div className="card p-6 text-sm text-gray-500">No models yet. Add one from Thesisfic&apos;s contract (nothing to configure), or connect your Microsoft Foundry / Azure OpenAI resource so Microsoft bills it with the rest of your tenant.</div>}
            {models.map((m) => (
              <div key={m.id} className={`card p-4 ${!m.enabled ? "opacity-60" : ""}`}>
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0" style={{ background: { anthropic: "#d97757", openai: "#10a37f", google: "#4285f4", mistral: "#ff7000" }[m.provider] }}>{FAMILIES[m.provider]?.[0]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{m.label}</h3>
                      {m.isDefault && <span className="badge bg-emerald-50 text-emerald-700">Default (Auto)</span>}
                      {m.ready ? <span className="badge-success flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Ready</span> : <span className="badge-warning">{m.backend === "thesisfic" ? "Thesisfic key missing on server" : "Key missing"}</span>}
                      {m.lastError && <span className="badge-danger">Last error</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{m.backendName} · <span className="font-mono">{m.model}</span>{m.endpoint && <> · <span className="font-mono">{m.endpoint}</span></>} · {m.region}</div>
                    <div className="text-xs text-gray-500">{m.billedBy}. List price {m.inputPrice} / {m.outputPrice} USD per M tokens{m.secretHint && <> · key ····{m.secretHint}</>}{m.lastTestedAt && <> · tested {new Date(m.lastTestedAt).toLocaleDateString()}</>}</div>
                    {m.lastError && <div className="text-xs text-red-600 mt-1">{m.lastError}</div>}
                    {spend && (() => { const u = spend.byModel.find((x) => x.id === m.id); return u && u.requests ? <div className="text-xs text-gray-400 mt-1">This month: {u.requests} requests · {u.spent.toFixed(2)} {cur} · {u.students} students</div> : null; })()}
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1 flex-shrink-0 sm:ml-auto">
                      <Toggle checked={m.enabled} onChange={(v) => toggle(m, { enabled: v })} />
                      {!m.isDefault && <button onClick={() => toggle(m, { isDefault: true })} className="text-xs px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200" title="Use for Auto">Default</button>}
                      <button onClick={() => test(m)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Test"><RefreshCw className="w-4 h-4" /></button>
                      <button onClick={() => { setError(""); setEdit({ id: m.id, form: { backend: m.backend, provider: m.provider, label: m.label, model: m.model, endpoint: m.endpoint || "", apiKey: "", region: m.region, inputPrice: m.inputPrice, outputPrice: m.outputPrice, enabled: m.enabled, isDefault: m.isDefault } }); }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Edit"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => setDel(m)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" title="Remove"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div className="card p-4 text-xs text-gray-500 space-y-1">
              <div className="font-medium text-gray-700">Three ways to pay, one assistant for students</div>
              <p><strong>Thesisfic contract</strong>: nothing to configure; usage appears on the Thesisfic invoice at provider list price.</p>
              <p><strong>Microsoft Foundry / Azure OpenAI</strong>: Claude and GPT run inside your Azure tenant and are billed by Microsoft, like Copilot. Data stays in the Azure region you choose (EU regions available). Create a Foundry or Azure OpenAI resource, deploy the model, paste the resource and a key here.</p>
              <p><strong>Your own provider account</strong>: Anthropic, OpenAI, Mistral or Google invoice the university directly; paste that account&apos;s API key.</p>
            </div>
          </section>
        </div>

        {/* Usage detail */}
        {spend && (spend.byDay.length > 0 || spend.byStudent.length > 0) && (
          <div className="grid lg:grid-cols-2 gap-6">
            <section className="card p-5">
              <h2 className="font-semibold mb-3">Daily spend this month ({cur})</h2>
              <div className="flex items-end gap-1 h-32">
                {spend.byDay.map((d) => (
                  <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full" title={`${d.day}: ${d.spent.toFixed(2)} ${cur}, ${d.requests} requests`}>
                    <div className="w-full bg-brand-500/80 rounded-t" style={{ height: `${Math.max(2, (d.spent / maxDay) * 100)}%` }} />
                    <div className="text-[9px] text-gray-400 mt-1">{d.day.slice(8)}</div>
                  </div>
                ))}
              </div>
            </section>
            <section className="card p-5">
              <h2 className="font-semibold mb-3">By student</h2>
              <div className="divide-y divide-gray-100 text-sm max-h-64 overflow-y-auto">
                {spend.byStudent.map((s) => (
                  <div key={s.userId} className="py-2 flex items-center gap-3">
                    <div className="flex-1 min-w-0"><div className="font-medium truncate">{s.name}</div><div className="text-[11px] text-gray-400">{s.requests} requests · last {new Date(s.lastAt).toLocaleDateString()}</div></div>
                    <div className="text-right"><div className="font-medium">{s.spent.toFixed(2)} {cur}</div>{s.allowanceUsed !== null && <div className={`text-[11px] ${s.allowanceUsed >= 100 ? "text-red-600" : "text-gray-400"}`}>{s.allowanceUsed}% of allowance</div>}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit model" : "Add a model for students"} size="lg" footer={<><button onClick={() => setEdit(null)} className="btn-outline !py-2 !px-4 text-sm">Cancel</button>{backendDef?.id !== "thesisfic" && <button disabled={busy} onClick={() => saveModel(true)} className="btn-outline !py-2 !px-4 text-sm">Save without testing</button>}<button disabled={busy} onClick={() => saveModel(false)} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40">{busy ? "Testing…" : edit?.id ? "Save" : "Test & add"}</button></>}>
        {edit && backendDef && (
          <div className="space-y-3 text-sm">
            {error && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs">{error}</div>}
            <label className="block text-xs text-gray-500">Who runs and bills it<select value={edit.form.backend} onChange={f("backend")} className="input-field !py-2 mt-1">{BACKENDS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select><span className="block mt-1 text-[11px] text-gray-400">{backendDef.who}</span></label>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-xs text-gray-500">Model family<select value={edit.form.provider} onChange={f("provider")} className="input-field !py-2 mt-1">{backendDef.providers.map((p) => <option key={p} value={p}>{FAMILIES[p]}</option>)}</select></label>
              <label className="block text-xs text-gray-500">Label students see<input value={edit.form.label} onChange={f("label")} placeholder={`${FAMILIES[edit.form.provider]} for students`} className="input-field !py-2 mt-1" /></label>
              <label className="block text-xs text-gray-500">{backendDef.modelLabel}<input list="model-presets" value={edit.form.model} onChange={f("model")} placeholder={backendDef.modelHint} className="input-field !py-2 mt-1 font-mono text-xs" /><datalist id="model-presets">{Object.keys(PRESET_PRICES).map((m) => <option key={m} value={m} />)}</datalist></label>
              <label className="block text-xs text-gray-500">Region shown to students<input value={edit.form.region} onChange={f("region")} placeholder="EU (France Central)" className="input-field !py-2 mt-1" /></label>
              {backendDef.endpointLabel && <label className="block text-xs text-gray-500 sm:col-span-2">{backendDef.endpointLabel}<input value={edit.form.endpoint} onChange={f("endpoint")} placeholder={backendDef.endpointHint} className="input-field !py-2 mt-1 font-mono text-xs" /></label>}
              {backendDef.keyLabel && <label className="block text-xs text-gray-500 sm:col-span-2">{backendDef.keyLabel}{edit.id && <span className="text-gray-400"> (leave empty to keep the stored key)</span>}<input type="password" autoComplete="off" value={edit.form.apiKey} onChange={f("apiKey")} placeholder={backendDef.keyHint || ""} className="input-field !py-2 mt-1 font-mono text-xs" /></label>}
              <label className="block text-xs text-gray-500">Input price (USD / M tokens)<input type="number" step="0.01" min={0} value={edit.form.inputPrice} onChange={f("inputPrice")} className="input-field !py-2 mt-1" /></label>
              <label className="block text-xs text-gray-500">Output price (USD / M tokens)<input type="number" step="0.01" min={0} value={edit.form.outputPrice} onChange={f("outputPrice")} className="input-field !py-2 mt-1" /></label>
            </div>
            <div className="flex items-center gap-6 pt-1">
              <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={edit.form.enabled} onChange={f("enabled")} />Enabled for students</label>
              <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={edit.form.isDefault} onChange={f("isDefault")} />Use for “Auto”</label>
            </div>
            <p className="text-[11px] text-gray-400">Prices are used to meter spend and allowances; copy them from your provider or Microsoft price list. Keys are stored encrypted and never shown again.</p>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={!!del} title="Remove this model?" body={`Students will no longer see “${del?.label}”. Usage history is kept.`} confirmLabel="Remove" danger onConfirm={remove} onClose={() => setDel(null)} />
      {toast && <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}
    </DashboardLayout>
  );
}
