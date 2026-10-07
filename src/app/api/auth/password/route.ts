import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { DEMO_PASSWORDS, verifyPassword } from "@/lib/auth";
import { json, requireUser } from "@/lib/api";

const MIN_PASSWORD = 8;

/** Signed-in user changes their own password: `{ currentPassword, newPassword }`. */
export async function POST(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const body = await request.json().catch(() => null);
  const current = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const next = typeof body?.newPassword === "string" ? body.newPassword : "";
  if (next.length < MIN_PASSWORD) return json({ error: `Password must be at least ${MIN_PASSWORD} characters`, code: "password_short" }, 400);
  if (!(await verifyPassword(r.user, current))) return json({ error: "Current password is incorrect", code: "wrong_password" }, 403);
  db.users.update(r.user.id, { password: await bcrypt.hash(next, 10) });
  // Seeded demo accounts keep accepting their documented password (unless DEMO_ACCOUNTS=off); say so rather than pretend otherwise.
  const demoPasswordStillValid = process.env.DEMO_ACCOUNTS !== "off" && DEMO_PASSWORDS[r.user.email] !== undefined;
  return json({ ok: true, demoPasswordStillValid });
}
