import { NextRequest, NextResponse } from "next/server";
import { verifyAnyToken } from "@/lib/auth";
import { getDatabase } from "@/lib/firestore";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const payload = await verifyAnyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const thesisId = request.nextUrl.searchParams.get("thesisId");
  const sessionId = request.nextUrl.searchParams.get("sessionId");

  const database = getDatabase();
  let snapshots;
  if (sessionId) {
    snapshots = await database.writingSnapshots.getBySession(sessionId);
  } else if (thesisId) {
    snapshots = await database.writingSnapshots.getByThesis(thesisId);
  } else {
    return NextResponse.json({ error: "thesisId or sessionId required" }, { status: 400 });
  }

  return NextResponse.json({ snapshots });
}
