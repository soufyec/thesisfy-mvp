import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const thesisId = request.nextUrl.searchParams.get("thesisId");

  if (thesisId) {
    const report = db.writingReports.getByThesis(thesisId);
    if (!report) return NextResponse.json({ error: "No report found" }, { status: 404 });
    const thesis = db.theses.findById(thesisId);
    const student = thesis ? db.users.findById(thesis.studentId) : null;
    return NextResponse.json({ report: { ...report, thesisTitle: thesis?.title, studentName: student?.name } });
  }

  const reports = db.writingReports.getAll();
  const enriched = reports.map((r) => {
    const thesis = db.theses.findById(r.thesisId);
    const student = thesis ? db.users.findById(thesis.studentId) : null;
    return { ...r, thesisTitle: thesis?.title, studentName: student?.name };
  });
  return NextResponse.json({ reports: enriched });
}
