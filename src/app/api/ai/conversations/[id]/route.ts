import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { error, json, requireUser } from "@/lib/api";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const c = db.conversations.findById(params.id);
  if (!c || c.userId !== r.user.id) return error("Conversation not found", 404);
  return json({ conversation: c });
}
