import { NextRequest, NextResponse } from "next/server";
import { AIMode, db } from "@/lib/db";
import { canAccessThesis } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";
import { checkPolicy, detectLang } from "@/lib/ai/policy";
import { costOf, resolveProvider } from "@/lib/ai/providers";
import { maybeAlertBudget } from "@/lib/ai/funding";
import { evidenceForClaim, summarizeStances } from "@/lib/ai/evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  thesisId?: string;
  claim?: string;
  /** CommentMark id on the sentence the claim comes from, so the check stays next to it. */
  anchorId?: string;
  sessionId?: string;
  provider?: string | null;
}

const MAX_HISTORY = 20;

/**
 * POST: run an evidence check for a claim and store it on the thesis.
 * Runs under the "gaps" mode (falls back to "critique" when the policy does not allow it); the model only labels
 * passages retrieved from OpenAlex / Semantic Scholar. Never inserts a citation.
 */
export async function POST(request: NextRequest) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const user = r.user;
  const body = ((await request.json().catch(() => null)) || {}) as Body;

  const claim = String(body.claim || "").replace(/\s+/g, " ").trim().slice(0, 1000);
  if (!claim || claim.split(" ").length < 3) return error("Select or type the claim to check (at least a few words).");
  if (!body.thesisId) return error("thesisId is required");
  const thesis = canAccessThesis(user, body.thesisId);
  if (!thesis) return error("Thesis not found", 404);

  const policy = db.policies.get(user.university);
  const consent = db.consents.latest(user.id);
  if (user.role === "student" && policy.requireConsent && !consent?.scopes.aiInteractions) {
    return NextResponse.json({ error: "Please review and accept the monitoring consent before using the assistant.", code: "consent_required" }, { status: 428 });
  }

  const mode: AIMode | null = policy.allowedModes.includes("gaps") ? "gaps" : policy.allowedModes.includes("critique") ? "critique" : null;
  if (!mode) return error("Your institution has not enabled Find gaps or Critique, which the evidence check runs under.", 403);

  const lang = user.preferences.language !== "en" ? user.preferences.language : detectLang(claim);
  const cfg = resolveProvider(user, policy, typeof body.provider === "string" ? body.provider : null);
  const anchorId = typeof body.anchorId === "string" && body.anchorId ? body.anchorId.slice(0, 80) : undefined;

  const log = (responsePreview: string, usage: { inputTokens: number; outputTokens: number }, aiUsed: boolean, blocked: boolean, model: string) =>
    db.interactions.create({
      userId: user.id,
      thesisId: thesis.id,
      sessionId: body.sessionId,
      provider: aiUsed ? cfg.provider : "demo",
      model,
      mode,
      source: "thesisfic",
      connectionId: aiUsed ? cfg.connectionId : undefined,
      promptPreview: `Evidence check: ${claim}`.slice(0, 200),
      responsePreview: responsePreview.slice(0, 200),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      insertedWords: 0,
      blockedByPolicy: blocked,
      billedTo: aiUsed ? cfg.billedTo : "none",
      costUsd: aiUsed ? costOf(cfg, usage) : 0,
      institutionModelId: aiUsed ? cfg.institutionModel?.id : undefined,
      responseFingerprints: [],
    });

  const check = checkPolicy(policy, mode, claim, lang);
  if (!check.allowed) {
    log(check.message || "blocked", { inputTokens: 0, outputTokens: 0 }, false, true, cfg.model);
    return NextResponse.json({ error: check.message, code: check.reason }, { status: 403 });
  }

  let outcome;
  try {
    outcome = await evidenceForClaim(claim, { cfg });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "The evidence check could not be completed." }, { status: 502 });
  }

  const costUsd = outcome.aiUsed ? costOf(cfg, outcome.usage) : 0;
  const stored = db.evidenceChecks.create({
    thesisId: thesis.id,
    userId: user.id,
    claimQuote: claim,
    anchorId,
    results: outcome.results,
    model: outcome.model,
    costUsd,
  });

  const interaction = log(summarizeStances(outcome.results), outcome.usage, outcome.aiUsed, false, outcome.model);
  if (body.sessionId) db.sessions.addEvent(body.sessionId, "ai_prompt", { mode, provider: outcome.aiUsed ? cfg.provider : "demo", model: outcome.model, blocked: false, promptPreview: `Evidence check: ${claim}`.slice(0, 120), interactionId: interaction.id });
  if (outcome.aiUsed && cfg.connectionId) db.connections.update(cfg.connectionId, { lastUsedAt: new Date().toISOString() });
  if (outcome.aiUsed && cfg.billedTo === "institution") maybeAlertBudget(user.university);

  return json({
    check: stored,
    aiUsed: outcome.aiUsed,
    aiAvailable: outcome.aiAvailable,
    attribution: outcome.attribution,
    mode,
    candidates: outcome.candidates,
    warnings: outcome.warnings,
    billedTo: outcome.aiUsed ? cfg.billedTo : "none",
    interactionId: interaction.id,
  });
}

/** GET ?thesisId= → the last checks on a thesis. Advisors and administration of the same university see the same list. */
export async function GET(request: NextRequest) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const thesisId = request.nextUrl.searchParams.get("thesisId") || "";
  if (!thesisId) return error("thesisId is required");
  const thesis = canAccessThesis(r.user, thesisId);
  if (!thesis) return error("Thesis not found", 404);
  return json({ checks: db.evidenceChecks.list(thesis.id).slice(0, MAX_HISTORY) });
}
