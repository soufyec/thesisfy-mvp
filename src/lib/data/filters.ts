import type { DataFilter, DatasetCell, DatasetColumn, DatasetSheet } from "../db";
import { dateMs, summarizeSheet } from "./summarize";

export class DataFilterError extends Error {
  constructor(public code: "invalid_filter" | "unknown_column" | "no_matching_rows", public column?: string, public available: string[] = []) {
    super(code);
    this.name = "DataFilterError";
    Object.setPrototypeOf(this, DataFilterError.prototype);
  }
}

const OPS = new Set(["eq", "neq", "in", "gt", "gte", "lt", "lte", "between", "isMissing", "isNotMissing"]);
const ORDERED = new Set(["gt", "gte", "lt", "lte", "between"]);
type Value = Exclude<DatasetCell, null>;

/** A year bound on a date column covers its entire year; exact dates retain their precision. */
function filterValue(value: unknown, col: DatasetColumn, upper = false): Value {
  if (col.type === "number") {
    const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
    if (Number.isFinite(n)) return n;
  } else if (col.type === "date") {
    const s = String(value);
    const date = /^\d{4}$/.test(s) ? `${s}-${upper ? "12-31T23:59:59" : "01-01"}` : upper && /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T23:59:59` : s;
    if (dateMs(date) !== null) return date;
  } else if (col.type === "boolean") {
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "false") return value === "true";
  } else if (col.type === "text" && typeof value === "string" && value.length <= 500) {
    return value.trim();
  }
  throw new DataFilterError("invalid_filter", col.name);
}

/** Strict allowlist; an invalid condition must never become an unfiltered analysis. */
export function normalizeFilters(raw: unknown, sheet: DatasetSheet, resolve: (ref: unknown) => number): DataFilter[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 16) throw new DataFilterError("invalid_filter");
  return raw.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new DataFilterError("invalid_filter");
    const r = item as Record<string, unknown>;
    const index = resolve(r.column);
    if (index < 0) throw new DataFilterError("unknown_column", typeof r.column === "string" ? r.column : undefined, sheet.columns.map(c => c.name));
    const col = sheet.columns[index];
    if (typeof r.op !== "string" || !OPS.has(r.op)) throw new DataFilterError("invalid_filter", col.name);
    const op = r.op as DataFilter["op"];
    if (op === "isMissing" || op === "isNotMissing") return { column: col.name, op };
    if (ORDERED.has(op) && col.type !== "number" && col.type !== "date") throw new DataFilterError("invalid_filter", col.name);
    let value: DataFilter["value"];
    if (op === "between" || op === "in") {
      if (!Array.isArray(r.value) || !r.value.length || r.value.length > 100 || (op === "between" && r.value.length !== 2)) throw new DataFilterError("invalid_filter", col.name);
      value = r.value.map((v, i) => filterValue(v, col, op === "between" && i === 1));
      if (op === "between" && comparable(value[0], col) > comparable(value[1], col)) throw new DataFilterError("invalid_filter", col.name);
    } else {
      value = filterValue(r.value, col, op === "lte" || op === "gt");
    }
    return { column: col.name, op, value };
  });
}

function comparable(value: Value, col: DatasetColumn): string | number {
  return col.type === "date" ? dateMs(String(value))! : typeof value === "boolean" ? Number(value) : value;
}

/** Original coordinates and column roles survive; summaries and all computations use only matching rows. */
export function filterSheet(sheet: DatasetSheet, filters: DataFilter[]): DatasetSheet {
  if (!filters.length) return sheet;
  const predicates = filters.map(f => {
    const index = sheet.columns.findIndex(c => c.name === f.column);
    if (index < 0) throw new DataFilterError("unknown_column", f.column);
    const col = sheet.columns[index];
    const values = (Array.isArray(f.value) ? f.value : f.value === undefined ? [] : [f.value]).map(v => comparable(v, col));
    return (row: number) => {
      const cell = sheet.data[index][row];
      const missing = cell === null || cell === undefined || cell === "";
      if (f.op === "isMissing") return missing;
      if (f.op === "isNotMissing") return !missing;
      if (missing) return false;
      const v = comparable(cell, col);
      switch (f.op) {
        case "eq": return v === values[0];
        case "neq": return v !== values[0];
        case "in": return values.includes(v);
        case "gt": return v > values[0];
        case "gte": return v >= values[0];
        case "lt": return v < values[0];
        case "lte": return v <= values[0];
        case "between": return v >= values[0] && v <= values[1];
      }
    };
  });
  const rows = Array.from({ length: sheet.rowCount }, (_, i) => i).filter(i => predicates.every(p => p(i)));
  if (!rows.length) throw new DataFilterError("no_matching_rows");
  const selected = summarizeSheet(sheet.name, sheet.columns.map(c => c.name), sheet.data.map(c => rows.map(i => c[i])), { headerRow: sheet.headerRow, truncated: sheet.truncated });
  selected.data = sheet.data.map(c => rows.map(i => c[i]));
  selected.columns = selected.columns.map((c, i) => {
    const original = sheet.columns[i];
    const values = selected.data[i].filter(v => v !== null && v !== "");
    const categories = original.categories?.map(k => ({ value: k.value, n: values.filter(v => String(v).trim() === k.value).length })).filter(k => k.n >= 3);
    return { ...c, type: original.type, role: original.role, label: original.label, precision: original.precision, n: values.length, missing: rows.length - values.length, distinct: new Set(values).size, categories };
  });
  selected.rowNumbers = rows.map(i => sheet.rowNumbers?.[i] ?? sheet.headerRow + i + 1);
  return selected;
}

/** Only explicit year intervals with an unambiguous time column. Does not infer a range from “2012 vs 2014”. */
export function requestedYearFilters(text: string, sheet: DatasetSheet): DataFilter[] {
  const t = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const ranges = Array.from(t.matchAll(/\b(?:from|desde|de|du|von|between|entre|zwischen)\s+(\d{4})\s+(?:to|through|until|hasta|a|au|bis|and|y|et|und)\s+(\d{4})\b/g));
  if (ranges.length !== 1) return [];
  const m = ranges[0];
  const time = sheet.columns.filter(c => c.role === "time" && (c.type === "number" || c.type === "date"));
  const named = time.filter(c => t.includes(c.name.toLowerCase()));
  const col = named.length === 1 ? named[0] : time.length === 1 ? time[0] : undefined;
  return col ? [{ column: col.name, op: "between", value: [Number(m[1]), Number(m[2])] }] : [];
}
