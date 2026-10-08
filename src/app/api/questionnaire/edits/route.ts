import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { error, json } from "@/lib/api";
import { isTeamRequest } from "@/lib/team";
import { BASE, keyOf, sanitizeNewItem } from "@/lib/questionnaire";

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
  const knownKeys = new Set<string>([...section.items.map((i) => keyOf(section, i)), ...db.questionnaire.edits().filter((e) => e.kind === "item" && e.sectionId === section.id).map((e) => e.id)]);
  const targetKey = typeof body.targetKey === "string" && knownKeys.has(body.targetKey) ? body.targetKey : undefined;

  if (body.kind === "item") {
    const item = sanitizeNewItem(body.item);
    if (!item) return error("The question needs a type, a title of at least 3 characters and, for choices, at least 2 options", 422);
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
