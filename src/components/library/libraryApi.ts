"use client";

import type { LibraryErrorBody } from "@/components/editor/types";

/** A failed library request: `body.code` tells the page which consequence to show (`cited`, `locked`, caps…). */
export class LibraryRequestError extends Error {
  status: number;
  body: LibraryErrorBody;
  constructor(status: number, body: LibraryErrorBody) {
    super(body.error);
    this.status = status;
    this.body = body;
  }
}

/**
 * fetch wrapper for `/api/library/*` that keeps the whole error body (the shared `api()` helper drops `citedIn`).
 * The server translates `error`; when a body has none (an empty or non-JSON answer, or no answer at all because the
 * network failed), `error` is "" and the caller shows its own translated fallback, never the browser's English text.
 */
export async function libraryCall<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  let body = init?.body;
  if (init?.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  let res: Response;
  let text = "";
  try {
    res = await fetch(url, { ...init, headers, body, credentials: "same-origin" });
    text = await res.text();
  } catch {
    throw new LibraryRequestError(0, { error: "" });
  }
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const b = (data && typeof data === "object" ? data : {}) as Partial<LibraryErrorBody>;
    throw new LibraryRequestError(res.status, { error: typeof b.error === "string" ? b.error : "", code: b.code, citedIn: b.citedIn });
  }
  return data as T;
}
