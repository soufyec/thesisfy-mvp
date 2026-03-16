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

  let requests;
  if (user.role === "student") {
    requests = db.feedback.getByStudent(user.id);
  } else if (user.role === "professor") {
    requests = db.feedback.getByProfessor(user.id);
  } else {
    requests = db.feedback.getAll();
  }

  const enriched = requests.map((f) => {
    const student = db.users.findById(f.studentId);
    const professor = db.users.findById(f.professorId);
    const thesis = db.theses.findById(f.thesisId);
    return {
      ...f,
      studentName: student?.name || "Unknown",
      professorName: professor?.name || "Unknown",
      thesisTitle: thesis?.title || "Unknown",
    };
  });

  return NextResponse.json({ feedback: enriched });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { thesisId, section, message } = body;

  if (!thesisId || !section || !message) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const thesis = db.theses.findById(thesisId);
  if (!thesis) return NextResponse.json({ error: "Thesis not found" }, { status: 404 });

  const fb = db.feedback.create({
    id: `fb_${Date.now()}`,
    thesisId,
    studentId: payload.userId,
    professorId: thesis.professorId || "",
    section,
    message,
    status: "pending",
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ feedback: fb }, { status: 201 });
}
