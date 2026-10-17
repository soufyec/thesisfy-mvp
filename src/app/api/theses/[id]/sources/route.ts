import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { canAccessThesis } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";
import { getT } from "@/lib/i18n/server";
import { publicSource } from "@/lib/sources/retrieve";
import { addUploadedSource, checkLinkable, createLibrarySource, fail, isFail, isLocked, libraryRoleCap, lockedFail, readSourceInput, roleFor } from "@/lib/sources/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → the sources linked to this thesis (from its owner's library), without the extracted text. */
export async function GET(request: NextRequest, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error(getT()("library.error.thesisNotFound"), 404);
  const counts = db.sourceChunks.countBySource();
  return json({ sources: db.sources.list(thesis.id).map((s) => publicSource(s, thesis.id, counts)) });
}

/**
 * POST → add a source to this thesis. Owner only. Either multipart with a `file` (.pdf .docx .xlsx .csv .tsv .txt .md,
 * ≤ 4 MB; optional title, authors, year and `role` "primary" | "secondary", sheets always primary) or JSON
 * { kind: "doi" | "url" | "text", value, title?, authors?, year?, role? }. The source is created in the owner's
 * library and linked to this thesis; its text (for a sheet: the parsed table and its data card) is extracted, chunked
 * and indexed in the same request.
 * - 201 { source }. A file already in the library (same SHA-256) is linked instead: 200 { source, existing: true }.
 *   A DOI already in the library is linked: 200 { source, linked: true } (409 "duplicate" if this thesis uses it).
 * - Refusals { error, code }: 409 locked | thesis_cap | library_cap; 413 too_large; 415 legacy_format |
 *   unsupported_type; 422 encrypted | empty | no_text | unreadable.
 */
export async function POST(request: NextRequest, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const t = getT();
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error(t("library.error.thesisNotFound"), 404);
  if (r.user.id !== thesis.studentId) return fail(t("library.error.ownerOnly"), 403, "owner_only").fail;
  // Checked before reading the body and again after it, right before the write: the thesis may have been approved,
  // or reached a cap through parallel requests, while the body was arriving.
  const fresh = () => db.theses.findById(thesis.id);
  const early = fresh();
  if (!early) return error(t("library.error.thesisNotFound"), 404);
  if (isLocked(early)) return lockedFail(early, t).fail;

  const read = await readSourceInput(request, t);
  if (isFail(read)) return read.fail;
  const { input } = read;

  if (input.kind === "file") {
    const now = fresh();
    if (!now) return error(t("library.error.thesisNotFound"), 404);
    const added = await addUploadedSource(thesis.studentId, [now], input, t);
    if (isFail(added)) return added.fail;
    const view = publicSource(added.source, thesis.id);
    return added.existing ? json({ source: view, existing: true }) : json({ source: view }, 201);
  }

  // From here to the write (link, or the synchronous creation that starts createLibrarySource) nothing awaits.
  const late = fresh();
  if (!late) return error(t("library.error.thesisNotFound"), 404);
  if (isLocked(late)) return lockedFail(late, t).fail;
  if (input.kind === "doi") {
    const existing = db.sources.findByDoi(thesis.studentId, input.doi);
    if (existing) {
      if (existing.thesisIds.indexOf(thesis.id) !== -1) return fail(t("library.error.alreadyLinked"), 409, "duplicate").fail;
      const refusedLink = checkLinkable([late], t, [], existing.role === "primary" ? "primary" : "secondary");
      if (refusedLink) return refusedLink.fail;
      const linked = db.sources.link(existing.id, thesis.id)!;
      return json({ source: publicSource(linked, thesis.id), linked: true });
    }
  }
  const role = roleFor(input);
  const refused = checkLinkable([late], t, [], role) || libraryRoleCap(thesis.studentId, role, t);
  if (refused) return refused.fail;

  const created = await createLibrarySource(thesis.studentId, [thesis.id], input, t);
  return json({ source: publicSource(created, thesis.id) }, 201);
}
