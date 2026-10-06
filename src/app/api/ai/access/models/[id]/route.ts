import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { error, json, requireUser } from "@/lib/api";
import { decrypt } from "@/lib/crypto";
import { BACKEND_META, testInstitutionModel } from "@/lib/ai/providers";
import { parseModel, publicModel } from "@/lib/ai/funding";

async function own(request: NextRequest, id: string) {
  const r = await requireUser(request);
  if ("response" in r) return r;
  if (r.user.role !== "admin") return { response: error("Only administrators can manage institution models", 403) };
  const model = db.aiAccess.findModel(id);
  if (!model || model.university !== r.user.university) return { response: error("Model not found", 404) };
  return { user: r.user, model };
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await own(request, params.id);
  if ("response" in r) return r.response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return error("Invalid body");
  const parsed = parseModel(body, r.model);
  if (parsed.error) return error(parsed.error);
  const data = parsed.data!;
  // Re-test when the connection details changed
  const changed = parsed.apiKey || data.endpoint !== r.model.endpoint || data.model !== r.model.model || data.backend !== r.model.backend;
  if (changed && body.skipTest !== true) {
    const test = await testInstitutionModel(data, parsed.apiKey || (r.model.encryptedSecret ? decrypt(r.model.encryptedSecret) : undefined));
    if (!test.ok) return error(`Could not reach ${BACKEND_META[data.backend].name}: ${test.error}`, 422);
    data.lastTestedAt = new Date().toISOString();
    data.lastError = undefined;
  }
  const m = db.aiAccess.updateModel(r.model.id, data)!;
  return json({ model: publicModel(m) });
}

/** Test the stored credentials. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await own(request, params.id);
  if ("response" in r) return r.response;
  let key: string | undefined;
  try {
    key = r.model.encryptedSecret ? decrypt(r.model.encryptedSecret) : undefined;
  } catch {
    return json({ ok: false, error: "Could not decrypt the stored key: add it again" });
  }
  const test = await testInstitutionModel(r.model, key);
  db.aiAccess.updateModel(r.model.id, test.ok ? { lastTestedAt: new Date().toISOString(), lastError: undefined } : { lastError: test.error });
  return json(test);
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await own(request, params.id);
  if ("response" in r) return r.response;
  db.aiAccess.removeModel(r.model.id);
  return json({ ok: true });
}
