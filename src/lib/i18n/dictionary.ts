import { DEFAULT_LOCALE, interpolate, Locale, LOCALES, Vars } from "./index";
import { common } from "./messages/common";
import { landing } from "./messages/landing";
import { dashboard } from "./messages/dashboard";
import { admin } from "./messages/admin";
import { editor } from "./messages/editor";
import { assistant } from "./messages/assistant";
import { panelsReview } from "./messages/panelsReview";
import { panelsResearch } from "./messages/panelsResearch";
import { accounts } from "./messages/accounts";
import { report } from "./messages/report";
import { questionnaire } from "./messages/questionnaire";
import { notifications } from "./messages/notifications";

const AREAS = [common, landing, dashboard, admin, editor, assistant, panelsReview, panelsResearch, accounts, report, questionnaire, notifications] as const;

function merge(locale: Locale): Record<string, string> {
  const out: Record<string, string> = {};
  for (const area of AREAS) Object.assign(out, (area as unknown as Record<Locale, Record<string, string>>)[locale]);
  return out;
}

export const MESSAGES: Record<Locale, Record<string, string>> = { en: merge("en"), es: merge("es"), fr: merge("fr") };

export type Translate = (key: string, vars?: Vars) => string;

/** Looks the key up in `locale`, then in English, then returns the key itself so a gap is visible rather than blank. */
export function translate(locale: Locale, key: string, vars?: Vars): string {
  const s = MESSAGES[locale][key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key;
  return interpolate(s, vars);
}

export function translator(locale: Locale): Translate {
  return (key, vars) => translate(locale, key, vars);
}

/** Keys that exist in English but not in another locale: used by the i18n check script. */
export function missingKeys(): Record<Exclude<Locale, "en">, string[]> {
  const out = { es: [] as string[], fr: [] as string[] };
  for (const l of LOCALES) {
    if (l === "en") continue;
    for (const k of Object.keys(MESSAGES.en)) if (!(k in MESSAGES[l])) out[l].push(k);
  }
  return out;
}
