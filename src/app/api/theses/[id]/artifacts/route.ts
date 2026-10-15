import { NextRequest } from "next/server";
import { db, uid, type Dataset } from "@/lib/db";
import { json, requireUser } from "@/lib/api";
import { canAccessThesis } from "@/lib/auth";
import { isLockedStatus } from "@/lib/paperSections";
import { getT } from "@/lib/i18n/server";
import { translator } from "@/lib/i18n/dictionary";
import { createWorkspaceArtifact, selectDataset, type WorkspaceRequest } from "@/lib/data/workspace";
import { readCsv } from "@/lib/sources/csv";
import { buildSheets } from "@/lib/sources/sheets";
import { artifactFingerprint, artifactGridFingerprint } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Preview and create from an explicit range. Computation stays on the server; no model or paid API is called. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  const t = getT();
  const fail = (key: string, status = 400) => json({ error: t(key), code: key }, status);
  const paper = canAccessThesis(auth.user, params.id);
  if (!paper || paper.studentId !== auth.user.id) return fail("library.error.thesisNotFound", 404);
  if (isLockedStatus(paper.status)) return fail("api.paper.locked", 409);
  const body = await request.json().catch(() => null);
  const config = body?.config as WorkspaceRequest | undefined;
  if (!config || !["chart", "table", "analysis"].includes(config.output) || !Number.isInteger(config.sheet) || config.sheet < 0 || typeof config.range !== "string" || config.range.length > 80 || typeof config.x !== "string" || !Array.isArray(config.ys) || config.ys.some(c => typeof c !== "string") || !["bar", "groupedBar", "line", "scatter", "pie", "histogram", "box"].includes(config.chartType)) return fail("workspace.invalidRange");
  const source = db.sources.list(paper.id).find(s => s.id === body.sourceId && s.ownerId === auth.user.id);
  if (!source) return fail("library.error.sourceNotFound", 404);
  let dataset = (source.datasetId && db.datasets.findById(source.datasetId)) || db.datasets.findBySource(source.id);
  try {
    if (typeof body.tableText === "string" && body.tableText.trim()) {
      if (body.tableText.length > 200_000) return fail("workspace.tooLarge", 413);
      const read = readCsv(new TextEncoder().encode(body.tableText), source.title);
      const built = buildSheets([read.sheet]);
      if (!built.sheets.length || built.noRoom || built.sheets.some(s => s.truncated)) return fail("workspace.tooLarge");
      dataset = { id: "manual", sourceId: source.id, ownerId: auth.user.id, sha256: "", sheets: built.sheets, cells: built.cells, createdAt: new Date().toISOString() } as Dataset;
    }
    if (!dataset) return fail("workspace.pasteData");
    if (body.selectionOnly === true) { selectDataset(dataset, config); return json({ selection: { sheet: config.sheet, range: config.range } }); }
    const lang = paper.writingLanguage || auth.user.preferences.language;
    const artifact = createWorkspaceArtifact(dataset, config, { id: uid("art"), interactionId: "", fileName: source.file?.name || source.title, lang }, translator(lang));
    if (body.tableText) delete artifact.dataSelection;
    if (body.preview === true) return json({ artifact });
    const policy = db.policies.get(auth.user.university);
    if (!policy.researchCopilot) return fail("workspace.unavailable", 403);
    if (policy.requireConsent && !db.consents.latest(auth.user.id)?.scopes.aiInteractions) return json({ code: "consent_required", error: t("workspace.consent") }, 428);
    let conversation = typeof body.conversationId === "string" ? db.conversations.findById(body.conversationId) : undefined;
    if (conversation && (conversation.userId !== auth.user.id || conversation.thesisId !== paper.id)) return fail("workspace.unavailable", 404);
    if (conversation?.messages.length && conversation.messages[0].mode !== "copilot") conversation = undefined;
    if (!conversation) conversation = db.conversations.create(auth.user.id, paper.id, artifact.title);
    const interaction = db.interactions.create({ userId: auth.user.id, thesisId: paper.id, provider: "demo", model: "data-workspace", mode: "copilot", source: "thesisfic", promptPreview: `${config.output}: ${config.range}`, responsePreview: artifact.title, inputTokens: 0, outputTokens: 0, insertedWords: 0, blockedByPolicy: false, billedTo: "none", costUsd: 0, responseFingerprints: [artifactFingerprint(artifact, translator(lang)), artifactGridFingerprint(artifact)], attachmentIds: [source.id], artifacts: [{ id: artifact.id, kind: artifact.kind, title: artifact.title, sourceId: source.id }] });
    artifact.interactionId = interaction.id;
    db.conversations.append(conversation.id, { role: "user", content: `${t("workspace.create")}: ${artifact.title} · ${config.range}`, mode: "copilot", attachmentIds: [source.id], sourceSelections: body.tableText ? {} : { [source.id]: { sheet: config.sheet, range: config.range } } });
    db.conversations.append(conversation.id, { role: "assistant", content: "", mode: "copilot", provider: "demo", model: "data-workspace", interactionId: interaction.id, artifacts: [artifact], attachmentIds: [source.id] });
    return json({ artifact, conversationId: conversation.id });
  } catch (error) {
    const key = error instanceof Error && /^(workspace\.|data\.error\.)/.test(error.message) ? error.message : "workspace.invalidData";
    return fail(key);
  }
}
