import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { error, json } from "@/lib/api";
import { isTeamRequest } from "@/lib/team";

export const dynamic = "force-dynamic";

/** Removes a team addition (a question takes its phrasings with it). Base questions cannot be removed. */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isTeamRequest(request)) return error("Team access required", 401);
  await db.ready();
  if (!db.questionnaire.removeEdit(params.id)) return error("Not found", 404);
  return json({ ok: true });
}
