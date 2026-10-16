"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useT } from "@/lib/i18n/client";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/lib/i18n";
import { api } from "@/lib/client";
import { defaultProductSettings, PRODUCT_MODES, type ProductSettings } from "@/lib/product-settings";

export default function ProductPanel() {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const [settings, setSettings] = useState<ProductSettings | null>(null);
  const [saved, setSaved] = useState("");
  const [descriptionLocale, setDescriptionLocale] = useState<Locale>(locale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [persistent, setPersistent] = useState(true);
  const load = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await api<{ settings: ProductSettings; persistent: boolean }>("/api/equipe/product");
      setSettings(data.settings); setSaved(JSON.stringify(data.settings)); setPersistent(data.persistent);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);
  const dirty = !!settings && JSON.stringify(settings) !== saved;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const patch = (value: Partial<ProductSettings>) => { setSettings(s => s && ({ ...s, ...value })); setNotice(""); };
  const save = async () => {
    if (!settings) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await api<{ settings: ProductSettings }>("/api/equipe/product", { method: "PUT", json: { revision: settings.revision, settings } });
      setSettings(data.settings); setSaved(JSON.stringify(data.settings)); setNotice("product.saved");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const toggle = (key: "assistantEnabled" | "searchEnabled" | "filesEnabled", label: string) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings?.[key] ?? false} onChange={e => patch({ [key]: e.target.checked })} />{label}</label>;
  return <main className="min-h-screen bg-gray-50 px-4 py-6 text-gray-900">
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap justify-between items-center gap-3">
        <div><h1 className="text-2xl font-bold">{t("product.title")}</h1><p className="text-sm text-gray-500 mt-1">{t("product.scope")}</p></div>
        <div className="flex items-center gap-3"><Link className="text-sm text-brand-700 underline" href="/equipe/resultats">{t("product.questionnaire")}</Link><select aria-label={t("product.language")} className="input-field !w-auto !py-1.5" value={locale} onChange={e => setLocale(e.target.value as Locale)}>{LOCALES.map(l => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}</select></div>
      </header>
      {!persistent && <p role="status" className="text-sm text-amber-800">{t("product.volatile")}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="text-sm text-brand-700">{t(notice)}</p>}
      {!settings && !busy && <button className="btn-outline" onClick={() => void load()}>{t("product.reload")}</button>}
      {!settings && busy && <p>{t("common.loading")}</p>}
      {settings && <>
        <fieldset disabled={busy} className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <legend className="px-1 font-semibold">{t("product.general")}</legend>
          <div className="flex flex-wrap gap-5">{toggle("assistantEnabled", t("product.enabled"))}{toggle("searchEnabled", t("product.search"))}{toggle("filesEnabled", t("product.files"))}</div>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="text-sm">{t("product.defaultMode")}<select className="input-field mt-1" value={settings.defaultMode} onChange={e => patch({ defaultMode: e.target.value as ProductSettings["defaultMode"] })}>{PRODUCT_MODES.map(id => <option key={id} value={id} disabled={!settings.modes[id].enabled}>{t(`assistant.mode.${id}.label`)}</option>)}</select></label>
            {([ ["maxOutputTokens", 256, 8192], ["historyMessages", 1, 30], ["maxArtifacts", 1, 4] ] as const).map(([key, min, max]) => <label key={key} className="text-sm">{t(`product.${key}`)}<input className="input-field mt-1" type="number" min={min} max={max} step={1} value={settings[key]} onChange={e => patch({ [key]: Number(e.target.value) })} /><span className="block text-xs text-gray-500 mt-1">{t(`product.${key}Help`)}</span></label>)}
          </div>
          <label className="block text-sm">{t("product.instructions")}<textarea className="input-field mt-1 min-h-24" maxLength={6000} value={settings.instructions} onChange={e => patch({ instructions: e.target.value })} /></label>
          <p className="text-xs text-gray-500">{t("product.guardrails")}</p>
        </fieldset>
        <section className="space-y-4" aria-label={t("product.modes")}>
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{t("product.modes")}</h2><label className="text-sm">{t("product.descriptionLanguage")} <select className="input-field !w-auto !py-1" value={descriptionLocale} onChange={e => setDescriptionLocale(e.target.value as Locale)}>{LOCALES.map(l => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}</select></label></div>
          {PRODUCT_MODES.map(id => <fieldset key={id} disabled={busy} className="rounded-xl bg-white border border-gray-200 p-4 space-y-3">
            <legend className="px-1 font-semibold">{t(`assistant.mode.${id}.label`)}</legend>
            <p className="text-sm text-gray-500">{t(`assistant.mode.${id}.description`)}</p>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.modes[id].enabled} onChange={e => patch({ modes: { ...settings.modes, [id]: { ...settings.modes[id], enabled: e.target.checked } } })} />{t("product.modeEnabled")}</label>
            <label className="block text-sm">{t("product.description")}<input className="input-field mt-1" maxLength={240} value={settings.modes[id].descriptions[descriptionLocale]} placeholder={t("product.defaultDescription")} onChange={e => patch({ modes: { ...settings.modes, [id]: { ...settings.modes[id], descriptions: { ...settings.modes[id].descriptions, [descriptionLocale]: e.target.value } } } })} /></label>
            <label className="block text-sm">{t("product.modeInstructions")}<textarea className="input-field mt-1 min-h-20" maxLength={4000} value={settings.modes[id].instructions} onChange={e => patch({ modes: { ...settings.modes, [id]: { ...settings.modes[id], instructions: e.target.value } } })} /></label>
          </fieldset>)}
        </section>
        <footer className="sticky bottom-0 flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 flex-1">{dirty ? t("product.unsaved") : t("product.current", { revision: settings.revision })}</p>
          <button className="btn-outline text-sm" disabled={busy || !dirty} onClick={() => { setSettings(JSON.parse(saved)); setError(""); setNotice(""); }}>{t("product.discard")}</button>
          <button className="btn-outline text-sm" disabled={busy} onClick={() => patch({ ...defaultProductSettings(), revision: settings.revision, updatedAt: settings.updatedAt })}>{t("product.reset")}</button>
          <button className="btn-primary text-sm" disabled={busy || !dirty} onClick={() => void save()}>{busy ? t("common.loading") : t("product.save")}</button>
        </footer>
        <p className="text-xs text-gray-500">{t("product.institutionSettings")}</p>
      </>}
    </div>
  </main>;
}
