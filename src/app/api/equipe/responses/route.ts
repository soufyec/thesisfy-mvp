import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { error, json } from "@/lib/api";
import { isTeamRequest } from "@/lib/team";
import { indicators, ResponseRow, toCsv } from "@/lib/questionnaire";
import { currentQuestionnaire } from "@/lib/questionnaireData";

export const dynamic = "force-dynamic";

/** All questionnaire responses for the team: JSON with indicators, or `?format=csv` (one column per question). */
export async function GET(request: NextRequest) {
  if (!isTeamRequest(request)) return error("Team access required", 401);
  await db.ready();
  const rows = db.questionnaire.responses() as ResponseRow[];
  const q = currentQuestionnaire();
  if (request.nextUrl.searchParams.get("format") === "csv") {
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(toCsv(q, rows), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="thesisfic-questionnaire-${date}.csv"` },
    });
  }
  return json({ questionnaire: q, responses: rows, indicators: indicators(rows) });
}
