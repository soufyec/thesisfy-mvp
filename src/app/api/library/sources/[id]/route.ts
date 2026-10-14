import { NextRequest } from "next/server";
import { db, ThesisSource } from "@/lib/db";
import { json, requireUser } from "@/lib/api";
import { getT } from "@/lib/i18n/server";
import { librarySourceView } from "@/lib/sources/retrieve";
import { checkLinkable, fail, isFail, isLocked, lockedFail, resolveOwnTheses } from "@/lib/sources/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function load(request: NextRequest, id: string) {
  const r = await requireUser(request);
  if ("response" in r) return { response: r.response };
  const t = getT();
  if (r.user.role !== "student") return { response: fail(t("library.error.studentsOnly"), 403).fail };
  const source = db.sources.findById(id);
  if (!source || source.ownerId !== r.user.id) return { response: fail(t("library.error.sourceNotFound"), 404).fail };
  return { user: r.user, source, t };
}

/**
 * PATCH { thesisIds?, title?, authors?, year?, venue? } → `thesisIds` sets the theses that use the source exactly
 * (each the caller's; locked theses cannot gain or lose it; at most 40 sources per thesis). Metadata fields are trimmed;
 * an empty title is refused, other empty fields are cleared. Response { source: LibrarySourceView }.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const l = await load(request, params.id);
  if ("response" in l) return l.response;
  const { user, source, t } = l;
  const body = (await request.json().catch(() => null)) as { thesisIds?: unknown; title?: unknown; authors?: unknown; year?: unknown; venue?: unknown } | null;
  if (!body || typeof body !== "object") return fail(t("library.error.invalidBody")).fail;

  const patch: Partial<ThesisSource> = {};
  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 300) : "";
    if (!title) return fail(t("library.error.titleEmpty")).fail;
    patch.title = title;
  }
  const optional = (v: unknown, max: number) => (typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) || undefined : undefined);
  if (body.authors !== undefined) patch.authors = optional(body.authors, 300);
  if (body.year !== undefined) patch.year = optional(body.year, 8);
  if (body.venue !== undefined) patch.venue = optional(body.venue, 300);

  if (body.thesisIds !== undefined) {
    const wanted = resolveOwnTheses(user, body.thesisIds, t);
    if (isFail(wanted)) return wanted.fail;
    const current = source.thesisIds;
    const refused = checkLinkable(wanted, t, current);
    if (refused) return refused.fail;
    for (const id of current) {
      if (wanted.some((x) => x.id === id)) continue;
      const thesis = db.theses.findById(id);
      if (thesis && isLocked(thesis)) return lockedFail(thesis, t).fail;
    }
    patch.thesisIds = wanted.map((x) => x.id);
  }

  const updated = db.sources.update(source.id, patch)!;
  return json({ source: librarySourceView(updated) });
}

/**
 * DELETE → deletes the source and its passages from the library, and so from every thesis that uses it.
 * Refused (409 code "locked") while an approved or submitted thesis uses it. Response { ok: true }.
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const l = await load(request, params.id);
  if ("response" in l) return l.response;
  const { source, t } = l;
  for (const id of source.thesisIds) {
    const thesis = db.theses.findById(id);
    if (thesis && isLocked(thesis)) return lockedFail(thesis, t).fail;
  }
  db.sources.remove(source.id);
  return json({ ok: true });
}
