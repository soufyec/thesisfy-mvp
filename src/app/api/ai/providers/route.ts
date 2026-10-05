import { NextRequest } from "next/server";
import { db, Provider } from "@/lib/db";
import { json, requireUser } from "@/lib/api";
import { allowanceFor, DEFAULT_MODELS, institutionModelReady, oauthConfigured, platformKeyAvailable, PROVIDER_META } from "@/lib/ai/providers";
import { BACKEND_META } from "@/lib/ai/providers";
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
  const funding = db.aiAccess.funding(r.user.university);
  const institutionModels = funding.institutionPays
    ? db.aiAccess.models(r.user.university)
        .filter((m) => m.enabled && policy.allowedProviders.includes(m.provider))
        .map((m) => ({ id: m.id, provider: m.provider, label: m.label, model: m.model, backend: m.backend, backendName: BACKEND_META[m.backend].name, region: m.region, isDefault: m.isDefault, ready: institutionModelReady(m), color: PROVIDER_META[m.provider].color }))
    : [];
  return json({ institutionModels, allowance: funding.institutionPays ? allowanceFor(r.user) : null, providers, modes: MODES.filter((m) => policy.allowedModes.includes(m.id)), policy: { allowBYOK: policy.allowBYOK, allowedProviders: policy.allowedProviders, maxAiUsagePercent: policy.maxAiUsagePercent }, defaultProvider: r.user.preferences.defaultProvider || null });
}
