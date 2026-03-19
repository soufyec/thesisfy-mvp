import { NextRequest, NextResponse } from "next/server";
import { verifyAnyToken } from "@/lib/auth";
import { getDatabase } from "@/lib/firestore";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const payload = await verifyAnyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const database = getDatabase();
  const stats = await database.theses.getStats();
  const allUsers = await database.users.getAll();

  return NextResponse.json({
    stats: {
      ...stats,
      totalStudents: allUsers.filter((u) => u.role === "student").length,
      totalProfessors: allUsers.filter((u) => u.role === "professor").length,
      totalUsers: allUsers.length,
      activeSessions: 3, // Mock
      flagsThisWeek: 2, // Mock
      avgWordsPerDay: 340, // Mock
    },
  });
}
