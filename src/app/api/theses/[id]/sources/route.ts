import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { canAccessThesis } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";
import { getT } from "@/lib/i18n/server";
import { publicSource } from "@/lib/sources/retrieve";
import { createLibrarySource, fail, isFail, isLocked, libraryCapFail, lockedFail, MAX_SOURCES_PER_LIBRARY, MAX_SOURCES_PER_THESIS, readSourceInput, thesisCapFail } from "@/lib/sources/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → the sources linked to this thesis (from its owner's library), without the extracted text. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error(getT()("library.error.thesisNotFound"), 404);
  const counts = db.sourceChunks.countBySource();
  return json({ sources: db.sources.list(thesis.id).map((s) => publicSource(s, thesis.id, counts)) });
}

/**
 * POST → add a source to this thesis. Owner only. Either multipart with a `file` PDF (≤ 15 MB) or JSON
 * { kind: "doi" | "url" | "text", value, title?, authors?, year? }. The source is created in the owner's library and
 * linked to this thesis; its text is extracted, chunked and indexed in the same request (`parseStatus` tells the outcome).
 * A DOI already in the library is linked instead: 200 { source, linked: true } (409 if this thesis already uses it).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const t = getT();
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error(t("library.error.thesisNotFound"), 404);
  if (r.user.id !== thesis.studentId) return fail(t("library.error.ownerOnly"), 403, "owner_only").fail;
  // Checked before reading the body (a PDF can be 15 MB) and again after it, right before the write: the thesis may
  // have been approved, or reached the cap through parallel requests, while the body was arriving.
  const refused = () => {
    const fresh = db.theses.findById(thesis.id);
    if (!fresh) return fail(t("library.error.thesisNotFound"), 404);
    if (isLocked(fresh)) return lockedFail(fresh, t);
    if (db.sources.list(fresh.id).length >= MAX_SOURCES_PER_THESIS) return thesisCapFail(fresh, t);
    return null;
  };
  const early = refused();
  if (early) return early.fail;

  const read = await readSourceInput(request, t);
  if (isFail(read)) return read.fail;
  const { input } = read;

  // From here to the write (link, or the synchronous creation that starts createLibrarySource) nothing awaits.
  const late = refused();
  if (late) return late.fail;
  if (input.kind === "doi") {
    const existing = db.sources.findByDoi(thesis.studentId, input.doi);
    if (existing) {
      if (existing.thesisIds.indexOf(thesis.id) !== -1) return fail(t("library.error.alreadyLinked"), 409, "duplicate").fail;
      const linked = db.sources.link(existing.id, thesis.id)!;
      return json({ source: publicSource(linked, thesis.id), linked: true });
    }
  }
  if (db.sources.listByOwner(thesis.studentId).length >= MAX_SOURCES_PER_LIBRARY) return libraryCapFail(t).fail;

  const created = await createLibrarySource(thesis.studentId, [thesis.id], input, t);
  return json({ source: publicSource(created, thesis.id) }, 201);
}
