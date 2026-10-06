import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, Locale, LOCALE_COOKIE, localeFromAcceptLanguage } from "./index";
import { translator } from "./dictionary";

/** Server components and route handlers: cookie first (set by the middleware or the switcher), then Accept-Language. */
export function getLocale(): Locale {
  try {
    const h = headers();
    const forced = h.get("x-locale");
    if (isLocale(forced)) return forced;
    const c = cookies().get(LOCALE_COOKIE)?.value;
    if (isLocale(c)) return c;
    return localeFromAcceptLanguage(h.get("accept-language")) || DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function getT(locale: Locale = getLocale()) {
  return translator(locale);
}
