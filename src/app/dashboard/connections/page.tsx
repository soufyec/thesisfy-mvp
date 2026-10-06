"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Building2, CheckCircle2, ExternalLink, KeyRound, LogIn, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Modal, Toast } from "@/components/ui";
import { api } from "@/lib/client";

interface Provider {
  id: string;
  name: string;
  product: string;
  keyUrl: string;
  keyPrefix: string;
  models: string[];
  sites: string[];
  color: string;
  defaultModel: string;
  allowedByPolicy: boolean;
  platformKey: boolean;
  oauthAvailable: boolean;
  connection: { id: string; label: string; authType: string; status: string; model?: string; secretHint: string; createdAt: string; lastUsedAt?: string; lastError?: string } | null;
}

function ConnectionsInner() {
  const params = useSearchParams();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [institutionModels, setInstitutionModels] = useState<{ id: string; provider: string; label: string; model: string; backendName: string; region: string; isDefault: boolean; ready: boolean; color: string }[]>([]);
  const [allowance, setAllowance] = useState<{ institutionPays: boolean; currency: string; perStudentMonthly: number; spentStudent: number; atLimit: "block" | "own_account"; exhausted: string } | null>(null);
  const [policy, setPolicy] = useState<{ allowBYOK: boolean; maxAiUsagePercent: number } | null>(null);
  const [defaultProvider, setDefaultProvider] = useState<string | null>(null);
  const [connect, setConnect] = useState<Provider | null>(null);
  const [form, setForm] = useState({ apiKey: "", model: "", label: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ message: string; kind?: "info" | "success" | "error" } | null>(null);

  const load = useCallback(() => api<{ providers: Provider[]; policy: { allowBYOK: boolean; maxAiUsagePercent: number }; defaultProvider: string | null; institutionModels?: typeof institutionModels; allowance?: typeof allowance }>("/api/ai/providers").then((d) => { setProviders(d.providers); setPolicy(d.policy); setDefaultProvider(d.defaultProvider); setInstitutionModels(d.institutionModels || []); setAllowance(d.allowance || null); }).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const o = params.get("oauth");
    if (o === "unavailable") setToast({ message: `Sign-in with ${params.get("provider")} is not available yet: this provider has not opened account sign-in to third-party apps. Use an API key from your account instead.`, kind: "info" });
    if (o === "connected") setToast({ message: `${params.get("provider")} account connected.`, kind: "success" });
    if (o === "error" || o === "state_mismatch") setToast({ message: `Sign-in failed${params.get("message") ? `: ${params.get("message")}` : ""}.`, kind: "error" });
  }, [params]);

  const submit = async () => {
    if (!connect) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/ai/connections", { method: "POST", json: { provider: connect.id, apiKey: form.apiKey, model: form.model || undefined, label: form.label || undefined } });
      setToast({ message: `${connect.product} connected. The assistant will now use your account.`, kind: "success" });
      setConnect(null);
      setForm({ apiKey: "", model: "", label: "" });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (p: Provider) => {
    if (!p.connection) return;
    await api(`/api/ai/connections/${p.connection.id}`, { method: "DELETE" }).catch(() => {});
    setToast({ message: `${p.product} disconnected and the key deleted.`, kind: "info" });
    load();
  };
  const test = async (p: Provider) => {
    if (!p.connection) return;
    const r = await api<{ ok: boolean; error?: string }>(`/api/ai/connections/${p.connection.id}`, { method: "POST" }).catch((e) => ({ ok: false, error: (e as Error).message }));
    setToast({ message: r.ok ? `${p.product} key works.` : `Test failed: ${r.error}`, kind: r.ok ? "success" : "error" });
    load();
  };
  const makeDefault = async (p: Provider) => {
    if (!p.connection) return;
    await api(`/api/ai/connections/${p.connection.id}`, { method: "PATCH", json: { makeDefault: true } }).catch(() => {});
    load();
  };
  const setModel = async (p: Provider, model: string) => {
    if (!p.connection) return;
    await api(`/api/ai/connections/${p.connection.id}`, { method: "PATCH", json: { model } }).catch(() => {});
    load();
  };

  return (
    <div className="animate-fade-in max-w-4xl">
      <div className="mb-6"><h1 className="text-2xl font-bold">AI Connections</h1><p className="text-gray-500 mt-1 text-sm">Use the models your university provides, or the AI account you already pay for, inside Thesisfic, with every interaction logged transparently.</p></div>

      {allowance?.institutionPays && (
        <section className="card p-5 mb-6 border-emerald-100 bg-gradient-to-br from-emerald-50/60 to-white">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-semibold flex items-center gap-2"><Building2 className="w-4 h-4 text-emerald-600" />Provided by your university</h2>
              <p className="text-sm text-gray-600 mt-1">Your university pays for these models, the same way companies give staff Copilot. Nothing to set up: pick one in the assistant or leave it on Auto.</p>
            </div>
            {allowance.perStudentMonthly > 0 && (
              <div className="text-sm min-w-[200px]">
                <div className="flex justify-between text-xs text-gray-500"><span>Your allowance this month</span><span>{allowance.spentStudent.toFixed(2)} / {allowance.perStudentMonthly} {allowance.currency}</span></div>
                <div className="h-2 rounded-full bg-gray-100 mt-1 overflow-hidden"><div className={`h-full ${allowance.exhausted !== "none" ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, (allowance.spentStudent / allowance.perStudentMonthly) * 100)}%` }} /></div>
                <div className="text-[11px] text-gray-400 mt-1">{allowance.exhausted !== "none" ? (allowance.atLimit === "block" ? "Used up: resets on the 1st." : "Used up: your own account is used until the 1st.") : allowance.atLimit === "block" ? "When it runs out, the assistant pauses until next month." : "When it runs out, your own connected account takes over."}</div>
              </div>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-2 mt-4">
            {institutionModels.map((m) => (
              <div key={m.id} className={`flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-100 ${!m.ready ? "opacity-60" : ""}`}>
                <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ background: m.color }}>{m.label[0]}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{m.label}{m.isDefault && <span className="ml-2 badge bg-emerald-50 text-emerald-700 !text-[10px] !py-0">default</span>}</div>
                  <div className="text-[11px] text-gray-400 truncate">{m.backendName} · {m.region}{!m.ready && " · not configured yet"}</div>
                </div>
              </div>
            ))}
            {institutionModels.length === 0 && <div className="text-sm text-gray-500">Your university has not configured any model yet.</div>}
          </div>
        </section>
      )}

      <h2 className="font-semibold mb-2 text-gray-700">{allowance?.institutionPays ? "Your own accounts (optional)" : "Your own accounts"}</h2>

      <div className="card p-4 sm:p-5 mb-6 flex gap-3">
        <ShieldCheck className="w-5 h-5 text-brand-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-gray-600 space-y-1">
          <p><strong>How it works.</strong> Connect Claude, ChatGPT/GPT, Gemini or Mistral with an API key from your own account. Thesisfic stores it encrypted (AES-256-GCM), uses it only for your requests, and never shows it to staff. Requests you make through Thesisfic are logged with provider, model and purpose; text you insert is marked as AI-assisted.</p>
          <p><strong>Using the chat apps directly?</strong> Install the <Link href="/dashboard/settings#extension" className="text-brand-600 underline">transparency extension</Link> so visits and copied text on chatgpt.com, claude.ai or gemini.google.com are attributed to you honestly while you write.</p>
          {policy && !policy.allowBYOK && <p className="text-amber-700">Your institution does not allow personal AI accounts; the institution assistant is used instead.</p>}
        </div>
      </div>

      <div className="grid gap-4">
        {providers.map((p) => {
          const c = p.connection;
          return (
            <div key={p.id} className={`card p-5 ${!p.allowedByPolicy ? "opacity-60" : ""}`}>
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0" style={{ background: p.color }}>{p.product[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap"><h3 className="font-semibold">{p.product}</h3><span className="text-xs text-gray-400">{p.name}</span>{c && c.status === "active" && <span className="badge-success flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Connected</span>}{c && c.status === "invalid" && <span className="badge-danger">Key invalid</span>}{!c && p.platformKey && <span className="badge-info">Institution key available</span>}{!p.allowedByPolicy && <span className="badge bg-gray-100 text-gray-500">Not permitted by policy</span>}{defaultProvider === p.id && c && <span className="badge bg-purple-50 text-purple-700">Default</span>}</div>
                  {c ? (
                    <div className="mt-2 text-sm text-gray-600 space-y-1">
                      <div>{c.label} · key ····{c.secretHint} · {c.authType === "oauth" ? "signed in" : "API key"}{c.lastUsedAt && <span className="text-gray-400"> · last used {new Date(c.lastUsedAt).toLocaleString()}</span>}</div>
                      {c.lastError && <div className="text-xs text-red-600">{c.lastError}</div>}
                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        <label className="text-xs text-gray-500 flex items-center gap-1">Model <select value={c.model || p.defaultModel} onChange={(e) => setModel(p, e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-xs">{Array.from(new Set([c.model || p.defaultModel, ...p.models])).map((m) => <option key={m}>{m}</option>)}</select></label>
                        <button onClick={() => test(p)} className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center gap-1"><RefreshCw className="w-3 h-3" />Test</button>
                        {defaultProvider !== p.id && <button onClick={() => makeDefault(p)} className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200">Make default</button>}
                        <button onClick={() => revoke(p)} className="text-xs px-2.5 py-1 rounded-lg text-red-600 hover:bg-red-50 flex items-center gap-1"><Trash2 className="w-3 h-3" />Disconnect</button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-gray-500">{p.platformKey ? `Your institution provides ${p.product} for you. Connect your own account to use your personal quota and models.` : `Connect your ${p.product} account to use it from Thesisfic.`} Sites covered by the extension: {p.sites.join(", ")}.</div>
                  )}
                  {!c && p.allowedByPolicy && policy?.allowBYOK && (
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <button onClick={() => { setConnect(p); setForm({ apiKey: "", model: p.defaultModel, label: "" }); setError(""); }} className="btn-primary !py-2 !px-3 text-xs"><KeyRound className="w-3.5 h-3.5 mr-1" />Connect with API key</button>
                      <a href={`/api/ai/connections/oauth/${p.id}`} className={`btn-outline !py-2 !px-3 text-xs ${p.oauthAvailable ? "" : "opacity-70"}`} title={p.oauthAvailable ? "" : "Not offered by this provider yet"}><LogIn className="w-3.5 h-3.5 mr-1" />Sign in with {p.product.split(" ")[0]}{p.oauthAvailable ? "" : " (soon)"}</a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={!!connect} onClose={() => setConnect(null)} title={`Connect ${connect?.product}`} footer={<><button onClick={() => setConnect(null)} className="btn-outline !py-2 !px-4 text-sm">Cancel</button><button disabled={busy || form.apiKey.length < 12} onClick={submit} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40">{busy ? "Validating…" : "Connect"}</button></>}>
        {connect && (
          <div className="space-y-3 text-sm">
            <p className="text-gray-600">Create a key in your {connect.name} account (<a href={connect.keyUrl} target="_blank" rel="noreferrer" className="text-brand-600 underline inline-flex items-center gap-0.5">{connect.keyUrl.replace("https://", "")}<ExternalLink className="w-3 h-3" /></a>) and paste it here. We validate it once, then store it encrypted.</p>
            {error && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs">{error}</div>}
            <input type="password" autoComplete="off" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} className="input-field font-mono text-xs" placeholder={`${connect.keyPrefix}…`} />
            <label className="block text-xs text-gray-500">Model<select value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="input-field !py-2 mt-1">{connect.models.map((m) => <option key={m}>{m}</option>)}</select></label>
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="input-field !py-2" placeholder={`Label (optional), e.g. "${connect.product} personal"`} />
            <p className="text-xs text-gray-400">Usage is billed to your own account. Your institution&apos;s policy still applies: max {policy?.maxAiUsagePercent}% AI-assisted text, no generated thesis content.</p>
          </div>
        )}
      </Modal>
      {toast && <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}
    </div>
  );
}

export default function ConnectionsPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={null}>
        <ConnectionsInner />
      </Suspense>
    </DashboardLayout>
  );
}
