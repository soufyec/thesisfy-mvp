import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessThesis } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";
import { checkPolicy, detectLang } from "@/lib/ai/policy";
import { costOf, resolveProvider } from "@/lib/ai/providers";
import { maybeAlertBudget } from "@/lib/ai/funding";
import { findSupportingSources } from "@/lib/ai/citeVerified";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  thesisId?: string;
  claim?: string;
  sessionId?: string;
  provider?: string | null;
}

/**
 * Finds published sources whose abstract or body passage supports a claim.
 * Candidates come from OpenAlex / Semantic Scholar; the model only picks ids and quotes verbatim; the server verifies each quote.
 * Response: { candidates: [{ work, quote, relevance, why, verified: true }], aiUsed, aiAvailable, attribution, warnings, interactionId }.
 */
export async function POST(request: NextRequest) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const user = r.user;
  const body = ((await request.json().catch(() => null)) || {}) as Body;
  const claim = String(body.claim || "").replace(/\s+/g, " ").trim().slice(0, 1500);
  if (claim.split(" ").length < 3) return error("Select or type a claim of at least three words");

  const policy = db.policies.get(user.university);
  const consent = db.consents.latest(user.id);
  if (user.role === "student" && policy.requireConsent && !consent?.scopes.aiInteractions) {
    return NextResponse.json({ error: "Please review and accept the monitoring consent before using the assistant.", code: "consent_required" }, { status: 428 });
  }
  const thesis = body.thesisId ? canAccessThesis(user, body.thesisId) : null;
  if (body.thesisId && !thesis) return error("Thesis not found", 404);

  const lang = user.preferences.language !== "en" ? user.preferences.language : detectLang(claim);
  const cfg = resolveProvider(user, policy, typeof body.provider === "string" ? body.provider : null);

  const check = checkPolicy(policy, "citations", claim, lang);
  if (!check.allowed) {
    db.interactions.create({
      userId: user.id,
      thesisId: thesis?.id,
      sessionId: body.sessionId,
      provider: cfg.provider,
      model: cfg.model,
      mode: "citations",
      source: "thesisfic",
      promptPreview: claim.slice(0, 200),
      responsePreview: "blocked by policy",
      inputTokens: 0,
      outputTokens: 0,
      insertedWords: 0,
      blockedByPolicy: true,
      billedTo: "none",
      costUsd: 0,
      responseFingerprints: [],
    });
    return NextResponse.json({ error: check.message, reason: check.reason, blocked: true }, { status: 403 });
  }

  const found = await findSupportingSources(claim, { cfg });
  const first = found.results[0]?.work;

  const interaction = db.interactions.create({
    userId: user.id,
    thesisId: thesis?.id,
    sessionId: body.sessionId,
    provider: found.aiUsed ? cfg.provider : "demo",
    model: found.aiUsed ? cfg.model : "lookup:cite-verified",
    mode: "citations",
    source: "thesisfic",
    connectionId: found.aiUsed ? cfg.connectionId : undefined,
    promptPreview: claim.slice(0, 200),
    responsePreview: first ? `${first.authors} (${first.year || "n.d."}). ${first.title}`.slice(0, 200) : "no supporting sources found",
    inputTokens: found.aiUsed ? found.usage.inputTokens : 0,
    outputTokens: found.aiUsed ? found.usage.outputTokens : 0,
    insertedWords: 0,
    blockedByPolicy: false,
    billedTo: found.aiUsed ? cfg.billedTo : "none",
    costUsd: found.aiUsed ? costOf(cfg, found.usage) : 0,
    institutionModelId: found.aiUsed ? cfg.institutionModel?.id : undefined,
    // Quotes are verbatim text from published sources, not assistant prose: nothing here should mark a later paste as AI.
    responseFingerprints: [],
  });
  if (body.sessionId) db.sessions.addEvent(body.sessionId, "ai_prompt", { mode: "citations", provider: found.aiUsed ? cfg.provider : "demo", model: found.aiUsed ? cfg.model : "lookup:cite-verified", blocked: false, promptPreview: claim.slice(0, 120), interactionId: interaction.id });
  if (found.aiUsed && cfg.connectionId) db.connections.update(cfg.connectionId, { lastUsedAt: new Date().toISOString() });
  if (found.aiUsed && cfg.billedTo === "institution") maybeAlertBudget(user.university);

  return json({
    candidates: found.results.map((c) => ({ work: c.work, quote: c.quote, relevance: c.relevance, why: c.why, section: c.section, verified: true as const })),
    candidateCount: found.candidateCount,
    aiUsed: found.aiUsed,
    aiAvailable: cfg.provider !== "demo",
    attribution: found.attribution.length ? found.attribution : ["OpenAlex"],
    warnings: found.warnings,
    interactionId: interaction.id,
    meta: { provider: found.aiUsed ? cfg.provider : "demo", model: found.aiUsed ? cfg.model : undefined, billedTo: found.aiUsed ? cfg.billedTo : "none", label: cfg.label, notice: cfg.notice },
  });
}
