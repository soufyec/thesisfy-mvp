import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { error, json } from "@/lib/api";
import { isTeamRequest } from "@/lib/team";

export const dynamic = "force-dynamic";

/** Archive added questions; remove phrasings or undo an edit without losing historical definitions. */
export async function DELETE(request: NextRequest, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  if (!isTeamRequest(request)) return error("Team access required", 401);
  await db.ready();
  const existing = db.questionnaire.edits().find(e => e.id === params.id);
  if (existing?.kind === "item") {
    db.questionnaire.addEdit({ kind: "remove", sectionId: existing.sectionId, targetKey: existing.id });
    return json({ ok: true });
  }
  if (!db.questionnaire.removeEdit(params.id)) return error("Not found", 404);
  return json({ ok: true });
}
