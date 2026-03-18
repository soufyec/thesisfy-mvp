import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const thesis = db.theses.findById(params.id);
  if (!thesis) return NextResponse.json({ error: "Thesis not found" }, { status: 404 });

  const student = db.users.findById(thesis.studentId);
  const professor = thesis.professorId ? db.users.findById(thesis.professorId) : null;

  return NextResponse.json({
    thesis: {
      ...thesis,
      studentName: student?.name || "Unknown",
      professorName: professor?.name || "Unassigned",
    },
  });
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { content, title, status, wordCount } = body;

  const updateData: Record<string, unknown> = {};
  if (content !== undefined) updateData.content = content;
  if (title !== undefined) updateData.title = title;
  if (status !== undefined) updateData.status = status;
  if (wordCount !== undefined) updateData.wordCount = wordCount;

  const thesis = db.theses.update(params.id, updateData);
  if (!thesis) return NextResponse.json({ error: "Thesis not found" }, { status: 404 });

  return NextResponse.json({ thesis });
}
