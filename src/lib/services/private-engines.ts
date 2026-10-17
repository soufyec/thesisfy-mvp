import { createHmac } from "crypto";
export function engineHeaders(): Record<string, string> {
  const key = process.env.JWT_SECRET;
  return key ? { "x-thesisfic-engine": createHmac("sha256", key).update("thesisfic-private-engines-v1").digest("hex") } : {};
}
export function privacyEndpoint() { return process.env.PRIVACY_INTERNAL_URL || process.env.PRESIDIO_ANALYZER_URL; }
export async function embedPrivate(texts: string[]): Promise<number[][]> {
  const endpoint = privacyEndpoint();
  if (!endpoint) throw new Error("privacy_unavailable");
  if (!texts.length || texts.length > 16 || texts.some(t => !t.trim() || t.length > 4000)) throw new Error("invalid_input");
  const response = await fetch(new URL("/embed", endpoint), {
    method: "POST", headers: { "Content-Type": "application/json", ...engineHeaders() },
    body: JSON.stringify({ texts }), signal: AbortSignal.timeout(60000), cache: "no-store", redirect: "error",
  });
  if (!response.ok) throw new Error("embedding_unavailable");
  const data = await response.json();
  if (!Array.isArray(data.vectors) || data.vectors.length !== texts.length || data.vectors.some((v: unknown) => !Array.isArray(v) || v.length !== 384 || v.some(n => typeof n !== "number" || !Number.isFinite(n)))) throw new Error("embedding_invalid");
  return data.vectors;
}
