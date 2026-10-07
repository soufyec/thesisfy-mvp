import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { registerUser } from "@/lib/auth";
import { getLocale } from "@/lib/i18n/server";

export async function POST(request: NextRequest) {
  await db.ready();
  try {
    const { email, password, name, university } = await request.json();
    if (!email || !password || !name || !university) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }
    const result = await registerUser({ email, password, name, university, language: getLocale() });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

    const response = NextResponse.json({ user: result.user, token: result.token });
    response.cookies.set("token", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
