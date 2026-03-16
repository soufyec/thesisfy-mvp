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

  let milestoneList;
  if (user.role === "student") {
    // Students see milestones for their theses
    const studentTheses = db.theses.getByStudent(user.id);
    const thesisIds = studentTheses.map((t) => t.id);
    milestoneList = db.milestones.getAll().filter((m) => thesisIds.includes(m.thesisId));
  } else if (user.role === "professor") {
    milestoneList = db.milestones.getByProfessor(user.id);
  } else {
    milestoneList = db.milestones.getAll();
  }

  const enriched = milestoneList.map((m) => {
    const thesis = db.theses.findById(m.thesisId);
    const student = thesis ? db.users.findById(thesis.studentId) : null;
    return {
      ...m,
      thesisTitle: thesis?.title || "Unknown",
      studentName: student?.name || "Unknown",
    };
  });

  return NextResponse.json({ milestones: enriched });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const user = db.users.findById(payload.userId);
  if (!user || (user.role !== "professor" && user.role !== "admin")) {
    return NextResponse.json({ error: "Only professors can create milestones" }, { status: 403 });
  }

  const body = await request.json();
  const { thesisId, title, description, dueDate, expectations, hasFeedback } = body;

  if (!thesisId || !title || !dueDate || !expectations) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const milestone = db.milestones.create({
    id: `ms_${Date.now()}`,
    thesisId,
    professorId: payload.userId,
    title,
    description: description || "",
    dueDate,
    expectations,
    hasFeedback: hasFeedback || false,
    status: "upcoming",
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ milestone }, { status: 201 });
}
