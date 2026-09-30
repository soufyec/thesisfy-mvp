import Anthropic from "@anthropic-ai/sdk";
import { db, Policy, Provider, User } from "../db";
import { decrypt } from "../crypto";

export const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: process.env.CLAUDE_MODEL || "claude-opus-5-5",
  openai: process.env.OPENAI_MODEL || "gpt-4o-mini",
  google: process.env.GEMINI_MODEL || "gemini-2.0-flash",
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
  source: "byok" | "platform" | "demo";
  connectionId?: string;
  label: string;
}

/** Pick the provider for a request: the student's own connected account first, then the platform key, then demo. */
export function resolveProvider(user: User, policy: Policy, requested?: Provider | null): ResolvedProvider {
  const order: Provider[] = [];
  const push = (p?: Provider | null) => p && !order.includes(p) && order.push(p);
  push(requested);
  push(user.preferences.defaultProvider);
  (["anthropic", "openai", "google", "mistral"] as Provider[]).forEach(push);

  for (const provider of order) {
    if (!policy.allowedProviders.includes(provider)) continue;
    if (policy.allowBYOK) {
      const conn = db.connections.findActive(user.id, provider);
      if (conn?.encryptedSecret) {
        try {
          const secret = decrypt(conn.encryptedSecret);
          const apiKey = conn.authType === "oauth" ? (JSON.parse(secret).access_token as string) : secret;
          return { provider, model: conn.model || DEFAULT_MODELS[provider], apiKey, authType: conn.authType, source: "byok", connectionId: conn.id, label: conn.label };
        } catch {
          db.connections.update(conn.id, { status: "invalid", lastError: "Could not decrypt stored secret" });
        }
      }
    }
    if (requested && requested !== provider) continue;
    if (PLATFORM_KEYS[provider]) {
      return { provider, model: DEFAULT_MODELS[provider], apiKey: PLATFORM_KEYS[provider], authType: "api_key", source: "platform", label: `${PROVIDER_META[provider].product} (institution)` };
    }
  }
  // Second pass: platform keys regardless of requested provider
  for (const provider of order) {
    if (policy.allowedProviders.includes(provider) && PLATFORM_KEYS[provider]) {
      return { provider, model: DEFAULT_MODELS[provider], apiKey: PLATFORM_KEYS[provider], authType: "api_key", source: "platform", label: `${PROVIDER_META[provider].product} (institution)` };
    }
  }
  return { provider: "demo", model: "thesisfy-demo", authType: "none", source: "demo", label: "Demo assistant" };
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
    if (cfg.provider === "anthropic") yield* streamAnthropic(cfg, system, messages, maxTokens);
    else if (cfg.provider === "google") yield* streamGemini(cfg, system, messages, maxTokens);
    else yield* streamOpenAICompatible(cfg, system, messages, maxTokens);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    const code = err.status === 401 || err.status === 403 ? "auth" : err.status === 429 ? "rate_limit" : "provider";
    if (code === "auth" && cfg.connectionId) db.connections.update(cfg.connectionId, { status: "invalid", lastError: err.message });
    yield { type: "error", message: err.message || "Provider request failed", code };
  }
}

async function* streamAnthropic(cfg: ResolvedProvider, system: string, messages: ChatMessage[], maxTokens: number): AsyncGenerator<StreamChunk> {
  const client = cfg.authType === "oauth" ? new Anthropic({ authToken: cfg.apiKey }) : new Anthropic({ apiKey: cfg.apiKey });
  const modern = MODERN_CLAUDE.test(cfg.model);
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

async function* streamOpenAICompatible(cfg: ResolvedProvider, system: string, messages: ChatMessage[], maxTokens: number): AsyncGenerator<StreamChunk> {
  const base = cfg.provider === "mistral" ? "https://api.mistral.ai/v1" : process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const body: Record<string, unknown> = {
    model: cfg.model,
    stream: true,
    max_tokens: maxTokens,
    messages: [{ role: "system", content: system }, ...messages],
  };
  if (cfg.provider === "openai") body.stream_options = { include_usage: true };
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
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
