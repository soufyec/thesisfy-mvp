import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { canAccessThesis } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";
import { maybeAlertBudget } from "@/lib/ai/funding";
import { passageFingerprints } from "@/lib/crypto";
import { buildSystemPrompt } from "@/lib/ai/prompts";
import { checkPolicy, detectLang } from "@/lib/ai/policy";
import { costOf, resolveProvider, streamCompletion } from "@/lib/ai/providers";
import { quoteAppearsIn } from "@/lib/scholar";
import { splitSentences } from "@/lib/sources/chunk";
import { groundingBlock, parseJsonLoose, passageLabel, rerankAndSummarize, retrieve, RetrievedPassage } from "@/lib/sources/retrieve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  thesisId?: string;
  question?: string;
  sourceIds?: string[];
  sessionId?: string;
  provider?: string | null;
}

interface SourceCitation {
  ref: string;
  sourceId: string;
  chunkId: string;
  page?: number;
  section?: string;
  quote: string;
  label: string;
  title: string;
  authors?: string;
  year?: string;
}

const ANSWER_FORMAT = `Reply with JSON only, no prose around it:
{"answer": "markdown text with [S1]-style citations after the claims they support", "citations": [{"ref": "S1", "quote": "a verbatim sentence or phrase copied exactly from passage S1"}]}
Every citation's quote must be copied character for character from the passage it names; never paraphrase inside "quote". Cite at most the passages you actually used. Keep the answer under 250 words. This answer stays in the student's notes panel: it is not thesis text, so do not write it as a paragraph for the thesis.`;

/**
 * POST { thesisId, question, sourceIds?, sessionId?, provider? }
 * → { answer, citations, meta }: an answer grounded only in the library's top passages, with string-verified quotes.
 */
export async function POST(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const user = r.user;
  const body = (await request.json().catch(() => null)) as Body | null;
  const question = body?.question?.trim().slice(0, 4000) || "";
  if (!body?.thesisId || !question) return error("thesisId and question are required");
  const thesis = canAccessThesis(user, body.thesisId);
  if (!thesis) return error("Thesis not found", 404);

  const policy = db.policies.get(user.university);
  const consent = db.consents.latest(user.id);
  if (user.role === "student" && policy.requireConsent && !consent?.scopes.aiInteractions) {
    return json({ error: "Please review and accept the monitoring consent before using the assistant.", code: "consent_required" }, 428);
  }
  const lang = user.preferences.language !== "en" ? user.preferences.language : detectLang(question);
  const cfg = resolveProvider(user, policy, typeof body.provider === "string" ? body.provider : null);
  const meta: Record<string, unknown> = { provider: cfg.provider, model: cfg.model, source: cfg.source, label: cfg.label, billedTo: cfg.billedTo, institutionModelId: cfg.institutionModel?.id, notice: cfg.notice, demo: cfg.provider === "demo", lang, mode: "chat" };

  const log = (answer: string, usage: { inputTokens: number; outputTokens: number }, blocked: boolean, citedSourceIds: string[]) => {
    const interaction = db.interactions.create({
      userId: user.id,
      thesisId: thesis.id,
      sessionId: body.sessionId,
      provider: cfg.provider,
      model: cfg.model,
      mode: "chat",
      source: "thesisfic",
      connectionId: cfg.connectionId,
      promptPreview: `[sources] ${question}`.slice(0, 200),
      responsePreview: answer.slice(0, 200),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      insertedWords: 0,
      blockedByPolicy: blocked,
      billedTo: cfg.billedTo,
      costUsd: costOf(cfg, usage),
      institutionModelId: cfg.institutionModel?.id,
      responseFingerprints: blocked ? [] : passageFingerprints(answer),
    });
    if (body.sessionId) db.sessions.addEvent(body.sessionId, "ai_prompt", { mode: "chat", grounded: true, provider: cfg.provider, model: cfg.model, blocked, promptPreview: question.slice(0, 120), interactionId: interaction.id });
    if (cfg.connectionId) db.connections.update(cfg.connectionId, { lastUsedAt: new Date().toISOString() });
    if (cfg.billedTo === "institution") maybeAlertBudget(user.university);
    const now = new Date().toISOString();
    for (const id of Array.from(new Set(citedSourceIds))) db.sources.update(id, { lastUsedAt: now });
    return interaction.id;
  };

  // Policy guardrails first: a grounded question is still a question to the assistant.
  const check = checkPolicy(policy, "chat", question, lang);
  if (!check.allowed) {
    const interactionId = log(check.message!, { inputTokens: 0, outputTokens: 0 }, true, []);
    return json({ answer: check.message, citations: [], meta: { ...meta, blocked: true, reason: check.reason, interactionId } });
  }

  const sourceIds = Array.isArray(body.sourceIds) ? body.sourceIds.filter((s) => typeof s === "string") : undefined;
  const candidates = retrieve(thesis.id, question, 12, sourceIds);
  if (!candidates.length) {
    const indexed = db.sourceChunks.listByThesis(thesis.id).length;
    // `meta.code` lets the panel render these fixed messages in the UI language; `answer` stays in English for other clients.
    const answer = indexed ? "No passage in your library matches this question. Try other terms, or add the source you have in mind." : "Your library has no indexed text yet. Add a DOI, a URL, a PDF or pasted text, then ask again.";
    return json({ answer, citations: [], meta: { ...meta, passages: 0, reranked: false, empty: true, code: indexed ? "no_match" : "no_index" } });
  }

  // Demo mode: extractive answer from the top three passages; quotes are their opening sentences, verified by construction.
  if (cfg.provider === "demo") {
    const top = candidates.slice(0, 3).map((p, i) => ({ ...p, ref: `S${i + 1}` }));
    const citations: SourceCitation[] = top.map((p) => toCitation(p, splitSentences(p.text)[0] || p.text.slice(0, 200)));
    const answer = `The passages below are the closest matches in your library for this question (demo mode: no model call, so this is an extract, not a synthesis).\n\n${top.map((p, i) => `- ${citations[i].quote} [${p.ref}]`).join("\n")}\n\n_Connect a model in AI connections, or ask your university to provide one, for a grounded answer._`;
    const interactionId = log(answer, { inputTokens: 0, outputTokens: 0 }, false, citations.map((c) => c.sourceId));
    // `code: "demo_extract"`: the panel rebuilds this fixed wording from its own strings (the quotes come from `citations`).
    return json({ answer, citations, meta: { ...meta, passages: top.length, reranked: false, interactionId, code: "demo_extract", usage: { inputTokens: 0, outputTokens: 0 } } });
  }

  // Rerank + contextual summary, then answer from the top five only.
  const rcs = await rerankAndSummarize(cfg, question, candidates, 5);
  const passages = rcs.passages;
  const system = `${groundingBlock(passages)}\n\n${buildSystemPrompt({ mode: "chat", policy, thesis, studentName: user.name, provider: cfg.label })}\n\n${ANSWER_FORMAT}`;
  let raw = "";
  let usage = { inputTokens: rcs.usage.inputTokens, outputTokens: rcs.usage.outputTokens };
  let err: string | undefined;
  for await (const chunk of streamCompletion(cfg, system, [{ role: "user", content: question }], 1500)) {
    if (chunk.type === "delta") raw += chunk.text;
    else if (chunk.type === "usage") usage = { inputTokens: usage.inputTokens + chunk.inputTokens, outputTokens: usage.outputTokens + chunk.outputTokens };
    else if (chunk.type === "error") err = chunk.message;
  }
  if (err && !raw) return json({ error: err, meta }, 502);

  const { answer, citations, structured } = verify(raw, passages);
  const interactionId = log(answer, usage, false, citations.map((c) => c.sourceId));
  return json({ answer, citations, meta: { ...meta, passages: passages.length, reranked: rcs.reranked, structured, interactionId, usage } });
}

function toCitation(p: RetrievedPassage, quote: string): SourceCitation {
  return { ref: p.ref, sourceId: p.sourceId, chunkId: p.chunkId, page: p.page, section: p.section, quote, label: passageLabel(p), title: p.title, authors: p.authors, year: p.year };
}

/**
 * Parses the model's JSON, keeps only citations whose quote is a verbatim substring of the named passage, and marks
 * references to dropped or unknown passages in the answer text with "(passage not verified)".
 */
function verify(raw: string, passages: RetrievedPassage[]): { answer: string; citations: SourceCitation[]; structured: boolean } {
  const byRef = new Map(passages.map((p) => [p.ref, p]));
  const parsed = parseJsonLoose(raw) as { answer?: unknown; citations?: unknown } | null;
  const structured = !!parsed && typeof parsed.answer === "string";
  let answer = structured ? (parsed!.answer as string).trim() : raw.replace(/```(?:json)?/gi, "").trim();
  const rawCitations = structured && Array.isArray(parsed!.citations) ? (parsed!.citations as { ref?: unknown; quote?: unknown }[]) : [];

  const citations: SourceCitation[] = [];
  const seen = new Set<string>();
  for (const c of rawCitations) {
    const ref = typeof c.ref === "string" ? c.ref.toUpperCase().replace(/[\[\]\s]/g, "") : "";
    const quote = typeof c.quote === "string" ? c.quote.trim() : "";
    const p = byRef.get(ref);
    if (!p || !quote || seen.has(ref + quote)) continue;
    if (!quoteAppearsIn(quote, p.text)) continue; // the only hallucination control that matters: string match
    seen.add(ref + quote);
    citations.push(toCitation(p, quote));
  }
  // Unstructured reply: the model still cited [Sn] in prose; anchor those with the passage's opening sentence.
  if (!structured) {
    for (const ref of Array.from(new Set(Array.from(answer.matchAll(/\[(S\d+)\]/g), (m) => m[1])))) {
      const p = byRef.get(ref);
      if (p) citations.push(toCitation(p, splitSentences(p.text)[0] || p.text.slice(0, 200)));
    }
  }
  const verifiedRefs = new Set(citations.map((c) => c.ref));
  answer = answer.replace(/\[(S\d+)\](?!\s*\(passage not verified\))/g, (m, ref: string) => (verifiedRefs.has(ref) ? m : `${m} (passage not verified)`));
  return { answer, citations, structured };
}
