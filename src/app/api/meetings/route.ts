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

  let meetingList;
  if (user.role === "student") {
    meetingList = db.meetings.getByStudent(user.id);
  } else if (user.role === "professor") {
    meetingList = db.meetings.getByProfessor(user.id);
  } else {
    meetingList = db.meetings.getAll();
  }

  const enriched = meetingList.map((m) => {
    const student = db.users.findById(m.studentId);
    const professor = db.users.findById(m.professorId);
    const thesis = db.theses.findById(m.thesisId);
    return {
      ...m,
      studentName: student?.name || "Unknown",
      professorName: professor?.name || "Unknown",
      thesisTitle: thesis?.title || "Unknown",
    };
  });

  return NextResponse.json({ meetings: enriched });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { thesisId, title, description, proposedDate, duration } = body;

  if (!thesisId || !title || !proposedDate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const thesis = db.theses.findById(thesisId);
  if (!thesis) return NextResponse.json({ error: "Thesis not found" }, { status: 404 });

  const meeting = db.meetings.create({
    id: `meet_${Date.now()}`,
    thesisId,
    studentId: payload.userId,
    professorId: thesis.professorId || "",
    title,
    description: description || "",
    proposedDate,
    duration: duration || 30,
    status: "pending",
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ meeting }, { status: 201 });
}
