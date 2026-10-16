"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { LocaleProvider, useLocale } from "@/lib/i18n/client";
import { interpolate, type Locale, type Vars } from "@/lib/i18n";
import { translate } from "@/lib/i18n/dictionary";
import { QUESTIONNAIRE_LANGUAGES, QUESTIONNAIRE_LANGUAGE_NAMES, isQuestionnaireLanguage, type QuestionnaireLanguage } from "@/lib/questionnaire/languages";
import { questionnaireText, questionTitle, questionHelp, questionLabel, needsQuestionTranslation } from "@/lib/questionnaire/translate";
import { extraUI } from "@/lib/questionnaire/ui-extra";
import type { Item } from "@/lib/questionnaire";

const additional = {
  language: { fr: "Langue", en: "Language", es: "Idioma", de: "Sprache", pt: "Idioma", ar: "اللغة" },
  pending: { fr: "Traduction à compléter", en: "Translation needed", es: "Traducción pendiente", de: "Übersetzung fehlt", pt: "Tradução em falta", ar: "الترجمة مطلوبة" },
  labels: { fr: "Traductions des options", en: "Translated option labels", es: "Traducciones de las opciones", de: "Übersetzte Antwortoptionen", pt: "Traduções das opções", ar: "ترجمات الخيارات" },
};
const Context = createContext<{ language: QuestionnaireLanguage; setLanguage: (l: QuestionnaireLanguage) => void }>({ language: "fr", setLanguage: () => {} });
export function QuestionnaireLanguageProvider({ children }: { children: React.ReactNode }) {
  const { locale: applicationLocale } = useLocale();
  const [language, setState] = useState<QuestionnaireLanguage>("fr");
  useEffect(() => { const url = new URL(location.href).searchParams.get("lang"); let saved; try { saved = localStorage.getItem("questionnaire_language"); } catch {} if (isQuestionnaireLanguage(url)) setState(url); else if (isQuestionnaireLanguage(saved)) setState(saved); }, []);
  useEffect(() => { document.documentElement.lang = language; document.documentElement.dir = language === "ar" ? "rtl" : "ltr"; document.documentElement.dataset.langLock = language; return () => { document.documentElement.dir = "ltr"; document.documentElement.lang = applicationLocale; }; }, [language, applicationLocale]);
  const setLanguage = (next: QuestionnaireLanguage) => { setState(next); try { localStorage.setItem("questionnaire_language", next); } catch {} const url = new URL(location.href); url.searchParams.set("lang", next); history.replaceState(null, "", url); };
  const base: Locale = language === "pt" || language === "ar" ? "en" : language;
  return <LocaleProvider locale={base} lock><Context.Provider value={{ language, setLanguage }}><div lang={language} dir={language === "ar" ? "rtl" : "ltr"}>{children}</div></Context.Provider></LocaleProvider>;
}
export function useQuestionnaireLanguage() {
  const context = useContext(Context), { language } = context;
  const base: Locale = language === "pt" || language === "ar" ? "en" : language;
  const t = (key: string, vars?: Vars) => {
    const special = key === "q.language" ? additional.language : key === "q.team.translationPending" ? additional.pending : key === "q.team.labels" ? additional.labels : undefined;
    return special ? special[language] : extraUI[language]?.[key] ? interpolate(extraUI[language][key], vars) : translate(base, key, vars);
  };
  return { ...context, t, text: (s: string | undefined) => questionnaireText(language, s), title: (item: Item) => questionTitle(language, item), help: (item: Item) => questionHelp(language, item), label: (item: Item, s: string) => questionLabel(language, item, s), needsTranslation: (item: Item) => needsQuestionTranslation(language, item) };
}
export function useQuestionnaireT() { return useQuestionnaireLanguage().t; }
export function QuestionnaireLanguageSelector() {
  const { language, setLanguage, t } = useQuestionnaireLanguage();
  return <label className="inline-flex items-center gap-2 text-xs text-gray-600"><span>{t("q.language")}</span><select aria-label={t("q.language")} className="max-w-[130px] rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm" value={language} onChange={event => { if (isQuestionnaireLanguage(event.target.value)) setLanguage(event.target.value); }}>{QUESTIONNAIRE_LANGUAGES.map(l => <option key={l} value={l} lang={l}>{QUESTIONNAIRE_LANGUAGE_NAMES[l]}</option>)}</select></label>;
}

export function useQuestionnaireFormat() {
  const { language } = useQuestionnaireLanguage();
  return { number: (n: number, opts?: Intl.NumberFormatOptions) => n.toLocaleString(language, opts), date: (d: string | number | Date) => new Date(d).toLocaleDateString(language, {day:"numeric",month:"short",year:"numeric"}), dateTime: (d: string | number | Date) => new Date(d).toLocaleString(language, {day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) };
}
