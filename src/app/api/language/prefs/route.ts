import { NextRequest } from "next/server";
import { db, LanguagePrefs } from "@/lib/db";
import { canAccessThesis } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";
import { LANGUAGE_CATEGORIES } from "@/lib/language/languagetool";

export const dynamic = "force-dynamic";

const LANGUAGES: LanguagePrefs["language"][] = ["en-US", "en-GB", "es", "fr", "auto"];

const stringList = (v: unknown, max = 500, maxLen = 80) =>
  Array.isArray(v) ? Array.from(new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter((x) => x && x.length <= maxLen))).slice(0, max) : undefined;

/** GET /api/language/prefs?thesisId= — language review preferences of a thesis (visible to everyone who can open it). */
export async function GET(request: NextRequest) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const thesisId = request.nextUrl.searchParams.get("thesisId");
  if (!thesisId) return error("thesisId is required");
  if (!canAccessThesis(r.user, thesisId)) return error("Thesis not found", 404);
  return json({ prefs: db.languagePrefs.get(thesisId) });
}

/** PUT /api/language/prefs?thesisId= — partial update by the thesis owner. Body: { language?, motherTongue?, mutedCategories?, mutedRules?, dictionary? } */
export async function PUT(request: NextRequest) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const thesisId = request.nextUrl.searchParams.get("thesisId") || (typeof body?.thesisId === "string" ? (body.thesisId as string) : null);
  if (!thesisId) return error("thesisId is required");
  const thesis = canAccessThesis(r.user, thesisId);
  if (!thesis) return error("Thesis not found", 404);
  if (thesis.studentId !== r.user.id) return error("Only the thesis owner can change language preferences", 403);
  if (!body) return error("Invalid body");

  const patch: Partial<LanguagePrefs> = {};
  if (body.language !== undefined) {
    if (!LANGUAGES.includes(body.language as LanguagePrefs["language"])) return error("language must be one of en-US, en-GB, es, fr, auto");
    patch.language = body.language as LanguagePrefs["language"];
  }
  if (body.motherTongue !== undefined) {
    if (body.motherTongue !== null && (typeof body.motherTongue !== "string" || !/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(body.motherTongue))) return error("motherTongue must be a language code such as es or fr");
    patch.motherTongue = (body.motherTongue as string | null) || undefined;
  }
  if (body.mutedCategories !== undefined) {
    const list = stringList(body.mutedCategories, 10, 20);
    if (!list || list.some((c) => !(LANGUAGE_CATEGORIES as string[]).includes(c))) return error(`mutedCategories must be a list of: ${LANGUAGE_CATEGORIES.join(", ")}`);
    patch.mutedCategories = list;
  }
  if (body.mutedRules !== undefined) {
    const list = stringList(body.mutedRules, 500, 80);
    if (!list) return error("mutedRules must be a list of rule ids");
    patch.mutedRules = list;
  }
  if (body.dictionary !== undefined) {
    const list = stringList(body.dictionary, 2000, 60);
    if (!list) return error("dictionary must be a list of words");
    patch.dictionary = list;
  }
  if (!Object.keys(patch).length) return error("Nothing to update");
  return json({ prefs: db.languagePrefs.update(thesisId, patch) });
}
