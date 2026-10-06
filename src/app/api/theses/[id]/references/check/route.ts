import { NextRequest } from "next/server";
import { db, Reference } from "@/lib/db";
import { canAccessThesis } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";
import { applyCheck, checkReference, ReferenceCheck } from "@/lib/ai/citeVerified";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_REFERENCES = 40;
const CONCURRENCY = 3; // Crossref polite pool allows 3 concurrent requests
const SPACING_MS = 350; // per worker, between reference checks

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/**
 * POST { referenceIds?: string[] } — checks the thesis references against Crossref, OpenAlex and Semantic Scholar and
 * stores `verification`, `isRetracted` and the resolved ids on each one. No model is involved; nothing is logged as AI use.
 * Response: { references, checked, results: { [referenceId]: ReferenceCheck } }.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error("Thesis not found", 404);
  const body = (await request.json().catch(() => null)) || {};
  const wanted: string[] | null = Array.isArray(body.referenceIds) ? body.referenceIds.filter((x: unknown) => typeof x === "string") : null;

  const all = thesis.references || [];
  const targets = (wanted ? all.filter((ref) => wanted.includes(ref.id)) : all).slice(0, MAX_REFERENCES);
  if (!targets.length) return json({ references: all, checked: 0, results: {} });

  const results: Record<string, ReferenceCheck> = {};
  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      const ref = targets[next++];
      try {
        results[ref.id] = await checkReference(ref);
      } catch (e) {
        results[ref.id] = { status: "unverified", source: "manual", mismatches: [], ids: {}, checkedAt: new Date().toISOString(), error: (e as Error).message };
      }
      if (next < targets.length) await sleep(SPACING_MS);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));

  // Re-read the thesis: the editor may have saved while the checks ran.
  const fresh = db.theses.findById(thesis.id);
  if (!fresh) return error("Thesis not found", 404);
  const references: Reference[] = (fresh.references || []).map((ref) => (results[ref.id] ? applyCheck(ref, results[ref.id]) : ref));
  db.theses.update(thesis.id, { references });

  return json({ references, checked: Object.keys(results).length, results });
}
