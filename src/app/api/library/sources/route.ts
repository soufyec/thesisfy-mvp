import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, requireUser } from "@/lib/api";
import { getT } from "@/lib/i18n/server";
import { librarySourceView } from "@/lib/sources/retrieve";
import { checkLinkable, createLibrarySource, fail, isFail, libraryCapFail, MAX_SOURCES_PER_LIBRARY, readSourceInput, resolveOwnTheses } from "@/lib/sources/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST → add a source to the caller's library (students only). Same bodies as `POST /api/theses/[id]/sources`
 * (multipart `file` PDF, or JSON { kind, value, title?, authors?, year? }) plus optional `thesisIds`: a JSON array, or
 * a multipart `thesisIds` field (repeated or comma-separated). Each thesis must be the caller's and not locked, and
 * can use at most 40 sources. A DOI already in the library is linked to the given theses instead:
 * 200 { source, existing: true }. Otherwise 201 { source: LibrarySourceView }.
 */
export async function POST(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const t = getT();
  if (r.user.role !== "student") return fail(t("library.error.studentsOnly"), 403).fail;

  const read = await readSourceInput(request, t);
  if (isFail(read)) return read.fail;
  const theses = resolveOwnTheses(r.user, read.thesisIds, t);
  if (isFail(theses)) return theses.fail;
  const { input } = read;

  if (input.kind === "doi") {
    const existing = db.sources.findByDoi(r.user.id, input.doi);
    if (existing) {
      const refused = checkLinkable(theses, t, existing.thesisIds);
      if (refused) return refused.fail;
      const updated = db.sources.update(existing.id, { thesisIds: [...existing.thesisIds, ...theses.map((x) => x.id)] })!;
      return json({ source: librarySourceView(updated), existing: true });
    }
  }

  if (db.sources.listByOwner(r.user.id).length >= MAX_SOURCES_PER_LIBRARY) return libraryCapFail(t).fail;
  const refused = checkLinkable(theses, t);
  if (refused) return refused.fail;

  const created = await createLibrarySource(r.user.id, theses.map((x) => x.id), input, t);
  return json({ source: librarySourceView(created) }, 201);
}
