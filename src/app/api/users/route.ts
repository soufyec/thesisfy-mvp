import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { error, json, requireStaff } from "@/lib/api";

export async function GET(request: NextRequest) {
  const r = requireStaff(request);
  if ("response" in r) return r.response;
  const users = db.users.getByUniversity(r.user.university);
  const students = users
    .filter((u) => u.role === "student")
    .map((u) => {
      const theses = db.theses.getByStudent(u.id);
      const flags = theses.flatMap((t) => db.flags.listByThesis(t.id));
      const sessions = theses.flatMap((t) => t.sessions);
      return {
        ...u,
        theses: theses.length,
        avgIntegrity: theses.length ? Math.round(theses.reduce((s, t) => s + t.integrityScore, 0) / theses.length) : 100,
        avgAiUsage: theses.length ? Math.round(theses.reduce((s, t) => s + t.aiUsagePercent, 0) / theses.length) : 0,
        openFlags: flags.filter((f) => !f.resolved).length,
        sessions: sessions.length,
        connections: db.connections.listByUser(u.id).map((c) => c.provider),
        consent: !!db.consents.latest(u.id),
        activeNow: sessions.some((s) => !s.endedAt && Date.now() - new Date(s.lastHeartbeatAt).getTime() < 5 * 60 * 1000),
      };
    });
  return json({ students, professors: users.filter((u) => u.role === "professor") });
}

/** Invite (create) a student account. Returns a temporary password once. */
export async function POST(request: NextRequest) {
  const r = requireStaff(request);
  if ("response" in r) return r.response;
  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.name) return error("name and email are required");
  if (db.users.findByEmail(body.email)) return error("User already exists");
  const temp = Math.random().toString(36).slice(2, 10);
  const user = db.users.create({
    email: body.email.toLowerCase(),
    password: await bcrypt.hash(temp, 10),
    name: body.name,
    role: body.role === "professor" && r.user.role === "admin" ? "professor" : "student",
    university: r.user.university,
    avatar: body.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase(),
  });
  db.notifications.create({ userId: user.id, title: "Welcome to Thesisfy", message: `${r.user.name} invited you to ${r.user.university}'s Thesisfy workspace.`, type: "info" });
  return json({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, temporaryPassword: temp }, 201);
}
