import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { error, json, requireUser } from "@/lib/api";
import { getT } from "@/lib/i18n/server";
import { datasetPage } from "@/lib/sources/dataPage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET ?sheet=0&offset=0&limit=100 → one page of the rows of a spreadsheet in the caller's own library, for "Preview
 * data" on a source not used in any paper yet. Owner only (other users get 404, as for a source that does not exist).
 * Same response as `GET /api/theses/[id]/sources/[sourceId]/data`:
 * { sheet: { name, columns, rowCount, headerRow, truncated }, rows, offset, limit, total, sheets }.
 */
export async function GET(request: NextRequest, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const t = getT();
  const source = db.sources.findById(params.id);
  if (!source || source.ownerId !== r.user.id) return error(t("library.error.sourceNotFound"), 404);
  const dataset = source.datasetId ? db.datasets.findById(source.datasetId) : db.datasets.findBySource(source.id);
  if (!dataset || !dataset.sheets.length) return error(t("library.error.noData"), 404);
  const page = datasetPage(dataset, request.nextUrl.searchParams);
  if (!page) return error(t("library.error.sheetNotFound"), 404);
  return json(page);
}
