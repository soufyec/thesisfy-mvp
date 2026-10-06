"use client";

import { Globe } from "lucide-react";
import { LOCALE_NAMES, LOCALES, isLocale, Locale } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";
import { useUser } from "@/components/useUser";
import { api } from "@/lib/client";

/**
 * Compact language selector. Writes the `locale` cookie, re-renders the app and, when signed in, stores the
 * preference on the account so the assistant answers in the same language.
 */
export default function LanguageSwitcher({ className = "", variant = "select" }: { className?: string; variant?: "select" | "inline" }) {
  const { locale, setLocale } = useLocale();
  const t = useT();
  const { user, refresh } = useUser();

  const change = (next: Locale) => {
    if (!isLocale(next) || next === locale) return;
    setLocale(next);
    if (user) api("/api/auth/me", { method: "PATCH", json: { preferences: { language: next } } }).then(() => refresh()).catch(() => {});
  };

  if (variant === "inline") {
    return (
      <div className={`inline-flex items-center gap-1 text-xs ${className}`} role="group" aria-label={t("common.language")}>
        {LOCALES.map((l) => (
          <button key={l} type="button" onClick={() => change(l)} aria-pressed={l === locale} className={`px-2 py-1 rounded-md uppercase font-medium ${l === locale ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"}`}>
            {l}
          </button>
        ))}
      </div>
    );
  }

  return (
    <label className={`inline-flex items-center gap-1.5 text-sm text-gray-600 ${className}`}>
      <Globe className="w-4 h-4" aria-hidden />
      <span className="sr-only">{t("common.language")}</span>
      <select value={locale} onChange={(e) => change(e.target.value as Locale)} aria-label={t("common.language")} className="bg-transparent text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-md py-1 pr-1 cursor-pointer">
        {LOCALES.map((l) => (
          <option key={l} value={l}>{LOCALE_NAMES[l]}</option>
        ))}
      </select>
    </label>
  );
}
