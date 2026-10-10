import { createHmac, createPublicKey, generateKeyPairSync, randomBytes, timingSafeEqual } from "crypto";
import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { db, LtiPlatform, Role, User } from "./db";
import { decrypt, encrypt } from "./crypto";
import { requestOrigin } from "./invitations";

/**
 * LTI 1.3 (IMS Learning Tools Interoperability) with Thesisfic as the Tool and Moodle (or any LTI Advantage
 * platform) as the Platform. The flow: Moodle calls /api/lti/login (OIDC third-party initiated login), we redirect
 * the browser to Moodle's auth endpoint with a signed `state` and a `nonce`, Moodle posts an id_token (RS256) to
 * /api/lti/launch, we verify it against the platform's JWKS, map the platform user to a Thesisfic account and open
 * a session. Deep linking lets a teacher place the "Thesisfic workspace" link in a course; the response is a JWT
 * signed with the tool key published at /api/lti/jwks.
 */

export const LTI_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/";
export const DL_CLAIM = "https://purl.imsglobal.org/spec/lti-dl/claim/";
const STATE_TTL_MS = 10 * 60 * 1000;
const JWKS_TTL_MS = 10 * 60 * 1000;
const SECRET = process.env.LTI_STATE_SECRET || process.env.JWT_SECRET || "thesisfy-mvp-dev-secret-key-2024";

export interface ToolUrls {
  origin: string;
  launch: string;
  login: string;
  jwks: string;
  deepLink: string;
}

/** The URLs a Moodle administrator pastes into "Configure a tool manually". */
export function toolUrls(request: NextRequest): ToolUrls {
  const origin = process.env.APP_URL?.replace(/\/$/, "") || requestOrigin(request);
  return { origin, launch: `${origin}/api/lti/launch`, login: `${origin}/api/lti/login`, jwks: `${origin}/api/lti/jwks`, deepLink: `${origin}/api/lti/launch` };
}

/** Moodle's three LTI endpoints derive from its site URL; the issuer is the site URL itself. */
export function moodleDefaults(siteUrl: string) {
  const base = siteUrl.trim().replace(/\/+$/, "");
  return { issuer: base, authLoginUrl: `${base}/mod/lti/auth.php`, tokenUrl: `${base}/mod/lti/token.php`, jwksUrl: `${base}/mod/lti/certs.php` };
}

// ---------------------------------------------------------------------------------------------------------------
// Tool key (RS256). Generated once per store and kept encrypted; the public part is served as a JWK set.

function toolKey() {
  let k = db.lti.keys.current();
  if (!k) {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" }) as Record<string, string>;
    const kid = randomBytes(8).toString("hex");
    k = db.lti.keys.create({ kid, privateKeyEnc: encrypt(privateKey.export({ type: "pkcs8", format: "pem" }) as string), publicJwk: { ...jwk, kid, alg: "RS256", use: "sig" } });
  }
  return k;
}

export function toolJwks() {
  const k = toolKey();
  return { keys: [k.publicJwk] };
}

function signWithToolKey(payload: Record<string, unknown>) {
  const k = toolKey();
  return jwt.sign(payload, decrypt(k.privateKeyEnc), { algorithm: "RS256", keyid: k.kid });
}

// ---------------------------------------------------------------------------------------------------------------
// State: a self-contained HMAC token (works even when the browser blocks third-party cookies inside Moodle's iframe).

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");
function hmac(data: string) {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

export function makeState(platformId: string, nonce: string, target: string) {
  const body = b64u(JSON.stringify({ p: platformId, n: nonce, t: target, exp: Date.now() + STATE_TTL_MS }));
  return `${body}.${hmac(body)}`;
}

export function readState(state: string | null): { platformId: string; nonce: string; target: string } | null {
  if (!state) return null;
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = hmac(body);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return { platformId: String(data.p), nonce: String(data.n), target: String(data.t || "") };
  } catch {
    return null;
  }
}

/** Nonces already consumed in this instance: a replayed id_token within the state window is refused. */
const usedNonces = new Map<string, number>();
function consumeNonce(nonce: string) {
  const t = Date.now();
  usedNonces.forEach((exp, n) => {
    if (exp < t) usedNonces.delete(n);
  });
  if (usedNonces.has(nonce)) return false;
  usedNonces.set(nonce, t + STATE_TTL_MS);
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Login initiation

export interface LoginParams {
  iss: string;
  login_hint: string;
  target_link_uri: string;
  lti_message_hint?: string;
  client_id?: string;
  lti_deployment_id?: string;
}

/** Builds the redirect to the platform's authentication endpoint (OIDC third-party initiated login). */
export function loginRedirect(platform: LtiPlatform, params: LoginParams, urls: ToolUrls) {
  const nonce = randomBytes(16).toString("hex");
  const state = makeState(platform.id, nonce, params.target_link_uri);
  const u = new URL(platform.authLoginUrl);
  u.searchParams.set("scope", "openid");
  u.searchParams.set("response_type", "id_token");
  u.searchParams.set("response_mode", "form_post");
  u.searchParams.set("prompt", "none");
  u.searchParams.set("client_id", params.client_id || platform.clientId);
  u.searchParams.set("redirect_uri", urls.launch);
  u.searchParams.set("login_hint", params.login_hint);
  u.searchParams.set("state", state);
  u.searchParams.set("nonce", nonce);
  if (params.lti_message_hint) u.searchParams.set("lti_message_hint", params.lti_message_hint);
  return { url: u.toString(), state, nonce };
}

// ---------------------------------------------------------------------------------------------------------------
// Launch verification

const jwksCache = new Map<string, { at: number; keys: Record<string, unknown>[] }>();

async function platformKeys(platform: LtiPlatform, force = false) {
  const hit = jwksCache.get(platform.jwksUrl);
  if (hit && !force && Date.now() - hit.at < JWKS_TTL_MS) return hit.keys;
  const res = await fetch(platform.jwksUrl, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Platform keyset unreachable (${res.status})`);
  const data = (await res.json()) as { keys?: Record<string, unknown>[] };
  const keys = Array.isArray(data.keys) ? data.keys : [];
  jwksCache.set(platform.jwksUrl, { at: Date.now(), keys });
  return keys;
}

export interface LaunchClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  nonce: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  [key: string]: unknown;
}

export class LtiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Verifies the id_token's signature (RS256 against the platform's keyset), issuer, audience, nonce and LTI claims. */
export async function verifyLaunch(idToken: string, state: string | null): Promise<{ platform: LtiPlatform; claims: LaunchClaims; target: string }> {
  const st = readState(state);
  if (!st) throw new LtiError("The launch state is missing or expired. Open the activity again from Moodle.");
  const platform = db.lti.platforms.findById(st.platformId);
  if (!platform) throw new LtiError("This Moodle site is no longer registered.", 404);
  const decoded = jwt.decode(idToken, { complete: true }) as { header: { kid?: string; alg?: string }; payload: LaunchClaims } | null;
  if (!decoded || typeof decoded.payload !== "object") throw new LtiError("The id_token could not be read.");
  if (decoded.header.alg !== "RS256") throw new LtiError("Unsupported token algorithm.");
  const pickKey = (keys: Record<string, unknown>[]) => keys.find((k) => !decoded.header.kid || k.kid === decoded.header.kid);
  let jwk = pickKey(await platformKeys(platform));
  if (!jwk) jwk = pickKey(await platformKeys(platform, true)); // key rotation: refresh once
  if (!jwk) throw new LtiError("The platform's signing key was not found in its keyset.");
  const pem = createPublicKey({ key: jwk as never, format: "jwk" }).export({ type: "spki", format: "pem" }) as string;
  let claims: LaunchClaims;
  try {
    claims = jwt.verify(idToken, pem, { algorithms: ["RS256"], audience: platform.clientId, issuer: platform.issuer, clockTolerance: 60 }) as LaunchClaims;
  } catch (e) {
    throw new LtiError(`The id_token was rejected: ${(e as Error).message}`, 401);
  }
  if (claims.nonce !== st.nonce) throw new LtiError("The launch nonce does not match.");
  if (!consumeNonce(claims.nonce)) throw new LtiError("This launch was already used.");
  if (claims[`${LTI_CLAIM}version`] !== "1.3.0") throw new LtiError("Only LTI 1.3 launches are accepted.");
  const deployment = String(claims[`${LTI_CLAIM}deployment_id`] || "");
  if (!deployment) throw new LtiError("The launch has no deployment id.");
  if (platform.deploymentIds.length && !platform.deploymentIds.includes(deployment)) throw new LtiError("This deployment id is not registered for the Moodle site.", 403);
  if (!platform.deploymentIds.length) db.lti.platforms.update(platform.id, { deploymentIds: [deployment] });
  return { platform, claims, target: st.target };
}

// ---------------------------------------------------------------------------------------------------------------
// Users

const INSTRUCTOR = /#(Instructor|TeachingAssistant|ContentDeveloper|Mentor)$/;
const INSTITUTION_ADMIN = /institution\/person#(Administrator|SysAdmin)$/;

export function roleFromClaims(claims: LaunchClaims): Role {
  const roles = (claims[`${LTI_CLAIM}roles`] as string[] | undefined) || [];
  if (roles.some((r) => INSTITUTION_ADMIN.test(r))) return "admin";
  if (roles.some((r) => INSTRUCTOR.test(r))) return "professor";
  return "student";
}

function localeFromClaims(claims: LaunchClaims): User["preferences"]["language"] {
  const lp = claims[`${LTI_CLAIM}launch_presentation`] as { locale?: string } | undefined;
  const l = (lp?.locale || "").slice(0, 2).toLowerCase();
  return l === "es" || l === "fr" ? l : "en";
}

/** Finds or creates the Thesisfic account behind a platform user. Existing accounts are matched by email. */
export function provisionUser(platform: LtiPlatform, claims: LaunchClaims): User {
  const context = claims[`${LTI_CLAIM}context`] as { id?: string; title?: string } | undefined;
  const existing = db.lti.links.find(platform.issuer, claims.sub);
  if (existing) {
    const u = db.users.findById(existing.userId);
    if (u) {
      db.lti.links.touch(existing.id, { contextId: context?.id, contextTitle: context?.title });
      return u;
    }
  }
  const email = typeof claims.email === "string" && claims.email.includes("@") ? claims.email.toLowerCase() : `${claims.sub}@lti.${platform.id}.invalid`;
  let user = db.users.findByEmail(email) || null;
  if (!user) {
    const name = (claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(" ") || email.split("@")[0]).toString().slice(0, 120);
    user = db.users.create({
      email,
      password: `lti:${randomBytes(24).toString("hex")}`, // never a valid bcrypt hash: the account signs in through Moodle only
      name,
      role: roleFromClaims(claims),
      university: platform.university,
      preferences: { language: localeFromClaims(claims) },
    });
  }
  db.lti.links.create({ platformId: platform.id, issuer: platform.issuer, sub: claims.sub, userId: user.id, contextId: context?.id, contextTitle: context?.title });
  return user;
}

// ---------------------------------------------------------------------------------------------------------------
// Deep linking: the teacher's "Select content" in Moodle gets one item, the Thesisfic workspace.

export function deepLinkResponse(platform: LtiPlatform, claims: LaunchClaims, urls: ToolUrls, title: string) {
  const settings = claims[`${DL_CLAIM}deep_linking_settings`] as { deep_link_return_url: string; data?: string } | undefined;
  if (!settings?.deep_link_return_url) throw new LtiError("The deep linking request has no return URL.");
  const payload: Record<string, unknown> = {
    iss: platform.clientId,
    aud: platform.issuer,
    exp: Math.floor(Date.now() / 1000) + 300,
    iat: Math.floor(Date.now() / 1000),
    nonce: randomBytes(12).toString("hex"),
    [`${LTI_CLAIM}message_type`]: "LtiDeepLinkingResponse",
    [`${LTI_CLAIM}version`]: "1.3.0",
    [`${LTI_CLAIM}deployment_id`]: claims[`${LTI_CLAIM}deployment_id`],
    [`${DL_CLAIM}content_items`]: [{ type: "ltiResourceLink", title, url: urls.launch }],
  };
  if (settings.data) payload[`${DL_CLAIM}data`] = settings.data;
  return { returnUrl: settings.deep_link_return_url, jwt: signWithToolKey(payload) };
}

/** An auto-submitting form: the only way to deliver a POST from a redirect-free launch. */
export function autoPostHtml(action: string, fields: Record<string, string>) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const inputs = Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Thesisfic</title></head><body><form id="f" method="post" action="${esc(action)}">${inputs}<noscript><button type="submit">Continue</button></noscript></form><script>document.getElementById("f").submit()</script></body></html>`;
}
