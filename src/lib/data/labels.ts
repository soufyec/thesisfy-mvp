/**
 * Readable labels and number formats for primary data (docs/papers.md §3.4, D19). Pure and client-safe: only
 * `import type` from the app, no runtime imports.
 *
 * Numbers are written in the paper's writing language: decimal comma in es/fr/de and never any grouping
 * (`useGrouping: false`), so "12345,6" stays one word for the word counters and one token in a table cell.
 */
import type { WritingLanguage } from "@/lib/db";

/** Same shape as `Translate` in src/lib/i18n/dictionary.ts: pure modules take it as a parameter instead of importing the dictionary. */
export type Translate = (key: string, vars?: Record<string, string | number | undefined>) => string;

/** Unit suffixes recognised at the end of a column name (`annual_rainfall_mm` → "Annual rainfall (mm)"). */
const UNITS: Record<string, string> = {
  mm: "mm",
  cm: "cm",
  m: "m",
  km: "km",
  m2: "m²",
  km2: "km²",
  ha: "ha",
  mg: "mg",
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "l",
  pct: "%",
  percent: "%",
  perc: "%",
  eur: "EUR",
  usd: "USD",
  gbp: "GBP",
  chf: "CHF",
  ms: "ms",
  s: "s",
  sec: "s",
  seconds: "s",
  minutes: "min",
  hours: "h",
  h: "h",
  hr: "h",
  hrs: "h",
  years: "years",
  yrs: "years",
  degc: "°C",
  celsius: "°C",
  kwh: "kWh",
};

/** Small words that stay lower case and acronyms that stay upper case in labels. */
const UPPER = new Set(["id", "uuid", "gdp", "co2", "bmi", "iq", "ph", "eu", "uk", "us", "usa"]);

/**
 * Readable label for a column name: snake_case, kebab-case, dotted and camelCase names become words with a first
 * capital, a known unit suffix becomes "(unit)", and "id" becomes "ID". A name that already has spaces only gets a
 * first capital. Deterministic and language-neutral (the words are the student's own).
 */
export function columnLabel(name: string): string {
  const raw = String(name ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  if (raw.indexOf(" ") !== -1 || !/[_\-.]|[a-z][A-Z]/.test(raw)) return capFirst(raw);
  const parts = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .split(/[_\-.]+/)
    .filter(Boolean);
  if (!parts.length) return capFirst(raw);
  let unit = "";
  if (parts.length >= 2) {
    const last = parts[parts.length - 1].toLowerCase();
    if (UNITS[last]) {
      unit = UNITS[last];
      parts.pop();
    }
  }
  const words = parts.map((p) => {
    const low = p.toLowerCase();
    if (UPPER.has(low)) return low === "co2" ? "CO2" : low === "ph" ? "pH" : low.toUpperCase();
    // Keep acronyms the student wrote in capitals (GDP_per_capita).
    if (p.length >= 2 && p === p.toUpperCase() && /[A-Z]/.test(p)) return p;
    return low;
  });
  const text = capFirst(words.join(" "));
  return unit ? `${text} (${unit})` : text;
}

export function capFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * A label used mid-sentence ("Mean annual rainfall (mm) by region"): first letter lowered, except in German (nouns keep
 * their capital) and for acronyms ("GDP", "ID").
 */
export function inSentence(label: string, lang: WritingLanguage | string): string {
  if (!label || lang === "de") return label;
  const a = label.charAt(0);
  const b = label.charAt(1);
  if (b && b === b.toUpperCase() && b !== b.toLowerCase()) return label; // acronym
  return a.toLowerCase() + label.slice(1);
}

/** "a, b and c" in the writing language (`data.list.and`). */
export function listJoin(items: string[], tr: Translate): string {
  if (items.length <= 1) return items[0] || "";
  return `${items.slice(0, -1).join(", ")}${tr("data.list.and")}${items[items.length - 1]}`;
}

const DECIMAL_COMMA: Record<string, boolean> = { es: true, fr: true, de: true };

/**
 * A number with `precision` decimals in the writing language: decimal comma in es/fr/de, no grouping, "-" for
 * negatives, never "-0". Null, NaN and infinities print as "—".
 */
export function formatNumber(v: number | null | undefined, lang: WritingLanguage | string, precision = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const p = Math.max(0, Math.min(6, Math.round(precision || 0)));
  let s = v.toFixed(p);
  if (s.charAt(0) === "-" && Number(s) === 0) s = s.slice(1);
  return DECIMAL_COMMA[lang] ? s.replace(".", ",") : s;
}

/**
 * Compact axis number from 1,000 up: 1500 → "1.5K" (en) / "1,5K"; 2,000,000 → "2M". Below 1,000 (or with
 * `compact` false) it prints like `formatNumber`. `decimals` is the precision of the plain form.
 */
export function formatCompact(v: number, lang: WritingLanguage | string, decimals = 0, compact = true, maxDecimals = 2): string {
  const a = Math.abs(v);
  if (!compact || a < 1000) return formatNumber(v, lang, decimals);
  const [div, suffix] = a >= 1e9 ? [1e9, "B"] : a >= 1e6 ? [1e6, "M"] : [1e3, "K"];
  const scaled = v / div;
  // Up to `maxDecimals` decimals, only as many as the value needs (1.25K, 1.5K, 2K).
  let d = 0;
  while (d < maxDecimals && Math.abs(scaled * Math.pow(10, d) - Math.round(scaled * Math.pow(10, d))) > 1e-6) d++;
  return formatNumber(scaled, lang, d) + suffix;
}
