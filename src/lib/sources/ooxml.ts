/**
 * Office Open XML readers for uploaded primary sources (docs/papers.md §3.3): `.xlsx` → raw sheets, `.docx` → text.
 * No dependencies: `zip.ts` (Node zlib) and small scanners over the XML parts.
 *
 * XML safety
 * - A part with a DTD (`<!DOCTYPE`, `<!ENTITY`) is refused, and only the five predefined entities plus numeric
 *   character references are decoded (`decodeXml`), so no entity can expand and nothing external is fetched.
 * - Scanning is linear in the size of the part: start tags are matched with `[^<>]` (attribute values cannot hold
 *   `<`), each element's end tag is searched forward once, and scanning stops at the first element that is not
 *   closed (a cut or broken part) instead of searching again from every later start tag.
 *
 * `parseXlsx`
 * - Workbook from `_rels/.rels`, sheets in workbook order through `workbook.xml.rels` (relative and absolute targets);
 *   chart sheets are skipped, hidden sheets only read when no visible sheet has data. At most `MAX_SHEETS` sheets.
 * - Cells: shared strings (rich text runs joined, phonetic `<rPh>` ignored), `inlineStr`, `str`, `b`, `d`, `e` → null,
 *   numbers; `<c>` and `<row>` without `r` take the next position. Formulas: only the cached value.
 * - Dates by cell style: built-in formats 14–17, 22, 27–31, 36, 50–58 and custom formats with d/y (or month-only m)
 *   → ISO strings; time formats (18–21, 32–35, 45–47, custom h/s) → "HH:MM[:SS]"; `date1904` honoured.
 * - Truncation while walking: each sheet stops at the walking limit of the cell budget (and reads at most 16 MB of
 *   XML); shared strings are resolved afterwards, for the collected cells only.
 *
 * `extractFromDocx`
 * - `w:p` paragraphs with `w:t`, `w:tab`, `w:br`/`w:cr`; heading styles (by name in styles.xml, `outlineLvl`, or
 *   Heading/Title ids) on their own line; tables row by row ("cell | cell") with a depth counter (nested tables are
 *   flattened into their cell); `w:delText`, `w:instrText`, `w:moveFrom` and `mc:Fallback` are skipped, so
 *   `mc:AlternateContent` is read once.
 */
import type { DatasetCell } from "@/lib/db";
import type { Extracted } from "./extract";
import { isoDate } from "../data/summarize";
import { IngestError } from "./errors";
import { openZip, ZipArchive, ZipError } from "./zip";
import { rowWidth, walkLimit, type RawSheet } from "./sheets";
import { MAX_CELL_CHARS, MAX_COLUMNS, MAX_DATASET_CELLS, MAX_SHEETS } from "./caps";

/** XML read per sheet at most (enough for the cell budget with room for styled empty cells). */
export const MAX_SHEET_XML_BYTES = 16 * 1024 * 1024;

// ---------------------------------------------------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------------------------------------------------

const ENTITY_RE = /&(?:(lt|gt|quot|apos|amp)|#([0-9]{1,8})|#[xX]([0-9a-fA-F]{1,7}));/g;
const NAMED: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" };

function codePoint(n: number): string {
  if (!(n > 0) || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return "\ufffd";
  return String.fromCodePoint(n);
}

/** Decodes the five predefined entities and numeric references in one pass; anything else stays as written. */
export function decodeXml(s: string): string {
  if (s.indexOf("&") === -1) return s;
  return s.replace(ENTITY_RE, (_m, name: string | undefined, dec: string | undefined, hex: string | undefined) => {
    if (name) return NAMED[name];
    return codePoint(dec !== undefined ? parseInt(dec, 10) : parseInt(hex as string, 16));
  });
}

/** OOXML string escapes `_x000D_` (and `_x005F_` for a literal underscore sequence). */
function decodeOoxmlEscapes(s: string): string {
  if (s.indexOf("_x") === -1) return s;
  return s.replace(/_x([0-9A-Fa-f]{4})_/g, (_m, h: string) => codePoint(parseInt(h, 16)));
}

/** DTDs never appear in Office files: refuse them rather than parse around them. */
export function assertNoDtd(xml: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml.slice(0, 65536))) throw new IngestError("unreadable", "XML with a DTD");
}

const ATTR_RES = new Map<string, RegExp>();

/** Value of an attribute in the text of a start tag (`name` may include a prefix, e.g. "r:id"). */
function attr(tag: string, name: string): string | undefined {
  let re = ATTR_RES.get(name);
  if (!re) {
    re = new RegExp("(?:^|\\s)" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')");
    ATTR_RES.set(name, re);
  }
  const m = re.exec(tag);
  if (!m) return undefined;
  return decodeXml(m[1] !== undefined ? m[1] : m[2]);
}

/** The relationship id of a `<sheet>` tag, whatever prefix the relationships namespace got. */
function relId(tag: string): string | undefined {
  const m = /(?:^|\s)[A-Za-z_][\w.-]*:id\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(tag);
  return m ? decodeXml(m[1] !== undefined ? m[1] : m[2]) : undefined;
}

const OPEN_RES = new Map<string, RegExp>();
const CLOSE_RES = new Map<string, RegExp>();

/** Start tags of `local` with any namespace prefix: group 1 = attributes, group 2 = "/" when self-closing. */
function openRe(local: string): RegExp {
  let re = OPEN_RES.get(local);
  if (!re) {
    re = new RegExp(`<(?:[\\w.-]+:)?${local}(?=[\\s/>])([^<>]*?)(\\/?)>`, "g");
    OPEN_RES.set(local, re);
  }
  return re;
}

function closeRe(local: string): RegExp {
  let re = CLOSE_RES.get(local);
  if (!re) {
    re = new RegExp(`<\\/(?:[\\w.-]+:)?${local}\\s*>`, "g");
    CLOSE_RES.set(local, re);
  }
  return re;
}

/**
 * Calls `cb(attrs, inner)` for each `local` element of `xml` from `from` on, in order (`inner` is null for a
 * self-closing tag). Elements of that name must not nest (true for every element read here). Stops when `cb` returns
 * false, or at the first element without an end tag. Returns where it stopped: the index after the last element read,
 * and whether an unclosed element stopped it.
 */
interface ScanPair {
  open: RegExp;
  close: RegExp;
  busy: boolean;
}
const PAIRS = new Map<string, ScanPair>();

/** A start/end regex pair for `local`, reused across calls (a fresh pair when the pooled one is in use by a caller). */
function acquire(local: string): ScanPair {
  const pooled = PAIRS.get(local);
  if (pooled && !pooled.busy) {
    pooled.busy = true;
    return pooled;
  }
  const pair = { open: new RegExp(openRe(local).source, "g"), close: new RegExp(closeRe(local).source, "g"), busy: true };
  if (!pooled) PAIRS.set(local, pair);
  return pair;
}

function eachElement(xml: string, local: string, cb: (attrs: string, inner: string | null) => boolean | void, from = 0): { end: number; unclosed: boolean } {
  const pair = acquire(local);
  try {
    return scanElements(xml, pair.open, pair.close, cb, from);
  } finally {
    pair.busy = false;
  }
}

function scanElements(xml: string, open: RegExp, close: RegExp, cb: (attrs: string, inner: string | null) => boolean | void, from: number): { end: number; unclosed: boolean } {
  open.lastIndex = from;
  let end = from;
  let m: RegExpExecArray | null;
  while ((m = open.exec(xml))) {
    if (m[2] === "/") {
      end = open.lastIndex;
      if (cb(m[1], null) === false) return { end, unclosed: false };
      continue;
    }
    close.lastIndex = open.lastIndex;
    const c = close.exec(xml);
    if (!c) return { end, unclosed: true };
    end = close.lastIndex;
    if (cb(m[1], xml.slice(open.lastIndex, c.index)) === false) return { end, unclosed: false };
    open.lastIndex = close.lastIndex;
  }
  return { end, unclosed: false };
}

/** Attributes and inner text of the first `local` element, or null. */
function firstElement(xml: string, local: string): { attrs: string; inner: string | null } | null {
  let found: { attrs: string; inner: string | null } | null = null;
  eachElement(xml, local, (attrs, inner) => {
    found = { attrs, inner };
    return false;
  });
  return found;
}

/** `xml` without its `local` elements (and their content); an unclosed one drops everything after it. */
function withoutElements(xml: string, local: string): string {
  const open = new RegExp(openRe(local).source, "g");
  const close = new RegExp(closeRe(local).source, "g");
  let out = "";
  let pos = 0;
  let m: RegExpExecArray | null;
  while ((m = open.exec(xml))) {
    out += xml.slice(pos, m.index);
    if (m[2] === "/") {
      pos = open.lastIndex;
      continue;
    }
    close.lastIndex = open.lastIndex;
    const c = close.exec(xml);
    if (!c) return out;
    pos = close.lastIndex;
    open.lastIndex = pos;
  }
  return out + xml.slice(pos);
}

interface Rel {
  id: string;
  type: string;
  target: string;
  external: boolean;
}

function parseRels(xml: string | null): Rel[] {
  if (!xml) return [];
  assertNoDtd(xml);
  const out: Rel[] = [];
  eachElement(xml, "Relationship", (attrs) => {
    const id = attr(attrs, "Id");
    const target = attr(attrs, "Target");
    if (id && target) out.push({ id, type: attr(attrs, "Type") || "", target, external: (attr(attrs, "TargetMode") || "").toLowerCase() === "external" });
  });
  return out;
}

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/** Resolves a relationship target against the source part's folder (absolute targets start at the package root). */
function resolveTarget(baseDir: string, target: string): string {
  const raw = target.replace(/\\/g, "/");
  const parts = (raw.startsWith("/") ? raw.slice(1) : (baseDir ? baseDir + "/" : "") + raw).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

function relsPathOf(partPath: string): string {
  const dir = dirOf(partPath);
  const base = partPath.slice(dir ? dir.length + 1 : 0);
  return (dir ? dir + "/" : "") + "_rels/" + base + ".rels";
}

/** The main part of the package (`officeDocument` relationship), or `fallback`. */
function mainPart(zip: ZipArchive, fallback: string): string | null {
  const rels = parseRels(zip.readText("_rels/.rels"));
  const main = rels.find((r) => /\/officeDocument$/i.test(r.type) && !r.external);
  const path = main ? resolveTarget("", main.target) : fallback;
  if (zip.entry(path)) return path;
  return zip.entry(fallback) ? fallback : null;
}

function fromZipError(e: unknown): Error {
  if (e instanceof IngestError) return e;
  if (e instanceof ZipError) {
    if (e.code === "encrypted") return new IngestError("encrypted", e.message);
    if (e.code === "too_large") return new IngestError("too_large", e.message);
    return new IngestError("unreadable", e.message);
  }
  return new IngestError("unreadable", (e as Error)?.message);
}

/** Opens the package and runs a reader over it, turning zip failures into ingest errors. */
function withPackage<T>(buf: Buffer, fn: (zip: ZipArchive) => T): T {
  try {
    return fn(openZip(buf));
  } catch (e) {
    throw fromZipError(e);
  }
}

/** A part cut by `readPrefixText` ends at its last complete tag. */
function wholeTags(part: { text: string; cut: boolean }): string {
  return part.cut ? part.text.slice(0, part.text.lastIndexOf(">") + 1) : part.text;
}

// ---------------------------------------------------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------------------------------------------------

type FormatKind = "number" | "date" | "datetime" | "time" | "duration";

const BUILTIN_DATE = [14, 15, 16, 17, 27, 28, 29, 30, 31, 36, 50, 51, 52, 53, 54, 55, 56, 57, 58];
const BUILTIN_TIME = [18, 19, 20, 21, 32, 33, 34, 35, 45, 47];

/** What a number format shows: a date, a date and time, a time of day, an elapsed time ([h]), or a plain number. */
export function formatKind(id: number, code?: string): FormatKind {
  if (code === undefined || code === "") {
    if (BUILTIN_DATE.indexOf(id) !== -1) return "date";
    if (id === 22) return "datetime";
    if (id === 46) return "duration";
    if (BUILTIN_TIME.indexOf(id) !== -1) return "time";
    return "number";
  }
  // First section only; quoted literals, escapes, fills and paddings, colours and locales are not tokens.
  let c = code.split(";")[0];
  const elapsed = /\[(?:h+|m+|s+)\]/i.test(c);
  c = c
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/[_*]./g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/AM\/PM|A\/P/gi, "")
    .toLowerCase();
  if (elapsed) return "duration";
  const hasDate = /[dy]/.test(c);
  const hasTime = /[hs]/.test(c);
  if (hasDate) return hasTime ? "datetime" : "date";
  if (hasTime) return "time";
  if (/m/.test(c)) return "date"; // "mmm", "mmmm"-like month formats without d/y
  return "number";
}

const DAY_MS = 86400000;

/** Excel serial → ISO string (date, or date and time when not midnight). Out-of-range serials stay numbers. */
export function serialToIso(v: number, date1904: boolean): string | number {
  if (!Number.isFinite(v) || v < 0 || v > 2958465) return v;
  let ms: number;
  if (date1904) ms = (v - 24107) * DAY_MS;
  else ms = (v < 60 ? v - 25568 : v - 25569) * DAY_MS; // Excel counts a 29 February 1900 that never existed
  ms = Math.round(ms / 1000) * 1000;
  return isoDate(ms);
}

const pad2 = (n: number) => (n < 10 ? "0" + n : String(n));

/** Fraction of a day → "HH:MM" or "HH:MM:SS"; `elapsed` keeps hours above 24 ([h] formats). */
export function serialToTime(v: number, elapsed: boolean): string | number {
  if (!Number.isFinite(v) || v < 0) return v;
  let secs = Math.round(v * 86400);
  if (!elapsed) secs = secs % 86400;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${pad2(h)}:${pad2(m)}${s ? ":" + pad2(s) : ""}`;
}

interface Styles {
  /** Format kind per cellXfs index. */
  kinds: FormatKind[];
}

function parseStyles(xml: string | null): Styles {
  if (!xml) return { kinds: [] };
  assertNoDtd(xml);
  const custom = new Map<number, string>();
  const numFmts = firstElement(xml, "numFmts");
  if (numFmts && numFmts.inner) {
    eachElement(numFmts.inner, "numFmt", (attrs) => {
      const id = Number(attr(attrs, "numFmtId"));
      if (Number.isFinite(id)) custom.set(id, attr(attrs, "formatCode") || "");
    });
  }
  const kinds: FormatKind[] = [];
  const xfs = firstElement(xml, "cellXfs");
  if (xfs && xfs.inner) {
    // <xf> may hold <alignment/> or <protection/>: only its start tag matters.
    const re = new RegExp(openRe("xf").source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(xfs.inner))) {
      const id = Number(attr(m[1], "numFmtId") || 0);
      kinds.push(formatKind(id, custom.has(id) ? custom.get(id) : undefined));
    }
  }
  return { kinds };
}

/** Column index (0-based) of a cell reference such as "AB12"; -1 when it has no letters. */
function columnOf(ref: string | undefined): number {
  if (!ref) return -1;
  const m = /^\$?([A-Za-z]{1,3})/.exec(ref);
  if (!m) return -1;
  let n = 0;
  const letters = m[1].toUpperCase();
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}

/** Raw characters read per string before decoding (a cell keeps at most MAX_CELL_CHARS). */
const RAW_STRING_CHARS = MAX_CELL_CHARS * 12;

/** Text of a shared or inline string: its `<t>` runs joined, phonetic runs ignored, capped. */
function stringText(inner: string): string {
  const body = inner.indexOf("rPh") === -1 ? inner : withoutElements(inner, "rPh");
  let out = "";
  eachElement(body, "t", (_attrs, text) => {
    if (text) out += text;
    return out.length <= RAW_STRING_CHARS;
  });
  return decodeOoxmlEscapes(decodeXml(out.slice(0, RAW_STRING_CHARS)));
}

interface PendingString {
  row: DatasetCell[];
  col: number;
  index: number;
}

interface SheetRef {
  name: string;
  path: string;
  hidden: boolean;
}

interface WalkContext {
  styles: Styles;
  date1904: boolean;
  limit: number;
  pending: PendingString[];
}

/** The value of one `<c>` element (shared strings are queued in `pending` and left null). */
function cellValue(head: string, body: string, ctx: WalkContext): { value: DatasetCell; shared?: number } {
  const type = attr(head, "t") || "n";
  if (type === "inlineStr") {
    const is = firstElement(body, "is");
    return { value: is && is.inner ? stringText(is.inner) : null };
  }
  const v = firstElement(body, "v");
  const raw = v && v.inner ? decodeXml(v.inner.length > RAW_STRING_CHARS ? v.inner.slice(0, RAW_STRING_CHARS) : v.inner) : "";
  if (type === "s") {
    const idx = Number(raw);
    return raw !== "" && Number.isInteger(idx) && idx >= 0 ? { value: null, shared: idx } : { value: null };
  }
  if (type === "str") return { value: raw === "" ? null : decodeOoxmlEscapes(raw) };
  if (type === "b") return { value: raw === "" ? null : raw === "1" || raw.toLowerCase() === "true" };
  if (type === "e") return { value: null }; // #DIV/0!, #N/A…
  if (type === "d") return { value: raw.trim() || null };
  if (raw.trim() === "") return { value: null };
  const num = Number(raw);
  if (!Number.isFinite(num)) return { value: raw };
  const kind = ctx.styles.kinds[Number(attr(head, "s") || 0)] || "number";
  if (kind === "date" || kind === "datetime") return { value: serialToIso(num, ctx.date1904) };
  if (kind === "time" || kind === "duration") return { value: serialToTime(num, kind === "duration") };
  return { value: num };
}

/** Excel's row limit: a row number above it is not a real row, and the walk stops there (the sheet reads as cut). */
export const MAX_SHEET_ROWS = 1048576;

/** One worksheet's rows, up to the walking limit. Shared strings are left pending (null) for `resolveStrings`. */
function walkSheet(xml: string, readCut: boolean, ctx: WalkContext, name: string): RawSheet {
  assertNoDtd(xml);
  const rows: DatasetCell[][] = [];
  let collected = 0;
  let lastRow = -1;
  let full = false;
  let beyond = false;
  const stop = eachElement(xml, "row", (rowAttrs, inner) => {
    const rAttr = Number(attr(rowAttrs, "r"));
    const rowIndex = Number.isInteger(rAttr) && rAttr > 0 ? rAttr - 1 : lastRow + 1;
    // A row number past Excel's limit (r="4294967295") would make `rows` a huge sparse array: stop and mark the cut.
    if (rowIndex >= MAX_SHEET_ROWS) {
      beyond = true;
      return false;
    }
    lastRow = rowIndex;
    if (!inner) return; // <row/> without cells
    const row: DatasetCell[] = [];
    const queued: PendingString[] = [];
    let lastCol = -1;
    eachElement(inner, "c", (head, body) => {
      const refCol = columnOf(attr(head, "r"));
      const col = refCol >= 0 ? refCol : lastCol + 1;
      lastCol = col;
      if (col > 16383) return;
      const { value, shared } = cellValue(head, body || "", ctx);
      if (shared !== undefined) queued.push({ row, col, index: shared });
      else if (value !== null) row[col] = value;
    });
    let w = rowWidth(row);
    for (const q of queued) w = Math.max(w, Math.min(MAX_COLUMNS + 1, q.col + 1));
    if (!w) return;
    for (const q of queued) row[q.col] = null;
    rows[rowIndex] = row;
    for (const q of queued) ctx.pending.push(q);
    collected += w;
    if (collected >= ctx.limit) {
      full = true;
      return false;
    }
  });
  // Cut when the walking limit stopped it with rows left, when a row was not closed, or when the part was a prefix.
  const rowsLeft = full && new RegExp(openRe("row").source).test(xml.slice(stop.end));
  return { name, rows, cut: beyond || rowsLeft || stop.unclosed || readCut };
}

/** Fills the pending shared-string cells, reading `sharedStrings.xml` only up to the largest index needed. */
function resolveStrings(zip: ZipArchive, path: string | null, pending: PendingString[]) {
  if (!pending.length) return;
  const needed = new Map<number, string>();
  let maxIndex = -1;
  for (const p of pending) {
    needed.set(p.index, "");
    if (p.index > maxIndex) maxIndex = p.index;
  }
  if (path && zip.remaining() > 0) {
    const part = zip.readPrefixText(path, zip.remaining());
    const xml = part ? wholeTags(part) : "";
    assertNoDtd(xml);
    let k = 0;
    eachElement(xml, "si", (_attrs, inner) => {
      if (needed.has(k)) needed.set(k, inner ? stringText(inner) : "");
      k++;
      return k <= maxIndex;
    });
  }
  for (const p of pending) {
    const s = needed.get(p.index);
    p.row[p.col] = s ? s : null;
  }
}

export interface XlsxRead {
  sheets: RawSheet[];
  date1904: boolean;
  /** Worksheets not read because `MAX_SHEETS` sheets with data were already read (some may be empty). */
  sheetsLeft: number;
}

/**
 * `.xlsx` bytes → raw sheets (at most `MAX_SHEETS` with data), each collected up to the walking limit of
 * `cellBudget`. Throws `IngestError` ("unreadable", "encrypted", "too_large").
 */
export function parseXlsx(buf: Buffer, opts: { cellBudget?: number } = {}): XlsxRead {
  return withPackage(buf, (zip) => {
    const wbPath = mainPart(zip, "xl/workbook.xml");
    if (!wbPath) throw new IngestError("unreadable", "No workbook part");
    const wbXml = zip.readText(wbPath) || "";
    assertNoDtd(wbXml);
    const wbPr = firstElement(wbXml, "workbookPr");
    const date1904 = !!wbPr && /^(1|true)$/i.test(attr(wbPr.attrs, "date1904") || "");
    const wbDir = dirOf(wbPath);
    const rels = parseRels(zip.readText(relsPathOf(wbPath)));
    const relById = new Map<string, Rel>();
    for (const r of rels) relById.set(r.id, r);
    const ofType = (suffix: RegExp, fallback: string) => {
      const r = rels.find((x) => suffix.test(x.type) && !x.external);
      const p = r ? resolveTarget(wbDir, r.target) : resolveTarget(wbDir, fallback);
      return zip.entry(p) ? p : null;
    };
    const stylesPath = ofType(/\/styles$/i, "styles.xml");
    const stringsPath = ofType(/\/sharedStrings$/i, "sharedStrings.xml");
    const styles = parseStyles(stylesPath ? zip.readText(stylesPath) : null);

    const refs: SheetRef[] = [];
    const sheets = firstElement(wbXml, "sheets");
    eachElement(sheets && sheets.inner ? sheets.inner : "", "sheet", (attrs) => {
      const id = relId(attrs);
      const rel = id ? relById.get(id) : undefined;
      if (!rel || rel.external || !/\/worksheet$/i.test(rel.type)) return; // chart and dialog sheets, macros
      const path = resolveTarget(wbDir, rel.target);
      if (!zip.entry(path)) return;
      const state = (attr(attrs, "state") || "visible").toLowerCase();
      refs.push({ name: attr(attrs, "name") || `Sheet ${refs.length + 1}`, path, hidden: state !== "visible" });
    });
    if (!refs.length) throw new IngestError("unreadable", "No worksheet");

    const ctx: WalkContext = { styles, date1904, limit: walkLimit(opts.cellBudget ?? MAX_DATASET_CELLS), pending: [] };
    // Leave room in the inflate budget for the shared strings, read after the sheets.
    const sst = stringsPath ? zip.entry(stringsPath) : undefined;
    const reserve = sst ? Math.min(sst.size, Math.floor(zip.remaining() / 2)) : 0;
    let sheetsLeft = 0;
    const read = (list: SheetRef[]) => {
      const out: RawSheet[] = [];
      for (let i = 0; i < list.length; i++) {
        const ref = list[i];
        if (out.length >= MAX_SHEETS) {
          sheetsLeft = list.length - i;
          break;
        }
        const room = Math.min(MAX_SHEET_XML_BYTES, zip.remaining() - reserve);
        if (room <= 0) break;
        const part = zip.readPrefixText(ref.path, room);
        if (!part) continue;
        const sheet = walkSheet(wholeTags(part), part.cut, ctx, ref.name);
        if (sheet.rows.length) out.push(sheet);
      }
      return out;
    };
    let found = read(refs.filter((r) => !r.hidden));
    if (!found.length) found = read(refs.filter((r) => r.hidden));
    resolveStrings(zip, stringsPath, ctx.pending);
    return { sheets: found, date1904, sheetsLeft };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------------------------------------------------------

/** Paragraph style ids that are headings: by name ("heading 1"…, "Title"), by outline level. */
function headingStyles(xml: string | null): Set<string> {
  const out = new Set<string>();
  if (!xml) return out;
  assertNoDtd(xml);
  eachElement(xml, "style", (attrs, inner) => {
    const id = attr(attrs, "w:styleId") ?? attr(attrs, "styleId");
    if (!id || !inner) return;
    const nameEl = firstElement(inner, "name");
    const name = nameEl ? attr(nameEl.attrs, "w:val") ?? attr(nameEl.attrs, "val") ?? "" : "";
    if (/^(heading\s*\d|title|subtitle)$/i.test(name.trim()) || firstElement(inner, "outlineLvl")) out.add(id);
  });
  return out;
}

/** Elements whose whole content is left out of the text. */
const SKIP = ["Fallback", "delText", "instrText", "moveFrom", "rPr"];

interface Para {
  text: string;
  heading: boolean;
}

/** Text of a `.docx` (paragraphs, headings and tables in document order). Throws `IngestError` like `parseXlsx`. */
export function extractFromDocx(buf: Buffer): Extracted {
  return withPackage(buf, (zip) => {
    const docPath = mainPart(zip, "word/document.xml");
    if (!docPath) throw new IngestError("unreadable", "No document part");
    const rels = parseRels(zip.readText(relsPathOf(docPath)));
    const stylesRel = rels.find((r) => /\/styles$/i.test(r.type) && !r.external);
    const stylesPath = resolveTarget(dirOf(docPath), stylesRel ? stylesRel.target : "styles.xml");
    const headings = headingStyles(zip.entry(stylesPath) ? zip.readText(stylesPath) : null);
    const part = zip.readPrefixText(docPath, zip.remaining());
    if (!part) throw new IngestError("unreadable", "No document part");
    const xml = wholeTags(part);
    assertNoDtd(xml);
    const text = docxText(xml, headings);
    return { text, pages: text ? [text] : [], pageCount: 0, status: text ? "parsed" : "no_text" };
  });
}

/** Walks the document XML with a linear tokenizer; see the module comment. Exported for tests. */
export function docxText(xml: string, headings: Set<string>): string {
  const blocks: string[] = [];
  let skip = 0;
  let inText = 0;
  let inRun = 0;
  let para: Para | null = null;
  const paraStack: Para[] = [];
  let tblDepth = 0;
  let rows: string[][] = [];
  let cells: string[] = [];
  let cell: string[] = [];

  const add = (s: string) => {
    if (para) para.text += s;
  };
  const endPara = () => {
    if (!para) return;
    let t = para.text.replace(/[ \u00a0]+/g, " ").replace(/ *\n */g, "\n").trim();
    if (para.heading) t = t.replace(/\n/g, " ").replace(/ {2,}/g, " "); // a heading stays on one line of its own
    if (t) {
      if (tblDepth > 0) cell.push(t.replace(/\s+/g, " "));
      else blocks.push(t);
    }
    para = paraStack.pop() || null;
  };
  const textToken = (raw: string, cdata: boolean) => {
    if (!skip && inText) add(cdata ? raw : decodeXml(raw));
  };
  const tagToken = (tag: string) => {
    const closing = tag.charAt(0) === "/";
    const selfClosing = !closing && tag.charAt(tag.length - 1) === "/";
    const m = /^\/?(?:[\w.-]+:)?([\w.-]+)/.exec(tag);
    if (!m) return;
    const local = m[1];
    const attrs = tag.slice(m[0].length);
    if (SKIP.indexOf(local) !== -1) {
      if (closing) skip = Math.max(0, skip - 1);
      else if (!selfClosing) skip++;
      return;
    }
    if (skip) return;
    switch (local) {
      case "p":
        if (closing) endPara();
        else if (!selfClosing) {
          if (para) paraStack.push(para); // a paragraph inside a text box inside a paragraph
          para = { text: "", heading: false };
        }
        break;
      case "pStyle": {
        const v = attr(attrs, "w:val") ?? attr(attrs, "val");
        if (para && v && (headings.has(v) || /^(heading\s?\d|title|subtitle)$/i.test(v))) para.heading = true;
        break;
      }
      case "outlineLvl":
        if (para) para.heading = true;
        break;
      case "r":
        if (closing) inRun = Math.max(0, inRun - 1);
        else if (!selfClosing) inRun++;
        break;
      case "t":
        if (closing) inText = Math.max(0, inText - 1);
        else if (!selfClosing && inRun) inText++;
        break;
      case "tab":
        if (inRun && !closing) add("\t");
        break;
      case "br":
      case "cr":
        if (inRun && !closing) add("\n");
        break;
      case "noBreakHyphen":
        if (inRun && !closing) add("-");
        break;
      case "tbl":
        if (closing) {
          tblDepth = Math.max(0, tblDepth - 1);
          if (tblDepth === 0) {
            const lines = rows.map((r) => r.join(" | ").trim()).filter((l) => l.replace(/[|\s]/g, ""));
            if (lines.length) blocks.push(lines.join("\n"));
            rows = [];
          }
        } else if (!selfClosing) {
          if (tblDepth === 0) {
            rows = [];
            cells = [];
            cell = [];
          }
          tblDepth++;
        }
        break;
      case "tr":
        if (tblDepth === 1) {
          if (closing) {
            rows.push(cells);
            cells = [];
          } else if (!selfClosing) cells = [];
        }
        break;
      case "tc":
        if (tblDepth === 1) {
          if (closing) {
            cells.push(cell.join(" "));
            cell = [];
          } else if (!selfClosing) cell = [];
        }
        break;
      default:
        break;
    }
  };

  // Tokenizer: each character is visited a constant number of times; an unclosed comment, processing instruction,
  // CDATA section or tag ends the walk.
  const n = xml.length;
  let i = 0;
  while (i < n) {
    const lt = xml.indexOf("<", i);
    if (lt === -1) {
      textToken(xml.slice(i), false);
      break;
    }
    if (lt > i) textToken(xml.slice(i, lt), false);
    if (xml.startsWith("<!--", lt)) {
      const e = xml.indexOf("-->", lt + 4);
      if (e === -1) break;
      i = e + 3;
    } else if (xml.startsWith("<![CDATA[", lt)) {
      const e = xml.indexOf("]]>", lt + 9);
      if (e === -1) break;
      textToken(xml.slice(lt + 9, e), true);
      i = e + 3;
    } else if (xml.startsWith("<?", lt) || xml.startsWith("<!", lt)) {
      const e = xml.indexOf(">", lt + 2);
      if (e === -1) break;
      i = e + 1;
    } else {
      const gt = xml.indexOf(">", lt + 1);
      if (gt === -1) break;
      tagToken(xml.slice(lt + 1, gt));
      i = gt + 1;
    }
  }
  while (para) endPara();
  // Every paragraph, heading and table is its own block, separated by a blank line as chunkText expects.
  return blocks.join("\n\n").trim();
}
