import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { error, json, requireStaff, requireUser } from "@/lib/api";

export async function GET(request: NextRequest) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  return json({ policy: db.policies.get(r.user.university) });
}

export async function PUT(request: NextRequest) {
  const r = requireStaff(request);
  if ("response" in r) return r.response;
  if (r.user.role !== "admin") return error("Only administrators can change policies", 403);
  const body = await request.json().catch(() => null);
  if (!body) return error("Invalid body");
  const allowed = ["maxAiUsagePercent", "allowBYOK", "allowedProviders", "allowedModes", "blockGeneration", "researchCopilot", "flagSensitivity", "requireConsent", "monitoring"];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (body[k] !== undefined) patch[k] = body[k];
  if (patch.maxAiUsagePercent !== undefined) patch.maxAiUsagePercent = Math.max(0, Math.min(100, Number(patch.maxAiUsagePercent)));
  const policy = db.policies.update(r.user.university, patch, r.user.id);
  return json({ policy });
}
