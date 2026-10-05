import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { error, json, requireUser } from "@/lib/api";

export async function GET(request: NextRequest) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const user = r.user;

  const theses =
    user.role === "student"
      ? db.theses.getByStudent(user.id)
      : user.role === "professor"
        ? db.theses.getByProfessor(user.id)
        : db.theses.getByUniversity(user.university);

  const enriched = theses.map((t) => {
    const student = db.users.findById(t.studentId);
    const professor = t.professorId ? db.users.findById(t.professorId) : null;
    const flags = db.flags.listByThesis(t.id);
    return {
      ...t,
      content: undefined,
      sessions: undefined,
      tabs: undefined,
      tabCount: (t.tabs || []).length,
      sessionCount: t.sessions.length,
      openFlags: flags.filter((f) => !f.resolved).length,
      studentName: student?.name || "Unknown",
      professorName: professor?.name || "Unassigned",
    };
  });

  return json({ theses: enriched });
}

export async function POST(request: NextRequest) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const user = r.user;
  const body = await request.json().catch(() => null);
  if (!body?.title?.trim()) return error("Title is required");

  const studentId = user.role === "student" ? user.id : body.studentId;
  if (!studentId || !db.users.findById(studentId)) return error("Student not found");
  const professorId =
    body.professorId ||
    (user.role === "professor" ? user.id : db.users.getByUniversity(user.university).find((u) => u.role === "professor")?.id);

  const thesis = db.theses.create({
    title: body.title.trim(),
    description: body.description?.trim() || "",
    studentId,
    professorId,
    deadline: body.deadline || undefined,
    targetWords: Number(body.targetWords) || 20000,
    citationStyle: body.citationStyle || "APA",
  });
  db.versions.create({ thesisId: thesis.id, authorId: user.id, content: thesis.content, wordCount: thesis.wordCount, kind: "milestone", label: "Created" });
  return json({ thesis }, 201);
}
