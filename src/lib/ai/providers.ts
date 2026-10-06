import Anthropic from "@anthropic-ai/sdk";
import { AnthropicFoundry } from "@anthropic-ai/foundry-sdk";
import { db, InstitutionModel, ModelBackend, Policy, Provider, User } from "../db";
import { decrypt } from "../crypto";

export const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: process.env.CLAUDE_MODEL || "claude-opus-5-5",
  openai: process.env.OPENAI_MODEL || "gpt-4o-mini",
  google: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  mistral: process.env.MISTRAL_MODEL || "mistral-small-latest",
};

export const PROVIDER_META: Record<
  Provider,
  { name: string; product: string; keyUrl: string; keyPrefix: string; models: string[]; sites: string[]; color: string }
> = {
  anthropic: { name: "Anthropic", product: "Claude", keyUrl: "https://console.anthropic.com/settings/keys", keyPrefix: "sk-ant-", models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"], sites: ["claude.ai"], color: "#d97757" },
  openai: { name: "OpenAI", product: "ChatGPT / GPT", keyUrl: "https://platform.openai.com/api-keys", keyPrefix: "sk-", models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o4-mini"], sites: ["chatgpt.com"], color: "#10a37f" },
  google: { name: "Google", product: "Gemini", keyUrl: "https://aistudio.google.com/app/apikey", keyPrefix: "AIza", models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"], sites: ["gemini.google.com"], color: "#4285f4" },
  mistral: { name: "Mistral", product: "Le Chat / Mistral", keyUrl: "https://console.mistral.ai/api-keys", keyPrefix: "", models: ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"], sites: ["chat.mistral.ai"], color: "#ff7000" },
};

const PLATFORM_KEYS: Record<Provider, string | undefined> = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  google: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
  mistral: process.env.MISTRAL_API_KEY,
};

export function platformKeyAvailable(provider: Provider) {
  return !!PLATFORM_KEYS[provider];
}

export function oauthConfigured(provider: Provider) {
  const p = provider.toUpperCase();
  return !!(process.env[`${p}_OAUTH_CLIENT_ID`] && process.env[`${p}_OAUTH_AUTHORIZE_URL`] && process.env[`${p}_OAUTH_TOKEN_URL`]);
}

export interface ResolvedProvider {
  provider: Provider | "demo";
  model: string;
  apiKey?: string;
  authType: "api_key" | "oauth" | "none";
  source: "byok" | "platform" | "institution" | "demo";
  connectionId?: string;
  label: string;
  /** Set when the request runs on a model the institution pays for. */
  institutionModel?: InstitutionModel;
  backend?: ModelBackend;
  endpoint?: string;
  billedTo: "institution" | "student" | "none";
  /** Why an institution model was not used, shown to the student. */
  notice?: string;
}

export const BACKEND_META: Record<ModelBackend, { name: string; billedBy: string; needsKey: boolean; endpointLabel?: string; endpointHint?: string }> = {
  thesisfic: { name: "Thesisfic contract", billedBy: "Thesisfic invoice, usage passed through at provider list price", needsKey: false },
  anthropic: { name: "Anthropic (your account)", billedBy: "Anthropic invoices the university", needsKey: true },
  openai: { name: "OpenAI (your account)", billedBy: "OpenAI invoices the university", needsKey: true },
  mistral: { name: "Mistral (your account)", billedBy: "Mistral invoices the university", needsKey: true },
  google: { name: "Google AI (your account)", billedBy: "Google invoices the university", needsKey: true },
  azure_openai: { name: "Azure OpenAI (Microsoft)", billedBy: "On the university's Microsoft Azure invoice, like Copilot", needsKey: true, endpointLabel: "Azure resource URL", endpointHint: "https://your-resource.openai.azure.com" },
  foundry_claude: { name: "Claude in Microsoft Foundry", billedBy: "On the university's Microsoft Azure invoice, like Copilot", needsKey: true, endpointLabel: "Foundry resource name", endpointHint: "your-resource (from your-resource.services.ai.azure.com)" },
};

/** Model families a backend can serve. */
export const BACKEND_PROVIDERS: Record<ModelBackend, Provider[]> = {
  thesisfic: ["anthropic", "openai", "google", "mistral"],
  anthropic: ["anthropic"],
  openai: ["openai"],
  mistral: ["mistral"],
  google: ["google"],
  azure_openai: ["openai", "mistral"],
  foundry_claude: ["anthropic"],
};

function institutionKey(m: InstitutionModel): string | undefined {
  if (m.backend === "thesisfic") return PLATFORM_KEYS[m.provider];
  if (!m.encryptedSecret) return undefined;
  try {
    return decrypt(m.encryptedSecret);
  } catch {
    db.aiAccess.updateModel(m.id, { lastError: "Could not decrypt the stored key" });
    return undefined;
  }
}

/** Is an institution model usable right now (configured and, for the thesisfic backend, backed by a Thesisfic key)? */
export function institutionModelReady(m: InstitutionModel) {
  return m.enabled && !!institutionKey(m);
}

export interface Allowance {
  institutionPays: boolean;
  currency: string;
  perStudentMonthly: number;
  spentStudent: number; // this month, institution currency
  monthlyBudget: number;
  spentInstitution: number;
  atLimit: "block" | "own_account";
  exhausted: "none" | "student" | "institution";
}

export function allowanceFor(user: User): Allowance {
  const f = db.aiAccess.funding(user.university);
  const all = db.aiAccess.monthUsage(user.university);
  const toLocal = (usd: number) => usd * f.usdRate;
  const spentInstitution = toLocal(all.reduce((a, i) => a + (i.costUsd || 0), 0));
  const spentStudent = toLocal(all.filter((i) => i.userId === user.id).reduce((a, i) => a + (i.costUsd || 0), 0));
  let exhausted: Allowance["exhausted"] = "none";
  if (f.monthlyBudget > 0 && spentInstitution >= f.monthlyBudget) exhausted = "institution";
  else if (f.perStudentMonthly > 0 && spentStudent >= f.perStudentMonthly) exhausted = "student";
  return { institutionPays: f.institutionPays, currency: f.currency, perStudentMonthly: f.perStudentMonthly, spentStudent, monthlyBudget: f.monthlyBudget, spentInstitution, atLimit: f.atLimit, exhausted };
}

function fromInstitutionModel(m: InstitutionModel): ResolvedProvider {
  return { provider: m.provider, model: m.model, apiKey: institutionKey(m), authType: "api_key", source: "institution", label: `${m.label} (${BACKEND_META[m.backend].name.split(" (")[0]}, paid by your university)`, institutionModel: m, backend: m.backend, endpoint: m.endpoint, billedTo: "institution" };
}

/**
 * Pick the provider for a request.
 * Order: a model the institution pays for (within its allowance) → the student's own connected account →
 * the Thesisfic platform key → demo. `requested` can be a provider id or an institution model id ("im_…").
 */
export function resolveProvider(user: User, policy: Policy, requested?: string | null): ResolvedProvider {
  const funding = db.aiAccess.funding(user.university);
  let notice: string | undefined;
  // Thesisfic's own keys back the assistant unless the university pays and the allowance is used up.
  let allowPlatform = true;
  const requestedModel = requested && requested.startsWith("im_") ? db.aiAccess.findModel(requested) : undefined;
  const requestedProvider = requested && !requested.startsWith("im_") ? (requested as Provider) : requestedModel?.provider || null;

  if (funding.institutionPays) {
    const allowance = allowanceFor(user);
    if (allowance.exhausted !== "none") {
      const what = allowance.exhausted === "student" ? `your monthly allowance (${allowance.perStudentMonthly.toFixed(2)} ${allowance.currency})` : "your university's monthly AI budget";
      if (funding.atLimit === "block") return { provider: "demo", model: "thesisfic-demo", authType: "none", source: "demo", label: "Allowance used up", billedTo: "none", notice: `You have used ${what} for this month. It resets on the 1st; ask your library or advisor if you need more.` };
      notice = `You have used ${what}; the assistant now uses your own connected account.`;
      allowPlatform = false;
    } else {
      const models = db.aiAccess.models(user.university).filter((m) => m.university === user.university && institutionModelReady(m) && policy.allowedProviders.includes(m.provider));
      const pick = requestedModel && models.find((m) => m.id === requestedModel.id) ? requestedModel : requestedProvider ? models.find((m) => m.provider === requestedProvider) : models.find((m) => m.isDefault) || models[0];
      if (pick && (!requestedProvider || pick.provider === requestedProvider || requestedModel)) return fromInstitutionModel(pick);
    }
  }

  const order: Provider[] = [];
  const push = (p?: Provider | null) => p && PROVIDER_META[p] && !order.includes(p) && order.push(p);
  push(requestedProvider);
  push(user.preferences.defaultProvider);
  (["anthropic", "openai", "google", "mistral"] as Provider[]).forEach(push);
  const requestedP = requestedProvider;

  for (const provider of order) {
    if (!policy.allowedProviders.includes(provider)) continue;
    if (policy.allowBYOK) {
      const conn = db.connections.findActive(user.id, provider);
      if (conn?.encryptedSecret) {
        try {
          const secret = decrypt(conn.encryptedSecret);
          const apiKey = conn.authType === "oauth" ? (JSON.parse(secret).access_token as string) : secret;
          return { provider, model: conn.model || DEFAULT_MODELS[provider], apiKey, authType: conn.authType, source: "byok", connectionId: conn.id, label: conn.label, billedTo: "student", notice };
        } catch {
          db.connections.update(conn.id, { status: "invalid", lastError: "Could not decrypt stored secret" });
        }
      }
    }
    if (requestedP && requestedP !== provider) continue;
    if (allowPlatform && PLATFORM_KEYS[provider]) {
      return { provider, model: DEFAULT_MODELS[provider], apiKey: PLATFORM_KEYS[provider], authType: "api_key", source: "platform", label: `${PROVIDER_META[provider].product} (Thesisfic)`, billedTo: "none", notice };
    }
  }
  // Second pass: platform keys regardless of requested provider
  if (allowPlatform) {
    for (const provider of order) {
      if (policy.allowedProviders.includes(provider) && PLATFORM_KEYS[provider]) {
        return { provider, model: DEFAULT_MODELS[provider], apiKey: PLATFORM_KEYS[provider], authType: "api_key", source: "platform", label: `${PROVIDER_META[provider].product} (Thesisfic)`, billedTo: "none", notice };
      }
    }
  }
  return { provider: "demo", model: "thesisfic-demo", authType: "none", source: "demo", label: "Demo assistant", billedTo: "none", notice };
}

/** Provider list cost of one request in USD, from the institution model's configured prices. */
export function costOf(cfg: ResolvedProvider, usage: { inputTokens: number; outputTokens: number }) {
  const m = cfg.institutionModel;
  if (!m) return 0;
  return (usage.inputTokens * m.inputPrice + usage.outputTokens * m.outputPrice) / 1e6;
}

export type StreamChunk = { type: "delta"; text: string } | { type: "usage"; inputTokens: number; outputTokens: number } | { type: "error"; message: string; code?: string };

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const MODERN_CLAUDE = /^claude-(opus-5|sonnet-5|fable|mythos)/;

export async function* streamCompletion(cfg: ResolvedProvider, system: string, messages: ChatMessage[], maxTokens = 4096): AsyncGenerator<StreamChunk> {
  if (cfg.provider === "demo" || !cfg.apiKey) return;
  try {
    if (cfg.backend === "foundry_claude") yield* streamAnthropic(cfg, system, messages, maxTokens);
    else if (cfg.backend === "azure_openai") yield* streamOpenAICompatible(cfg, system, messages, maxTokens);
    else if (cfg.provider === "anthropic") yield* streamAnthropic(cfg, system, messages, maxTokens);
    else if (cfg.provider === "google") yield* streamGemini(cfg, system, messages, maxTokens);
    else yield* streamOpenAICompatible(cfg, system, messages, maxTokens);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    const code = err.status === 401 || err.status === 403 ? "auth" : err.status === 429 ? "rate_limit" : "provider";
    if (code === "auth" && cfg.connectionId) db.connections.update(cfg.connectionId, { status: "invalid", lastError: err.message });
    if (cfg.institutionModel) db.aiAccess.updateModel(cfg.institutionModel.id, { lastError: `${new Date().toISOString().slice(0, 16)} ${err.message || "request failed"}` });
    yield { type: "error", message: err.message || "Provider request failed", code };
  }
}

type ClaudeClient = { beta: { messages: Pick<Anthropic["beta"]["messages"], "stream"> } };

function anthropicClient(cfg: { apiKey?: string; authType?: string; backend?: ModelBackend; endpoint?: string }): ClaudeClient {
  // Claude inside the university's Microsoft Foundry resource: same Messages API, billed by Microsoft.
  if (cfg.backend === "foundry_claude") return new AnthropicFoundry({ apiKey: cfg.apiKey, resource: foundryResource(cfg.endpoint) });
  return cfg.authType === "oauth" ? new Anthropic({ authToken: cfg.apiKey }) : new Anthropic({ apiKey: cfg.apiKey });
}

/** Accepts "my-resource", "my-resource.services.ai.azure.com" or a full https URL. */
function foundryResource(endpoint?: string) {
  const e = (endpoint || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return e.includes(".") ? e : `${e}.services.ai.azure.com`;
}

async function* streamAnthropic(cfg: ResolvedProvider, system: string, messages: ChatMessage[], maxTokens: number): AsyncGenerator<StreamChunk> {
  const client = anthropicClient(cfg);
  // Foundry does not take the server-side fallback beta; keep the request plain there.
  const modern = MODERN_CLAUDE.test(cfg.model) && cfg.backend !== "foundry_claude";
  const stream = client.beta.messages.stream({
    model: cfg.model,
    max_tokens: maxTokens,
    system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    ...(modern
      ? { betas: ["server-side-fallback-2026-07-01" as Anthropic.Beta.AnthropicBeta], fallbacks: "default" as const, output_config: { effort: "medium" as const } }
      : {}),
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield { type: "delta", text: event.delta.text };
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    yield { type: "error", message: "The provider declined this request for safety reasons. Rephrase it and try again.", code: "refusal" };
  }
  yield { type: "usage", inputTokens: final.usage?.input_tokens || 0, outputTokens: final.usage?.output_tokens || 0 };
}

const AZURE_API_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";

function azureUrl(endpoint: string | undefined, deployment: string, path: "chat/completions" | "models") {
  const base = (endpoint || "").trim().replace(/\/+$/, "");
  return path === "models" ? `${base}/openai/models?api-version=${AZURE_API_VERSION}` : `${base}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${AZURE_API_VERSION}`;
}

async function* streamOpenAICompatible(cfg: ResolvedProvider, system: string, messages: ChatMessage[], maxTokens: number): AsyncGenerator<StreamChunk> {
  const azure = cfg.backend === "azure_openai";
  const base = cfg.provider === "mistral" ? "https://api.mistral.ai/v1" : process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const body: Record<string, unknown> = {
    model: cfg.model,
    stream: true,
    max_tokens: maxTokens,
    messages: [{ role: "system", content: system }, ...messages],
  };
  if (cfg.provider === "openai" || azure) body.stream_options = { include_usage: true };
  const res = await fetch(azure ? azureUrl(cfg.endpoint, cfg.model, "chat/completions") : `${base}/chat/completions`, {
    method: "POST",
    headers: azure ? { "Content-Type": "application/json", "api-key": cfg.apiKey! } : { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw Object.assign(new Error(parseErr(text) || `${PROVIDER_META[cfg.provider as Provider].name} error ${res.status}`), { status: res.status });
  }
  let usage = { inputTokens: 0, outputTokens: 0 };
  for await (const data of sseLines(res.body)) {
    if (data === "[DONE]") break;
    try {
      const json = JSON.parse(data);
      const text = json.choices?.[0]?.delta?.content;
      if (text) yield { type: "delta", text };
      if (json.usage) usage = { inputTokens: json.usage.prompt_tokens || 0, outputTokens: json.usage.completion_tokens || 0 };
    } catch {
      /* ignore partial frames */
    }
  }
  yield { type: "usage", ...usage };
}

async function* streamGemini(cfg: ResolvedProvider, system: string, messages: ChatMessage[], maxTokens: number): AsyncGenerator<StreamChunk> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(cfg.apiKey!)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw Object.assign(new Error(parseErr(text) || `Gemini error ${res.status}`), { status: res.status });
  }
  let usage = { inputTokens: 0, outputTokens: 0 };
  for await (const data of sseLines(res.body)) {
    try {
      const json = JSON.parse(data);
      const parts = json.candidates?.[0]?.content?.parts || [];
      for (const p of parts) if (p.text) yield { type: "delta", text: p.text };
      if (json.usageMetadata) usage = { inputTokens: json.usageMetadata.promptTokenCount || 0, outputTokens: json.usageMetadata.candidatesTokenCount || 0 };
    } catch {
      /* ignore */
    }
  }
  yield { type: "usage", ...usage };
}

async function* sseLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line.startsWith("data:")) yield line.slice(5).trim();
    }
  }
  if (buffer.trim().startsWith("data:")) yield buffer.trim().slice(5).trim();
}

function parseErr(text: string): string | undefined {
  try {
    const j = JSON.parse(text);
    return j.error?.message || j.message;
  } catch {
    return text.slice(0, 200) || undefined;
  }
}

/** Validates an institution model's credentials with a one-token request (Foundry/Azure have no cheap model list). */
export async function testInstitutionModel(m: Pick<InstitutionModel, "backend" | "provider" | "model" | "endpoint">, apiKey?: string): Promise<{ ok: boolean; error?: string; models?: string[] }> {
  if (m.backend === "thesisfic") return PLATFORM_KEYS[m.provider] ? { ok: true } : { ok: false, error: `Thesisfic has no ${PROVIDER_META[m.provider].name} key configured on this server yet (set ${m.provider.toUpperCase()}_API_KEY).` };
  if (!apiKey) return { ok: false, error: "A key is required for this backend" };
  if (m.backend === "foundry_claude" || m.backend === "azure_openai") {
    try {
      const cfg: ResolvedProvider = { provider: m.provider, model: m.model, apiKey, authType: "api_key", source: "institution", label: "test", backend: m.backend, endpoint: m.endpoint, billedTo: "none" };
      let err: string | undefined;
      for await (const chunk of streamCompletion(cfg, "Reply with OK.", [{ role: "user", content: "ping" }], 5)) if (chunk.type === "error") err = chunk.message;
      return err ? { ok: false, error: err } : { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  return testConnection(m.backend as Provider, apiKey);
}

/** Validates a key against the provider's model list. Returns a few model ids on success. */
export async function testConnection(provider: Provider, apiKey: string, authType: "api_key" | "oauth" = "api_key"): Promise<{ ok: boolean; error?: string; models?: string[] }> {
  try {
    if (provider === "anthropic") {
      const client = authType === "oauth" ? new Anthropic({ authToken: apiKey }) : new Anthropic({ apiKey });
      const page = await client.models.list({ limit: 20 });
      return { ok: true, models: page.data.map((m) => m.id) };
    }
    const url = provider === "openai" ? `${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/models` : provider === "mistral" ? "https://api.mistral.ai/v1/models" : `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { headers: provider === "google" ? {} : { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: parseErr(text) || `HTTP ${res.status}` };
    }
    const json = await res.json();
    const models: string[] = provider === "google" ? (json.models || []).map((m: { name: string }) => m.name.replace("models/", "")) : (json.data || []).map((m: { id: string }) => m.id);
    return { ok: true, models: models.slice(0, 40) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
