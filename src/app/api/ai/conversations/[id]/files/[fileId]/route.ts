import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { error, requireUser } from "@/lib/api";
import { FILE_MIME } from "@/lib/ai/files";
export async function GET(request: NextRequest, { params: routeParams }: { params: Promise<{ id: string; fileId: string }> }) {
  const params = await routeParams;
  const auth = await requireUser(request); if ("response" in auth) return auth.response;
  const conversation = db.conversations.findById(params.id);
  if (!conversation || conversation.userId !== auth.user.id) return error("Not found", 404);
  const file = conversation.messages.flatMap(m => m.files || []).find(f => f.id === params.fileId);
  if (!file || !file.interactionId) return error("Not found", 404);
  return new Response((file.format === "csv" ? "\ufeff" : "") + file.content, { headers: { "Content-Type": `${FILE_MIME[file.format]};charset=utf-8`, "Content-Disposition": `attachment; filename="${file.name}"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "Content-Security-Policy": "sandbox" } });
}
