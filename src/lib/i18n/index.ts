/**
 * Minimal i18n for Thesisfic: three UI locales, flat key → string dictionaries, `{var}` interpolation.
 * No library: dictionaries live in `./messages/*.ts`, one file per area, each typed against its English keys
 * so a missing Spanish or French string is a compile error.
 */
export type Locale = "en" | "es" | "fr";

export const LOCALES: Locale[] = ["en", "es", "fr"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "locale";
/** One year. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const LOCALE_NAMES: Record<Locale, string> = { en: "English", es: "Español", fr: "Français" };
/** BCP 47 tags for Intl formatting. */
export const LOCALE_TAGS: Record<Locale, string> = { en: "en-GB", es: "es-ES", fr: "fr-FR" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as string[]).indexOf(value) !== -1;
}

/** Dictionary shape for one area: English defines the keys, the other locales must cover every one of them. */
export type Messages<E extends Record<string, string>> = { en: E; es: Record<keyof E, string>; fr: Record<keyof E, string> };

export type Vars = Record<string, string | number | undefined>;

export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
}

/** Picks the best supported locale from an Accept-Language header. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const parts = header.split(",").map((p) => p.trim().split(";")[0].toLowerCase()).filter(Boolean);
  for (const p of parts) {
    const base = p.split("-")[0];
    if (isLocale(base)) return base;
  }
  return null;
}
