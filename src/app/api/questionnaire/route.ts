import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { error, json } from "@/lib/api";
import { isTeamRequest } from "@/lib/team";
import { validateSubmission } from "@/lib/questionnaire";
import { currentQuestionnaire } from "@/lib/questionnaireData";

export const dynamic = "force-dynamic";

/** Submissions per minute accepted by one server instance, whoever sends them. No IP is read or stored. */
const MAX_PER_MINUTE = 30;
let windowStart = 0;
let windowCount = 0;

function overLimit() {
  const t = Date.now();
  if (t - windowStart > 60_000) {
    windowStart = t;
    windowCount = 0;
  }
  windowCount++;
  return windowCount > MAX_PER_MINUTE;
}

/** Current questionnaire (base content plus the team's additions). Public. */
export async function GET(request: NextRequest) {
  await db.ready();
  return json({ questionnaire: currentQuestionnaire(), team: isTeamRequest(request) });
}

/** A filled-in questionnaire. Public, validated against the definition, honeypot + rate limit against bots. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return error("Invalid body");
  // Hidden field a person never sees: anything in it is a bot. Answer as if saved so the bot stops.
  if (typeof body.website === "string" && body.website.trim() !== "") return json({ ok: true, id: "ignored" }, 201);
  if (overLimit()) return error("Too many submissions, try again in a minute", 429);
  await db.ready();
  const q = currentQuestionnaire();
  const v = validateSubmission(q, { answers: body.answers, path: body.path, durationSeconds: Number(body.durationSeconds) || 0 });
  if (!v.ok) return error(v.error, 422);
  const saved = db.questionnaire.addResponse(v.value);
  return json({ ok: true, id: saved.id }, 201);
}
