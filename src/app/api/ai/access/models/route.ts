import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { error, json, requireUser } from "@/lib/api";
import { BACKEND_META, testInstitutionModel } from "@/lib/ai/providers";
import { parseModel, publicModel } from "@/lib/ai/funding";

/** Add a model the institution pays for. The key is validated with a one-token request, then stored encrypted. */
export async function POST(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  if (r.user.role !== "admin") return error("Only administrators can manage institution models", 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return error("Invalid body");
  const parsed = parseModel(body);
  if (parsed.error) return error(parsed.error);
  const data = parsed.data!;
  if (body.skipTest !== true) {
    const test = await testInstitutionModel(data, parsed.apiKey);
    if (!test.ok) return error(`Could not reach ${BACKEND_META[data.backend].name}: ${test.error}`, 422);
    data.lastTestedAt = new Date().toISOString();
    data.lastError = undefined;
  }
  const m = db.aiAccess.createModel({ ...data, university: r.user.university });
  return json({ model: publicModel(m) }, 201);
}
