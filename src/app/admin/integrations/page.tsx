"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Trash2 } from "lucide-react";
import DashboardLayout, { useTimeAgo } from "@/components/DashboardLayout";
import { ConfirmDialog } from "@/components/editor/Dialogs";
import { EmptyState, Toast } from "@/components/ui";
import { useUser } from "@/components/useUser";
import { api } from "@/lib/client";
import { useT } from "@/lib/i18n/client";

interface Tool { origin: string; launch: string; login: string; jwks: string; deepLink: string }
interface Platform { id: string; name: string; issuer: string; clientId: string; deploymentIds: string[]; authLoginUrl: string; tokenUrl: string; jwksUrl: string; launches: number; lastLaunchAt?: string; linkedUsers: number }

const EMPTY = { name: "", siteUrl: "", clientId: "", deploymentId: "", authLoginUrl: "", tokenUrl: "", jwksUrl: "" };

function derive(siteUrl: string) {
  const base = siteUrl.trim().replace(/\/+$/, "");
  return base ? { authLoginUrl: `${base}/mod/lti/auth.php`, tokenUrl: `${base}/mod/lti/token.php`, jwksUrl: `${base}/mod/lti/certs.php` } : { authLoginUrl: "", tokenUrl: "", jwksUrl: "" };
}

/** One value the Moodle administrator copies, with a copy button that confirms itself. */
function CopyRow({ label, value }: { label: string; value: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {});
  };
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-gray-500">{label}</div>
        <code className="text-[13px] text-gray-900 break-all">{value}</code>
      </div>
      <button type="button" onClick={copy} className="btn-outline !py-1.5 !px-3 text-xs flex-shrink-0" aria-label={`${t("lti.copy")}: ${label}`}>
        {done ? <Check className="w-3.5 h-3.5 mr-1 text-green-600" /> : <Copy className="w-3.5 h-3.5 mr-1" />}{done ? t("lti.copied") : t("lti.copy")}
      </button>
    </div>
  );
}

/** Administrators: Thesisfic as an LTI 1.3 tool, the URLs for Moodle and the registered Moodle sites. */
export default function IntegrationsPage() {
  const t = useT();
  const { user } = useUser();
  const timeAgo = useTimeAgo();
  const [tool, setTool] = useState<Tool | null>(null);
  const [platforms, setPlatforms] = useState<Platform[] | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ message: string; kind: "success" | "error" } | null>(null);
  const [removing, setRemoving] = useState<Platform | null>(null);

  const load = useCallback(() => api<{ tool: Tool; platforms: Platform[] }>("/api/lti/platforms").then((d) => { setTool(d.tool); setPlatforms(d.platforms); }).catch(() => setPlatforms([])), []);
  useEffect(() => { load(); }, [load]);

  const setSite = (siteUrl: string) => setForm((f) => ({ ...f, siteUrl, ...(advanced ? {} : derive(siteUrl)) }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/api/lti/platforms", { method: "POST", json: { ...form, ...(advanced ? {} : derive(form.siteUrl)) } });
      setForm(EMPTY);
      setToast({ message: t("lti.registered"), kind: "success" });
      load();
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(code && ["name", "clientId", "issuer", "urls", "duplicate"].includes(code) ? t(`lti.error.${code}`) : (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    await api(`/api/lti/platforms/${removing.id}`, { method: "DELETE" }).catch(() => {});
    setToast({ message: t("lti.removed"), kind: "success" });
    load();
  };

  const launches = (n: number) => (n === 1 ? t("lti.list.launches_one") : t("lti.list.launches", { n }));
  const users = (n: number) => (n === 1 ? t("lti.list.users_one") : t("lti.list.users", { n }));

  return (
    <DashboardLayout>
      <div className="max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{t("lti.title")}</h1>
          <p className="text-gray-500 mt-1">{t("lti.subtitle")}</p>
        </div>

        <div className="card p-5 sm:p-6 mb-6">
          <h2 className="font-semibold mb-1">{t("lti.how.title")}</h2>
          <p className="text-sm text-gray-600">{t("lti.how.body")}</p>
        </div>

        <div className="card p-5 sm:p-6 mb-6">
          <h2 className="font-semibold mb-1">{t("lti.tool.title")}</h2>
          <p className="text-sm text-gray-600 mb-3">{t("lti.tool.body")}</p>
          {tool ? (
            <div>
              <CopyRow label={t("lti.tool.name")} value="Thesisfic" />
              <CopyRow label={t("lti.tool.launch")} value={tool.launch} />
              <CopyRow label={t("lti.tool.login")} value={tool.login} />
              <CopyRow label={t("lti.tool.redirect")} value={tool.launch} />
              <CopyRow label={t("lti.tool.jwks")} value={tool.jwks} />
              <CopyRow label={t("lti.tool.keyType")} value={t("lti.tool.keyTypeValue")} />
            </div>
          ) : (
            <div className="text-sm text-gray-400">{t("common.loading")}…</div>
          )}
          <p className="text-xs text-gray-500 mt-3">{t("lti.tool.settings")}</p>
        </div>

        <form onSubmit={submit} className="card p-5 sm:p-6 mb-6">
          <h2 className="font-semibold mb-1">{t("lti.register.title")}</h2>
          <p className="text-sm text-gray-600 mb-4">{t("lti.register.body")}</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="text-xs text-gray-500 block">{t("lti.form.name")}<input id="lti-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field !py-2 mt-1" placeholder={t("lti.form.namePlaceholder")} required /></label>
            <label className="text-xs text-gray-500 block">{t("lti.form.siteUrl")}<input id="lti-site" value={form.siteUrl} onChange={(e) => setSite(e.target.value)} className="input-field !py-2 mt-1" placeholder={t("lti.form.siteUrlPlaceholder")} required /></label>
            <label className="text-xs text-gray-500 block">{t("lti.form.clientId")}<input id="lti-client" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} className="input-field !py-2 mt-1" required /></label>
            <label className="text-xs text-gray-500 block">{t("lti.form.deploymentId")}<input id="lti-deployment" value={form.deploymentId} onChange={(e) => setForm({ ...form, deploymentId: e.target.value })} className="input-field !py-2 mt-1" /><span className="block mt-1 text-[11px] text-gray-400">{t("lti.form.deploymentHelp")}</span></label>
          </div>
          <details className="mt-4" open={advanced} onToggle={(e) => setAdvanced((e.target as HTMLDetailsElement).open)}>
            <summary className="text-xs text-brand-600 cursor-pointer">{t("lti.form.advanced")}</summary>
            <div className="grid gap-3 mt-3">
              {(["authLoginUrl", "tokenUrl", "jwksUrl"] as const).map((k) => (
                <label key={k} className="text-xs text-gray-500 block">{t(`lti.form.${k}`)}<input id={`lti-${k}`} value={form[k] || derive(form.siteUrl)[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="input-field !py-2 mt-1" /></label>
              ))}
            </div>
          </details>
          {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
          <p className="text-xs text-gray-500 mt-4">{t("lti.form.consequence", { university: user?.university || "" })}</p>
          <button type="submit" disabled={saving} className="btn-primary !py-2 !px-4 text-sm mt-3 disabled:opacity-40">{saving ? t("lti.form.saving") : t("lti.form.submit")}</button>
        </form>

        <div className="card">
          <div className="p-5 border-b border-gray-100"><h2 className="font-semibold">{t("lti.list.title")}</h2></div>
          {platforms === null ? (
            <div className="p-5 text-sm text-gray-400">{t("common.loading")}…</div>
          ) : platforms.length === 0 ? (
            <div className="p-6"><EmptyState title={t("lti.list.empty")} /></div>
          ) : (
            <div className="divide-y divide-gray-50">
              {platforms.map((p) => (
                <div key={p.id} className="p-5 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-xs text-gray-500 break-all">{p.issuer}</div>
                    <div className="flex gap-x-3 gap-y-1 flex-wrap text-xs text-gray-400 mt-1">
                      <span>{t("lti.list.clientId", { id: p.clientId })}</span>
                      <span>{p.deploymentIds.length ? t("lti.list.deployments", { ids: p.deploymentIds.join(", ") }) : t("lti.list.noDeployment")}</span>
                      <span>{launches(p.launches)}</span>
                      <span>{users(p.linkedUsers)}</span>
                      <span>{p.lastLaunchAt ? t("lti.list.lastLaunch", { time: timeAgo(p.lastLaunchAt) }) : t("lti.list.never")}</span>
                    </div>
                  </div>
                  <button type="button" onClick={() => setRemoving(p)} className="text-gray-300 hover:text-red-500 p-1 flex-shrink-0" aria-label={`${t("lti.remove")}: ${p.name}`}><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} title={t("lti.removeTitle")} danger confirmLabel={t("lti.remove")} body={<>{t("lti.removeBody", { name: removing?.name })}</>} onConfirm={remove} />
      {toast && <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />}
    </DashboardLayout>
  );
}
