// Run from the repo root with the app on :3050: `node scripts/lti/fake-moodle.mjs`, then register http://localhost:4100 (client id client-abc)
// under Admin → Integrations and open http://localhost:3050/api/lti/login?iss=http://localhost:4100&login_hint=student&target_link_uri=http://localhost:3050/dashboard
// A minimal LTI 1.3 platform standing in for Moodle: keyset, auth endpoint (auto-posts an id_token) and deep-link return.
import http from "node:http";
import { generateKeyPairSync, createPublicKey, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const jwt = require("jsonwebtoken");
const PORT = 4100, ISS = `http://localhost:${PORT}`, CLIENT = "client-abc", DEPLOY = "1";
const TOOL = "http://localhost:3050";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "moodle-k1", alg: "RS256", use: "sig" };
const log = (...a) => console.log("[moodle]", ...a);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
http.createServer(async (req, res) => {
  const u = new URL(req.url, ISS);
  if (u.pathname === "/mod/lti/certs.php") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ keys: [jwk] })); }
  if (u.pathname === "/mod/lti/auth.php") {
    const q = Object.fromEntries(u.searchParams);
    log("auth request", { client_id: q.client_id, redirect_uri: q.redirect_uri, prompt: q.prompt, hint: q.lti_message_hint });
    const who = q.login_hint === "teacher" ? { sub: "u-teacher", name: "Marta López", email: "marta.lopez@uni.test", roles: ["http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor"] }
      : { sub: "u-student", name: "Pau Serra", email: "pau.serra@uni.test", roles: ["http://purl.imsglobal.org/vocab/lis/v2/membership#Learner"] };
    const dl = q.lti_message_hint === "dl";
    const C = "https://purl.imsglobal.org/spec/lti/claim/";
    const payload = {
      iss: ISS, aud: CLIENT, sub: who.sub, nonce: q.nonce, name: who.name, email: who.email,
      [C + "message_type"]: dl ? "LtiDeepLinkingRequest" : "LtiResourceLinkRequest",
      [C + "version"]: "1.3.0", [C + "deployment_id"]: DEPLOY, [C + "roles"]: who.roles,
      [C + "target_link_uri"]: q.redirect_uri, [C + "context"]: { id: "course-7", title: "TFM 2026" },
      [C + "launch_presentation"]: { locale: "es" },
      ...(dl ? { "https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings": { deep_link_return_url: `${ISS}/mod/lti/contentitem_return.php`, accept_types: ["ltiResourceLink"], data: "opaque-123" } } : { [C + "resource_link"]: { id: "rl-1" } }),
    };
    const token = jwt.sign(payload, privateKey.export({ type: "pkcs8", format: "pem" }), { algorithm: "RS256", keyid: "moodle-k1", expiresIn: "5m" });
    res.setHeader("content-type", "text/html");
    return res.end(`<form id="f" method="post" action="${esc(q.redirect_uri)}"><input type="hidden" name="id_token" value="${esc(token)}"><input type="hidden" name="state" value="${esc(q.state)}"></form><script>document.getElementById("f").submit()</script>`);
  }
  if (u.pathname === "/mod/lti/contentitem_return.php" && req.method === "POST") {
    let body = ""; for await (const c of req) body += c;
    const JWT = new URLSearchParams(body).get("JWT");
    const dec = jwt.decode(JWT, { complete: true });
    const keys = await (await fetch(`${TOOL}/api/lti/jwks`)).json();
    const k = keys.keys.find((x) => x.kid === dec.header.kid);
    let ok = false, items = null, err = "";
    try { const pem = createPublicKey({ key: k, format: "jwk" }).export({ type: "spki", format: "pem" }); const p = jwt.verify(JWT, pem, { algorithms: ["RS256"], audience: ISS, issuer: CLIENT }); ok = true; items = p["https://purl.imsglobal.org/spec/lti-dl/claim/content_items"]; } catch (e) { err = e.message; }
    log("deep link response", { verified: ok, err, items, data: dec.payload["https://purl.imsglobal.org/spec/lti-dl/claim/data"] });
    res.setHeader("content-type", "text/html");
    return res.end(`<h1 id="dl-result">${ok ? "DEEP LINK OK: " + items.map((i) => i.title + " -> " + i.url).join(", ") : "DEEP LINK FAILED " + err}</h1>`);
  }
  res.statusCode = 404; res.end("nope");
}).listen(PORT, () => log("listening", ISS));
