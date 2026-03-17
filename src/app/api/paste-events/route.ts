import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const thesisId = request.nextUrl.searchParams.get("thesisId");
  if (!thesisId) return NextResponse.json({ error: "thesisId required" }, { status: 400 });

  const events = db.pasteEvents.getByThesis(thesisId);
  return NextResponse.json({ pasteEvents: events });
}
