import { NextRequest, NextResponse } from "next/server";
import { error, json } from "@/lib/api";
import { checkTeamPassword, TEAM_COOKIE, TEAM_COOKIE_MAX_AGE, teamConfigured, teamCookieValue } from "@/lib/team";

/** Team sign-in with the shared TEAM_PASSWORD: sets the team cookie. Slowed down against guessing. */
let attempts = 0;
let attemptsSince = 0;

export async function POST(request: NextRequest) {
  if (!teamConfigured()) return error("TEAM_PASSWORD is not configured", 503);
  const t = Date.now();
  if (t - attemptsSince > 60_000) {
    attemptsSince = t;
    attempts = 0;
  }
  if (++attempts > 10) return error("Too many attempts, wait a minute", 429);
  const body = await request.json().catch(() => null);
  const password = body && typeof body.password === "string" ? body.password : "";
  if (!checkTeamPassword(password)) return error("Wrong password", 401);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(TEAM_COOKIE, teamCookieValue(), { path: "/", maxAge: TEAM_COOKIE_MAX_AGE, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  return res;
}

export async function DELETE() {
  const res = json({ ok: true });
  res.cookies.set(TEAM_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
