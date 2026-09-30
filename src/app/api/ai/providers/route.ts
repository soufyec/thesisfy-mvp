import { NextRequest } from "next/server";
import { db, Provider } from "@/lib/db";
import { json, requireUser } from "@/lib/api";
import { DEFAULT_MODELS, oauthConfigured, platformKeyAvailable, PROVIDER_META } from "@/lib/ai/providers";
import { MODES } from "@/lib/ai/prompts";

export async function GET(request: NextRequest) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const policy = db.policies.get(r.user.university);
  const connections = db.connections.listByUser(r.user.id);
  const providers = (Object.keys(PROVIDER_META) as Provider[]).map((p) => {
    const conn = connections.find((c) => c.provider === p);
    return {
      id: p,
      ...PROVIDER_META[p],
      defaultModel: DEFAULT_MODELS[p],
      allowedByPolicy: policy.allowedProviders.includes(p),
      platformKey: platformKeyAvailable(p),
      oauthAvailable: oauthConfigured(p),
      connection: conn ? { id: conn.id, label: conn.label, authType: conn.authType, status: conn.status, model: conn.model, secretHint: conn.secretHint, createdAt: conn.createdAt, lastUsedAt: conn.lastUsedAt, lastError: conn.lastError } : null,
    };
  });
  return json({ providers, modes: MODES.filter((m) => policy.allowedModes.includes(m.id)), policy: { allowBYOK: policy.allowBYOK, allowedProviders: policy.allowedProviders, maxAiUsagePercent: policy.maxAiUsagePercent }, defaultProvider: r.user.preferences.defaultProvider || null });
}
