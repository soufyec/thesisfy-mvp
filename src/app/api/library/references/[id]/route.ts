import { NextRequest } from "next/server";
import { db, LibraryReference, Reference, Thesis, thesisCopyOf } from "@/lib/db";
import { json, requireUser } from "@/lib/api";
import { getT } from "@/lib/i18n/server";
import { thesisCitationCounts } from "@/lib/sources/cited";
import { addReferenceToThesis, fail, isFail, isLocked, libraryReferenceView, lockedFail, ReferenceFields, removeReferenceFromThesis, resolveOwnTheses, sanitizeReferenceFields } from "@/lib/sources/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Changing any of these makes an earlier verification (reference check) meaningless, so it is dropped. */
const IDENTITY_FIELDS = ["title", "authors", "year", "doi", "source"] as const;

async function load(request: NextRequest, id: string) {
  const r = await requireUser(request);
  if ("response" in r) return { response: r.response };
  const t = getT();
  if (r.user.role !== "student") return { response: fail(t("library.error.studentsOnly"), 403).fail };
  const item = db.libraryReferences.find(r.user.id, id);
  if (!item) return { response: fail(t("library.error.referenceNotFound"), 404).fail };
  return { user: r.user, item, t };
}

/** In-text citations of `id` in each of `theses`, only where it is cited. */
function citedIn(theses: Thesis[], id: string) {
  const out: Record<string, number> = {};
  for (const th of theses) {
    const n = thesisCitationCounts(th)[id] || 0;
    if (n > 0) out[th.id] = n;
  }
  return out;
}

/** Whether applying `fields` would change the entry (absent and empty count as the same value). */
function changesSomething(ref: Reference, fields: ReferenceFields) {
  return (Object.keys(fields) as (keyof ReferenceFields)[]).some((k) => (fields[k] || "") !== (ref[k] || ""));
}

function withFields<T extends Reference>(ref: T, fields: ReferenceFields): T {
  const next = { ...ref, ...fields } as T;
  if (IDENTITY_FIELDS.some((k) => k in fields && (fields[k] || "") !== (ref[k] || ""))) delete next.verification;
  return next;
}

/**
 * PATCH { thesisIds?, fields?, confirmCited? } →
 * - `fields` (type, authors, year, title, source, url, doi, pages, volume, issue) updates the library item and the copy
 *   inside every thesis that uses it; refused (409 code "locked") when it would change the copy of an approved or
 *   submitted thesis.
 * - `thesisIds` sets the theses that use the reference exactly: a copy (same id) is appended to newly selected theses
 *   and removed from the others. Removing it from a thesis where it is cited needs `confirmCited: true`, else
 *   409 { error, code: "cited", citedIn }. Locked theses → 409 code "locked". `thesisIds` must be an array (else 400).
 * Response { reference: LibraryReferenceView }.
 */
export async function PATCH(request: NextRequest, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  const l = await load(request, params.id);
  if ("response" in l) return l.response;
  const { user, item, t } = l;
  const body = (await request.json().catch(() => null)) as { thesisIds?: unknown; fields?: unknown; confirmCited?: unknown } | null;
  if (!body || typeof body !== "object") return fail(t("library.error.invalidBody")).fail;

  let fields: ReferenceFields | null = null;
  if (body.fields !== undefined) {
    const clean = sanitizeReferenceFields(body.fields, t, false);
    if (isFail(clean)) return clean.fail;
    fields = clean;
  }

  const current = db.libraryReferences.thesesUsing(user.id, item.id);
  let toAdd: Thesis[] = [];
  let toRemove: Thesis[] = [];
  if (body.thesisIds !== undefined) {
    const wanted = resolveOwnTheses(user, body.thesisIds, t);
    if (isFail(wanted)) return wanted.fail;
    toAdd = wanted.filter((x) => !current.some((c) => c.id === x.id));
    toRemove = current.filter((c) => !wanted.some((x) => x.id === c.id));
  }
  // A field edit reaches every thesis copy it changes, so (like DELETE) it is refused when one of those theses is
  // locked: an approved or submitted bibliography stays as it was. Skipping that copy instead would let a later write
  // of the locked thesis (a reference check) carry its old copy back into the library.
  const touched = fields
    ? current.filter((th) => {
        if (toRemove.some((x) => x.id === th.id)) return false;
        const copy = (th.references || []).find((ref) => ref && ref.id === item.id);
        return !!copy && changesSomething(copy, fields!);
      })
    : [];
  const locked = [...toAdd, ...toRemove, ...touched].find((x) => isLocked(x));
  if (locked) return lockedFail(locked, t).fail;
  // Unreachable while links are derived from the id, kept as a guard: never replace another entry that shares the id.
  const clash = toAdd.find((x) => (x.references || []).some((ref) => ref && ref.id === item.id));
  if (clash) return fail(t("library.error.idConflict", { title: clash.title }), 409, "conflict").fail;
  const cited = citedIn(toRemove, item.id);
  if (Object.keys(cited).length && body.confirmCited !== true) return fail(t("library.error.cited"), 409, "cited", { citedIn: cited }).fail;

  let latest: LibraryReference = item;
  if (fields && (touched.length || changesSomething(item, fields))) {
    // Each copy gets the same field changes (keeping what is specific to that thesis, like a support snippet).
    for (const th of touched) {
      const refs = th.references || [];
      db.theses.update(th.id, { references: refs.map((ref) => (ref && ref.id === item.id ? withFields(ref, fields!) : ref)) });
    }
    // The library item ends with exactly the edited entry (the thesis writes above sync their own copies into it).
    latest = db.libraryReferences.upsert(user.id, thesisCopyOf(withFields(item, fields)));
  }
  for (const th of toAdd) addReferenceToThesis(th, latest);
  for (const th of toRemove) removeReferenceFromThesis(th, item.id);

  return json({ reference: libraryReferenceView(db.libraryReferences.find(user.id, item.id) || latest) });
}

/**
 * DELETE (?confirmCited=1) → removes the reference from the library and from every thesis that uses it.
 * Cited in one of them without confirmation → 409 { error, code: "cited", citedIn }; used by a locked thesis → 409
 * code "locked". In-text citations are never rewritten: they stay in the text without a bibliography entry.
 * Response { ok: true }.
 */
export async function DELETE(request: NextRequest, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  const l = await load(request, params.id);
  if ("response" in l) return l.response;
  const { user, item, t } = l;
  const q = request.nextUrl.searchParams.get("confirmCited");
  const confirmed = q === "1" || q === "true";
  const using = db.libraryReferences.thesesUsing(user.id, item.id);
  const locked = using.find((x) => isLocked(x));
  if (locked) return lockedFail(locked, t).fail;
  const cited = citedIn(using, item.id);
  if (Object.keys(cited).length && !confirmed) return fail(t("library.error.cited"), 409, "cited", { citedIn: cited }).fail;
  for (const th of using) removeReferenceFromThesis(th, item.id);
  db.libraryReferences.remove(user.id, item.id);
  return json({ ok: true });
}
