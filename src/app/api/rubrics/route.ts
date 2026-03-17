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

  const thesisId = request.nextUrl.searchParams.get("thesisId");
  if (thesisId) {
    const rubric = db.rubrics.getByThesis(thesisId);
    if (!rubric) return NextResponse.json({ error: "No rubric found" }, { status: 404 });
    return NextResponse.json({ rubric });
  }

  const rubricList = user.role === "professor" ? db.rubrics.getByProfessor(user.id) : db.rubrics.getAll();
  const enriched = rubricList.map((r) => {
    const thesis = db.theses.findById(r.thesisId);
    const student = thesis ? db.users.findById(thesis.studentId) : null;
    return { ...r, thesisTitle: thesis?.title, studentName: student?.name };
  });
  return NextResponse.json({ rubrics: enriched });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { thesisId, title, criteria } = body;
  if (!thesisId || !title || !criteria?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const rubric = db.rubrics.create({
    id: `rub_${Date.now()}`,
    thesisId,
    professorId: payload.userId,
    title,
    criteria: criteria.map((c: { name: string; description: string; maxScore: number; weight: number }, i: number) => ({
      id: `rc_${Date.now()}_${i}`,
      name: c.name,
      description: c.description,
      maxScore: c.maxScore,
      weight: c.weight,
    })),
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ rubric }, { status: 201 });
}
