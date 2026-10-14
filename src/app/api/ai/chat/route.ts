import { NextRequest, NextResponse } from "next/server";
import { AIMode, db, Provider, uid } from "@/lib/db";
import type { Artifact } from "@/lib/db";
import { maybeAlertBudget } from "@/lib/ai/funding";
import { artifactFingerprint, artifactGridFingerprint, passageFingerprints } from "@/lib/crypto";
import { canAccessThesis } from "@/lib/auth";
import { error, requireUser } from "@/lib/api";
import { buildSystemPrompt, MODES } from "@/lib/ai/prompts";
import { checkPolicy, detectLang } from "@/lib/ai/policy";
import { demoAttachmentsResponse, demoDataResponse, demoGroundedResponse, demoNotice, demoResponse, demoLang } from "@/lib/ai/demo";
import { ChatMessage, costOf, resolveProvider, streamCompletion } from "@/lib/ai/providers";
import { GROUNDING_RULE, passageLabel, retrieve } from "@/lib/sources/retrieve";
import { splitSentences } from "@/lib/sources/chunk";
import { isUnsupportedRequest } from "@/lib/data/analysis";
import { isWritingLanguage } from "@/lib/papers/kinds";
import type { WritingLanguage } from "@/lib/papers/kinds";
import { translator } from "@/lib/i18n/dictionary";
import { ArtifactError, artifactRefs, artifactsFromAnswer, dataCards, demoArtifacts, lastArtifactDigests, previewOf } from "./artifacts";
import { chatAttachments, firstSentence, librarySourceIds, passagesPerFile, primaryPassages } from "./context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  messages: ChatMessage[];
  mode?: AIMode;
  thesisId?: string;
  sessionId?: string;
  provider?: Provider | string | null; // provider id, or an institution model id ("im_…")
  conversationId?: string;
  selection?: string;
  stream?: boolean;
  /** Ground the answer in the thesis's source library (F5): the top passages for the last user message are added to the system prompt. */
  useSources?: boolean;
  /**
   * Sources attached to this message in the Research copilot (docs/papers.md §3.5): only the paper owner's sources
   * linked to this paper are used, the rest is ignored. Spreadsheets send their data card (never rows) and let the
   * model ask Thesisfic for tables and figures; documents send their passages, labelled [P1]…
   */
  sourceIds?: string[];
}

type Usage = { inputTokens: number; outputTokens: number };
const NO_USAGE: Usage = { inputTokens: 0, outputTokens: 0 };

/**
 * POST /api/ai/chat. SSE events: `meta` → `delta`* → (`artifact` { artifact } | `artifact_error` { code, column?,
 * available?, file? })* → `done`, or `error`. With `stream: false`: { message, meta, interactionId, usage,
 * artifacts?, artifactErrors? }. Artifacts are computed only here, after the whole answer is in, and always carry the
 * `interactionId` of the answer they belong to.
 */
export async function POST(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const user = r.user;
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || !Array.isArray(body.messages) || !body.messages.length) return error("messages are required");

  const mode: AIMode = MODES.some((m) => m.id === body.mode) ? (body.mode as AIMode) : "chat";
  const policy = db.policies.get(user.university);
  const consent = db.consents.latest(user.id);
  if (user.role === "student" && policy.requireConsent && !consent?.scopes.aiInteractions) {
    return NextResponse.json({ error: "Please review and accept the monitoring consent before using the assistant.", code: "consent_required" }, { status: 428 });
  }
  const thesis = body.thesisId ? canAccessThesis(user, body.thesisId) : null;
  if (body.thesisId && !thesis) return error("Thesis not found", 404);

  const messages: ChatMessage[] = body.messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-30)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 20000) }));
  // What the student typed: the language, the conversation title and the saved message come from it, not from the
  // selected passage that is prepended as context for the model.
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  if (body.selection && messages.length) {
    const last = messages[messages.length - 1];
    last.content = `Selected passage from my paper:\n"""\n${body.selection.slice(0, 12000)}\n"""\n\n${last.content}`;
  }
  const lang = user.preferences.language !== "en" ? user.preferences.language : detectLang(lastUser);
  // Fixed sentences (refusal hint, demo replies) follow the student's language; artifact titles, headers and number
  // formats follow the paper's writing language (D19), by default the interface language.
  const uiTr = translator(lang);
  const writingLang: WritingLanguage = thesis?.writingLanguage ?? (isWritingLanguage(user.preferences.language) ? user.preferences.language : "en");
  const runOpts = { lang: writingLang, tr: translator(writingLang), newId: () => uid("art") };

  // Attachments: Research copilot with a paper in context only.
  // Only the paper's student attaches its files: staff chats about a paper never send the student's data.
  const attached = chatAttachments(mode === "copilot" && thesis && thesis.studentId === user.id ? thesis : null, body.sourceIds);
  const hasSheets = attached.sheets.length > 0;

  // Conversation persistence
  let conversation = body.conversationId ? db.conversations.findById(body.conversationId) : undefined;
  // One assistant function per conversation: a message in another mode starts a new conversation instead of mixing histories.
  if (conversation && conversation.messages.length && (conversation.messages[0].mode || "chat") !== mode) conversation = undefined;
  if (conversation && conversation.userId !== user.id) conversation = undefined;
  if (!conversation) conversation = db.conversations.create(user.id, thesis?.id, lastUser.slice(0, 60) || "New conversation");
  // Aggregates of the last artifacts of this conversation, so the model can talk about them without new numbers.
  const digests = hasSheets ? lastArtifactDigests(conversation.messages, attached.sheets, 3, translator) : [];
  db.conversations.append(conversation.id, { role: "user", content: lastUser, mode, ...(attached.ids.length ? { attachmentIds: attached.ids } : {}) });

  const cfg = resolveProvider(user, policy, typeof body.provider === "string" ? body.provider : null);
  // "Use my sources" searches the paper's literature: spreadsheets, primary sources and this message's attachments are left out.
  let grounding: ReturnType<typeof retrieve> | null = null;
  if (body.useSources && thesis) {
    const ids = librarySourceIds(thesis, attached.ids);
    grounding = ids.length ? retrieve(thesis.id, lastUser, 8, ids) : [];
  }
  const demo = cfg.provider === "demo";
  // `demoNotice` is metadata: the panel shows it next to the answer, so it is never inserted as AI text.
  const meta = {
    provider: cfg.provider,
    model: cfg.model,
    source: cfg.source,
    label: cfg.label,
    billedTo: cfg.billedTo,
    institutionModelId: cfg.institutionModel?.id,
    notice: cfg.notice,
    mode,
    conversationId: conversation.id,
    demo,
    demoNotice: demo ? demoNotice(demoLang(lang)) : undefined,
    lang,
    useSources: !!grounding,
    groundedPassages: grounding?.length ?? 0,
    /** Attachments the server accepted (others were ignored). */
    ...(attached.view.length ? { attachments: attached.view } : {}),
  };

  const finish = (text: string, usage: Usage, blocked: boolean, artifacts: Artifact[] = []) => {
    // Per computed table (never per row): the whole inserted table and its grid alone (a copy of just the table),
    // next to the answer's sentences (docs/papers.md §3.5).
    const fingerprints = blocked ? [] : Array.from(new Set([...passageFingerprints(text), ...artifacts.flatMap((a) => [artifactFingerprint(a, translator(a.lang)), artifactGridFingerprint(a)])]));
    const interaction = db.interactions.create({
      userId: user.id,
      thesisId: thesis?.id,
      sessionId: body.sessionId,
      provider: cfg.provider,
      model: cfg.model,
      mode,
      source: "thesisfic",
      connectionId: cfg.connectionId,
      promptPreview: lastUser.slice(0, 200),
      responsePreview: previewOf(text, artifacts),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      insertedWords: 0,
      blockedByPolicy: blocked,
      billedTo: cfg.billedTo,
      costUsd: costOf(cfg, usage),
      institutionModelId: cfg.institutionModel?.id,
      responseFingerprints: fingerprints,
      ...(attached.ids.length ? { attachmentIds: attached.ids } : {}),
      ...(artifacts.length ? { artifacts: artifactRefs(artifacts) } : {}),
    });
    // Every artifact carries the interaction it was computed for before it is stored or sent (D12).
    for (const a of artifacts) a.interactionId = interaction.id;
    db.conversations.append(conversation!.id, {
      role: "assistant",
      content: text,
      mode,
      provider: cfg.provider,
      model: cfg.model,
      interactionId: interaction.id,
      ...(attached.ids.length ? { attachmentIds: attached.ids } : {}),
      ...(artifacts.length ? { artifacts } : {}),
    });
    if (body.sessionId) db.sessions.addEvent(body.sessionId, "ai_prompt", { mode, provider: cfg.provider, model: cfg.model, blocked, promptPreview: lastUser.slice(0, 120), interactionId: interaction.id, ...(artifacts.length ? { artifacts: artifacts.length } : {}) });
    if (cfg.connectionId) db.connections.update(cfg.connectionId, { lastUsedAt: new Date().toISOString() });
    if (cfg.billedTo === "institution") maybeAlertBudget(user.university);
    return interaction.id;
  };

  // Policy guardrails run before any provider call.
  const check = checkPolicy(policy, mode, lastUser, lang);
  if (!check.allowed) {
    // With data attached, the refusal also says what the copilot can do with it (D14).
    const text = check.reason === "generation_blocked" && hasSheets ? `${check.message!}\n\n${uiTr("data.blockedHint")}` : check.message!;
    const interactionId = finish(text, NO_USAGE, true);
    if (body.stream === false) return NextResponse.json({ message: text, blocked: true, reason: check.reason, meta, interactionId });
    return sse(async (send) => {
      send("meta", { ...meta, blocked: true, reason: check.reason });
      for (const chunk of chunkText(text)) {
        send("delta", { text: chunk });
        await new Promise((res) => setTimeout(res, 12));
      }
      send("done", { interactionId, usage: NO_USAGE, blocked: true });
    });
  }

  // Attached documents are read even when "Use my sources" is off; "Used {n} passages from {file}" per document.
  const primary = thesis && attached.documents.length ? primaryPassages(thesis, lastUser, attached.documents) : null;
  const answerMeta = primary ? { ...meta, groundedFiles: passagesPerFile(primary) } : meta;
  const assignment = thesis?.assignmentId ? db.assignments.findById(thesis.assignmentId) : undefined;
  const system = buildSystemPrompt({
    mode,
    policy,
    thesis,
    studentName: user.name,
    provider: cfg.label,
    context: {
      assignment: assignment ? { title: assignment.title, brief: assignment.brief } : null,
      data: hasSheets ? { cards: dataCards(attached.sheets), digests, multipleFiles: attached.sheets.length > 1 } : null,
      primary,
      library: grounding ? { passages: grounding.map((p) => ({ ref: p.ref, label: passageLabel(p), section: p.section, text: p.text, summary: p.summary })), rule: GROUNDING_RULE } : null,
    },
  });

  if (cfg.provider === "demo") {
    let artifacts: Artifact[] = [];
    let artifactErrors: ArtifactError[] = [];
    let text: string;
    if (cfg.notice && cfg.source === "demo" && cfg.label === "Allowance used up") text = cfg.notice;
    else if (hasSheets) {
      // No model: Thesisfic plans the analysis from the request and computes it (the numbers are real either way).
      const run = demoArtifacts(lastUser, attached.sheets, { ...runOpts, planTr: uiTr });
      artifacts = run.artifacts;
      artifactErrors = run.errors;
      text = demoDataResponse({ file: (run.sheet || attached.sheets[0]).fileName, computed: artifacts.length > 0, unsupported: isUnsupportedRequest(lastUser) }, uiTr);
    } else if (primary) text = demoAttachmentsResponse(primary.slice(0, 3).map((p) => ({ label: p.label, quote: firstSentence(p.text) })), uiTr);
    else if (grounding && grounding.length) text = demoGroundedResponse(grounding.slice(0, 3).map((p) => ({ label: passageLabel(p), quote: splitSentences(p.text)[0] || p.text.slice(0, 200) })), demoLang(lang));
    else text = demoResponse(mode, messages, demoLang(lang));
    const interactionId = finish(text, NO_USAGE, false, artifacts);
    if (body.stream === false) return NextResponse.json({ message: text, meta: answerMeta, interactionId, usage: NO_USAGE, ...artifactFields(artifacts, artifactErrors) });
    return sse(async (send) => {
      send("meta", answerMeta);
      for (const chunk of chunkText(text)) {
        send("delta", { text: chunk });
        await new Promise((res) => setTimeout(res, 15));
      }
      emitArtifacts(send, artifacts, artifactErrors);
      send("done", { interactionId, usage: NO_USAGE });
    });
  }

  if (body.stream === false) {
    let text = "";
    let usage = NO_USAGE;
    let err: string | undefined;
    for await (const chunk of streamCompletion(cfg, system, messages)) {
      if (chunk.type === "delta") text += chunk.text;
      else if (chunk.type === "usage") usage = { inputTokens: chunk.inputTokens, outputTokens: chunk.outputTokens };
      else if (chunk.type === "error") err = chunk.message;
    }
    if (err && !text) return NextResponse.json({ error: err, meta: answerMeta }, { status: 502 });
    const run = artifactsFromAnswer(text, attached.sheets, runOpts);
    const interactionId = finish(run.text, usage, false, run.artifacts);
    return NextResponse.json({ message: run.text, meta: answerMeta, interactionId, usage, ...artifactFields(run.artifacts, run.errors) });
  }

  return sse(async (send) => {
    send("meta", answerMeta);
    let text = "";
    let usage = NO_USAGE;
    for await (const chunk of streamCompletion(cfg, system, messages)) {
      if (chunk.type === "delta") {
        text += chunk.text;
        send("delta", { text: chunk.text });
      } else if (chunk.type === "usage") usage = { inputTokens: chunk.inputTokens, outputTokens: chunk.outputTokens };
      else if (chunk.type === "error") send("error", { message: chunk.message, code: chunk.code });
    }
    if (!text) {
      send("done", { interactionId: undefined, usage });
      return;
    }
    // Server order (docs/papers.md §3.5): whole text → blocks out → validate and compute → log and store → artifacts → done.
    const run = artifactsFromAnswer(text, attached.sheets, runOpts);
    const interactionId = finish(run.text, usage, false, run.artifacts);
    emitArtifacts(send, run.artifacts, run.errors);
    send("done", { interactionId, usage });
  });
}

function artifactFields(artifacts: Artifact[], errors: ArtifactError[]) {
  return { ...(artifacts.length ? { artifacts } : {}), ...(errors.length ? { artifactErrors: errors } : {}) };
}

/** `artifact` per computed artifact (only with its interactionId), then `artifact_error` per block that could not be computed. */
function emitArtifacts(send: (event: string, data: unknown) => void, artifacts: Artifact[], errors: ArtifactError[]) {
  for (const a of artifacts) if (a.interactionId) send("artifact", { artifact: a });
  for (const e of errors) send("artifact_error", e);
}

function chunkText(text: string, size = 24) {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

function sse(run: (send: (event: string, data: unknown) => void) => Promise<void>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* stream closed */
        }
      };
      try {
        await run(send);
      } catch (e) {
        send("error", { message: (e as Error).message || "Unexpected error" });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
