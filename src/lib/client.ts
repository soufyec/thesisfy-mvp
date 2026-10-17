"use client";

// Browser-side helpers shared by pages and components.

import type { Artifact } from "@/lib/db";

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

/** A block the copilot asked for that Thesisfic could not compute (`event: artifact_error`). */
export interface ArtifactErrorEvent {
  /** `data.error.<code>` in the UI: the engine's codes (SPEC_ERROR_CODES), no_sheet, diagram_invalid, prisma_numbers, latex_invalid, equation_numbers. */
  code: string;
  column?: string;
  /** Columns (or sheets) that would fit, for "Columns you can use: …". */
  available?: string[];
  /** File the block was computed against, when known. */
  file?: string;
  /** Diagram and equation blocks (Research copilot): which kind failed. */
  kind?: "diagram" | "equation";
  /** `diagram_invalid`: the validation code (`data.diagram.error.<detail>`). */
  detail?: string;
  /** `diagram_invalid`: the field at fault, when known. */
  field?: string;
  /** `prisma_numbers` / `equation_numbers`: the numbers that are not in the student's messages (nor computed). */
  missing?: string[];
  /** `latex_invalid`: the command at fault. */
  command?: string;
  /** `latex_invalid`: the parser's error code. */
  reason?: string;
}

export interface StreamHandlers {
  onMeta?: (meta: Record<string, unknown>) => void;
  onDelta?: (text: string) => void;
  onDone?: (data: { interactionId?: string; usage?: { inputTokens: number; outputTokens: number }; blocked?: boolean }) => void;
  onError?: (err: { message: string; code?: string }) => void;
  /** A table or chart Thesisfic computed for the answer (always with `interactionId`); arrives after the text, before `done`. */
  onResearchFile?: (file: import("./ai/files").ResearchFile) => void;
  onResearchFileError?: (message: string) => void;
  onArtifact?: (artifact: Artifact) => void;
  /** A requested artifact that could not be computed; arrives after the text, before `done`. */
  onArtifactError?: (err: ArtifactErrorEvent) => void;
}

/** Library sources attached to a copilot message (docs/papers.md §3.5); the server keeps only the paper owner's sources linked to the paper. */
export const MAX_CHAT_ATTACHMENTS = 20;

/** Consumes the SSE stream produced by /api/ai/chat. `body.sourceIds` (attached sources) is passed through, de-duplicated. */
export async function streamChat(body: Record<string, unknown> & { sourceIds?: string[] }, handlers: StreamHandlers, signal?: AbortSignal) {
  const payload: Record<string, unknown> = { ...body, stream: true };
  if (Array.isArray(body.sourceIds)) {
    const ids = Array.from(new Set(body.sourceIds.filter((x): x is string => typeof x === "string" && !!x))).slice(0, MAX_CHAT_ATTACHMENTS);
    if (ids.length) payload.sourceIds = ids;
    else delete payload.sourceIds;
  }
  const res = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal, credentials: "same-origin" });
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
    else if (ev === "artifact") {
      const a = (data as { artifact?: Artifact }).artifact;
      if (a && typeof a === "object" && typeof a.id === "string" && typeof a.interactionId === "string" && a.interactionId) handlers.onArtifact?.(a);
    } else if (ev === "research_file") {
      const file = data.file as import("./ai/files").ResearchFile;
      if (file && typeof file.id === "string" && typeof file.content === "string" && file.interactionId) handlers.onResearchFile?.(file);
    } else if (ev === "research_file_error") {
      handlers.onResearchFileError?.(String(data.message || ""));
    } else if (ev === "artifact_error") {
      if (typeof data.code === "string") handlers.onArtifactError?.(data as unknown as ArtifactErrorEvent);
    }
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

// ---------- Passages: mirror of src/lib/crypto.ts (same code, same output), so pasted fragments match answers ----------

/** Rows of a Markdown table in AI text are short: they are kept from this many words (docs/papers.md §3.5). */
export const TABLE_ROW_MIN_WORDS = 3;

/** A Markdown table delimiter row: `|---|:---:|`, `--- | ---`. It needs a pipe, so a `---` rule is not one. */
function isTableSeparator(line: string): boolean {
  return line.indexOf("|") !== -1 && /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/.test(line);
}

/**
 * The Markdown tables of a text, by line index: "sep" for delimiter rows, a table number for header and body rows.
 * A table is a header line with a pipe, a delimiter row, then the following non-empty lines with a pipe.
 */
function markdownTableLines(lines: string[]): Map<number, number | "sep"> {
  const map = new Map<number, number | "sep">();
  let table = 0;
  for (let i = 1; i < lines.length; i++) {
    if (map.has(i) || !isTableSeparator(lines[i]) || map.has(i - 1) || lines[i - 1].indexOf("|") === -1 || !lines[i - 1].trim()) continue;
    map.set(i - 1, table);
    map.set(i, "sep");
    let j = i + 1;
    for (; j < lines.length && lines[j].trim() && lines[j].indexOf("|") !== -1; j++) map.set(j, isTableSeparator(lines[j]) ? "sep" : table);
    table++;
    i = j - 1;
  }
  return map;
}

/**
 * Split text into the units a student is likely to copy: the whole text, paragraphs and sentences of at least
 * `minWords` words. Markdown tables in AI text are read as tables: delimiter rows are dropped, each row is its cells
 * joined with spaces (kept from 3 words, or `minWords` if lower), and the whole table is one more unit. Text without
 * a Markdown table gives exactly the units it gave before tables were handled.
 */
export function passages(text: string, minWords = 8, max = 80): string[] {
  const out = new Set<string>();
  // Strip Markdown so a sentence copied from the rendered answer matches the raw one: emphasis, headings, quotes,
  // list markers, links and inline code.
  const clean = (t: string) =>
    t
      .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_`#>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const words = (t: string) => (t ? t.split(" ").length : 0);
  const lines = text.split("\n");
  const tables = markdownTableLines(lines);
  const rowMin = Math.min(minWords, TABLE_ROW_MIN_WORDS);
  const whole = clean(tables.size ? lines.filter((_, i) => tables.get(i) !== "sep").join("\n") : text);
  if (words(whole) >= minWords) out.add(whole);
  let rows: string[] = [];
  const closeTable = () => {
    const all = clean(rows.join(" "));
    if (rows.length && words(all) >= rowMin) out.add(all);
    rows = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const para = lines[i];
    const t = tables.get(i);
    if (rows.length && t === undefined) closeTable();
    // Empty lines add nothing (the split on /\n+/ this replaces never produced them between paragraphs).
    if (!para) continue;
    if (t === "sep") continue;
    const cp = clean(para);
    if (t !== undefined) {
      if (words(cp) >= rowMin) out.add(cp);
      rows.push(cp);
    }
    if (words(cp) >= minWords) out.add(cp);
    for (const sentence of cp.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÀÈÙÂÊÎÔÛÇ0-9"'(])/)) {
      const cs = sentence.trim();
      if (words(cs) >= minWords) out.add(cs);
    }
    if (out.size >= max) break;
  }
  if (rows.length && out.size < max) closeTable();
  return Array.from(out).slice(0, max);
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
