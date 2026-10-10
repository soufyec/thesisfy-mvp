import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolJwks } from "@/lib/lti";

export const dynamic = "force-dynamic";

/** The tool's public keys. Moodle fetches them to verify our deep-linking responses and service tokens. */
export async function GET() {
  await db.ready();
  return NextResponse.json(toolJwks(), { headers: { "cache-control": "public, max-age=300" } });
}
