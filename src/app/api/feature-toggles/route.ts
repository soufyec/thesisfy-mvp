import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  return NextResponse.json({ features: db.featureToggles.getAll() });
}

export async function PUT(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const user = db.users.findById(payload.userId);
  if (!user || (user.role !== "admin" && user.role !== "professor")) {
    return NextResponse.json({ error: "Only admins can manage features" }, { status: 403 });
  }

  const body = await request.json();
  const { id, enabled } = body;
  if (!id || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "id and enabled required" }, { status: 400 });
  }

  const updated = db.featureToggles.toggle(id, enabled);
  if (!updated) return NextResponse.json({ error: "Feature not found" }, { status: 404 });

  return NextResponse.json({ feature: updated });
}
