import { NextRequest, NextResponse } from "next/server";
import { notifyUser } from "@/lib/notify";
import { db, Comment } from "@/lib/db";
import { maybeAlertBudget } from "@/lib/ai/funding";
import { canAccessThesis } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";
import { checkPolicy } from "@/lib/ai/policy";
import { costOf, resolveProvider, streamCompletion } from "@/lib/ai/providers";
import { locateQuote } from "@/lib/ai/anchor";
import { AnchoredReviewComment, buildReviewerPrompt, buildReviewerUserMessage, demoReview, effectiveRubric, isReviewCategory, MAX_COMMENTS_PER_SECTION, parseReviewerOutput, ReviewCategory, ReviewerComment, ReviewScope, rubricVersion, SEVERITY_ORDER } from "@/lib/ai/reviewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hard limit on the text reviewed in one request; longer scopes are chunked by paragraph. */
const MAX_TEXT_CHARS = 40000;
const CHUNK_CHARS = 9000;

interface PostBody {
  thesisId: string;
  scope: ReviewScope;
  text: string;
  sectionLabel?: string;
  sessionId?: string;
  provider?: string | null;
  /** Rubric categories to ask for; defaults to every active criterion. */
  categories?: ReviewCategory[];
}

/**
 * POST: run the AI reviewer over a plain-text scope and return anchored, validated comments.
 * Comment rows are not created here; the client applies the CommentMark and posts to
 * /api/theses/[id]/comments so anchors are real document positions.
 */
export async function POST(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const user = r.user;
  const body = (await request.json().catch(() => null)) as PostBody | null;
  if (!body || typeof body.thesisId !== "string" || typeof body.text !== "string") return error("thesisId and text are required");
  const scope: ReviewScope = body.scope === "selection" || body.scope === "document" ? body.scope : "section";
  const text = body.text.replace(/\r\n?/g, "\n");
  if (!text.trim()) return error("There is no text to review in this scope.");
  if (text.length > MAX_TEXT_CHARS) return error(`The scope is too long to review at once (${text.length.toLocaleString()} characters, limit ${MAX_TEXT_CHARS.toLocaleString()}). Review it section by section.`);

  const thesis = canAccessThesis(user, body.thesisId);
  if (!thesis) return error("Thesis not found", 404);
  const policy = db.policies.get(user.university);
  const consent = db.consents.latest(user.id);
  if (user.role === "student" && policy.requireConsent && !consent?.scopes.aiInteractions) {
    return NextResponse.json({ error: "Please review and accept the monitoring consent before using the reviewer.", code: "consent_required" }, { status: 428 });
  }

  const rubric = effectiveRubric(policy);
  const categories = Array.isArray(body.categories) ? body.categories.filter(isReviewCategory) : undefined;
  const activeRubric = rubric.filter((c) => c.weight > 0 && (!categories || categories.includes(c.id)));
  if (!activeRubric.length) return error("No rubric criteria are selected.");

  const cfg = resolveProvider(user, policy, typeof body.provider === "string" ? body.provider : null);
  const sectionLabel = typeof body.sectionLabel === "string" ? body.sectionLabel.slice(0, 120) : undefined;
  const promptPreview = `Review: ${scope}${sectionLabel ? ` · ${sectionLabel}` : ""}`;
  const meta = { provider: cfg.provider, model: cfg.model, source: cfg.source, label: cfg.label, billedTo: cfg.billedTo, institutionModelId: cfg.institutionModel?.id, notice: cfg.notice, demo: cfg.provider === "demo" };

  const log = (responsePreview: string, usage: { inputTokens: number; outputTokens: number }, blocked: boolean) => {
    const interaction = db.interactions.create({
      userId: user.id,
      thesisId: thesis.id,
      sessionId: body.sessionId,
      provider: cfg.provider,
      model: cfg.model,
      mode: "critique",
      source: "thesisfic",
      connectionId: cfg.connectionId,
      promptPreview,
      responsePreview: responsePreview.slice(0, 200),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      insertedWords: 0,
      blockedByPolicy: blocked,
      billedTo: cfg.billedTo,
      costUsd: costOf(cfg, usage),
      institutionModelId: cfg.institutionModel?.id,
      responseFingerprints: [],
    });
    if (body.sessionId) db.sessions.addEvent(body.sessionId, "ai_prompt", { mode: "critique", provider: cfg.provider, model: cfg.model, blocked, promptPreview, interactionId: interaction.id, reviewer: true });
    if (cfg.connectionId) db.connections.update(cfg.connectionId, { lastUsedAt: new Date().toISOString() });
    if (cfg.billedTo === "institution") maybeAlertBudget(user.university);
    return interaction;
  };

  // The reviewer is the Critique mode under a structured output; the same policy gate applies.
  const check = checkPolicy(policy, "critique", promptPreview, user.preferences.language);
  if (!check.allowed) {
    log(check.message || "blocked", { inputTokens: 0, outputTokens: 0 }, true);
    return NextResponse.json({ error: check.message, code: check.reason, meta }, { status: 403 });
  }

  // Allowance used up and the institution blocks: resolveProvider returns the demo with a notice.
  if (cfg.provider === "demo" && cfg.source === "demo" && cfg.label === "Allowance used up") {
    return NextResponse.json({ error: cfg.notice, code: "allowance_exhausted", meta }, { status: 402 });
  }

  const system = buildReviewerPrompt({ rubric: activeRubric, scope, sectionLabel, thesis });
  const chunks = chunkByParagraph(text, CHUNK_CHARS);
  const anchored: AnchoredReviewComment[] = [];
  const rejected: { reason: string; quote?: string }[] = [];
  let usage = { inputTokens: 0, outputTokens: 0 };

  for (const chunk of chunks) {
    let comments: ReviewerComment[];
    if (cfg.provider === "demo") {
      comments = demoReview(chunk.text, activeRubric, { categories, lang: user.preferences.language });
    } else {
      let raw = "";
      let err: string | undefined;
      for await (const piece of streamCompletion(cfg, system, [{ role: "user", content: buildReviewerUserMessage(chunk.text, scope, sectionLabel) }], 3000)) {
        if (piece.type === "delta") raw += piece.text;
        else if (piece.type === "usage") usage = { inputTokens: usage.inputTokens + piece.inputTokens, outputTokens: usage.outputTokens + piece.outputTokens };
        else if (piece.type === "error") err = piece.message;
      }
      if (err && !raw) return NextResponse.json({ error: err, meta }, { status: 502 });
      const parsed = parseReviewerOutput(raw, chunk.text, { rubric: activeRubric, categories, max: MAX_COMMENTS_PER_SECTION });
      if (parsed.error && chunks.length === 1) {
        log(parsed.error, usage, false);
        return NextResponse.json({ error: parsed.error, meta }, { status: 502 });
      }
      rejected.push(...parsed.rejected);
      comments = parsed.comments;
    }
    for (const c of comments) {
      const a = locateQuote(chunk.text, c.quote, c.context);
      if (!a) {
        rejected.push({ reason: "could not be anchored", quote: c.quote });
        continue;
      }
      const start = chunk.offset + a.start;
      const end = chunk.offset + a.end;
      if (anchored.some((x) => x.category === c.category && x.start < end && start < x.end)) {
        rejected.push({ reason: "overlaps another comment of the same category", quote: c.quote });
        continue;
      }
      anchored.push({ quote: text.slice(start, end), category: c.category, severity: c.severity, rationale: c.rationale, question: c.question, start, end, confidence: a.confidence });
    }
  }

  anchored.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.start - b.start);
  const costUsd = costOf(cfg, usage);
  const run = db.reviewRuns.create({ thesisId: thesis.id, userId: user.id, scope, scopeLabel: sectionLabel, rubricVersion: rubricVersion(rubric), model: cfg.model, provider: cfg.provider, costUsd, commentCount: anchored.length });
  const interaction = log(`${anchored.length} anchored comment${anchored.length === 1 ? "" : "s"} (${scope})`, usage, false);

  return json({ run, comments: anchored, meta: { ...meta, interactionId: interaction.id }, usage, rejected: rejected.length, rubricVersion: run.rubricVersion });
}

/** GET ?thesisId= → previous runs and the rubric in force. */
export async function GET(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const thesisId = request.nextUrl.searchParams.get("thesisId");
  if (!thesisId) return error("thesisId is required");
  const thesis = canAccessThesis(r.user, thesisId);
  if (!thesis) return error("Thesis not found", 404);
  const policy = db.policies.get(r.user.university);
  return json({ runs: db.reviewRuns.list(thesis.id), rubric: effectiveRubric(policy) });
}

interface PatchBody {
  thesisId: string;
  /** Share a run's comments with the advisor: notifies the thesis's professor. */
  runId?: string;
  share?: boolean;
  /** Update reviewer-only fields of an AI comment (the generic comments route does not know them). */
  commentId?: string;
  reviewRunId?: string;
  question?: string;
  anchorStatus?: Comment["anchorStatus"];
  dismissedReason?: string;
}

/**
 * PATCH: two additive operations on reviewer data.
 * { thesisId, runId, share: true } → notification to the advisor.
 * { thesisId, commentId, reviewRunId?, question?, anchorStatus?, dismissedReason? } → patch an AI comment;
 * a dismissedReason also resolves the comment.
 */
export async function PATCH(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const body = (await request.json().catch(() => null)) as PatchBody | null;
  if (!body || typeof body.thesisId !== "string") return error("thesisId is required");
  const thesis = canAccessThesis(r.user, body.thesisId);
  if (!thesis) return error("Thesis not found", 404);

  if (body.runId && body.share) {
    const run = db.reviewRuns.list(thesis.id).find((x) => x.id === body.runId);
    if (!run) return error("Review run not found", 404);
    if (run.userId !== r.user.id) return error("Only the person who requested the review can share it", 403);
    if (!thesis.professorId) return error("This thesis has no advisor assigned yet.", 409);
    const open = db.comments.list(thesis.id).filter((c) => c.source === "ai" && c.reviewRunId === run.id && !c.resolved).length;
    notifyUser(thesis.professorId, "notif.reviewShared", { name: r.user.name, scope: run.scope === "document" ? "the submission" : run.scopeLabel ? `"${run.scopeLabel}"` : run.scope, n: run.commentCount }, { type: "comment", link: `/admin/theses/${thesis.id}` });
    return json({ shared: true, runId: run.id, sharedAt: new Date().toISOString() });
  }

  if (body.commentId) {
    const c = db.comments.findById(body.commentId);
    if (!c || c.thesisId !== thesis.id) return error("Comment not found", 404);
    if (c.source !== "ai") return error("Only AI reviewer comments can be patched here", 400);
    const patch: Partial<Comment> = {};
    if (typeof body.reviewRunId === "string" && db.reviewRuns.list(thesis.id).some((x) => x.id === body.reviewRunId)) patch.reviewRunId = body.reviewRunId;
    if (typeof body.question === "string") patch.question = body.question.trim().slice(0, 400) || undefined;
    if (body.anchorStatus === "live" || body.anchorStatus === "stale" || body.anchorStatus === "orphaned") patch.anchorStatus = body.anchorStatus;
    if (typeof body.dismissedReason === "string") {
      patch.dismissedReason = body.dismissedReason.trim().slice(0, 200) || "No reason given";
      patch.resolved = true;
    }
    if (!Object.keys(patch).length) return error("Nothing to update");
    return json({ comment: db.comments.update(c.id, patch) });
  }

  return error("Provide runId with share, or commentId with fields to update");
}

/** Splits text into paragraph-aligned chunks of about `size` characters, keeping absolute offsets. */
function chunkByParagraph(text: string, size: number): { text: string; offset: number }[] {
  if (text.length <= size) return [{ text, offset: 0 }];
  const out: { text: string; offset: number }[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + size);
    if (end < text.length) {
      const nl = text.lastIndexOf("\n", end);
      if (nl > start + size / 3) end = nl + 1;
      else {
        const sp = text.lastIndexOf(" ", end);
        if (sp > start + size / 3) end = sp + 1;
      }
    }
    out.push({ text: text.slice(start, end), offset: start });
    start = end;
  }
  return out;
}
