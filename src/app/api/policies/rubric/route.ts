import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { error, json, requireStaff, requireUser } from "@/lib/api";
import { DEFAULT_RUBRIC, effectiveRubric, rubricVersion, validateRubric } from "@/lib/ai/reviewer";

/** GET: the reviewer rubric in force for the caller's university (any signed-in user). */
export async function GET(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const policy = db.policies.get(r.user.university);
  const rubric = effectiveRubric(policy);
  return json({ rubric, version: rubricVersion(rubric), isDefault: !policy.reviewRubric, defaults: DEFAULT_RUBRIC });
}

/**
 * PUT: admins set weights (0–3, 0 disables) and optionally labels/descriptions per criterion.
 * Body: { rubric: [{ id, weight, label?, description? }] } or { reset: true } to return to the default.
 */
export async function PUT(request: NextRequest) {
  const r = await requireStaff(request);
  if ("response" in r) return r.response;
  if (r.user.role !== "admin") return error("Only administrators can change the reviewer rubric", 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return error("Invalid body");
  if (body.reset === true) {
    const policy = db.policies.update(r.user.university, { reviewRubric: undefined }, r.user.id);
    const rubric = effectiveRubric(policy);
    return json({ rubric, version: rubricVersion(rubric), isDefault: true });
  }
  const v = validateRubric(body.rubric);
  if ("error" in v) return error(v.error);
  if (!v.rubric.some((c) => c.weight > 0)) return error("At least one criterion must have a weight above 0");
  const policy = db.policies.update(r.user.university, { reviewRubric: v.rubric }, r.user.id);
  const rubric = effectiveRubric(policy);
  return json({ rubric, version: rubricVersion(rubric), isDefault: false });
}
