import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseToken, setUserRole } from "@/lib/auth";
import { getDatabase } from "@/lib/firestore";
import { isFirebaseAdminConfigured } from "@/lib/firebase-admin";

// POST /api/auth/firebase - Exchange Firebase ID token for a session
export async function POST(request: NextRequest) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Firebase is not configured" },
      { status: 501 }
    );
  }

  try {
    const { idToken, displayName, photoURL } = await request.json();

    if (!idToken) {
      return NextResponse.json({ error: "idToken is required" }, { status: 400 });
    }

    const payload = await verifyFirebaseToken(idToken);
    if (!payload) {
      return NextResponse.json({ error: "Invalid Firebase token" }, { status: 401 });
    }

    const db = getDatabase();

    // Check if user exists in Firestore
    let user = await db.users.findByEmail(payload.email);

    if (!user) {
      // Create new user in Firestore
      const newUser = {
        id: payload.userId,
        email: payload.email,
        password: "", // No password needed for Firebase Auth users
        name: displayName || payload.email.split("@")[0],
        role: "student" as const,
        university: "",
        avatar: displayName ? displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) : "U",
        createdAt: new Date().toISOString(),
        photoURL: photoURL || undefined,
      };
      await db.users.create(newUser);
      user = newUser;

      // Set default role in Firebase custom claims
      await setUserRole(payload.userId, "student");
    }

    // Set the Firebase token as a session cookie
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        university: user.university,
        avatar: user.avatar,
      },
      success: true,
    });

    // Store the Firebase ID token as session cookie
    response.cookies.set("token", idToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Firebase auth error:", error);
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}
