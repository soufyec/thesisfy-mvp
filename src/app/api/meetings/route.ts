import { NextRequest, NextResponse } from "next/server";
import { verifyAnyToken } from "@/lib/auth";
import { getDatabase } from "@/lib/firestore";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const payload = await verifyAnyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const database = getDatabase();
  const user = await database.users.findById(payload.userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  let meetingList;
  if (user.role === "student") {
    meetingList = await database.meetings.getByStudent(user.id);
  } else if (user.role === "professor") {
    meetingList = await database.meetings.getByProfessor(user.id);
  } else {
    meetingList = await database.meetings.getAll();
  }

  const enriched = await Promise.all(meetingList.map(async (m) => {
    const student = await database.users.findById(m.studentId);
    const professor = await database.users.findById(m.professorId);
    const thesis = await database.theses.findById(m.thesisId);
    return {
      ...m,
      studentName: student?.name || "Unknown",
      professorName: professor?.name || "Unknown",
      thesisTitle: thesis?.title || "Unknown",
    };
  }));

  return NextResponse.json({ meetings: enriched });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const payload = await verifyAnyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { thesisId, title, description, proposedDate, duration } = body;

  if (!thesisId || !title || !proposedDate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const database = getDatabase();
  const thesis = await database.theses.findById(thesisId);
  if (!thesis) return NextResponse.json({ error: "Thesis not found" }, { status: 404 });

  const meeting = await database.meetings.create({
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
