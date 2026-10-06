import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { error, json, requireUser } from "@/lib/api";
import { decrypt } from "@/lib/crypto";
import { testConnection } from "@/lib/ai/providers";

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const c = db.connections.findById(params.id);
  if (!c || c.userId !== r.user.id) return error("Connection not found", 404);
  db.connections.revoke(c.id);
  if (r.user.preferences.defaultProvider === c.provider) {
    const next = db.connections.listByUser(r.user.id)[0]?.provider;
    db.users.update(r.user.id, { preferences: { ...r.user.preferences, defaultProvider: next } });
  }
  return json({ success: true });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const c = db.connections.findById(params.id);
  if (!c || c.userId !== r.user.id) return error("Connection not found", 404);
  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.model === "string" && body.model.trim()) patch.model = body.model.trim();
  if (typeof body.label === "string" && body.label.trim()) patch.label = body.label.trim();
  if (body.makeDefault) db.users.update(r.user.id, { preferences: { ...r.user.preferences, defaultProvider: c.provider } });
  const updated = db.connections.update(c.id, patch)!;
  const { encryptedSecret: _s, ...rest } = updated;
  return json({ connection: rest });
}

/** Re-test a stored key. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const c = db.connections.findById(params.id);
  if (!c || c.userId !== r.user.id) return error("Connection not found", 404);
  let secret: string;
  try {
    secret = decrypt(c.encryptedSecret);
    if (c.authType === "oauth") secret = JSON.parse(secret).access_token;
  } catch {
    return error("Stored secret could not be read; reconnect the account.", 422);
  }
  const test = await testConnection(c.provider, secret, c.authType);
  db.connections.update(c.id, { status: test.ok ? "active" : "invalid", lastError: test.error });
  return json({ ok: test.ok, error: test.error, models: test.models });
}
