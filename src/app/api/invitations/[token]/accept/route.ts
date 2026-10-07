import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { registerUser, setAuthCookie } from "@/lib/auth";
import { error, json } from "@/lib/api";
import { invitationStatus } from "@/lib/invitations";

const MIN_PASSWORD = 8;

/** Public: creates the invited account (email, role and university come from the invitation) and signs in. */
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  await db.ready();
  const inv = db.invitations.findByToken(params.token);
  if (!inv || inv.revokedAt) return error("Invitation not found", 404);
  const status = invitationStatus(inv);
  if (status === "accepted") return json({ error: "Invitation already accepted", code: "accepted" }, 409);
  if (status === "expired") return json({ error: "Invitation expired", code: "expired" }, 410);

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!name) return json({ error: "Name is required", code: "name_required" }, 400);
  if (password.length < MIN_PASSWORD) return json({ error: `Password must be at least ${MIN_PASSWORD} characters`, code: "password_short" }, 400);

  const result = await registerUser({ email: inv.email, password, name, university: inv.university, role: inv.role });
  if ("error" in result) return json({ error: result.error, code: "email_taken" }, 409);
  db.invitations.accept(inv.id, result.user.id);
  return setAuthCookie(json({ user: result.user, token: result.token }, 201), result.token);
}
