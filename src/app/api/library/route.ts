import { NextRequest } from "next/server";
import { json, requireUser } from "@/lib/api";
import { librarySourceViews, libraryReferenceViews, libraryTheses } from "@/lib/sources/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET → the caller's personal library: every source (no text) and reference, with the theses that use each one,
 * plus the caller's theses (`locked` = approved or submitted, links cannot change).
 * Staff have no library: they read the items linked to a thesis through `/api/theses/[id]/sources` and the thesis.
 * Response: { sources: LibrarySourceView[], references: LibraryReferenceView[], theses: { id, title, status, citationStyle, locked }[] }.
 */
export async function GET(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  if (r.user.role !== "student") return json({ sources: [], references: [], theses: [] });
  return json({ sources: librarySourceViews(r.user.id), references: libraryReferenceViews(r.user.id), theses: libraryTheses(r.user.id) });
}
