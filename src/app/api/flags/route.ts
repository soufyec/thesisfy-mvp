import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, requireUser } from "@/lib/api";

export async function GET(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const flags =
    r.user.role === "student"
      ? db.theses.getByStudent(r.user.id).flatMap((t) => db.flags.listByThesis(t.id))
      : r.user.role === "professor"
        ? db.theses.getByProfessor(r.user.id).flatMap((t) => db.flags.listByThesis(t.id))
        : db.flags.listByUniversity(r.user.university);
  const enriched = flags
    .map((f) => {
      const t = db.theses.findById(f.thesisId);
      return { ...f, thesisTitle: t?.title || "Unknown", studentName: t ? db.users.findById(t.studentId)?.name : undefined, resolvedByName: f.resolvedBy ? db.users.findById(f.resolvedBy)?.name : undefined };
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return json({ flags: enriched });
}
