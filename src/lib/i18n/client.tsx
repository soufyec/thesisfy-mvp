"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LOCALE, isLocale, Locale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALE_TAGS, Vars } from "./index";
import { translate, Translate } from "./dictionary";

interface LocaleContextValue {
  locale: Locale;
  /** BCP 47 tag for Intl / toLocaleDateString. */
  tag: string;
  t: Translate;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  tag: LOCALE_TAGS[DEFAULT_LOCALE],
  t: (key: string, vars?: Vars) => translate(DEFAULT_LOCALE, key, vars),
  setLocale: () => {},
});

export function writeLocaleCookie(locale: Locale) {
  if (typeof document === "undefined") return;
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
}

export function LocaleProvider({ locale: initial, children }: { locale: Locale; children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(isLocale(initial) ? initial : DEFAULT_LOCALE);
  const router = useRouter();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback(
    (next: Locale) => {
      if (!isLocale(next) || next === locale) return;
      writeLocaleCookie(next);
      setLocaleState(next);
      // Server components (landing, metadata) re-render with the new cookie; client components re-render from context.
      router.refresh();
    },
    [locale, router],
  );

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, tag: LOCALE_TAGS[locale], t: (key, vars) => translate(locale, key, vars), setLocale }),
    [locale, setLocale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** `const t = useT(); t("common.save")` — the only way to put visible text in a client component. */
export function useT(): Translate {
  return useContext(LocaleContext).t;
}

export function useLocale() {
  const { locale, tag, setLocale } = useContext(LocaleContext);
  return { locale, tag, setLocale };
}

/** Date helpers that follow the active locale. */
export function useFormat() {
  const { tag } = useContext(LocaleContext);
  return useMemo(
    () => ({
      date: (d: string | number | Date, opts?: Intl.DateTimeFormatOptions) => new Date(d).toLocaleDateString(tag, opts || { day: "numeric", month: "short", year: "numeric" }),
      time: (d: string | number | Date, opts?: Intl.DateTimeFormatOptions) => new Date(d).toLocaleTimeString(tag, opts || { hour: "2-digit", minute: "2-digit" }),
      dateTime: (d: string | number | Date) => new Date(d).toLocaleString(tag, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
      number: (n: number, opts?: Intl.NumberFormatOptions) => n.toLocaleString(tag, opts),
    }),
    [tag],
  );
}
