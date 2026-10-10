import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { error, json, requireUser } from "@/lib/api";
import { moodleDefaults, toolUrls } from "@/lib/lti";

export const dynamic = "force-dynamic";

const isUrl = (s: string) => /^https?:\/\/[^\s]+$/i.test(s);

function view(p: ReturnType<typeof db.lti.platforms.findById> & object) {
  return { ...p, linkedUsers: db.lti.links.listByPlatform(p.id).length };
}

/** Administrators: the registered Moodle sites of their university and the tool URLs to paste into Moodle. */
export async function GET(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  if (r.user.role !== "admin") return error("Only administrators manage integrations", 403);
  return json({ tool: toolUrls(request), platforms: db.lti.platforms.listByUniversity(r.user.university).map(view) });
}

/** Register a Moodle site. Either the four URLs, or just `siteUrl` and Moodle's standard endpoints are derived. */
export async function POST(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  if (r.user.role !== "admin") return error("Only administrators manage integrations", 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return error("Invalid body");
  const name = String(body.name || "").trim().slice(0, 120);
  const clientId = String(body.clientId || "").trim().slice(0, 200);
  const deploymentId = String(body.deploymentId || "").trim().slice(0, 200);
  const d = body.siteUrl ? moodleDefaults(String(body.siteUrl)) : { issuer: "", authLoginUrl: "", tokenUrl: "", jwksUrl: "" };
  const issuer = String(body.issuer || d.issuer).trim().replace(/\/+$/, "");
  const authLoginUrl = String(body.authLoginUrl || d.authLoginUrl).trim();
  const tokenUrl = String(body.tokenUrl || d.tokenUrl).trim();
  const jwksUrl = String(body.jwksUrl || d.jwksUrl).trim();
  if (!name) return json({ error: "Give the site a name.", code: "name" }, 400);
  if (!clientId) return json({ error: "The client ID comes from Moodle's tool configuration details.", code: "clientId" }, 400);
  if (!isUrl(issuer)) return json({ error: "The platform ID must be the Moodle site URL.", code: "issuer" }, 400);
  if (![authLoginUrl, tokenUrl, jwksUrl].every(isUrl)) return json({ error: "The three Moodle endpoints must be full URLs.", code: "urls" }, 400);
  if (db.lti.platforms.listByUniversity(r.user.university).some((p) => p.issuer === issuer && p.clientId === clientId)) return json({ error: "This site and client ID are already registered.", code: "duplicate" }, 409);
  const p = db.lti.platforms.create({ university: r.user.university, name, issuer, clientId, deploymentIds: deploymentId ? [deploymentId] : [], authLoginUrl, tokenUrl, jwksUrl, createdBy: r.user.id });
  return json({ platform: view(p) }, 201);
}
