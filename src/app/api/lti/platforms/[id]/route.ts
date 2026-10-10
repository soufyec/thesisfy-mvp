import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { error, json, requireUser } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Remove a Moodle site; its user links go with it (the accounts stay). */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  if (r.user.role !== "admin") return error("Only administrators manage integrations", 403);
  const p = db.lti.platforms.findById(params.id);
  if (!p || p.university !== r.user.university) return error("Not found", 404);
  db.lti.platforms.remove(p.id);
  return json({ ok: true });
}
