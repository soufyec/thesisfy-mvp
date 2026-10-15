import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { canAccessThesis } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";
import { getT } from "@/lib/i18n/server";
import { datasetPage } from "@/lib/sources/dataPage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const page = datasetPage(dataset, request.nextUrl.searchParams);
  if (!page) return error(t("library.error.sheetNotFound"), 404);
  return json(page);
}
