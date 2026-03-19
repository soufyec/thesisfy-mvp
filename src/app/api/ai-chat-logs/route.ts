import { NextRequest, NextResponse } from "next/server";
import { verifyAnyToken } from "@/lib/auth";
import { getDatabase } from "@/lib/firestore";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const payload = await verifyAnyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const thesisId = request.nextUrl.searchParams.get("thesisId");
  const studentId = request.nextUrl.searchParams.get("studentId");

  const database = getDatabase();
  let logs;
  if (thesisId) {
    logs = await database.aiChatLogs.getByThesis(thesisId);
  } else if (studentId) {
    logs = await database.aiChatLogs.getByStudent(studentId);
  } else {
    logs = await database.aiChatLogs.getAll();
  }

  // Generate summary
  const categories = ["brainstorming", "grammar", "structure", "research", "citations", "paraphrase", "proofreading", "other"];
  const summary = categories.map((cat) => {
    const catLogs = logs.filter((l) => l.category === cat);
    return { category: cat, count: catLogs.length, totalTokens: catLogs.reduce((sum, l) => sum + l.tokensUsed, 0) };
  }).filter((s) => s.count > 0);

  return NextResponse.json({ logs, summary, totalInteractions: logs.length, totalTokens: logs.reduce((sum, l) => sum + l.tokensUsed, 0) });
}
