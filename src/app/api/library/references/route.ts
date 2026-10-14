import { NextRequest } from "next/server";
import { db, LibraryReference, Reference, Thesis } from "@/lib/db";
import type { Translate } from "@/lib/i18n/dictionary";
import { json, requireUser } from "@/lib/api";
import { getT } from "@/lib/i18n/server";
import { lookupDoi } from "@/lib/citations";
import { normalizeDoi } from "@/lib/scholar";
import { addReferenceToThesis, fail, isFail, isLocked, libraryReferenceView, lockedFail, newReferenceId, ReferenceFields, resolveOwnTheses, sanitizeReferenceFields } from "@/lib/sources/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST → add a reference to the caller's library (students only), optionally linked to some of their theses.
 * Body: { reference: { type?, authors?, title, year?, source?, url?, doi?, pages?, volume?, issue? }, thesisIds? }
 *    or { doi, thesisIds? } (looked up in Crossref; 404 when no record exists).
 * A reference with the same DOI already in the library is reused: 200 { reference, existing: true }.
 * Otherwise 201 { reference: LibraryReferenceView } with a new id `ref_<random>`. Linking appends a copy (same id) to
 * each thesis's references. Locked theses (approved or submitted) → 409 code "locked".
 */
export async function POST(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const t = getT();
  if (r.user.role !== "student") return fail(t("library.error.studentsOnly"), 403).fail;
  const body = (await request.json().catch(() => null)) as { reference?: unknown; doi?: unknown; thesisIds?: unknown } | null;
  if (!body || typeof body !== "object") return fail(t("library.error.invalidBody")).fail;

  const theses = resolveOwnTheses(r.user, body.thesisIds, t);
  if (isFail(theses)) return theses.fail;
  const locked = theses.find((x) => isLocked(x));

  let fields: ReferenceFields;
  if (typeof body.doi === "string" && body.doi.trim()) {
    const doi = normalizeDoi(body.doi);
    if (!doi) return fail(t("library.error.doiInvalid")).fail;
    const existing = db.libraryReferences.findByDoi(r.user.id, doi);
    if (existing) return linkAndRespond(existing, theses, true, t);
    if (locked) return lockedFail(locked, t).fail;
    const found = await lookupDoi(doi);
    if (!found) return fail(t("library.error.doiNotFound"), 404).fail;
    const clean = sanitizeReferenceFields({ ...found, doi, title: found.title || doi }, t, true);
    if (isFail(clean)) return clean.fail;
    fields = clean;
  } else if (body.reference && typeof body.reference === "object") {
    const clean = sanitizeReferenceFields(body.reference, t, true);
    if (isFail(clean)) return clean.fail;
    fields = clean;
    if (fields.doi) {
      const existing = db.libraryReferences.findByDoi(r.user.id, fields.doi);
      if (existing) return linkAndRespond(existing, theses, true, t);
    }
  } else {
    return fail(t("library.error.invalidBody")).fail;
  }
  if (locked) return lockedFail(locked, t).fail;

  const item = db.libraryReferences.upsert(r.user.id, { ...fields, id: newReferenceId(r.user.id) } as Reference);
  return linkAndRespond(item, theses, false, t);
}

/** Links the item to the theses that do not have it yet, then answers with its library view. */
function linkAndRespond(item: LibraryReference, targets: Thesis[], existing: boolean, t: Translate) {
  const add = targets.filter((x) => !(x.references || []).some((ref) => ref && ref.id === item.id));
  const refused = add.find((x) => isLocked(x));
  if (refused) return lockedFail(refused, t).fail;
  for (const x of add) addReferenceToThesis(x, item);
  const fresh = db.libraryReferences.find(item.ownerId, item.id) || item;
  return existing ? json({ reference: libraryReferenceView(fresh), existing: true }) : json({ reference: libraryReferenceView(fresh) }, 201);
}
