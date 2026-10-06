import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { canAccessThesis } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";
import { buildLedgerSummary, gatherProcess } from "@/lib/process";
import { DeclarationLang, renderDeclaration, rephraseWithModel } from "@/lib/ai/declaration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LANGS: DeclarationLang[] = ["en", "es", "fr"];

/** GET → { declarations } newest first. Same list for the student and the advisor. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error("Thesis not found", 404);
  const declarations = db.declarations.list(thesis.id).map((d) => ({ ...d, signedByName: d.signedBy ? db.users.findById(d.signedBy)?.name : undefined }));
  return json({ declarations });
}

/**
 * POST { lang?, rephrase?, provider? } → { declaration, rephrased? }
 * Renders the declaration from the ledger with the deterministic template and stores it with its summary.
 * With `rephrase`, also asks the model for a reworded proposal (not stored until the student accepts it).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error("Thesis not found", 404);
  if (thesis.studentId !== r.user.id) return error("Only the author generates the declaration", 403);
  const body = await request.json().catch(() => ({}));
  const lang: DeclarationLang = LANGS.includes(body.lang) ? body.lang : r.user.preferences.language;

  const g = gatherProcess(thesis);
  const summary = buildLedgerSummary(thesis);
  const text = renderDeclaration(summary, { studentName: r.user.name, thesisTitle: thesis.title, university: g.university, lang });
  const declaration = db.declarations.create({ thesisId: thesis.id, text, ledgerSummary: { ...summary, lang, template: "deterministic-v1" } as Record<string, unknown> });

  let rephrased: Record<string, unknown> | undefined;
  if (body.rephrase === true) {
    const res = await rephraseWithModel(text, r.user, g.policy, typeof body.provider === "string" ? body.provider : null);
    if (!res.demo && !res.error) {
      // The rewording is a real model call: it goes in the interaction log like any other request.
      const interaction = db.interactions.create({
        userId: r.user.id,
        thesisId: thesis.id,
        sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
        provider: res.provider as never,
        model: res.model,
        mode: "chat",
        source: "thesisfic",
        promptPreview: `Reword AI-use declaration v${declaration.version}`.slice(0, 200),
        responsePreview: res.text.slice(0, 200),
        inputTokens: res.usage.inputTokens,
        outputTokens: res.usage.outputTokens,
        insertedWords: 0,
        blockedByPolicy: false,
        billedTo: res.billedTo,
        costUsd: res.costUsd,
        responseFingerprints: [],
      });
      rephrased = { text: res.text, provider: res.provider, model: res.model, demo: false, interactionId: interaction.id, costUsd: res.costUsd };
    } else {
      rephrased = { text: res.text, provider: res.provider, model: res.model, demo: res.demo, error: res.error };
    }
  }
  return json({ declaration, rephrased }, 201);
}

/**
 * PATCH { id, text?, sign?: true, aiReworded?: boolean } (owner only).
 * Text can be edited until the declaration is signed; signing is final for that version.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error("Thesis not found", 404);
  if (thesis.studentId !== r.user.id) return error("Only the author edits or signs the declaration", 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== "string") return error("id is required");
  const existing = db.declarations.list(thesis.id).find((d) => d.id === body.id);
  if (!existing) return error("Declaration not found", 404);

  const patch: Partial<typeof existing> = {};
  if (typeof body.text === "string") {
    if (existing.signedAt) return error("A signed declaration cannot be edited; generate a new version", 409);
    if (!body.text.trim()) return error("The declaration cannot be empty");
    if (body.text.length > 20000) return error("The declaration is too long");
    patch.text = body.text;
    patch.ledgerSummary = { ...existing.ledgerSummary, editedAt: new Date().toISOString(), aiReworded: body.aiReworded === true };
  }
  if (body.sign === true) {
    if (existing.signedAt) return error("Already signed", 409);
    patch.signedAt = new Date().toISOString();
    patch.signedBy = r.user.id;
  }
  const updated = db.declarations.update(existing.id, patch);
  if (!updated) return error("Declaration not found", 404);
  if (patch.signedAt && thesis.professorId) db.notifications.create({ userId: thesis.professorId, title: "AI-use declaration signed", message: `${r.user.name} signed the AI-use declaration (v${updated.version}) for "${thesis.title}".`, type: "info", link: `/admin/theses/${thesis.id}` });
  return json({ declaration: { ...updated, signedByName: updated.signedBy ? db.users.findById(updated.signedBy)?.name : undefined } });
}
