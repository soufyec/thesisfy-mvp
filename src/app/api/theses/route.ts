import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const user = db.users.findById(payload.userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  let theses;
  if (user.role === "student") {
    theses = db.theses.getByStudent(user.id);
  } else if (user.role === "professor") {
    theses = db.theses.getByProfessor(user.id);
  } else {
    theses = db.theses.getAll();
  }

  // Enrich with student names
  const enriched = theses.map((t) => {
    const student = db.users.findById(t.studentId);
    const professor = t.professorId ? db.users.findById(t.professorId) : null;
    return {
      ...t,
      studentName: student?.name || "Unknown",
      professorName: professor?.name || "Unassigned",
      content: undefined, // Don't send full content in list
    };
  });

  return NextResponse.json({ theses: enriched });
}
