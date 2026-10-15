/**
 * From parsed cells to a typed, summarised sheet, and the D11 data card (docs/papers.md §1.3, §3.3, §3.4, D10, D11).
 * Pure and client-safe: `import type` from the app, relative runtime imports only.
 *
 * - `summarizeSheet` types every column (number, date, boolean, text, empty), normalises its cells (numeric strings
 *   become numbers, dates become ISO strings, "NA"-like tokens in number/date/boolean columns become null), computes
 *   n, missing, distinct and the numeric statistics, assigns a role and a readable label, and keeps category labels
 *   only where D11 allows them.
 * - `dataCard` writes what the model (and the source index) may see of a dataset: column names, types, roles,
 *   counts and summary statistics. Never a row, never a value of an identifier or free-text column.
 */
import type { Dataset, DatasetCell, DatasetColumn, DatasetSheet } from "@/lib/db";
import { compareText, decimalsOf, frequencies, max, mean, median, min, sd, toNumber } from "./stats";
import { columnLabel, formatNumber } from "./labels";
import { MAX_SHEETS } from "../sources/caps";

// ---------- Cells ----------

/** Written in a number, date or boolean column, these mean "no value". Text columns keep them as they are. */
const MISSING_TOKENS = new Set(["na", "n/a", "n.a.", "nan", "null", "none", "-", "--", "—", "–", ".", "#n/a", "#na", "?", "missing", "s/d", "k.a."]);

export function isBlank(v: DatasetCell | undefined): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/** A cell as a category key: trimmed text, "true"/"false", or the number as JavaScript prints it. Null when blank. */
export function cellText(v: DatasetCell | undefined): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const s = v.trim();
    return s ? s : null;
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  return Number.isFinite(v) ? String(v) : null;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const DMY_RE = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/;
const YMD_SLASH_RE = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;

function validUtc(y: number, m: number, d: number, hh = 0, mm = 0, ss = 0): number | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || hh > 23 || mm > 59 || ss > 59) return null;
  const t = Date.UTC(y, m - 1, d, hh, mm, ss);
  const dt = new Date(t);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? t : null;
}

/** Milliseconds (UTC) of an ISO date cell ("2020-03-01" or "2020-03-01T10:30"); null otherwise. */
export function dateMs(v: DatasetCell | undefined): number | null {
  if (typeof v !== "string") return null;
  const m = ISO_DATE_RE.exec(v.trim());
  if (!m) return null;
  return validUtc(+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
}

const pad2 = (n: number) => (n < 10 ? "0" + n : String(n));

/** "YYYY-MM-DD" (or "YYYY-MM-DDTHH:MM[:SS]" when the time is not midnight) of a UTC timestamp. */
export function isoDate(ms: number): string {
  const d = new Date(ms);
  const day = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  const hh = d.getUTCHours();
  const mi = d.getUTCMinutes();
  const ss = d.getUTCSeconds();
  if (!hh && !mi && !ss) return day;
  return `${day}T${pad2(hh)}:${pad2(mi)}${ss ? ":" + pad2(ss) : ""}`;
}

type DayOrder = "dmy" | "mdy";

function parseDate(s: string, order: DayOrder): number | null {
  const iso = ISO_DATE_RE.exec(s);
  if (iso) return validUtc(+iso[1], +iso[2], +iso[3], iso[4] ? +iso[4] : 0, iso[5] ? +iso[5] : 0, iso[6] ? +iso[6] : 0);
  const ymd = YMD_SLASH_RE.exec(s);
  if (ymd) return validUtc(+ymd[1], +ymd[2], +ymd[3]);
  const dmy = DMY_RE.exec(s);
  if (dmy) return order === "dmy" ? validUtc(+dmy[3], +dmy[2], +dmy[1]) : validUtc(+dmy[3], +dmy[1], +dmy[2]);
  return null;
}

/** dd/mm/yyyy unless a value only makes sense as mm/dd/yyyy (second part above 12 and first part at most 12). */
function dayOrder(strings: string[]): DayOrder {
  let firstOver12 = false;
  let secondOver12 = false;
  for (const s of strings) {
    const m = DMY_RE.exec(s);
    if (!m) continue;
    if (+m[1] > 12) firstOver12 = true;
    if (+m[2] > 12) secondOver12 = true;
  }
  return secondOver12 && !firstOver12 ? "mdy" : "dmy";
}

// ---------- Column typing ----------

type ColumnType = DatasetColumn["type"];

interface Typed {
  type: ColumnType;
  /** Normalised cells, same length as the input. */
  cells: DatasetCell[];
}

function typeColumn(raw: DatasetCell[]): Typed {
  let nonBlank = 0;
  let numbers = 0;
  let booleans = 0;
  let dates = 0;
  let tokens = 0;
  const strings: string[] = [];
  for (const v of raw) {
    if (isBlank(v)) continue;
    nonBlank++;
    if (typeof v === "number") {
      if (Number.isFinite(v)) numbers++;
      continue;
    }
    if (typeof v === "boolean") {
      booleans++;
      continue;
    }
    const s = String(v).trim();
    strings.push(s);
    if (toNumber(s) !== null) numbers++;
    else if (/^(true|false)$/i.test(s)) booleans++;
    else if (ISO_DATE_RE.test(s) || DMY_RE.test(s) || YMD_SLASH_RE.test(s)) dates++;
    else if (MISSING_TOKENS.has(s.toLowerCase())) tokens++;
  }
  if (!nonBlank) return { type: "empty", cells: raw.map(() => null) };
  if (numbers && numbers + tokens === nonBlank) {
    return { type: "number", cells: raw.map((v) => (isBlank(v) ? null : toNumber(v))) };
  }
  if (booleans && booleans + tokens === nonBlank) {
    return {
      type: "boolean",
      cells: raw.map((v) => {
        if (typeof v === "boolean") return v;
        const s = typeof v === "string" ? v.trim().toLowerCase() : "";
        return s === "true" ? true : s === "false" ? false : null;
      }),
    };
  }
  if (dates && dates + tokens === nonBlank) {
    const order = dayOrder(strings);
    const parsed = raw.map((v) => (typeof v === "string" && !isBlank(v) ? parseDate(v.trim(), order) : null));
    // Every date must parse (31/02/2020 does not): otherwise the column stays text.
    const bad = raw.some((v, i) => typeof v === "string" && !isBlank(v) && !MISSING_TOKENS.has(v.trim().toLowerCase()) && parsed[i] === null);
    if (!bad) return { type: "date", cells: parsed.map((t) => (t === null ? null : isoDate(t))) };
  }
  return { type: "text", cells: raw.map((v) => (isBlank(v) ? null : typeof v === "string" ? v.trim() : cellText(v))) };
}

// ---------- Roles ----------

const ID_NAME_RE = /(^|[_\s-])(id|code|uuid)$/i;
const YEAR_NAME_RE = /(^|[_\s-])(year|yr|ano|anio|annee)$/i;

function plain(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Column names that name an identifier: `participant_id`, `gauge_id`, `Code`, `uuid`. */
export function isIdentifierName(name: string): boolean {
  return ID_NAME_RE.test(name.trim());
}

/** A column name in lower case without accents, with `_`, `-`, `.` and spaces as single spaces. */
function nameWords(name: string): string {
  return plain(name)
    .toLowerCase()
    .replace(/[_\-.\s]+/g, " ")
    .trim();
}

/**
 * Whole column names that hold a person's name (en/es/fr/de): `name`, `full_name`, `Nombre completo`, `Prénom`,
 * `Teilnehmer`, `student_name`. A plain `_name` suffix is not one: `region_name` and `school_name` are categories.
 */
const PERSON_NAME_RE =
  /^(name|full ?name|first ?name|last ?name|surname|given ?name|family ?name|middle ?name|nombre( completo)?|nombre y apellidos?|apellidos?|nom|nom complet|nom prenom|prenom|vorname|nachname|name vorname|vorname nachname|student( name)?|participant( name)?|respondent( name)?|interviewee( name)?|alumn[oa]|estudiante|participante|encuestad[oa]|entrevistad[oa]|etudiante?|teilnehmer(in)?|befragte[r]?)$/;

/** Column names ending in a contact or personal-document word: `email`, `E-Mail-Adresse`, `phone_number`, `dni`. */
const CONTACT_NAME_RE =
  /(^| )(e ?mail|mail|correo|correo electronico|courriel|phone|phone number|telephone|telefono|telefon|telefonnummer|tel|mobile|movil|cellphone|handy|handynummer|address|email address|direccion|adresse|anschrift|dni|nif|nie|ssn|passport|pasaporte|passeport|iban)$/;

/**
 * Column names that name a person or their contact details (D11, docs/papers.md §8.6): such a column is an
 * identifier whatever its values, so its labels never reach the prompt or the indexed text.
 */
export function isPersonalDataName(name: string): boolean {
  const w = nameWords(name);
  return !!w && (PERSON_NAME_RE.test(w) || CONTACT_NAME_RE.test(w));
}

const EMAIL_VALUE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_VALUE_RE = /^\+?[\d\s().-]{7,}$/;

/** A phone number: at least 7 digits, and a leading "+" or 3 or more groups of digits ("600 12 34 56", "(555) 123-4567"). */
function looksLikePhone(s: string): boolean {
  if (s.length > 40 || !PHONE_VALUE_RE.test(s)) return false;
  const digits = s.replace(/\D/g, "").length;
  if (digits < 7) return false;
  return s[0] === "+" || s.split(/[\s().-]+/).filter(Boolean).length >= 3;
}

/** At least half of the values look like email addresses or phone numbers. */
function looksLikeContacts(texts: string[]): boolean {
  if (!texts.length) return false;
  let hits = 0;
  for (const t of texts) if (EMAIL_VALUE_RE.test(t) || looksLikePhone(t)) hits++;
  return hits * 2 >= texts.length;
}

/** Column names that name a year: year, año, année, Jahr (also `survey_year`, `Erhebungsjahr`). */
export function isYearName(name: string): boolean {
  const p = plain(name.trim());
  return YEAR_NAME_RE.test(p) || /jahr$/i.test(p);
}

interface RoleInput {
  name: string;
  type: ColumnType;
  n: number;
  distinct: number;
  /** Non-blank values (normalised). */
  values: DatasetCell[];
}

/**
 * Role of a column (docs/papers.md §3.4):
 * - identifier: name `(^|_)(id|code|uuid)$`; a name that names a person or contact details (`name`, `email`,
 *   `phone`…, any type); text values that are mostly email addresses or phone numbers; short text values that are
 *   almost all different (distinct ≥ 0.9 · n); or a whole-number row index (1…n);
 * - time: a date column, or whole numbers named year/año/année/Jahr, or all between 1900 and 2100;
 * - measure: any other number column;
 * - freeText: long text, or text values that are almost all different and read like phrases;
 * - category: any other text or boolean column;
 * - empty: no values.
 */
export function columnRole(c: RoleInput): DatasetColumn["role"] {
  if (c.type === "empty" || c.n === 0) return "empty";
  // A yes/no column named `mobile` or `student` is a category, not contact details.
  if (isIdentifierName(c.name) || (c.type !== "boolean" && isPersonalDataName(c.name))) return "identifier";
  // Names, emails and phone numbers repeat in longitudinal data (distinct/n is low), so values count too.
  if (c.type === "text" && looksLikeContacts(c.values.map((v) => String(v).trim()))) return "identifier";
  if (c.type === "date") return "time";
  if (c.type === "number") {
    const nums = c.values as number[];
    const integers = nums.every((x) => Number.isInteger(x));
    if (integers && isYearName(c.name)) return "time";
    const lo = min(nums) as number;
    const hi = max(nums) as number;
    // A name with a unit (`elevation_m`) is a measure even when its values look like years.
    const unit = /\([^)]+\)$/.test(columnLabel(c.name)) && !/\)$/.test(c.name.trim());
    if (integers && !unit && lo >= 1900 && hi <= 2100 && c.distinct >= 2) return "time";
    if (integers && c.n >= 10 && c.distinct === c.n && hi - lo + 1 === c.n) return "identifier";
    return "measure";
  }
  if (c.type === "boolean") return "category";
  // Text
  const texts = c.values.map((v) => String(v));
  const totalLen = texts.reduce((s, t) => s + t.length, 0);
  const avgLen = texts.length ? totalLen / texts.length : 0;
  const longest = texts.reduce((m, t) => Math.max(m, t.length), 0);
  if (avgLen > 40 || longest > 120) return "freeText";
  if (c.distinct / c.n > 0.9 && c.n >= 2) {
    const spaced = texts.filter((t) => /\s/.test(t)).length;
    return spaced / texts.length >= 0.5 ? "freeText" : "identifier";
  }
  return "category";
}

/** D11: category labels are exposed only for 2–30 distinct values, distinct/rows ≤ 0.5, values ≤ 40 characters; only values with n ≥ 3. */
function exposedCategories(role: DatasetColumn["role"], values: DatasetCell[], distinct: number, rows: number): DatasetColumn["categories"] {
  if (role !== "category") return undefined;
  if (distinct < 2 || distinct > 30 || !rows || distinct / rows > 0.5) return undefined;
  const keys = values.map((v) => cellText(v) as string);
  if (keys.some((k) => k.length > 40)) return undefined;
  const list = frequencies(keys).filter((f) => f.n >= 3);
  return list.length ? list : undefined;
}

/** Decimals used to present a number column: the most any value shows, at most 4. */
function columnPrecision(nums: number[]): number {
  let p = 0;
  for (const x of nums) {
    const d = decimalsOf(x, 4);
    if (d > p) p = d;
    if (p === 4) break;
  }
  return p;
}

/** Header names: empty → "Column N", duplicates get " (2)", " (3)"… (idempotent with the parsers' own rule). */
export function uniqueNames(header: string[], count: number): string[] {
  const out: string[] = [];
  const seen = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    let name = String(header[i] ?? "").replace(/\s+/g, " ").trim() || `Column ${i + 1}`;
    const key = name.toLowerCase();
    const k = (seen.get(key) || 0) + 1;
    seen.set(key, k);
    if (k > 1) name = `${name} (${k})`;
    out.push(name);
  }
  return out;
}

export interface SummarizeOptions {
  /** 1-based row of the header in the original sheet. */
  headerRow: number;
  /** The parser cut the sheet at a cap (cells, rows or columns). */
  truncated: boolean;
}

/**
 * A typed, summarised sheet from its header and column-major cells (`columns[c][r]`). Columns shorter than the
 * longest are padded with null. The returned `data` holds the normalised cells (see the module comment).
 */
export function summarizeSheet(name: string, header: string[], columns: DatasetCell[][], opts: SummarizeOptions): DatasetSheet {
  const count = Math.max(header.length, columns.length);
  const rowCount = columns.reduce((m, c) => Math.max(m, Array.isArray(c) ? c.length : 0), 0);
  const names = uniqueNames(header, count);
  const data: DatasetCell[][] = [];
  const cols: DatasetColumn[] = [];
  for (let c = 0; c < count; c++) {
    const raw: DatasetCell[] = [];
    const src = Array.isArray(columns[c]) ? columns[c] : [];
    for (let r = 0; r < rowCount; r++) raw.push(r < src.length && src[r] !== undefined ? src[r] : null);
    const typed = typeColumn(raw);
    data.push(typed.cells);
    cols.push(describeColumn(names[c], typed, rowCount));
  }
  return { name: String(name || "Sheet 1"), columns: cols, data, rowCount, headerRow: opts.headerRow, truncated: !!opts.truncated };
}

function describeColumn(name: string, typed: Typed, rowCount: number): DatasetColumn {
  const values = typed.cells.filter((v) => v !== null);
  const n = values.length;
  const distinct = new Set(values.map((v) => cellText(v))).size;
  const col: DatasetColumn = {
    name,
    label: columnLabel(name),
    type: typed.type,
    role: "empty",
    n,
    missing: rowCount - n,
    distinct,
  };
  let nums: number[] = [];
  if (typed.type === "number") nums = values as number[];
  else if (typed.type === "date") nums = values.map((v) => dateMs(v) as number);
  if (nums.length) {
    col.min = min(nums) as number;
    col.max = max(nums) as number;
    col.mean = mean(nums) as number;
    col.median = median(nums) as number;
    const s = sd(nums);
    if (s !== null) col.sd = s;
    if (typed.type === "number") col.precision = columnPrecision(nums);
  }
  col.role = columnRole({ name, type: typed.type, n, distinct, values });
  const cats = exposedCategories(col.role, values, distinct, rowCount);
  if (cats) col.categories = cats;
  return col;
}

// ---------- Data card (D11) ----------

/**
 * Text from a file (column name, category label, sheet or file name) made safe to quote in a prompt: no code fences,
 * no `thesisfic-artifact` marker, no line breaks or control characters, at most `max` characters.
 */
export function sanitizeForPrompt(s: string, maxLen = 80): string {
  let out = String(s ?? "")
    .replace(/`{3,}/g, "'")
    .replace(/thesisfic-artifact/gi, "")
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (out.length > maxLen) out = out.slice(0, maxLen - 1).trimEnd() + "…";
  return out;
}

const ROLE_TEXT: Record<DatasetColumn["role"], string> = {
  measure: "measure",
  category: "category",
  time: "time",
  identifier: "identifier / free text",
  freeText: "identifier / free text",
  empty: "empty",
};

function cardNumber(v: number | undefined, decimals: number): string {
  return v === undefined ? "n/a" : formatNumber(v, "en", decimals);
}

function columnCardLine(c: DatasetColumn, i: number): string {
  const parts = [`${i + 1}. ${sanitizeForPrompt(c.name)}`, `label "${sanitizeForPrompt(c.label)}"`, c.type, ROLE_TEXT[c.role], `n ${c.n}`, `missing ${c.missing}`, `distinct ${c.distinct}`];
  const hidden = c.role === "identifier" || c.role === "freeText";
  if (!hidden && c.type === "number" && c.min !== undefined) {
    const p = c.precision ?? 0;
    const ps = Math.min(4, p + 2);
    parts.push(`min ${cardNumber(c.min, p)}`, `max ${cardNumber(c.max, p)}`, `mean ${cardNumber(c.mean, ps)}`, `median ${cardNumber(c.median, Math.min(4, p + 1))}`);
    if (c.sd !== undefined) parts.push(`sd ${cardNumber(c.sd, ps)}`);
  } else if (!hidden && c.type === "date" && c.min !== undefined) {
    const day = (ms: number) => isoDate(Math.round(ms)).slice(0, 10);
    parts.push(`min ${isoDate(c.min)}`, `max ${isoDate(c.max as number)}`, `mean ${day(c.mean as number)}`, `median ${day(c.median as number)}`);
    if (c.sd !== undefined) parts.push(`sd ${cardNumber(c.sd / 86400000, 1)} days`);
  }
  if (!hidden && c.categories && c.categories.length) {
    const shown = c.categories.map((k) => `${sanitizeForPrompt(k.value, 40)} (${k.n})`).join(", ");
    const covered = c.categories.reduce((s, k) => s + k.n, 0);
    const rest = c.distinct - c.categories.length;
    parts.push(`categories: ${shown}${rest > 0 ? `; ${rest} more values with fewer than 3 rows each (${c.n - covered} rows)` : ""}`);
  } else if (c.role === "category") {
    parts.push("category labels not shown");
  }
  return parts.join(" · ");
}

/**
 * The D11 data card of a dataset: per sheet, its size and header row; per column, name, label, type, role, n,
 * missing and distinct; numbers and dates add min/max/mean/median/sd; categories add their labels and counts only
 * where D11 allows it; identifier and free-text columns get counts only. No rows. Model-facing, in English. The same
 * text is indexed as the source text of the sheet. `sheetsCut` (sheets past the sheet cap) adds a line saying so.
 */
export function dataCard(dataset: Pick<Dataset, "sheets"> & { sheetsCut?: number }, fileName: string): string {
  const lines: string[] = [];
  lines.push(`Data card of "${sanitizeForPrompt(fileName, 120)}", computed by Thesisfic. Column names, types and summary statistics only: no rows.`);
  const cut = typeof dataset.sheetsCut === "number" && dataset.sheetsCut > 0 ? Math.round(dataset.sheetsCut) : 0;
  if (cut) lines.push(`The file has ${cut} more ${cut === 1 ? "sheet" : "sheets"} that ${cut === 1 ? "was" : "were"} not read: Thesisfic reads at most ${MAX_SHEETS} sheets of a file.`);
  dataset.sheets.forEach((s, si) => {
    lines.push("");
    lines.push(`Sheet ${si + 1} "${sanitizeForPrompt(s.name)}" · ${s.rowCount} rows · ${s.columns.length} columns · header on row ${s.headerRow}`);
    if (s.truncated) lines.push(`The file was cut at the size limit: these statistics cover the first ${s.rowCount} rows.`);
    s.columns.forEach((c, ci) => lines.push(columnCardLine(c, ci)));
  });
  return lines.join("\n");
}

/** Numbers of a column for statistics: numbers as they are, dates as UTC milliseconds; null elsewhere. */
export function numericCell(col: Pick<DatasetColumn, "type">, v: DatasetCell | undefined): number | null {
  if (col.type === "number") return toNumber(v);
  if (col.type === "date") return dateMs(v ?? null);
  return null;
}

/** Category keys of a column in natural order (numbers numerically, text naturally). */
export function sortKeys(keys: string[], numeric: boolean): string[] {
  return keys.slice().sort((a, b) => (numeric ? Number(a) - Number(b) : compareText(a, b)));
}
