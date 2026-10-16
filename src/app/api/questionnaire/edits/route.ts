import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { error, json } from "@/lib/api";
import { isTeamRequest } from "@/lib/team";
import { BASE, canRemoveQuestion, keyOf, sanitizeNewItem } from "@/lib/questionnaire";

import { isQuestionnaireLanguage } from "@/lib/questionnaire/languages";
import { currentQuestionnaire } from "@/lib/questionnaireData";

export const dynamic = "force-dynamic";

/** The team adds a question to a section, or an alternative phrasing to a question. Team cookie required. */
export async function POST(request: NextRequest) {
  if (!isTeamRequest(request)) return error("Team access required", 401);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return error("Invalid body");
  const section = BASE.sections.find((s) => s.id === body.sectionId);
  if (!section) return error("Unknown section", 422);
  await db.ready();
  const author = typeof body.author === "string" && body.author.trim() ? body.author.trim().slice(0, 60) : undefined;
  const current = currentQuestionnaire().sections.find(s => s.id === section.id)!;
  if (["update", "remove", "order"].includes(body.kind)) {
    const target = current.items.find(i => keyOf(current, i) === body.targetKey);
    if (body.kind === "order") {
      const keys = current.items.map(i => keyOf(current, i));
      if (!Array.isArray(body.keys) || body.keys.length !== keys.length || new Set(body.keys).size !== keys.length || body.keys.some((k: unknown) => typeof k !== "string" || !keys.includes(k))) return error("Invalid question order", 422);
      const edit = db.questionnaire.addEdit({ kind: "order", sectionId: section.id, keys: body.keys, author });
      return json({ ok: true, edit }, 201);
    }
    if (!target) return error("Question not found", 404);
    if (body.kind === "remove") {
      if (!canRemoveQuestion(target)) return error("Consent, mode and profile are required for questionnaire routing", 422);
      const edit = db.questionnaire.addEdit({ kind: "remove", sectionId: section.id, targetKey: body.targetKey, author });
      return json({ ok: true, edit }, 201);
    }
    const title = typeof body.item?.title === "string" ? body.item.title.trim().slice(0, 400) : "";
    const help = typeof body.item?.help === "string" ? body.item.help.trim().slice(0, 600) : "";
    if (title.length < 3) return error("Question title is too short", 422);
    if (body.locale && !["fr", "en", "es", "de", "pt", "ar"].includes(body.locale)) return error("Unknown language", 422);
    const labels: Record<string, string> = {};
    if (body.locale && body.locale !== (target.sourceLanguage || "fr") && body.item?.labels && typeof body.item.labels === "object") {
      for (const key of [...(target.choices || []), ...(target.rows || []), ...(target.cols || []), target.low || "", target.high || ""].filter(Boolean)) {
        if (typeof body.item.labels[key] === "string" && body.item.labels[key].trim()) labels[key] = body.item.labels[key].trim().slice(0, 300);
      }
    }
    const locale = isQuestionnaireLanguage(body.locale) ? body.locale : "fr";
    const edit = db.questionnaire.addEdit({ kind: "update", sectionId: section.id, targetKey: body.targetKey, item: { title, help, translations: { [locale]: { title, help, labels } } }, locale, author });
    return json({ ok: true, edit }, 201);
  }
  const knownKeys = new Set(current.items.map(i => keyOf(current, i)));
  const targetKey = typeof body.targetKey === "string" && knownKeys.has(body.targetKey) ? body.targetKey : undefined;

  if (body.kind === "item") {
    const item = sanitizeNewItem(body.item);
    if (!item) return error("The question needs a type, a title of at least 3 characters and, for choices, at least 2 options", 422);
    item.sourceLanguage = isQuestionnaireLanguage(body.locale) ? body.locale : "fr";
    const e = db.questionnaire.addEdit({ kind: "item", sectionId: section.id, targetKey, item: item as unknown as Record<string, unknown>, author });
    return json({ ok: true, edit: e }, 201);
  }
  if (body.kind === "phrasing") {
    const text = typeof body.text === "string" ? body.text.trim().slice(0, 600) : "";
    if (!targetKey) return error("The phrasing needs a question", 422);
    if (text.length < 3) return error("The phrasing is too short", 422);
    const e = db.questionnaire.addEdit({ kind: "phrasing", sectionId: section.id, targetKey, text, author });
    return json({ ok: true, edit: e }, 201);
  }
  return error("Unknown edit kind", 422);
}
