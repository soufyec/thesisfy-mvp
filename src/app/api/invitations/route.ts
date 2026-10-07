import { NextRequest } from "next/server";
import { db, Role } from "@/lib/db";
import { error, json, requireUser } from "@/lib/api";
import { adminInvitation, deliverInvitation, INVITABLE_ROLES, isEmail, MAX_INVITES_PER_REQUEST, requestOrigin } from "@/lib/invitations";

/** Pending and accepted invitations of the admin's university (revoked ones are hidden). */
export async function GET(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  if (r.user.role !== "admin") return error("Forbidden", 403);
  const origin = requestOrigin(request);
  return json({ invitations: db.invitations.listByUniversity(r.user.university).map((i) => adminInvitation(i, origin)) });
}

/**
 * Creates invitation links for the admin's university. Body: `{ invites: [{ email, role }] }` (up to 500).
 * Addresses already registered or already holding an open invitation are returned in `skipped`, not re-invited.
 */
export async function POST(request: NextRequest) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  if (r.user.role !== "admin") return error("Forbidden", 403);
  const body = await request.json().catch(() => null);
  const invites: unknown = body?.invites;
  if (!Array.isArray(invites) || invites.length === 0) return error("invites must be a non-empty array");
  if (invites.length > MAX_INVITES_PER_REQUEST) return error(`At most ${MAX_INVITES_PER_REQUEST} invitations per request`);

  const skipped: { email: string; reason: "invalid" | "registered" | "invited" | "duplicate" | "role" }[] = [];
  const toCreate: { university: string; email: string; role: Role; invitedBy: string }[] = [];
  const seen: Record<string, true> = {};
  for (const raw of invites as { email?: unknown; role?: unknown }[]) {
    const email = typeof raw?.email === "string" ? raw.email.trim().toLowerCase() : "";
    const role = typeof raw?.role === "string" ? (raw.role as Role) : "student";
    if (!isEmail(email)) {
      skipped.push({ email: String(raw?.email ?? ""), reason: "invalid" });
      continue;
    }
    if (INVITABLE_ROLES.indexOf(role) === -1) {
      skipped.push({ email, reason: "role" });
      continue;
    }
    if (seen[email]) {
      skipped.push({ email, reason: "duplicate" });
      continue;
    }
    seen[email] = true;
    if (db.users.findByEmail(email)) {
      skipped.push({ email, reason: "registered" });
      continue;
    }
    if (db.invitations.findPendingByEmail(email)) {
      skipped.push({ email, reason: "invited" });
      continue;
    }
    toCreate.push({ university: r.user.university, email, role, invitedBy: r.user.id });
  }

  const origin = requestOrigin(request);
  const created = db.invitations.createMany(toCreate);
  const invitations = [];
  for (const inv of created) {
    const delivery = await deliverInvitation(inv, origin);
    invitations.push({ ...adminInvitation(inv, origin), link: delivery.link });
  }
  return json({ invitations, skipped }, 201);
}
