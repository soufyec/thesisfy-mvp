import { NextRequest, NextResponse } from "next/server";
import { verifyAnyToken } from "@/lib/auth";
import { getDatabase } from "@/lib/firestore";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const payload = await verifyAnyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { thesisId, events } = body;

  if (!thesisId || !events || !Array.isArray(events)) {
    return NextResponse.json({ error: "thesisId and events array are required" }, { status: 400 });
  }

  const database = getDatabase();
  const thesis = await database.theses.findById(thesisId);
  if (!thesis) return NextResponse.json({ error: "Thesis not found" }, { status: 404 });

  const sessionId = `sess_${Date.now()}`;

  for (const event of events) {
    const snapshot = await database.writingSnapshots.create({
      id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      thesisId,
      sessionId,
      timestamp: new Date().toISOString(),
      action: event.type,
      position: event.position,
      content: event.content,
      wordCount: event.wordCount,
      metadata: event.metadata,
    });

    if (event.type === "pasted") {
      await database.pasteEvents.create({
        id: `pe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        thesisId,
        sessionId,
        timestamp: snapshot.timestamp,
        wordCount: event.wordCount,
        content: event.content,
        wasModified: false,
        modificationPercent: 0,
        sourceHint: event.metadata?.sourceHint,
      });
    }
  }

  return NextResponse.json({ success: true, recorded: events.length });
}
