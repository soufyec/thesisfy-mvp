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

  let milestoneList;
  if (user.role === "student") {
    // Students see milestones for their theses
    const studentTheses = await database.theses.getByStudent(user.id);
    const thesisIds = studentTheses.map((t) => t.id);
    const allMilestones = await database.milestones.getAll();
    milestoneList = allMilestones.filter((m) => thesisIds.includes(m.thesisId));
  } else if (user.role === "professor") {
    milestoneList = await database.milestones.getByProfessor(user.id);
  } else {
    milestoneList = await database.milestones.getAll();
  }

  const enriched = await Promise.all(milestoneList.map(async (m) => {
    const thesis = await database.theses.findById(m.thesisId);
    const student = thesis ? await database.users.findById(thesis.studentId) : null;
    return {
      ...m,
      thesisTitle: thesis?.title || "Unknown",
      studentName: student?.name || "Unknown",
    };
  }));

  return NextResponse.json({ milestones: enriched });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const payload = await verifyAnyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const database = getDatabase();
  const user = await database.users.findById(payload.userId);
  if (!user || (user.role !== "professor" && user.role !== "admin")) {
    return NextResponse.json({ error: "Only professors can create milestones" }, { status: 403 });
  }

  const body = await request.json();
  const { thesisId, title, description, dueDate, expectations, hasFeedback } = body;

  if (!thesisId || !title || !dueDate || !expectations) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const milestone = await database.milestones.create({
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
