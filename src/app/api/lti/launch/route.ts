import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signToken } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { autoPostHtml, deepLinkResponse, LTI_CLAIM, LtiError, provisionUser, toolUrls, verifyLaunch } from "@/lib/lti";

export const dynamic = "force-dynamic";

function page(title: string, body: string, status = 400) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title><style>body{font-family:Inter,system-ui,sans-serif;color:#111827;max-width:560px;margin:48px auto;padding:0 16px;line-height:1.5}h1{font-size:18px}p{color:#4b5563;font-size:14px}</style></head><body><h1>${esc(title)}</h1><p>${esc(body)}</p></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

/** The LTI 1.3 launch: Moodle posts id_token + state here after the login redirect. */
export async function POST(request: NextRequest) {
  await db.ready();
  const t = getT();
  const form = await request.formData().catch(() => null);
  const idToken = String(form?.get("id_token") || "");
  const state = String(form?.get("state") || request.cookies.get("lti_state")?.value || "");
  if (!idToken) return page(t("lti.launch.failedTitle"), t("lti.launch.noToken"));
  try {
    const { platform, claims, target } = await verifyLaunch(idToken, state || null);
    const urls = toolUrls(request);
    const messageType = claims[`${LTI_CLAIM}message_type`];
    if (messageType === "LtiDeepLinkingRequest") {
      const { returnUrl, jwt } = deepLinkResponse(platform, claims, urls, t("lti.deepLink.itemTitle"));
      return new NextResponse(autoPostHtml(returnUrl, { JWT: jwt }), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (messageType !== "LtiResourceLinkRequest") return page(t("lti.launch.failedTitle"), t("lti.launch.unsupportedMessage"));
    const user = provisionUser(platform, claims);
    db.lti.platforms.update(platform.id, { launches: platform.launches + 1, lastLaunchAt: new Date().toISOString() });
    const dest = new URL(target && target.startsWith(urls.origin) && !target.startsWith(urls.launch) ? target : `${urls.origin}${user.role === "student" ? "/dashboard" : "/admin"}`);
    const res = NextResponse.redirect(dest.toString(), 303);
    // SameSite=None so the session also works when Moodle embeds the tool in an iframe (HTTPS only).
    const prod = process.env.NODE_ENV === "production";
    res.cookies.set("token", signToken(user), { httpOnly: true, secure: prod, sameSite: prod ? "none" : "lax", maxAge: 60 * 60 * 24 * 7, path: "/" });
    res.cookies.set("locale", user.preferences.language, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    res.cookies.set("lti_state", "", { maxAge: 0, path: "/api/lti" });
    return res;
  } catch (e) {
    const err = e as LtiError;
    return page(t("lti.launch.failedTitle"), err.message || t("lti.launch.generic"), err.status || 400);
  }
}
