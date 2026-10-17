import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { error, json } from "@/lib/api";
import { isTeamRequest } from "@/lib/team";
import { supportMessage } from "@/lib/support-store";
import { sameOrigin, supportBody } from "@/lib/support/http";
import { notifySupport } from "@/lib/support/mail";
import { translator } from "@/lib/i18n/dictionary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  if (!isTeamRequest(request)) return error("Unauthorized", 401);
  try { return json({ tickets: await db.support.list() }); } catch { return error("support_unavailable", 503); }
}
export async function PATCH(request: NextRequest) {
  if (!isTeamRequest(request)) return error("Unauthorized", 401);
  if (!sameOrigin(request)) return error("Forbidden", 403);
  const body = await supportBody(request);
  if (!body || typeof body.id !== "string" || body.reply !== undefined && (typeof body.reply !== "string" || body.reply.length > 4000)) return error("invalid_input", 400);
  if (body.status !== undefined && !["open", "in_progress", "resolved"].includes(String(body.status))) return error("invalid_input", 400);
  if (body.priority !== undefined && !["urgent", "high", "normal", "low"].includes(String(body.priority))) return error("invalid_input", 400);
  try {
    const ticket = await db.support.update(body.id, undefined, row => {
      if (body.status === "resolved" && !row.firstResponseAt && !(typeof body.reply === "string" && body.reply.trim())) throw new Error("reply_required");
      if (row.messages.length >= 200) throw new Error("limit");
      if (typeof body.reply === "string" && body.reply.trim()) { row.messages.push(supportMessage("team", body.reply.trim())); row.firstResponseAt ||= new Date().toISOString(); }
      if (body.status) row.status = body.status as typeof row.status;
      if (body.priority) row.priority = body.priority as typeof row.priority;
    });
    if (!ticket) return error("Not found", 404);
    if (typeof body.reply === "string" && body.reply.trim()) {
      try {
        await db.ready();
        const user = db.users.findById(ticket.userId);
        if (user) { const t = translator(user.preferences.language); db.notifications.create({ userId: user.id, title: t("support.title"), message: t("support.replyReceived", { id: ticket.id }), type: "info", link: "/dashboard?help=" + encodeURIComponent(ticket.id) }); }
      } catch { /* The reply is already committed; notification failure must not invite a duplicate reply. */ }
    }
    if (body.retryEmail) { const status = await notifySupport(ticket); await db.support.update(ticket.id, undefined, row => { row.emailStatus = status; }); ticket.emailStatus = status; }
    return json({ ticket });
  } catch { return error("support_update_failed", 400); }
}
