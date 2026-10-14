import { db, Notification } from "./db";
import { isLocale, Locale, LOCALE_TAGS, Vars } from "./i18n";
import { translator } from "./i18n/dictionary";

/** The language a user reads notifications in: their saved interface language, English otherwise. */
export function recipientLocale(userId: string): Locale {
  const u = db.users.findById(userId);
  return u && isLocale(u.preferences?.language) ? u.preferences.language : "en";
}

/** A calendar date in the recipient's language. Due dates are stored at noon UTC, so UTC gives the chosen day everywhere. */
function formatDate(iso: string, lang: Locale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(LOCALE_TAGS[lang], { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * In-app notifications are written in the recipient's language at the moment they are created, from keys in
 * `messages/notifications.ts` (`<key>.title`, `<key>.message`). Stored text stays plain: no keys in the database.
 *
 * Options: `messageKey` replaces `<key>.message` (a variant of the same notification, e.g. with a due date);
 * `dates` are ISO dates formatted in the recipient's language and added to the variables under the same names.
 */
export function notifyUser(userId: string, key: string, vars: Vars, opts: { type: Notification["type"]; link?: string; messageKey?: string; dates?: Record<string, string | undefined> }) {
  const lang = recipientLocale(userId);
  const t = translator(lang);
  const all: Vars = { ...vars };
  if (opts.dates) for (const [k, iso] of Object.entries(opts.dates)) if (iso) all[k] = formatDate(iso, lang);
  return db.notifications.create({ userId, title: t(`${key}.title`, all), message: t(opts.messageKey || `${key}.message`, all), type: opts.type, link: opts.link });
}
