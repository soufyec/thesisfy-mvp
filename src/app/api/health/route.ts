import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health → { ok, store: "postgres" | "file" | "memory", version? } — no data, safe to expose. */
export async function GET() {
  await db.ready();
  const store = db.storeConfigured ? "postgres" : process.env.DATA_FILE ? "file" : "memory";
  return NextResponse.json({ ok: true, store, version: db.storeVersion() ?? null, users: db.raw().users.length });
}
