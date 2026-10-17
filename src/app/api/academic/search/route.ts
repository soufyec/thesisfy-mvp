import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { AcademicSearchService } from "@/lib/services/academic-search";
import { createPresidioAnalyzer, PIIScrubberService, PrivacyUnavailableError } from "@/lib/services/pii-scrubber";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

/** Authenticated academic search with private pseudonymization before external queries. */
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  const settings = db.productSettings.get();
  if (!settings.assistantEnabled || !settings.searchEnabled) return reply({ ok: false, code: "forbidden" }, 403);
  let scrubber: PIIScrubberService | undefined;
  try {
    // Bound the body even when Content-Length is absent or misleading.
    const reader = request.body?.getReader();
    if (!reader) return reply({ ok: false, code: "invalid_input" }, 400);
    const decoder = new TextDecoder();
    let raw = "", size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 8192) { await reader.cancel(); return reply({ ok: false, code: "invalid_input" }, 413); }
        raw += decoder.decode(part.value, { stream: true });
      }
      raw += decoder.decode();
    } finally { reader.releaseLock(); }
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_input");
    const b = body as Record<string, unknown>;
    if (typeof b.query !== "string" || !b.query.trim() || b.query.length > 500 ||
        (b.limit !== undefined && (typeof b.limit !== "number" || !Number.isInteger(b.limit) || b.limit < 1 || b.limit > 20)) ||
        (b.language !== undefined && !["fr", "en", "es", "de"].includes(String(b.language)))) throw new Error("invalid_input");
    const url = process.env.PRIVACY_INTERNAL_URL || process.env.PRESIDIO_ANALYZER_URL;
    if (!url) throw new PrivacyUnavailableError();
    scrubber = new PIIScrubberService({
      knownNames: [auth.user.name], knownEmails: [auth.user.email],
      analyzer: createPresidioAnalyzer(url),
    });
    const safe = await scrubber.scrub(b.query, (b.language as "fr" | "en" | "es" | "de") ?? "en");
    // Remove placeholders from public search keywords; they have no scholarly meaning.
    const query = safe.text.replace(/\[TF_[a-f0-9]+_[A-Z_]+_\d+\]/g, " ").replace(/\s+/g, " ").trim();
    if (!query) return reply({ ok: false, code: "invalid_input" }, 400);
    const engine = new AcademicSearchService();
    const data = await engine.search({ query, limit: b.limit as number | undefined });
    if (data.status === "unavailable") return reply({ ok: false, code: "unavailable" }, 503);
    return reply({ ok: true, data: { ...data, suggestions: engine.suggestions(data.papers) } });
  } catch (error) {
    // No raw input, provider URL, analyzer response or token map in errors/logs.
    if (error instanceof PrivacyUnavailableError) return reply({ ok: false, code: "privacy_unavailable" }, 503);
    if (error instanceof SyntaxError || (error instanceof Error && error.message === "invalid_input")) return reply({ ok: false, code: "invalid_input" }, 400);
    return reply({ ok: false, code: "unavailable" }, 503);
  } finally { scrubber?.dispose(); }
}
