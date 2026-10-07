import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { error, json, requireUser } from "@/lib/api";
import { invitationStatus } from "@/lib/invitations";

/** Public: what the invite page needs to render. No ids, no inviter, nothing beyond email, university and role. */
export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  await db.ready();
  const inv = db.invitations.findByToken(params.token);
  if (!inv || inv.revokedAt) return error("Invitation not found", 404);
  const status = invitationStatus(inv);
  return json({ email: inv.email, university: inv.university, role: inv.role, expired: status === "expired", accepted: status === "accepted" });
}

/** Admin of the same university: revokes an invitation by id (the segment is the id here, not the token). */
export async function DELETE(request: NextRequest, { params }: { params: { token: string } }) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  if (r.user.role !== "admin") return error("Forbidden", 403);
  const inv = db.invitations.findById(params.token);
  if (!inv || inv.university !== r.user.university) return error("Invitation not found", 404);
  if (inv.acceptedAt) return error("Invitation already accepted", 409);
  db.invitations.revoke(inv.id);
  return json({ ok: true });
}
