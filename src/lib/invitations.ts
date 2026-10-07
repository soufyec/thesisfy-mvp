import { NextRequest } from "next/server";
import type { Invitation, Role } from "./db";

export const INVITABLE_ROLES: Role[] = ["student", "professor", "admin"];
export const MAX_INVITES_PER_REQUEST = 500;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (s: string) => EMAIL_RE.test(s);

/** Public origin of this deployment, honouring the proxy headers Vercel and most reverse proxies set. */
export function requestOrigin(request: NextRequest) {
  const proto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host;
  return `${proto}://${host}`;
}

export const invitationLink = (origin: string, token: string) => `${origin}/invite/${token}`;
export const resetLink = (origin: string, token: string) => `${origin}/reset/${token}`;

export type InvitationStatus = "pending" | "accepted" | "expired";

export function invitationStatus(inv: Invitation, at = Date.now()): InvitationStatus {
  if (inv.acceptedAt) return "accepted";
  if (Date.parse(inv.expiresAt) <= at) return "expired";
  return "pending";
}

/** What the admin UI sees: everything but the raw token; the link is included only while it can still be used. */
export function adminInvitation(inv: Invitation, origin: string) {
  const { token, ...rest } = inv;
  const status = invitationStatus(inv);
  return { ...rest, status, link: status === "pending" ? invitationLink(origin, token) : undefined };
}

/**
 * Hands an invitation to the person. There is no email provider yet, so delivery means returning the link for the
 * admin to copy and send by hand. When a provider is added, send here and keep returning the link as a fallback.
 */
export async function deliverInvitation(inv: Invitation, origin: string): Promise<{ link: string; delivered: "manual" }> {
  return { link: invitationLink(origin, inv.token), delivered: "manual" };
}
