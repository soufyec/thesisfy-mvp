import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

/**
 * Team access to the questionnaire results and to questionnaire editing: one shared password (`TEAM_PASSWORD`),
 * never in code. The cookie holds an HMAC of a fixed label under the password, so it is stateless and stops
 * working the moment the password changes. Unset password → no team access at all.
 */
export const TEAM_COOKIE = "team";
export const TEAM_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function password() {
  return process.env.TEAM_PASSWORD || "";
}

export function teamConfigured() {
  return password().length > 0;
}

export function teamCookieValue(): string {
  return createHmac("sha256", password()).update("thesisfic-team-session").digest("hex");
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function checkTeamPassword(candidate: string): boolean {
  return teamConfigured() && safeEqual(candidate, password());
}

export function isTeamCookie(value: string | undefined): boolean {
  return !!value && teamConfigured() && safeEqual(value, teamCookieValue());
}

export function isTeamRequest(request: NextRequest): boolean {
  return isTeamCookie(request.cookies.get(TEAM_COOKIE)?.value);
}
