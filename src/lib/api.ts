import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, isStaff } from "./auth";
import { User } from "./db";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export function requireUser(request: NextRequest): { user: User } | { response: NextResponse } {
  const user = getSessionUser(request);
  if (!user) return { response: error("Not authenticated", 401) };
  return { user };
}

export function requireStaff(request: NextRequest): { user: User } | { response: NextResponse } {
  const r = requireUser(request);
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
