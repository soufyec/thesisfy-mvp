import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { db } from "./db";

const JWT_SECRET = process.env.JWT_SECRET || "thesisfy-mvp-dev-secret-key-2024";

export interface AuthPayload {
  userId: string;
  email: string;
  role: string;
}

export async function authenticateUser(email: string, password: string) {
  const user = db.users.findByEmail(email);
  if (!user) return null;

  // For demo: accept demo passwords directly
  const demoPasswords: Record<string, string> = {
    "jane.cooper@stanford.edu": "demo123",
    "admin@stanford.edu": "admin123",
    "marie.dupont@sorbonne.fr": "demo123",
    "prof.williams@stanford.edu": "demo123",
  };

  const isValid = demoPasswords[email] === password || await bcrypt.compare(password, user.password);
  if (!isValid) return null;

  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role } as AuthPayload,
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  const { password: _, ...userWithoutPassword } = user;
  return { user: userWithoutPassword, token };
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}
