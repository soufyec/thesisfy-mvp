import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifyUser } from "@/lib/notify";
import { error, json, requireUser } from "@/lib/api";

const ROLES = ["teacher", "school_head", "integrity_office", "dean", "library", "other"] as const;

/** Pilot request from the landing page. Public; rate limiting belongs to the edge in production. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return error("Invalid body");
  const institution = String(body.institution || "").trim().slice(0, 160);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 160);
  const role = (ROLES as readonly string[]).includes(body.role) ? (body.role as (typeof ROLES)[number]) : "other";
  if (institution.length < 2) return NextResponse.json({ error: "Tell us which institution you are writing from.", code: "institution" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: "Enter a valid work email.", code: "email" }, { status: 400 });
  const name = String(body.name || "").trim().slice(0, 120) || undefined;
  const phone = String(body.phone || "").trim().slice(0, 40) || undefined;
  if (phone && !/^\+?[\d\s().-]{6,40}$/.test(phone)) return NextResponse.json({ error: "Enter a phone number with digits only, spaces, dots or dashes.", code: "phone" }, { status: 400 });
  const lead = db.leads.create({ institution, email, role, name, phone, message: typeof body.message === "string" ? body.message.slice(0, 2000) : undefined });
  // Let the demo administrators know a pilot was requested.
  for (const admin of db.users.getAll().filter((u) => u.role === "admin")) {
    notifyUser(admin.id, "notif.pilotRequest", { institution, email }, { type: "info", link: "/admin/pilot-requests" });
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
