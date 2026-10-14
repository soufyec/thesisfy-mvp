import type { Messages } from "../index";

/**
 * Primary data, analyses, tables and figures from the Research copilot (docs/papers.md §1.3, §1.4, §3.3–3.5, §4.5–4.7).
 * Skeleton from the foundation phase: no component uses these keys yet. data-backend adds the server keys
 * (`data.title.*` in the writing language, error codes, notes, `data.unsupported`, `data.blockedHint`, demo replies);
 * copilot-ui adds the UI keys (artifact card, attach menu, privacy lines, data preview).
 * Rules: numbers are always computed by Thesisfic; say "computed", "attributed", "declared", never "detected".
 * Spanish uses "tú"; French "vous"; German "Sie". No exclamation marks.
 */
const en = {};

export const data: Messages<typeof en> = {
  en,
  es: {},
  fr: {},
  de: {},
};
