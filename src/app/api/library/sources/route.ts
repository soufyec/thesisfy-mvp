import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, requireUser } from "@/lib/api";
import { getT } from "@/lib/i18n/server";
import { librarySourceView } from "@/lib/sources/retrieve";
import { addUploadedSource, checkLinkable, createLibrarySource, fail, isFail, libraryRoleCap, readSourceInput, resolveOwnTheses, roleFor, roleOf } from "@/lib/sources/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST → add a source to the caller's library (students only). Same bodies as `POST /api/theses/[id]/sources`
 * (multipart `file` .pdf .docx .xlsx .csv .tsv .txt .md ≤ 4 MB with optional title, authors, year, role; or JSON
 * { kind, value, title?, authors?, year?, role? }) plus optional `thesisIds`: a JSON array, or a multipart `thesisIds`
 * field (repeated or comma-separated). Each thesis must be the caller's and not locked, and can use at most 40
 * secondary and 20 primary sources.
 * - 201 { source: LibrarySourceView }.
 * - A file (same SHA-256) or a DOI already in the library is linked to the given theses instead: 200 { source, existing: true }.
 * - Refusals { error, code }: 409 locked | thesis_cap | library_cap; 413 too_large; 415 legacy_format |
 *   unsupported_type; 422 encrypted | empty | no_text | unreadable.
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

  if (input.kind === "file") {
    const added = await addUploadedSource(r.user.id, theses, input, t);
    if (isFail(added)) return added.fail;
    const view = librarySourceView(added.source);
    return added.existing ? json({ source: view, existing: true }) : json({ source: view }, 201);
  }

  if (input.kind === "doi") {
    const existing = db.sources.findByDoi(r.user.id, input.doi);
    if (existing) {
      const refused = checkLinkable(theses, t, existing.thesisIds, roleOf(existing));
      if (refused) return refused.fail;
      const updated = db.sources.update(existing.id, { thesisIds: [...existing.thesisIds, ...theses.map((x) => x.id)] })!;
      return json({ source: librarySourceView(updated), existing: true });
    }
  }

  const role = roleFor(input);
  const refused = libraryRoleCap(r.user.id, role, t) || checkLinkable(theses, t, [], role);
  if (refused) return refused.fail;

  const created = await createLibrarySource(r.user.id, theses.map((x) => x.id), input, t);
  return json({ source: librarySourceView(created) }, 201);
}
