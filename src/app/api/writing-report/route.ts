import { NextRequest, NextResponse } from "next/server";
import { verifyAnyToken } from "@/lib/auth";
import { getDatabase } from "@/lib/firestore";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const payload = await verifyAnyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const thesisId = request.nextUrl.searchParams.get("thesisId");
  const database = getDatabase();

  if (thesisId) {
    const report = await database.writingReports.getByThesis(thesisId);
    if (!report) return NextResponse.json({ error: "No report found" }, { status: 404 });
    const thesis = await database.theses.findById(thesisId);
    const student = thesis ? await database.users.findById(thesis.studentId) : null;
    return NextResponse.json({ report: { ...report, thesisTitle: thesis?.title, studentName: student?.name } });
  }

  const reports = await database.writingReports.getAll();
  const enriched = await Promise.all(reports.map(async (r) => {
    const thesis = await database.theses.findById(r.thesisId);
    const student = thesis ? await database.users.findById(thesis.studentId) : null;
    return { ...r, thesisTitle: thesis?.title, studentName: student?.name };
  }));
  return NextResponse.json({ reports: enriched });
}
