import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { error, json, requireUser } from "@/lib/api";
import { parseDatabase } from "@/lib/library";

function own(request: NextRequest, id: string) {
  const r = requireUser(request);
  if ("response" in r) return r;
  const d = db.library.findById(id);
  if (!d || d.university !== r.user.university) return { response: error("Database not found", 404) };
  return { user: r.user, d };
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const o = own(request, params.id);
  if ("response" in o) return o.response;
  if (o.user.role !== "admin") return error("Only administrators can manage research databases", 403);
  const body = await request.json().catch(() => null);
  if (!body) return error("Invalid body");
  const parsed = parseDatabase({ ...o.d, ...body });
  if ("error" in parsed) return error(parsed.error!);
  return json({ database: db.library.update(o.d.id, parsed.data!) });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const o = own(request, params.id);
  if ("response" in o) return o.response;
  if (o.user.role !== "admin") return error("Only administrators can manage research databases", 403);
  db.library.remove(o.d.id);
  return json({ success: true });
}

/** Click-through counter so the library can see which subscriptions students actually use. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const o = own(request, params.id);
  if ("response" in o) return o.response;
  db.library.recordOpen(o.d.id);
  return json({ ok: true });
}
