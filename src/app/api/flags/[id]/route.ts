import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { error, json, requireUser } from "@/lib/api";
import { refreshThesisMetrics } from "@/lib/integrity";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const flag = db.flags.list().find((f) => f.id === params.id);
  if (!flag) return error("Flag not found", 404);
  const thesis = db.theses.findById(flag.thesisId);
  const body = await request.json().catch(() => ({}));

  // Students may respond (attribute / explain); only staff can resolve.
  if (r.user.role === "student") {
    if (!thesis || thesis.studentId !== r.user.id) return error("Forbidden", 403);
    if (typeof body.studentNote === "string") {
      flag.description += `\n\nStudent response: ${body.studentNote.trim()}`;
      db.persist();
      if (thesis.professorId) db.notifications.create({ userId: thesis.professorId, title: "Student responded to a flag", message: body.studentNote.slice(0, 100), type: "flag", link: `/admin/theses/${thesis.id}` });
    }
    return json({ flag });
  }

  const resolved = db.flags.resolve(flag.id, r.user.id, body.note);
  refreshThesisMetrics(flag.thesisId);
  if (thesis) db.notifications.create({ userId: thesis.studentId, title: "Flag resolved", message: `${r.user.name} resolved a flag on "${thesis.title.slice(0, 40)}".`, type: "success", link: `/dashboard/editor/${thesis.id}` });
  return json({ flag: resolved });
}
