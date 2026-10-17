import type { NextRequest } from "next/server";
export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === (request.headers.get("host") || request.nextUrl.host); }
  catch { return false; }
}
export async function supportBody(request: NextRequest) {
  // Bound the stream before JSON parsing, including requests without Content-Length.
  const reader = request.body?.getReader(); if (!reader) return null;
  const parts: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 20000) { await reader.cancel(); return null; } parts.push(value); }
    const body: unknown = JSON.parse(Buffer.concat(parts).toString("utf8"));
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch { return null; }
}
