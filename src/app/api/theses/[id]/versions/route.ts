import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { canAccessThesis } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error("Thesis not found", 404);
  const versions = db.versions.list(thesis.id).map(({ content: _c, ...v }) => ({ ...v, authorName: db.users.findById(v.authorId)?.name || "Unknown" }));
  return json({ versions });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error("Thesis not found", 404);
  const body = await request.json().catch(() => ({}));
  const v = db.versions.create({ thesisId: thesis.id, authorId: r.user.id, content: thesis.content, wordCount: thesis.wordCount, kind: "manual", label: body.label || "Named version" });
  return json({ version: { ...v, content: undefined } }, 201);
}
