import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { error, json } from "@/lib/api";
import { isTeamRequest } from "@/lib/team";
import { validateProductSettings } from "@/lib/product-settings";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  if (!isTeamRequest(request)) return error(getT()("product.teamRequired"), 401);
  await db.ready();
  return json({ settings: db.productSettings.get(), persistent: db.storeConfigured || !!process.env.DATA_FILE });
}
export async function PUT(request: NextRequest) {
  const t = getT();
  if (!isTeamRequest(request)) return error(t("product.teamRequired"), 401);
  const origin = request.headers.get("origin");
  // Next may normalise nextUrl to localhost behind its own server; compare the browser origin to the public Host.
  if (origin) {
    try {
      const expectedHost = request.headers.get("host") || request.nextUrl.host;
      const expectedProtocol = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
      const parsed = new URL(origin);
      if (parsed.host !== expectedHost || parsed.protocol !== `${expectedProtocol}:`) return error(t("product.teamRequired"), 403);
    } catch { return error(t("product.teamRequired"), 403); }
  }
  const body = await request.json().catch(() => null);
  if (!body || !Number.isSafeInteger(body.revision) || body.revision < 0) return error(t("product.invalid"), 422);
  let settings;
  try { settings = validateProductSettings(body.settings); }
  catch { return error(t("product.invalid"), 422); }
  await db.ready();
  try { return json({ settings: db.productSettings.set(settings, body.revision) }); }
  catch (e) { return error(t((e as Error).message === "conflict" ? "product.conflict" : "product.saveFailed"), (e as Error).message === "conflict" ? 409 : 500); }
}
