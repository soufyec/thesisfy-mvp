"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Building2, CheckCircle2, ExternalLink, KeyRound, LogIn, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Modal, Toast } from "@/components/ui";
import { api } from "@/lib/client";
import { useFormat, useT } from "@/lib/i18n/client";

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
  const t = useT();
  const format = useFormat();
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
    const provider = params.get("provider") || "";
    if (o === "unavailable") setToast({ message: t("dashboard.connections.oauthUnavailable", { provider }), kind: "info" });
    if (o === "connected") setToast({ message: t("dashboard.connections.oauthConnected", { provider }), kind: "success" });
    if (o === "error" || o === "state_mismatch") setToast({ message: params.get("message") ? t("dashboard.connections.oauthFailedMsg", { message: params.get("message") || "" }) : t("dashboard.connections.oauthFailed"), kind: "error" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const submit = async () => {
    if (!connect) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/ai/connections", { method: "POST", json: { provider: connect.id, apiKey: form.apiKey, model: form.model || undefined, label: form.label || undefined } });
      setToast({ message: t("dashboard.connections.toastConnected", { product: connect.product }), kind: "success" });
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
    setToast({ message: t("dashboard.connections.toastDisconnected", { product: p.product }), kind: "info" });
    load();
  };
  const test = async (p: Provider) => {
    if (!p.connection) return;
    const r = await api<{ ok: boolean; error?: string }>(`/api/ai/connections/${p.connection.id}`, { method: "POST" }).catch((e) => ({ ok: false, error: (e as Error).message }));
    setToast({ message: r.ok ? t("dashboard.connections.toastKeyWorks", { product: p.product }) : t("dashboard.connections.toastTestFailed", { error: r.error }), kind: r.ok ? "success" : "error" });
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
    <div className="max-w-4xl">
      <div className="mb-6"><h1 className="text-2xl font-bold">{t("dashboard.connections.title")}</h1><p className="text-gray-500 mt-1 text-sm">{t("dashboard.connections.subtitle")}</p></div>

      {allowance?.institutionPays && (
        <section className="card p-5 mb-6 border-emerald-100 bg-gradient-to-br from-emerald-50/60 to-white">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-semibold flex items-center gap-2"><Building2 className="w-4 h-4 text-emerald-600" />{t("glossary.providedByUniversity")}</h2>
              <p className="text-sm text-gray-600 mt-1">{t("dashboard.connections.providedBody")}</p>
            </div>
            {allowance.perStudentMonthly > 0 && (
              <div className="text-sm min-w-[200px]">
                <div className="flex justify-between text-xs text-gray-500"><span>{t("dashboard.connections.allowance")}</span><span>{format.number(allowance.spentStudent, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / {allowance.perStudentMonthly} {allowance.currency}</span></div>
                <div className="h-2 rounded-full bg-gray-100 mt-1 overflow-hidden"><div className={`h-full ${allowance.exhausted !== "none" ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, (allowance.spentStudent / allowance.perStudentMonthly) * 100)}%` }} /></div>
                <div className="text-[11px] text-gray-400 mt-1">{allowance.exhausted !== "none" ? (allowance.atLimit === "block" ? t("dashboard.connections.usedUpBlock") : t("dashboard.connections.usedUpOwn")) : allowance.atLimit === "block" ? t("dashboard.connections.runsOutBlock") : t("dashboard.connections.runsOutOwn")}</div>
              </div>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-2 mt-4">
            {institutionModels.map((m) => (
              <div key={m.id} className={`flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-100 ${!m.ready ? "opacity-60" : ""}`}>
                <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ background: m.color }}>{m.label[0]}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{m.label}{m.isDefault && <span className="ml-2 badge bg-emerald-50 text-emerald-700 !text-[10px] !py-0">{t("dashboard.connections.defaultTag")}</span>}</div>
                  <div className="text-[11px] text-gray-400 truncate">{m.backendName} · {m.region}{!m.ready && ` · ${t("dashboard.connections.notConfigured")}`}</div>
                </div>
              </div>
            ))}
            {institutionModels.length === 0 && <div className="text-sm text-gray-500">{t("dashboard.connections.noModels")}</div>}
          </div>
        </section>
      )}

      <h2 className="font-semibold mb-2 text-gray-700">{allowance?.institutionPays ? t("dashboard.connections.ownOptional") : t("dashboard.connections.own")}</h2>

      <div className="card p-4 sm:p-5 mb-6 flex gap-3">
        <ShieldCheck className="w-5 h-5 text-brand-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-gray-600 space-y-1">
          <p><strong>{t("dashboard.connections.howTitle")}</strong> {t("dashboard.connections.howBody")}</p>
          <p><strong>{t("dashboard.connections.preferTitle")}</strong> {t("dashboard.connections.preferBefore")} <Link href="/dashboard/ai-chat?mode=copilot" className="text-brand-600 underline">{t("glossary.copilot")}</Link> {t("dashboard.connections.preferAfter")}</p>
          {policy && !policy.allowBYOK && <p className="text-amber-700">{t("dashboard.connections.noByok")}</p>}
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
                  <div className="flex items-center gap-2 flex-wrap"><h3 className="font-semibold">{p.product}</h3><span className="text-xs text-gray-400">{p.name}</span>{c && c.status === "active" && <span className="badge-success flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{t("dashboard.connections.connected")}</span>}{c && c.status === "invalid" && <span className="badge-danger">{t("dashboard.connections.keyInvalid")}</span>}{!c && p.platformKey && <span className="badge-info">{t("dashboard.connections.institutionKey")}</span>}{!p.allowedByPolicy && <span className="badge bg-gray-100 text-gray-500">{t("dashboard.connections.notPermitted")}</span>}{defaultProvider === p.id && c && <span className="badge bg-purple-50 text-purple-700">{t("dashboard.connections.defaultBadge")}</span>}</div>
                  {c ? (
                    <div className="mt-2 text-sm text-gray-600 space-y-1">
                      <div>{t("dashboard.connections.keyLine", { label: c.label, hint: c.secretHint, auth: c.authType === "oauth" ? t("dashboard.connections.authOauth") : t("dashboard.connections.authKey") })}{c.lastUsedAt && <span className="text-gray-400"> · {t("dashboard.connections.lastUsed", { date: format.dateTime(c.lastUsedAt) })}</span>}</div>
                      {c.lastError && <div className="text-xs text-red-600">{c.lastError}</div>}
                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        <label className="text-xs text-gray-500 flex items-center gap-1">{t("dashboard.connections.model")} <select value={c.model || p.defaultModel} onChange={(e) => setModel(p, e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-xs">{Array.from(new Set([c.model || p.defaultModel, ...p.models])).map((m) => <option key={m}>{m}</option>)}</select></label>
                        <button onClick={() => test(p)} className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center gap-1"><RefreshCw className="w-3 h-3" />{t("dashboard.connections.test")}</button>
                        {defaultProvider !== p.id && <button onClick={() => makeDefault(p)} className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200">{t("dashboard.connections.makeDefault")}</button>}
                        <button onClick={() => revoke(p)} className="text-xs px-2.5 py-1 rounded-lg text-red-600 hover:bg-red-50 flex items-center gap-1"><Trash2 className="w-3 h-3" />{t("dashboard.connections.disconnect")}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-gray-500">{p.platformKey ? t("dashboard.connections.institutionProvides", { product: p.product }) : t("dashboard.connections.connectYour", { product: p.product })}</div>
                  )}
                  {!c && p.allowedByPolicy && policy?.allowBYOK && (
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <button onClick={() => { setConnect(p); setForm({ apiKey: "", model: p.defaultModel, label: "" }); setError(""); }} className="btn-primary !py-2 !px-3 text-xs"><KeyRound className="w-3.5 h-3.5 mr-1" />{t("dashboard.connections.connectWithKey")}</button>
                      <a href={`/api/ai/connections/oauth/${p.id}`} className={`btn-outline !py-2 !px-3 text-xs ${p.oauthAvailable ? "" : "opacity-70"}`} title={p.oauthAvailable ? "" : t("dashboard.connections.notOffered")}><LogIn className="w-3.5 h-3.5 mr-1" />{t(p.oauthAvailable ? "dashboard.connections.signInWith" : "dashboard.connections.signInWithSoon", { name: p.product.split(" ")[0] })}</a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={!!connect} onClose={() => setConnect(null)} title={t("dashboard.connections.connectTitle", { product: connect?.product })} footer={<><button onClick={() => setConnect(null)} className="btn-outline !py-2 !px-4 text-sm">{t("common.cancel")}</button><button disabled={busy || form.apiKey.length < 12} onClick={submit} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40">{busy ? t("dashboard.connections.validating") : t("dashboard.connections.connect")}</button></>}>
        {connect && (
          <div className="space-y-3 text-sm">
            <p className="text-gray-600">{t("dashboard.connections.createKeyBefore", { name: connect.name })}<a href={connect.keyUrl} target="_blank" rel="noreferrer" className="text-brand-600 underline inline-flex items-center gap-0.5">{connect.keyUrl.replace("https://", "")}<ExternalLink className="w-3 h-3" /></a>{t("dashboard.connections.createKeyAfter")}</p>
            {error && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs">{error}</div>}
            <input type="password" autoComplete="off" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} className="input-field font-mono text-xs" placeholder={`${connect.keyPrefix}…`} />
            <label className="block text-xs text-gray-500">{t("dashboard.connections.model")}<select value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="input-field !py-2 mt-1">{connect.models.map((m) => <option key={m}>{m}</option>)}</select></label>
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="input-field !py-2" placeholder={t("dashboard.connections.labelPlaceholder", { product: connect.product })} />
            <p className="text-xs text-gray-400">{t("dashboard.connections.billedNote", { pct: policy?.maxAiUsagePercent })}</p>
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
