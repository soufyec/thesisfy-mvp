"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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

export function LocaleProvider({ locale: initial, children, lock = false }: { locale: Locale; children: React.ReactNode; lock?: boolean }) {
  const [locale, setLocaleState] = useState<Locale>(isLocale(initial) ? initial : DEFAULT_LOCALE);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // A nested provider (the French-only questionnaire) locks the document language; the root one then leaves it alone.
    const el = document.documentElement;
    if (lock) {
      el.lang = locale;
      el.dataset.langLock = locale;
      return () => {
        delete el.dataset.langLock;
      };
    }
    if (!el.dataset.langLock) el.lang = locale;
  }, [locale, lock]);

  const setLocale = useCallback(
    (next: Locale) => {
      if (!isLocale(next) || next === locale) return;
      writeLocaleCookie(next);
      setLocaleState(next);
      // On a language-prefixed URL (/es, /fr/login) the prefix would rewrite the cookie back: move to the new prefix.
      const m = (pathname || "").match(/^\/(en|es|fr)(\/.*)?$/);
      if (m) {
        router.push(`/${next}${m[2] || ""}`);
        return;
      }
      // Server components (landing, metadata) re-render with the new cookie; client components re-render from context.
      router.refresh();
    },
    [locale, router, pathname],
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
