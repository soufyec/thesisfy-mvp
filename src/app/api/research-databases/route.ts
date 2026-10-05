import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { parseDatabase } from "@/lib/library";
import { error, json, requireUser } from "@/lib/api";

export async function GET(request: NextRequest) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const uni = r.user.university;
  const list = db.library.list(uni).map((d) => (r.user.role === "student" ? { ...d, opens: undefined } : d));
  return json({ databases: list, settings: db.library.settings(uni), university: uni, canManage: r.user.role === "admin" });
}

export async function POST(request: NextRequest) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  if (r.user.role !== "admin") return error("Only administrators can manage research databases", 403);
  const body = await request.json().catch(() => null);
  if (!body) return error("Invalid body");
  if (body.settings && typeof body.settings === "object") {
    const s = body.settings;
    const proxyPrefix = String(s.proxyPrefix || "").trim();
    if (proxyPrefix && !/^https?:\/\//i.test(proxyPrefix)) return error("The proxy prefix must start with https://");
    const helpUrl = String(s.helpUrl || "").trim();
    if (helpUrl && !/^https?:\/\//i.test(helpUrl)) return error("The help link must start with https://");
    const settings = db.library.updateSettings(r.user.university, { proxyPrefix: proxyPrefix || undefined, intro: String(s.intro || "").slice(0, 600) || undefined, helpEmail: String(s.helpEmail || "").trim().slice(0, 120) || undefined, helpUrl: helpUrl || undefined });
    return json({ settings });
  }
  const parsed = parseDatabase(body);
  if ("error" in parsed) return error(parsed.error!);
  const d = db.library.create({ ...parsed.data!, university: r.user.university });
  return json({ database: d }, 201);
}
