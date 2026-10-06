import { NextRequest } from "next/server";
import { db, Provider } from "@/lib/db";
import { error, json, requireUser } from "@/lib/api";
import { encrypt } from "@/lib/crypto";
import { DEFAULT_MODELS, PROVIDER_META, testConnection } from "@/lib/ai/providers";

const strip = (c: ReturnType<typeof db.connections.listByUser>[number]) => {
  const { encryptedSecret: _s, ...rest } = c;
  return rest;
};

export async function GET(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  return json({ connections: db.connections.listByUser(r.user.id).map(strip) });
}

/** Connect the student's own AI account with an API key (BYOK). The key is validated, then stored encrypted. */
export async function POST(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const body = await request.json().catch(() => null);
  const provider = body?.provider as Provider;
  if (!provider || !PROVIDER_META[provider]) return error("Unknown provider");
  const policy = db.policies.get(r.user.university);
  if (!policy.allowBYOK) return error("Your institution does not allow connecting personal AI accounts.", 403);
  if (!policy.allowedProviders.includes(provider)) return error(`${PROVIDER_META[provider].product} is not permitted by your institution's policy.`, 403);
  const apiKey = String(body.apiKey || "").trim();
  if (apiKey.length < 12) return error("API key looks too short");

  const test = await testConnection(provider, apiKey);
  if (!test.ok) return error(`Could not validate the key with ${PROVIDER_META[provider].name}: ${test.error}`, 422);

  const requestedModel = typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined;
  const conn = db.connections.create({
    userId: r.user.id,
    provider,
    authType: "api_key",
    label: body.label?.trim() || `${PROVIDER_META[provider].product} (my account)`,
    encryptedSecret: encrypt(apiKey),
    secretHint: apiKey.slice(-4),
    model: requestedModel || DEFAULT_MODELS[provider],
    status: "active",
  });
  if (!r.user.preferences.defaultProvider) db.users.update(r.user.id, { preferences: { ...r.user.preferences, defaultProvider: provider } });
  return json({ connection: strip(conn), models: test.models }, 201);
}
