import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loginRedirect, LoginParams, toolUrls } from "@/lib/lti";

export const dynamic = "force-dynamic";

/**
 * OIDC third-party initiated login. Moodle sends iss, login_hint, target_link_uri (and client_id, deployment id,
 * message hint) by GET or POST; we answer with a redirect to its authentication endpoint.
 */
async function handle(request: NextRequest, params: URLSearchParams) {
  await db.ready();
  const p: LoginParams = {
    iss: params.get("iss") || "",
    login_hint: params.get("login_hint") || "",
    target_link_uri: params.get("target_link_uri") || "",
    lti_message_hint: params.get("lti_message_hint") || undefined,
    client_id: params.get("client_id") || undefined,
    lti_deployment_id: params.get("lti_deployment_id") || undefined,
  };
  if (!p.iss || !p.login_hint || !p.target_link_uri) return NextResponse.json({ error: "Missing iss, login_hint or target_link_uri" }, { status: 400 });
  const platform = db.lti.platforms.findByIssuer(p.iss, p.client_id);
  if (!platform) return NextResponse.json({ error: "This platform is not registered. Ask your Thesisfic administrator to add the Moodle site under Admin → Integrations." }, { status: 404 });
  const urls = toolUrls(request);
  if (!p.target_link_uri.startsWith(urls.origin)) return NextResponse.json({ error: "target_link_uri does not belong to this tool" }, { status: 400 });
  const { url, state } = loginRedirect(platform, p, urls);
  const res = NextResponse.redirect(url, 302);
  // Belt and braces: the state also travels in a cookie; SameSite=None so the cross-site POST back carries it.
  res.cookies.set("lti_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", maxAge: 600, path: "/api/lti" });
  return res;
}

export async function GET(request: NextRequest) {
  return handle(request, request.nextUrl.searchParams);
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const params = new URLSearchParams();
  form?.forEach((v, k) => params.set(k, String(v)));
  return handle(request, params);
}
