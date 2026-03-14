import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const stats = db.theses.getStats();
  const allUsers = db.users.getAll();

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
