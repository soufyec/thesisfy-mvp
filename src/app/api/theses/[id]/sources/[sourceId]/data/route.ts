import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { canAccessThesis } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function intParam(v: string | null, fallback: number): number {
  if (v === null || v.trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : NaN;
}

/**
 * GET ?sheet=0&offset=0&limit=100 → one page of the rows of a sheet source linked to this thesis, for "Preview data".
 * Same access as the source's passages: the owner, the paper's teacher (D8) and the university's administration.
 * Response { sheet: { name, columns, rowCount, headerRow, truncated }, rows, offset, limit, total, sheets }:
 * `columns` are the dataset columns (name, label, type, role, counts and statistics), `rows` are row-major
 * (`rows[i][c]` is column c of row offset + i), `total` is the sheet's row count, `sheets` lists every sheet
 * ({ name, rowCount }). `limit` is clamped to 1–500. 404 when the thesis, the source or its table is not reachable.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string; sourceId: string } }) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const t = getT();
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error(t("library.error.thesisNotFound"), 404);
  const source = db.sources.findById(params.sourceId);
  if (!source || !Array.isArray(source.thesisIds) || source.thesisIds.indexOf(thesis.id) === -1) return error(t("library.error.sourceNotFound"), 404);
  const dataset = source.datasetId ? db.datasets.findById(source.datasetId) : db.datasets.findBySource(source.id);
  if (!dataset || !dataset.sheets.length) return error(t("library.error.noData"), 404);

  const q = request.nextUrl.searchParams;
  const sheetIndex = intParam(q.get("sheet"), 0);
  if (!Number.isInteger(sheetIndex) || sheetIndex < 0 || sheetIndex >= dataset.sheets.length) return error(t("library.error.sheetNotFound"), 404);
  const sheet = dataset.sheets[sheetIndex];
  const total = sheet.rowCount;
  const rawOffset = intParam(q.get("offset"), 0);
  const rawLimit = intParam(q.get("limit"), DEFAULT_LIMIT);
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.min(rawOffset, total)) : 0;
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, MAX_LIMIT)) : DEFAULT_LIMIT;
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

  return json({
    sheet: { name: sheet.name, columns: sheet.columns, rowCount: sheet.rowCount, headerRow: sheet.headerRow, truncated: sheet.truncated },
    rows,
    offset,
    limit,
    total,
    sheets: dataset.sheets.map((s) => ({ name: s.name, rowCount: s.rowCount })),
  });
}
