import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { error, json, requireUser } from "@/lib/api";

const ROLES = ["integrity_office", "dean", "library", "other"] as const;

/** Pilot request from the landing page. Public; rate limiting belongs to the edge in production. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return error("Invalid body");
  const institution = String(body.institution || "").trim().slice(0, 160);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 160);
  const role = (ROLES as readonly string[]).includes(body.role) ? (body.role as (typeof ROLES)[number]) : "other";
  if (institution.length < 2) return error("Tell us which institution you are writing from.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return error("Enter a valid work email.");
  const lead = db.leads.create({ institution, email, role, message: typeof body.message === "string" ? body.message.slice(0, 2000) : undefined });
  // Let the demo administrators know a pilot was requested.
  for (const admin of db.users.getAll().filter((u) => u.role === "admin")) {
    db.notifications.create({ userId: admin.id, title: "Pilot request", message: `${institution} (${email}) asked for a pilot.`, type: "info" });
  }
  return json({ ok: true, id: lead.id }, 201);
}

/** Administrators list pilot requests. */
export async function GET(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  if (r.user.role !== "admin") return error("Only administrators can list pilot requests", 403);
  return json({ leads: db.leads.list() });
}
