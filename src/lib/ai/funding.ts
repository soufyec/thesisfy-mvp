import { db, InstitutionModel, ModelBackend, Provider } from "../db";
import { encrypt } from "../crypto";
import { BACKEND_META, BACKEND_PROVIDERS, institutionModelReady, PROVIDER_META } from "./providers";

/** Public shape of an institution model: never includes the key. */
export function publicModel(m: InstitutionModel) {
  const { encryptedSecret: _s, ...rest } = m;
  return { ...rest, ready: institutionModelReady(m), hasKey: !!m.encryptedSecret, backendName: BACKEND_META[m.backend].name, billedBy: BACKEND_META[m.backend].billedBy };
}

export interface SpendSummary {
  currency: string;
  usdRate: number;
  monthlyBudget: number;
  perStudentMonthly: number;
  spent: number; // institution currency, this month
  requests: number;
  inputTokens: number;
  outputTokens: number;
  projected: number; // linear projection to month end
  byModel: { id: string; label: string; backend: string; requests: number; spent: number; students: number }[];
  byStudent: { userId: string; name: string; requests: number; spent: number; allowanceUsed: number | null; lastAt: string }[];
  byDay: { day: string; spent: number; requests: number }[];
  alertPercent: number;
}

export function spendSummary(university: string): SpendSummary {
  const f = db.aiAccess.funding(university);
  const usage = db.aiAccess.monthUsage(university);
  const toLocal = (usd: number) => Math.round(usd * f.usdRate * 10000) / 10000;
  const spentUsd = usage.reduce((a, i) => a + (i.costUsd || 0), 0);
  const now = new Date();
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();

  const models = db.aiAccess.models(university);
  const byModel = models.map((m) => {
    const rows = usage.filter((i) => i.institutionModelId === m.id);
    return { id: m.id, label: m.label, backend: m.backend, requests: rows.length, spent: toLocal(rows.reduce((a, i) => a + (i.costUsd || 0), 0)), students: new Set(rows.map((r) => r.userId)).size };
  });

  const perStudent = new Map<string, { requests: number; usd: number; lastAt: string }>();
  for (const i of usage) {
    const cur = perStudent.get(i.userId) || { requests: 0, usd: 0, lastAt: "" };
    cur.requests++;
    cur.usd += i.costUsd || 0;
    if (i.timestamp > cur.lastAt) cur.lastAt = i.timestamp;
    perStudent.set(i.userId, cur);
  }
  const byStudent = Array.from(perStudent.entries())
    .map(([userId, v]) => ({ userId, name: db.users.findById(userId)?.name || userId, requests: v.requests, spent: toLocal(v.usd), allowanceUsed: f.perStudentMonthly > 0 ? Math.min(100, Math.round((toLocal(v.usd) / f.perStudentMonthly) * 100)) : null, lastAt: v.lastAt }))
    .sort((a, b) => b.spent - a.spent);

  const dayMap = new Map<string, { spent: number; requests: number }>();
  for (const i of usage) {
    const day = i.timestamp.slice(0, 10);
    const cur = dayMap.get(day) || { spent: 0, requests: 0 };
    cur.spent += toLocal(i.costUsd || 0);
    cur.requests++;
    dayMap.set(day, cur);
  }
  const byDay = Array.from(dayMap.entries())
    .map(([day, v]) => ({ day, spent: Math.round(v.spent * 100) / 100, requests: v.requests }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return {
    currency: f.currency,
    usdRate: f.usdRate,
    monthlyBudget: f.monthlyBudget,
    perStudentMonthly: f.perStudentMonthly,
    spent: toLocal(spentUsd),
    requests: usage.length,
    inputTokens: usage.reduce((a, i) => a + i.inputTokens, 0),
    outputTokens: usage.reduce((a, i) => a + i.outputTokens, 0),
    projected: Math.round(toLocal(spentUsd) * (daysInMonth / Math.max(1, dayOfMonth)) * 100) / 100,
    byModel,
    byStudent,
    byDay,
    alertPercent: f.alertPercent,
  };
}

/** Notify the university's admins once per month when spend passes the alert threshold. */
export function maybeAlertBudget(university: string) {
  const f = db.aiAccess.funding(university);
  if (!f.monthlyBudget || !f.alertPercent) return;
  const month = new Date().toISOString().slice(0, 7);
  if (f.alertedMonth === month) return;
  const spent = db.aiAccess.monthUsage(university).reduce((a, i) => a + (i.costUsd || 0), 0) * f.usdRate;
  if (spent < (f.monthlyBudget * f.alertPercent) / 100) return;
  db.aiAccess.updateFunding(university, { alertedMonth: month });
  for (const admin of db.users.getByUniversity(university).filter((u) => u.role === "admin")) {
    db.notifications.create({ userId: admin.id, title: "AI budget alert", message: `Students have used ${Math.round((spent / f.monthlyBudget) * 100)}% of this month's AI budget (${spent.toFixed(2)} of ${f.monthlyBudget} ${f.currency}).`, type: "warning", link: "/admin/ai-access" });
  }
}

/** Validates an institution model sent by an administrator. */
export function parseModel(body: Record<string, unknown>, existing?: InstitutionModel): { data?: Omit<InstitutionModel, "id" | "university" | "createdAt" | "updatedAt">; apiKey?: string; error?: string } {
  const backend = (body.backend ?? existing?.backend) as ModelBackend;
  if (!BACKEND_META[backend]) return { error: "Unknown backend" };
  const provider = (body.provider ?? existing?.provider) as Provider;
  if (!PROVIDER_META[provider]) return { error: "Unknown model family" };
  if (!BACKEND_PROVIDERS[backend].includes(provider)) return { error: `${BACKEND_META[backend].name} cannot serve ${PROVIDER_META[provider].product} models` };
  const label = String(body.label ?? existing?.label ?? "").trim().slice(0, 80);
  if (!label) return { error: "A label is required" };
  const model = String(body.model ?? existing?.model ?? "").trim().slice(0, 120);
  if (!model) return { error: backend === "azure_openai" ? "The Azure deployment name is required" : "A model id is required" };
  const endpoint = String(body.endpoint ?? existing?.endpoint ?? "").trim().slice(0, 300);
  if (backend === "azure_openai" && !/^https:\/\/[^\s/]+\.openai\.azure\.com\/?$/i.test(endpoint) && !/^https:\/\/[^\s/]+\.cognitiveservices\.azure\.com\/?$/i.test(endpoint)) return { error: "The Azure resource URL should look like https://your-resource.openai.azure.com" };
  if (backend === "foundry_claude" && !/^[a-z0-9-]+(\.[a-z0-9.-]+)?$/i.test(endpoint.replace(/^https?:\/\//, "").replace(/\/.*$/, ""))) return { error: "Enter the Foundry resource name, e.g. my-university-ai" };
  const price = (v: unknown, fallback: number | undefined) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000 ? v : fallback);
  const inputPrice = price(body.inputPrice, existing?.inputPrice);
  const outputPrice = price(body.outputPrice, existing?.outputPrice);
  if (inputPrice === undefined || outputPrice === undefined) return { error: "Prices per million tokens are required (0 is allowed)" };
  const apiKey = typeof body.apiKey === "string" && body.apiKey.trim() ? body.apiKey.trim() : undefined;
  if (BACKEND_META[backend].needsKey && !apiKey && !existing?.encryptedSecret) return { error: "A key for this backend is required" };
  return {
    apiKey,
    data: {
      provider,
      backend,
      label,
      model,
      endpoint: endpoint || undefined,
      encryptedSecret: apiKey ? encrypt(apiKey) : existing?.encryptedSecret,
      secretHint: apiKey ? apiKey.slice(-4) : existing?.secretHint,
      region: String(body.region ?? existing?.region ?? "").trim().slice(0, 60) || "Not specified",
      inputPrice,
      outputPrice,
      enabled: typeof body.enabled === "boolean" ? body.enabled : existing?.enabled ?? true,
      isDefault: typeof body.isDefault === "boolean" ? body.isDefault : existing?.isDefault ?? false,
      lastTestedAt: existing?.lastTestedAt,
      lastError: existing?.lastError,
    },
  };
}
