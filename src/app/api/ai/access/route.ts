import { NextRequest } from "next/server";
import { AIFunding, db } from "@/lib/db";
import { error, json, requireStaff } from "@/lib/api";
import { allowanceFor } from "@/lib/ai/providers";
import { publicModel, spendSummary } from "@/lib/ai/funding";

/**
 * AI access for a university: which models the institution offers and pays for, and how much each student may use.
 * Students see the models and their own allowance; administrators also see spend and can change the configuration.
 */
export async function GET(request: NextRequest) {
  const r = await requireStaff(request);
  if ("response" in r) return r.response;
  const uni = r.user.university;
  const funding = db.aiAccess.funding(uni);
  const models = db.aiAccess.models(uni).map(publicModel);
  const allowance = allowanceFor(r.user);
  const isAdmin = r.user.role === "admin";
  return json({
    university: uni,
    canManage: isAdmin,
    funding: isAdmin ? funding : { institutionPays: funding.institutionPays, currency: funding.currency, perStudentMonthly: funding.perStudentMonthly, atLimit: funding.atLimit },
    models: isAdmin ? models : models.filter((m) => m.enabled).map(({ endpoint: _e, hasKey: _k, lastError: _l, ...m }) => m),
    allowance,
    spend: isAdmin ? spendSummary(uni) : undefined,
  });
}

/** Administrators update who pays and the limits. */
export async function PUT(request: NextRequest) {
  const r = await requireStaff(request);
  if ("response" in r) return r.response;
  if (r.user.role !== "admin") return error("Only administrators can change AI funding", 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return error("Invalid body");
  const patch: Partial<AIFunding> = {};
  if (typeof body.institutionPays === "boolean") patch.institutionPays = body.institutionPays;
  if (["EUR", "USD", "GBP", "CHF"].includes(body.currency)) patch.currency = body.currency;
  const num = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : undefined);
  const usdRate = num(body.usdRate, 0.01, 1000);
  if (usdRate !== undefined) patch.usdRate = usdRate;
  const monthlyBudget = num(body.monthlyBudget, 0, 10_000_000);
  if (monthlyBudget !== undefined) patch.monthlyBudget = monthlyBudget;
  const perStudentMonthly = num(body.perStudentMonthly, 0, 100_000);
  if (perStudentMonthly !== undefined) patch.perStudentMonthly = perStudentMonthly;
  if (body.atLimit === "block" || body.atLimit === "own_account") patch.atLimit = body.atLimit;
  const alertPercent = num(body.alertPercent, 0, 100);
  if (alertPercent !== undefined) patch.alertPercent = alertPercent;
  const funding = db.aiAccess.updateFunding(r.user.university, patch, r.user.id);
  return json({ funding });
}
