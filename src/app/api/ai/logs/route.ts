import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { canAccessThesis } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";

export async function GET(request: NextRequest) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const thesisId = request.nextUrl.searchParams.get("thesisId");
  let list;
  if (thesisId) {
    if (!canAccessThesis(r.user, thesisId)) return error("Thesis not found", 404);
    list = db.interactions.listByThesis(thesisId);
  } else if (r.user.role === "student") list = db.interactions.listByUser(r.user.id);
  else list = db.interactions.listByUniversity(r.user.university).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const enriched = list.slice(0, 200).map((i) => ({ ...i, userName: db.users.findById(i.userId)?.name, thesisTitle: i.thesisId ? db.theses.findById(i.thesisId)?.title : undefined }));
  return json({ interactions: enriched });
}
