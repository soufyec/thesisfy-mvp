import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { error, json, requireUser } from "@/lib/api";
import { requestOrigin, resetLink } from "@/lib/invitations";

/** Admin of the same university: issues a 48-hour password reset link for this user. Copied and sent by hand. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  if (r.user.role !== "admin") return error("Forbidden", 403);
  const target = db.users.findById(params.id);
  if (!target || target.university !== r.user.university) return error("User not found", 404);
  const reset = db.passwordResets.create(target.id);
  return json({ link: resetLink(requestOrigin(request), reset.token), expiresAt: reset.expiresAt }, 201);
}
