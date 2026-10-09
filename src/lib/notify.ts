import { db, Notification } from "./db";
import { isLocale, Locale, Vars } from "./i18n";
import { translator } from "./i18n/dictionary";

/**
 * In-app notifications are written in the recipient's language at the moment they are created, from keys in
 * `messages/notifications.ts` (`<key>.title`, `<key>.message`). Stored text stays plain: no keys in the database.
 */
export function notifyUser(userId: string, key: string, vars: Vars, opts: { type: Notification["type"]; link?: string }) {
  const u = db.users.findById(userId);
  const lang: Locale = isLocale(u?.preferences.language) ? u!.preferences.language : "en";
  const t = translator(lang);
  return db.notifications.create({ userId, title: t(`${key}.title`, vars), message: t(`${key}.message`, vars), type: opts.type, link: opts.link });
}
