import type { Dataset } from "@/lib/db";

/** Rows per page of "Preview data" by default, and at most. */
export const DATA_PAGE_DEFAULT = 100;
export const DATA_PAGE_MAX = 500;

function intParam(v: string | null, fallback: number): number {
  if (v === null || v.trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : NaN;
}

export interface DataPageBody {
  rowNumbers?: number[];
  sheet: { name: string; columns: Dataset["sheets"][number]["columns"]; rowCount: number; lastRow?: number; headerRow: Dataset["sheets"][number]["headerRow"]; truncated: Dataset["sheets"][number]["truncated"] };
  rows: (string | number | boolean | null)[][];
  offset: number;
  limit: number;
  total: number;
  sheets: { name: string; rowCount: number }[];
}

/**
 * One page of a dataset's sheet for "Preview data" (`?sheet=0&offset=0&limit=100`): the sheet's columns, its rows
 * row-major (`rows[i][c]` is column c of row offset + i), the sheet's row count and every sheet's name and row count.
 * `limit` is clamped to 1–500 and `offset` to the sheet. Null when `sheet` names no sheet. Shared by the paper's data
 * route and the owner's library data route, so both answer the same shape.
 */
export function datasetPage(dataset: Dataset, q: URLSearchParams): DataPageBody | null {
  const sheetIndex = intParam(q.get("sheet"), 0);
  if (!Number.isInteger(sheetIndex) || sheetIndex < 0 || sheetIndex >= dataset.sheets.length) return null;
  const sheet = dataset.sheets[sheetIndex];
  const total = sheet.rowCount;
  const rawOffset = intParam(q.get("offset"), 0);
  const rawLimit = intParam(q.get("limit"), DATA_PAGE_DEFAULT);
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.min(rawOffset, total)) : 0;
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, DATA_PAGE_MAX)) : DATA_PAGE_DEFAULT;
  const end = Math.min(total, offset + limit);
  const rows: (string | number | boolean | null)[][] = [];
  for (let i = offset; i < end; i++) {
    const row: (string | number | boolean | null)[] = new Array(sheet.columns.length);
    for (let c = 0; c < sheet.columns.length; c++) {
      const col = sheet.data[c];
      const v = col ? col[i] : null;
      row[c] = v === undefined ? null : v;
    }
    rows.push(row);
  }
  return {
    rowNumbers: Array.from({ length: end - offset }, (_, i) => sheet.rowNumbers?.[offset + i] ?? sheet.headerRow + offset + i + 1),
    sheet: { lastRow: sheet.rowNumbers?.[sheet.rowNumbers.length - 1] ?? sheet.headerRow + sheet.rowCount, name: sheet.name, columns: sheet.columns, rowCount: sheet.rowCount, headerRow: sheet.headerRow, truncated: sheet.truncated },
    rows,
    offset,
    limit,
    total,
    sheets: dataset.sheets.map((s) => ({ name: s.name, rowCount: s.rowCount })),
  };
}
