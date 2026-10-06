import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, isStaff } from "./auth";
import { db, User } from "./db";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function requireUser(request: NextRequest): Promise<{ user: User } | { response: NextResponse }> {
  await db.ready();
  const user = getSessionUser(request);
  if (!user) return { response: error("Not authenticated", 401) };
  return { user };
}

export async function requireStaff(request: NextRequest): Promise<{ user: User } | { response: NextResponse }> {
  const r = await requireUser(request);
  if ("response" in r) return r;
  if (!isStaff(r.user)) return { response: error("Forbidden", 403) };
  return r;
}

export function deviceFromUA(ua: string | null): "desktop" | "mobile" | "tablet" {
  if (!ua) return "desktop";
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone/i.test(ua)) return "mobile";
  return "desktop";
}
