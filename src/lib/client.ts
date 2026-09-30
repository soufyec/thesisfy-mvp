"use client";

// Browser-side helpers shared by pages and components.

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  let body = init?.body;
  if (init?.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  const res = await fetch(url, { ...init, headers, body, credentials: "same-origin" });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    const d = data as { error?: string; code?: string } | null;
    throw new ApiError(d?.error || `Request failed (${res.status})`, res.status, d?.code);
  }
  return data as T;
}

export interface StreamHandlers {
  onMeta?: (meta: Record<string, unknown>) => void;
  onDelta?: (text: string) => void;
  onDone?: (data: { interactionId?: string; usage?: { inputTokens: number; outputTokens: number }; blocked?: boolean }) => void;
  onError?: (err: { message: string; code?: string }) => void;
}

/** Consumes the SSE stream produced by /api/ai/chat. */
export async function streamChat(body: Record<string, unknown>, handlers: StreamHandlers, signal?: AbortSignal) {
  const res = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, stream: true }), signal, credentials: "same-origin" });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    let parsed: { error?: string; code?: string } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      /* ignore */
    }
    throw new ApiError(parsed.error || `Request failed (${res.status})`, res.status, parsed.code);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "message";
  const dispatch = (ev: string, raw: string) => {
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (ev === "meta") handlers.onMeta?.(data);
    else if (ev === "delta") handlers.onDelta?.(String(data.text || ""));
    else if (ev === "done") handlers.onDone?.(data as never);
    else if (ev === "error") handlers.onError?.(data as never);
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).replace(/\r$/, "");
      buffer = buffer.slice(idx + 1);
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) {
        dispatch(event, line.slice(5).trim());
        event = "message";
      }
    }
  }
}

/** Same normalisation as the server: lowercase, collapse whitespace, SHA-256, first 32 hex chars. */
export async function fingerprint(text: string): Promise<string> {
  const norm = text.toLowerCase().replace(/\s+/g, " ").trim();
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export function timeAgo(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const diff = Date.now() - d.getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function countWordsInText(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function isMobileViewport() {
  return typeof window !== "undefined" && window.innerWidth < 768;
}

export const statusLabels: Record<string, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  under_review: "Under Review",
  revision_requested: "Revision Needed",
  approved: "Approved",
  submitted: "Submitted",
};

export const statusColors: Record<string, string> = {
  draft: "badge-info",
  in_progress: "badge-warning",
  under_review: "badge-info",
  revision_requested: "badge-danger",
  approved: "badge-success",
  submitted: "badge-success",
};
