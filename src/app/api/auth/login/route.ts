import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  await db.ready();
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required", code: "missing_fields" }, { status: 400 });
    }

    const result = await authenticateUser(email, password);
    if (!result) {
      // `code` lets the client translate the message; `error` stays for older clients.
      return NextResponse.json({ error: "Invalid credentials", code: "invalid_credentials" }, { status: 401 });
    }

    const response = NextResponse.json({ user: result.user, token: result.token });
    response.cookies.set("token", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
