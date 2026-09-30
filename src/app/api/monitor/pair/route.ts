import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { error, json, requireUser } from "@/lib/api";
import { preflight, withCors } from "@/lib/cors";

export const OPTIONS = () => preflight();

/** Student generates a short-lived pairing code from Settings. */
export async function POST(request: NextRequest) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const code = db.pairing.create(r.user.id);
  return json({ code: code.code, expiresAt: code.expiresAt });
}

/** Extension redeems the code for a long-lived token (no cookie auth: the code is the credential). */
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.code) return withCors(error("code is required"));
  const token = db.pairing.redeem(String(body.code), body.name || "Browser extension");
  if (!token) return withCors(error("Invalid or expired pairing code", 404));
  const user = db.users.findById(token.userId)!;
  return withCors(json({ token: token.token, user: { id: user.id, name: user.name, email: user.email, university: user.university } }));
}

export async function GET(request: NextRequest) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  return json({ tokens: db.pairing.tokens(r.user.id).map(({ token, ...t }) => ({ ...t, tokenHint: token.slice(-6) })) });
}

export async function DELETE(request: NextRequest) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const body = await request.json().catch(() => ({}));
  const tokens = db.pairing.tokens(r.user.id);
  const target = body.tokenHint ? tokens.find((t) => t.token.endsWith(body.tokenHint)) : undefined;
  (target ? [target] : tokens).forEach((t) => db.pairing.revokeToken(t.token));
  return json({ success: true });
}
