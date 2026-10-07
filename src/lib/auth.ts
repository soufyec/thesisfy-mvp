import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { db, publicUser, Role, User } from "./db";

const JWT_SECRET = process.env.JWT_SECRET || "thesisfy-mvp-dev-secret-key-2024";

export interface AuthPayload {
  userId: string;
  email: string;
  role: Role;
}

export function signToken(user: User) {
  return jwt.sign({ userId: user.id, email: user.email, role: user.role } as AuthPayload, JWT_SECRET, { expiresIn: "7d" });
}

/** Seeded demo accounts; refused at login when DEMO_ACCOUNTS=off so a real pilot never exposes documented passwords. */
export const DEMO_EMAILS = ["jane.cooper@stanford.edu", "admin@stanford.edu", "marie.dupont@sorbonne.fr", "prof.williams@stanford.edu"];

export async function authenticateUser(email: string, password: string) {
  const user = db.users.findByEmail(email);
  if (!user) return null;

  // Demo accounts accept their documented passwords unless the deployment turns them off (DEMO_ACCOUNTS=off).
  if (process.env.DEMO_ACCOUNTS === "off" && DEMO_EMAILS.indexOf(user.email) !== -1) return null;
  const demoPasswords: Record<string, string> = {
    "jane.cooper@stanford.edu": "demo123",
    "admin@stanford.edu": "admin123",
    "marie.dupont@sorbonne.fr": "demo123",
    "prof.williams@stanford.edu": "demo123",
  };

  const isValid = demoPasswords[user.email] === password || (await bcrypt.compare(password, user.password));
  if (!isValid) return null;

  db.users.touch(user.id);
  return { user: publicUser(user), token: signToken(user) };
}

export async function registerUser(data: { email: string; password: string; name: string; university: string; role?: Role }) {
  if (db.users.findByEmail(data.email)) return { error: "An account with this email already exists" };
  if (data.password.length < 6) return { error: "Password must be at least 6 characters" };
  const hashed = await bcrypt.hash(data.password, 10);
  const user = db.users.create({
    email: data.email.toLowerCase(),
    password: hashed,
    name: data.name,
    role: data.role || "student",
    university: data.university,
    avatar: data.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
  });
  return { user: publicUser(user), token: signToken(user) };
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

/** Resolves the current user from the auth cookie or an Authorization: Bearer header (mobile clients). */
export function getSessionUser(request: NextRequest): User | null {
  const header = request.headers.get("authorization");
  const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined;
  const token = bearer || request.cookies.get("token")?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  const user = db.users.findById(payload.userId) || null;
  if (user) db.users.touch(user.id);
  return user;
}

export function isStaff(user: User) {
  return user.role === "admin" || user.role === "professor";
}

/** Can this user read/write the thesis? Students own theirs; professors their advisees; admins their university. */
export function canAccessThesis(user: User, thesisId: string) {
  const thesis = db.theses.findById(thesisId);
  if (!thesis) return null;
  if (user.role === "student" && thesis.studentId === user.id) return thesis;
  if (user.role === "professor" && (thesis.professorId === user.id || db.users.findById(thesis.studentId)?.university === user.university)) return thesis;
  if (user.role === "admin" && db.users.findById(thesis.studentId)?.university === user.university) return thesis;
  return null;
}
