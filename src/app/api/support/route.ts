import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { error, json, requireUser } from "@/lib/api";
import { classifySupport, priorityFor, SUPPORT_CATEGORIES, type SupportCategory, type SupportTicket } from "@/lib/support/types";
import { supportMessage } from "@/lib/support-store";
import { sameOrigin, supportBody } from "@/lib/support/http";
import { notifySupport } from "@/lib/support/mail";
import { translator } from "@/lib/i18n/dictionary";
import { isLocale } from "@/lib/i18n";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const r = await requireUser(request); if ("response" in r) return r.response;
  try { return json({ tickets: await db.support.list(r.user.id) }); }
  catch { return error("support_unavailable", 503); }
}
export async function POST(request: NextRequest) {
  const r = await requireUser(request); if ("response" in r) return r.response;
  if (!sameOrigin(request)) return error("Forbidden", 403);
  const body = await supportBody(request);
  if (!body || typeof body.text !== "string" || !body.text.trim() || body.text.length > 4000) return error("invalid_input", 400);
  const text = body.text.trim();
  const category = SUPPORT_CATEGORIES.includes(body.category as SupportCategory) ? body.category as SupportCategory : classifySupport(text);
  const t = translator(isLocale(body.locale) ? body.locale : r.user.preferences.language);
  const answer = t(`support.guide.${category}`);
  if (!body.createTicket && !body.ticketId) return json({ answer, category, canRefresh: category === "ai" });
  try {
    if (typeof body.ticketId === "string") {
      const ticket = await db.support.update(body.ticketId, r.user.id, row => {
        if (row.messages.length >= 200) throw new Error("limit");
        const previous = row.messages.filter(m => m.role === "student").slice(-1)[0];
        if (previous && Date.parse(previous.at) > Date.now() - 5000) throw new Error("support_rate_limit");
        row.messages.push(supportMessage("student", text));
        row.status = "open"; row.emailStatus = "pending";
      });
      if (!ticket) return error("Not found", 404);
      const status = await notifySupport(ticket);
      await db.support.update(ticket.id, r.user.id, row => { row.emailStatus = status; }).catch(() => null);
      return json({ ticket: { ...ticket, emailStatus: status } });
    }
    const at = new Date().toISOString();
    const ticket: SupportTicket = {
      id: `TF-${randomUUID().slice(0, 8)}`, userId: r.user.id, university: r.user.university,
      category, priority: priorityFor(category, text), status: "open", subject: text.replace(/\s+/g, " ").slice(0, 100),
      page: typeof body.page === "string" && body.page.startsWith("/dashboard") ? body.page.split("?")[0].slice(0, 160) : "/dashboard",
      createdAt: at, updatedAt: at, responseDueAt: new Date(Date.parse(at) + 2 * 60 * 60 * 1000).toISOString(),
      messages: [supportMessage("student", text), supportMessage("assistant", answer)], emailStatus: "pending",
    };
    await db.support.create(ticket);
    const status = await notifySupport(ticket);
    await db.support.update(ticket.id, r.user.id, row => { row.emailStatus = status; }).catch(() => null);
    return json({ ticket: { ...ticket, emailStatus: status }, answer }, 201);
  } catch (e) { return error((e as Error).message === "support_rate_limit" ? "support_rate_limit" : "support_unavailable", (e as Error).message === "support_rate_limit" ? 429 : 503); }
}
