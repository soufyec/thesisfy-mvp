import { NextRequest, NextResponse } from "next/server";
import { db, Provider } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { DEFAULT_MODELS, PROVIDER_META } from "@/lib/ai/providers";

export async function GET(request: NextRequest) {
  const back = new URL("/dashboard/connections", request.url);
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const raw = request.cookies.get("oauth_state")?.value;
  const res = () => {
    const out = NextResponse.redirect(back);
    out.cookies.set("oauth_state", "", { maxAge: 0, path: "/" });
    return out;
  };
  if (!code || !state || !raw) {
    back.searchParams.set("oauth", "error");
    return res();
  }
  let saved: { state: string; verifier: string; provider: Provider; userId: string };
  try {
    saved = JSON.parse(raw);
  } catch {
    back.searchParams.set("oauth", "error");
    return res();
  }
  if (saved.state !== state) {
    back.searchParams.set("oauth", "state_mismatch");
    return res();
  }
  const P = saved.provider.toUpperCase();
  const tokenUrl = process.env[`${P}_OAUTH_TOKEN_URL`]!;
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: new URL("/api/ai/connections/oauth/callback", request.url).toString(),
    client_id: process.env[`${P}_OAUTH_CLIENT_ID`]!,
    code_verifier: saved.verifier,
  });
  if (process.env[`${P}_OAUTH_CLIENT_SECRET`]) form.set("client_secret", process.env[`${P}_OAUTH_CLIENT_SECRET`]!);
  try {
    const tokenRes = await fetch(tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: form });
    const token = await tokenRes.json();
    if (!tokenRes.ok || !token.access_token) throw new Error(token.error_description || token.error || "Token exchange failed");
    db.connections.create({
      userId: saved.userId,
      provider: saved.provider,
      authType: "oauth",
      label: `${PROVIDER_META[saved.provider].product} (signed in)`,
      encryptedSecret: encrypt(JSON.stringify({ access_token: token.access_token, refresh_token: token.refresh_token, expires_in: token.expires_in, obtained_at: Date.now() })),
      secretHint: String(token.access_token).slice(-4),
      model: DEFAULT_MODELS[saved.provider],
      status: "active",
      scopes: typeof token.scope === "string" ? token.scope.split(" ") : undefined,
    });
    back.searchParams.set("oauth", "connected");
    back.searchParams.set("provider", saved.provider);
  } catch (e) {
    back.searchParams.set("oauth", "error");
    back.searchParams.set("message", (e as Error).message.slice(0, 120));
  }
  return res();
}
