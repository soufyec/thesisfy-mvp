import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { db, publicUser } from "@/lib/db";
import { setAuthCookie, signToken } from "@/lib/auth";
import { error, json } from "@/lib/api";

const MIN_PASSWORD = 8;

function state(token: string) {
  const reset = db.passwordResets.findByToken(token);
  if (!reset) return null;
  const user = db.users.findById(reset.userId);
  if (!user) return null;
  return { reset, user, expired: Date.parse(reset.expiresAt) <= Date.now(), used: !!reset.usedAt };
}

/** Public: what the reset page needs to render. */
export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  await db.ready();
  const s = state(params.token);
  if (!s) return error("Reset link not found", 404);
  return json({ email: s.user.email, expired: s.expired, used: s.used });
}

/** Public: `{ password }` sets the new password, marks the link used and signs in with the regular session cookie. */
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  await db.ready();
  const s = state(params.token);
  if (!s) return error("Reset link not found", 404);
  if (s.used) return json({ error: "Reset link already used", code: "used" }, 409);
  if (s.expired) return json({ error: "Reset link expired", code: "expired" }, 410);
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.length < MIN_PASSWORD) return json({ error: `Password must be at least ${MIN_PASSWORD} characters`, code: "password_short" }, 400);
  const user = db.users.update(s.user.id, { password: await bcrypt.hash(password, 10) });
  if (!user) return error("User not found", 404);
  db.passwordResets.use(s.reset.id);
  db.users.touch(user.id);
  const token = signToken(user);
  return setAuthCookie(json({ user: publicUser(user), token }), token);
}
