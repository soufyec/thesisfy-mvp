import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { db, Provider } from "@/lib/db";
import { requireUser } from "@/lib/api";
import { PROVIDER_META } from "@/lib/ai/providers";

/**
 * OAuth 2.0 + PKCE start. Anthropic and OpenAI do not yet offer public "Sign in with Claude / ChatGPT"
 * programs for third-party apps; when a provider enables one, set
 *   <PROVIDER>_OAUTH_CLIENT_ID, <PROVIDER>_OAUTH_AUTHORIZE_URL, <PROVIDER>_OAUTH_TOKEN_URL, <PROVIDER>_OAUTH_SCOPES
 * and this route works without code changes. Until then it redirects back with oauth=unavailable.
 */
export async function GET(request: NextRequest, { params }: { params: { provider: string } }) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const provider = params.provider as Provider;
  const back = new URL("/dashboard/connections", request.url);
  if (!PROVIDER_META[provider]) return NextResponse.redirect(back);
  const P = provider.toUpperCase();
  const clientId = process.env[`${P}_OAUTH_CLIENT_ID`];
  const authorizeUrl = process.env[`${P}_OAUTH_AUTHORIZE_URL`];
  const policy = db.policies.get(r.user.university);
  if (!clientId || !authorizeUrl || !policy.allowBYOK || !policy.allowedProviders.includes(provider)) {
    back.searchParams.set("oauth", "unavailable");
    back.searchParams.set("provider", provider);
    return NextResponse.redirect(back);
  }

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("hex");
  const redirectUri = new URL("/api/ai/connections/oauth/callback", request.url).toString();
  const url = new URL(authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", process.env[`${P}_OAUTH_SCOPES`] || "");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  const res = NextResponse.redirect(url);
  res.cookies.set("oauth_state", JSON.stringify({ state, verifier, provider, userId: r.user.id }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
  return res;
}
