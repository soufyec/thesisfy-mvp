import { NextRequest } from "next/server";
import { db, Provider } from "@/lib/db";
import { json, requireUser } from "@/lib/api";
import { allowanceFor, DEFAULT_MODELS, institutionModelReady, oauthConfigured, platformKeyAvailable, PROVIDER_META } from "@/lib/ai/providers";
import { BACKEND_META } from "@/lib/ai/providers";
import { MODES } from "@/lib/ai/prompts";

export async function GET(request: NextRequest) {
  const r = await requireUser(request);
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
  // Platform keys the university pays for appear as institution models too (default when no configured model is ready),
  // so the student never sees a "demo" choice: the university's model first, the rest marked unavailable.
  if (funding.institutionPays) {
    const pretty = (id: string) => id.split("-").map((part) => (/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1))).join(" ").replace(/ Preview$/, " (preview)");
    const hasReadyDefault = institutionModels.some((m) => m.ready && m.isDefault);
    (Object.keys(PROVIDER_META) as Provider[]).forEach((p) => {
      if (!policy.allowedProviders.includes(p) || !platformKeyAvailable(p)) return;
      if (institutionModels.some((m) => m.provider === p && m.ready)) return;
      if (!hasReadyDefault) institutionModels.forEach((m) => { if (!m.ready) m.isDefault = false; });
      institutionModels.unshift({ id: `platform:${p}`, provider: p, label: pretty(DEFAULT_MODELS[p]), model: DEFAULT_MODELS[p], backend: "thesisfic", backendName: BACKEND_META.thesisfic.name, region: "", isDefault: !hasReadyDefault && !institutionModels.some((m) => m.id.startsWith("platform:")), ready: true, color: PROVIDER_META[p].color });
    });
  }
  return json({ institutionModels, allowance: funding.institutionPays ? allowanceFor(r.user) : null, providers, modes: MODES.filter((m) => (m.id === "copilot" ? policy.researchCopilot : policy.allowedModes.includes(m.id))), policy: { allowBYOK: policy.allowBYOK, allowedProviders: policy.allowedProviders, maxAiUsagePercent: policy.maxAiUsagePercent, researchCopilot: policy.researchCopilot }, defaultProvider: r.user.preferences.defaultProvider || null });
}
