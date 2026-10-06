import { NextRequest } from "next/server";
import { canAccessThesis } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";
import { buildLedgerSummary, gatherProcess, processTimeline } from "@/lib/process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → { timeline, summary }. The student, the advisor and the administration receive the same record. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error("Thesis not found", 404);
  const g = gatherProcess(thesis);
  const timeline = processTimeline(thesis, g.sessions, g.interactions, g.snapshots, g.versions);
  const summary = buildLedgerSummary(thesis);
  return json({ timeline, summary });
}
