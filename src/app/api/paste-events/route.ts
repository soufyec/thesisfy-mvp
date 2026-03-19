import { NextRequest, NextResponse } from "next/server";
import { verifyAnyToken } from "@/lib/auth";
import { getDatabase } from "@/lib/firestore";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const payload = await verifyAnyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const thesisId = request.nextUrl.searchParams.get("thesisId");
  if (!thesisId) return NextResponse.json({ error: "thesisId required" }, { status: 400 });

  const database = getDatabase();
  const events = await database.pasteEvents.getByThesis(thesisId);
  return NextResponse.json({ pasteEvents: events });
}
