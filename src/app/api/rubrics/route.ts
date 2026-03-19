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

  const thesisId = request.nextUrl.searchParams.get("thesisId");
  if (thesisId) {
    const rubric = await database.rubrics.getByThesis(thesisId);
    if (!rubric) return NextResponse.json({ error: "No rubric found" }, { status: 404 });
    return NextResponse.json({ rubric });
  }

  const rubricList = user.role === "professor" ? await database.rubrics.getByProfessor(user.id) : await database.rubrics.getAll();
  const enriched = await Promise.all(rubricList.map(async (r) => {
    const thesis = await database.theses.findById(r.thesisId);
    const student = thesis ? await database.users.findById(thesis.studentId) : null;
    return { ...r, thesisTitle: thesis?.title, studentName: student?.name };
  }));
  return NextResponse.json({ rubrics: enriched });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const payload = await verifyAnyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { thesisId, title, criteria } = body;
  if (!thesisId || !title || !criteria?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const database = getDatabase();
  const rubric = await database.rubrics.create({
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
