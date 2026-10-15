/**
 * From parsed rows (CSV or XLSX) to the column-major sheets of a `Dataset` (docs/papers.md §1.3, §3.3, D10).
 * Pure and client-safe: `import type` from the app, relative runtime imports only.
 *
 * - Header: the first row (among the first 20) with at least half of the table width in non-empty text cells,
 *   followed by a row with some number; title rows above it are skipped and `headerRow` records where it was.
 *   Without such a row: the first row that fills at least half the width; a table of numbers only has no header
 *   (`headerRow` 0, names "Column N").
 * - Caps while building: at most `MAX_COLUMNS` columns, `MAX_CELL_CHARS` characters per cell, and the cell budget
 *   (width × rows, `MAX_DATASET_CELLS` per dataset across `MAX_SHEETS` sheets). A cut sets `truncated`.
 * - Decimal comma: a column whose every value reads as a number with a decimal comma ("4,5", "1.234,5") and that has
 *   at least one comma becomes numbers. Columns that do not all fit stay as they are.
 * - Typing, statistics, roles and labels are `summarizeSheet`'s job (src/lib/data/summarize.ts).
 */
import type { DatasetCell, DatasetSheet } from "@/lib/db";
import { summarizeSheet } from "../data/summarize";
import { toNumber } from "../data/stats";
import { MAX_CELL_CHARS, MAX_COLUMNS, MAX_DATASET_CELLS, MAX_SHEETS } from "./caps";

/** Rows searched for the header. */
export const HEADER_SCAN_ROWS = 20;

/** A sheet as a parser read it: row-major, `rows[i]` is row i + 1 of the original (holes allowed). */
export interface RawSheet {
  name: string;
  rows: DatasetCell[][];
  /** The parser stopped before the end of the sheet (cell budget or read limit). */
  cut: boolean;
}

/** Cells a parser should collect per sheet before stopping: enough for the budget plus title rows above the header. */
export function walkLimit(cellBudget: number): number {
  return Math.max(0, cellBudget) + MAX_COLUMNS * HEADER_SCAN_ROWS;
}

/** Number of positions a row occupies for the walking count (trailing blanks ignored, at most `MAX_COLUMNS`). */
export function rowWidth(row: DatasetCell[] | undefined): number {
  if (!row) return 0;
  for (let i = Math.min(row.length, MAX_COLUMNS + 1) - 1; i >= 0; i--) if (!blank(row[i])) return i + 1;
  return 0;
}

const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** A cell within the caps: strings without control characters and at most `MAX_CELL_CHARS` characters. */
export function capCell(v: DatasetCell | undefined): DatasetCell {
  if (v === undefined || v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v;
  let s = String(v).replace(CONTROL_RE, "");
  if (s.length > MAX_CELL_CHARS) s = s.slice(0, MAX_CELL_CHARS - 1) + "…";
  return s;
}

function blank(v: DatasetCell | undefined): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/** "4,5", "-0,25", "1.234,5", "1.234" (thousands) — numbers written with a decimal comma. */
const DECIMAL_COMMA_RE = /^[-+]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/;

/** Tokens that mean "no value" and do not stop a column from being numeric (summarizeSheet turns them into null). */
const MISSING = ["na", "n/a", "n.a.", "nan", "null", "none", "-", "--", "—", "–", ".", "#n/a", "?", "missing", "s/d", "k.a."];

function isMissingToken(s: string): boolean {
  return MISSING.indexOf(s.trim().toLowerCase()) !== -1;
}

/** Longer strings are never read as numbers (and `toNumber`'s pattern backtracks badly on long runs of digits). */
const MAX_NUMBER_CHARS = 40;

/** Whether a cell reads as a number (dot or comma decimal). */
export function isNumberLike(v: DatasetCell | undefined): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v !== "string") return false;
  const s = v.trim();
  return !!s && s.length <= MAX_NUMBER_CHARS && (toNumber(s) !== null || DECIMAL_COMMA_RE.test(s));
}

function isText(v: DatasetCell | undefined): boolean {
  return typeof v === "string" && v.trim() !== "" && !isNumberLike(v);
}

function nonBlankCount(row: DatasetCell[] | undefined, width: number): number {
  let n = 0;
  if (!row) return 0;
  for (let i = 0; i < Math.min(width, row.length); i++) if (!blank(row[i])) n++;
  return n;
}

function textCount(row: DatasetCell[] | undefined, width: number): number {
  let n = 0;
  if (!row) return 0;
  for (let i = 0; i < Math.min(width, row.length); i++) if (isText(row[i])) n++;
  return n;
}

function hasNumber(row: DatasetCell[] | undefined, width: number): boolean {
  if (!row) return false;
  for (let i = 0; i < Math.min(width, row.length); i++) if (isNumberLike(row[i])) return true;
  return false;
}

/**
 * Indices of the rows a parser stored, ascending. Parsers leave holes (`rows[i]` is row i + 1 of the original), so
 * `rows.length` can be far larger than the number of rows: never loop up to it. Array index keys are enumerated in
 * ascending numeric order, so this costs the number of stored rows, not the highest row number.
 */
export function rowIndices(rows: DatasetCell[][]): number[] {
  const out: number[] = [];
  for (const k of Object.keys(rows)) {
    const i = Number(k);
    if (Number.isInteger(i) && i >= 0) out.push(i);
  }
  return out;
}

/**
 * Index (0-based) of the header row, or -1 when the table has no header (numbers only) or no rows. Blank rows are
 * skipped: the search looks at the first 20 non-empty rows. See the module comment for the rule.
 */
export function detectHeader(rows: DatasetCell[][], indices: number[] = rowIndices(rows)): number {
  const filled: number[] = [];
  for (let k = 0; k < indices.length && filled.length < HEADER_SCAN_ROWS * 5; k++) if (rowWidth(rows[indices[k]]) > 0) filled.push(indices[k]);
  if (!filled.length) return -1;
  let width = 0;
  for (const i of filled) width = Math.max(width, rowWidth(rows[i]));
  const scan = filled.slice(0, HEADER_SCAN_ROWS);
  for (let k = 0; k < scan.length; k++) {
    const i = scan[k];
    if (textCount(rows[i], width) * 2 < width) continue;
    const next = filled[k + 1];
    if (next !== undefined && hasNumber(rows[next], width)) return i;
  }
  for (const i of scan) {
    if (nonBlankCount(rows[i], width) * 2 < width) continue;
    // A row of numbers only is data, not a header.
    return textCount(rows[i], width) === 0 ? -1 : i;
  }
  return textCount(rows[scan[0]], width) ? scan[0] : -1;
}

/** Converts a column written with decimal commas to numbers, when every value fits (see the module comment). */
export function applyDecimalComma(col: DatasetCell[]): DatasetCell[] {
  let commas = 0;
  for (const v of col) {
    if (blank(v) || typeof v === "number") continue;
    if (typeof v !== "string") return col;
    const s = v.trim();
    if (s.length > MAX_NUMBER_CHARS) return col;
    if (isMissingToken(s)) continue;
    if (!DECIMAL_COMMA_RE.test(s)) return col;
    if (s.indexOf(",") !== -1) commas++;
  }
  if (!commas) return col;
  return col.map((v) => {
    if (typeof v !== "string") return v;
    const s = v.trim();
    if (!s || isMissingToken(s) || !DECIMAL_COMMA_RE.test(s)) return v;
    const n = Number(s.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : v;
  });
}

function headerName(v: DatasetCell | undefined): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : String(v);
  const clean = s.replace(CONTROL_RE, " ").replace(/\s+/g, " ").trim();
  return clean.length > MAX_CELL_CHARS ? clean.slice(0, MAX_CELL_CHARS) : clean;
}

export interface BuiltSheet {
  sheet: DatasetSheet;
  /** Cells stored (columns × rows), what `Dataset.cells` counts. */
  cells: number;
}

/**
 * One raw sheet → a summarised, column-major `DatasetSheet` within `cellBudget` cells, or null when it has no data
 * row (or the budget cannot hold one row).
 */
export function buildSheet(raw: RawSheet, cellBudget: number, indices: number[] = rowIndices(raw.rows)): BuiltSheet | null {
  const rows = raw.rows;
  const h = detectHeader(rows, indices);
  const headerRow = h === -1 ? [] : (rows[h] || []).slice(0, MAX_COLUMNS);
  const start = h === -1 ? 0 : h + 1;
  let colsCut = false;
  let width = rowWidth(headerRow);
  const data: DatasetCell[][] = [];
  for (const i of indices) {
    if (i < start) continue;
    const row = rows[i];
    const w = rowWidth(row);
    if (!w) continue; // blank rows are not data
    if (w > MAX_COLUMNS || (row && row.length > MAX_COLUMNS && row.slice(MAX_COLUMNS).some((v) => !blank(v)))) colsCut = true;
    width = Math.max(width, Math.min(w, MAX_COLUMNS));
    data.push(row);
  }
  if (h !== -1 && (rows[h] || []).slice(MAX_COLUMNS).some((v) => !blank(v))) colsCut = true;
  if (!data.length || !width) return null;
  const maxRows = Math.floor(Math.max(0, cellBudget) / width);
  if (maxRows < 1) return null;
  const kept = data.length > maxRows ? data.slice(0, maxRows) : data;
  const truncated = raw.cut || colsCut || kept.length < data.length;

  const header: string[] = [];
  for (let c = 0; c < width; c++) header.push(headerName(headerRow[c]));
  const columns: DatasetCell[][] = [];
  for (let c = 0; c < width; c++) {
    const col: DatasetCell[] = new Array(kept.length);
    for (let r = 0; r < kept.length; r++) col[r] = capCell(kept[r][c]);
    columns.push(applyDecimalComma(col));
  }
  const name = headerName(raw.name).slice(0, 100) || "Sheet 1";
  const sheet = summarizeSheet(name, header, columns, { headerRow: h === -1 ? 0 : h + 1, truncated });
  return { sheet, cells: sheet.columns.length * sheet.rowCount };
}

/** Whether a raw sheet has at least one data row (after its header), whatever the budget. */
function hasDataRow(raw: RawSheet, indices: number[] = rowIndices(raw.rows)): boolean {
  const h = detectHeader(raw.rows, indices);
  const start = h === -1 ? 0 : h + 1;
  for (const i of indices) if (i >= start && rowWidth(raw.rows[i]) > 0) return true;
  return false;
}

/**
 * Raw sheets → at most `MAX_SHEETS` dataset sheets within `cellBudget` cells in total (sheets without data are
 * skipped). `noRoom` is true when a sheet with data was left out because the budget could not hold one of its rows.
 * `sheetsCut` counts the sheets with data left out because `MAX_SHEETS` sheets were already kept (D10: the file was
 * cut, and the data card says so).
 */
export function buildSheets(raws: RawSheet[], cellBudget: number = MAX_DATASET_CELLS): { sheets: DatasetSheet[]; cells: number; noRoom: boolean; sheetsCut: number } {
  const sheets: DatasetSheet[] = [];
  let cells = 0;
  let noRoom = false;
  let sheetsCut = 0;
  for (const raw of raws) {
    const indices = rowIndices(raw.rows);
    if (sheets.length >= MAX_SHEETS) {
      if (hasDataRow(raw, indices)) sheetsCut++;
      continue;
    }
    const left = cellBudget - cells;
    const built = left > 0 ? buildSheet(raw, left, indices) : null;
    if (!built) {
      if (hasDataRow(raw, indices)) noRoom = true;
      continue;
    }
    sheets.push(built.sheet);
    cells += built.cells;
  }
  return { sheets, cells, noRoom, sheetsCut };
}
