/**
 * CSV and TSV reader for uploaded primary data (docs/papers.md §3.3). Pure (TextDecoder only), no dependencies.
 *
 * - Encoding: BOM (UTF-8, UTF-16 LE/BE) first; otherwise strict UTF-8, falling back to windows-1252 (what Excel on
 *   Windows writes for "CSV" in Western European locales).
 * - Separator: `,` `;` tab or `|`, chosen as the one that splits the first records into the most consistent number of
 *   fields (≥ 2); `.tsv` files are always tab-separated.
 * - RFC 4180: quoted fields with `""` escapes and line breaks inside quotes; CRLF, LF or CR line ends. Lenient with
 *   stray quotes inside unquoted fields (kept as text).
 * - Stops collecting once the walking limit is reached (`cut`), so a 4 MB file never becomes millions of cells.
 * Numbers stay strings here: `sheets.ts` handles decimal commas and `summarizeSheet` types the columns.
 */
import type { DatasetCell } from "@/lib/db";
import type { RawSheet } from "./sheets";
import { rowWidth, walkLimit } from "./sheets";
import { MAX_DATASET_CELLS } from "./caps";

export type TextEncodingName = "utf-8" | "utf-16le" | "utf-16be" | "windows-1252";

/** Whether bytes look like binary data rather than text (NUL bytes in the first 8 KB, without a UTF-16 BOM). */
export function looksBinary(buf: Uint8Array): boolean {
  if (buf.length >= 2 && ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff))) return false;
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

function decodeWith(label: string, bytes: Uint8Array, fatal = false): string {
  return new TextDecoder(label, { fatal }).decode(bytes);
}

/** windows-1252 code points of the bytes 0x80–0x9F (the rest equals Latin-1). Node's TextDecoder decodes these as Latin-1. */
const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];

/** windows-1252 bytes → text, with the same table on every runtime. */
export function decodeWindows1252(bytes: Uint8Array): string {
  const parts: string[] = [];
  const CHUNK = 8192;
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const end = Math.min(bytes.length, start + CHUNK);
    const codes: number[] = new Array(end - start);
    for (let i = start; i < end; i++) {
      const b = bytes[i];
      codes[i - start] = b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80] : b;
    }
    parts.push(String.fromCharCode.apply(null, codes));
  }
  return parts.join("");
}

/** Decodes a text file: BOM, then strict UTF-8, then windows-1252. The BOM is never part of the text. */
export function decodeText(buf: Uint8Array): { text: string; encoding: TextEncodingName } {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return { text: decodeWith("utf-8", buf.subarray(3)), encoding: "utf-8" };
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return { text: decodeWith("utf-16le", buf.subarray(2)), encoding: "utf-16le" };
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return { text: decodeWith("utf-16be", buf.subarray(2)), encoding: "utf-16be" };
  try {
    return { text: decodeWith("utf-8", buf, true), encoding: "utf-8" };
  } catch {
    return { text: decodeWindows1252(buf), encoding: "windows-1252" };
  }
}

export const CSV_DELIMITERS = [",", ";", "\t", "|"] as const;

export interface CsvParseOptions {
  delimiter: string;
  /** Stop after this many cells (trailing blanks not counted); `cut` tells whether something was left. */
  maxCells?: number;
  /** Stop after this many records (used by delimiter detection). */
  maxRecords?: number;
}

/**
 * RFC 4180 parser. Returns row-major records where `rows[i]` is record i (blank records leave a hole), cells as
 * strings (empty → null).
 */
export function parseCsv(text: string, opts: CsvParseOptions): { rows: DatasetCell[][]; cut: boolean; records: number } {
  const d = opts.delimiter;
  const maxCells = opts.maxCells ?? Infinity;
  const maxRecords = opts.maxRecords ?? Infinity;
  const rows: DatasetCell[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let wasQuoted = false;
  let cells = 0;
  let index = 0;
  let cut = false;
  const len = text.length;
  let i = 0;

  const endField = () => {
    record.push(field);
    field = "";
    wasQuoted = false;
  };
  const endRecord = () => {
    endField();
    const cellsOut: DatasetCell[] = record.map((f) => (f === "" ? null : f));
    const w = rowWidth(cellsOut);
    if (w > 0) {
      rows[index] = cellsOut;
      cells += w;
    }
    index++;
    record = [];
  };

  while (i < len) {
    if (quoted) {
      // Append the run up to the next quote in one step.
      const q = text.indexOf('"', i);
      if (q === -1) {
        field += text.slice(i);
        i = len;
        break;
      }
      field += text.slice(i, q);
      if (text[q + 1] === '"') {
        field += '"';
        i = q + 2;
        continue;
      }
      quoted = false;
      i = q + 1;
      continue;
    }
    const ch = text[i];
    if (ch !== '"' && ch !== d && ch !== "\n" && ch !== "\r") {
      // Append the run up to the next separator, line end or quote in one step.
      let j = i + 1;
      while (j < len) {
        const c = text[j];
        if (c === d || c === "\n" || c === "\r" || c === '"') break;
        j++;
      }
      field += text.slice(i, j);
      i = j;
      continue;
    }
    if (ch === '"' && field === "" && !wasQuoted) {
      quoted = true;
      wasQuoted = true;
      i++;
      continue;
    }
    if (ch === d) {
      endField();
      i++;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      endRecord();
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
      if (cells >= maxCells || index >= maxRecords) {
        cut = i < len && /\S/.test(text.slice(i, i + 4096));
        return { rows, cut, records: index };
      }
      continue;
    }
    field += ch; // a quote inside an unquoted field is kept as text
    i++;
  }
  if (field !== "" || record.length || quoted) endRecord();
  return { rows, cut, records: index };
}

/** The separator that splits the first records into the most consistent number of fields (≥ 2); "," if none does. */
export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 64 * 1024);
  let best = ",";
  let bestScore = -1;
  let bestMode = 0;
  for (const d of CSV_DELIMITERS) {
    const { rows } = parseCsv(sample, { delimiter: d, maxRecords: 30 });
    const counts: number[] = [];
    for (let i = 0; i < rows.length; i++) if (rows[i]) counts.push(rows[i].length);
    if (counts.length > 1 && sample.length >= 64 * 1024) counts.pop(); // the last sampled record may be cut
    if (!counts.length) continue;
    const freq = new Map<number, number>();
    for (const c of counts) freq.set(c, (freq.get(c) || 0) + 1);
    let mode = 0;
    let modeN = 0;
    freq.forEach((n, c) => {
      if (n > modeN || (n === modeN && c > mode)) {
        mode = c;
        modeN = n;
      }
    });
    if (mode < 2) continue;
    const score = modeN / counts.length;
    if (score > bestScore + 1e-9 || (Math.abs(score - bestScore) < 1e-9 && mode > bestMode)) {
      best = d;
      bestScore = score;
      bestMode = mode;
    }
  }
  return best;
}

export interface CsvRead {
  sheet: RawSheet;
  delimiter: string;
  encoding: TextEncodingName;
}

/**
 * Bytes of a .csv/.tsv file → one raw sheet named `name`, collected up to the walking limit of `cellBudget`.
 * `tab` forces the tab separator (.tsv).
 */
export function readCsv(buf: Uint8Array, name: string, opts: { tab?: boolean; cellBudget?: number } = {}): CsvRead {
  const { text, encoding } = decodeText(buf);
  const delimiter = opts.tab ? "\t" : detectDelimiter(text);
  const { rows, cut } = parseCsv(text, { delimiter, maxCells: walkLimit(opts.cellBudget ?? MAX_DATASET_CELLS) });
  return { sheet: { name, rows, cut }, delimiter, encoding };
}
