import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { canAccessThesis } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";
import { refreshThesisMetrics } from "@/lib/integrity";

export async function GET(request: NextRequest, { params }: { params: { id: string; versionId: string } }) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  if (!canAccessThesis(r.user, params.id)) return error("Thesis not found", 404);
  const v = db.versions.findById(params.versionId);
  if (!v || v.thesisId !== params.id) return error("Version not found", 404);
  return json({ version: v });
}

/** Restore: the current content is snapshotted first, then replaced by the version. */
export async function POST(request: NextRequest, { params }: { params: { id: string; versionId: string } }) {
  const r = requireUser(request);
  if ("response" in r) return r.response;
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error("Thesis not found", 404);
  if (thesis.studentId !== r.user.id) return error("Only the author can restore versions", 403);
  const v = db.versions.findById(params.versionId);
  if (!v || v.thesisId !== params.id) return error("Version not found", 404);
  db.versions.create({ thesisId: thesis.id, authorId: r.user.id, content: thesis.content, wordCount: thesis.wordCount, kind: "restore", label: "Before restore" });
  db.theses.update(thesis.id, { content: v.content });
  refreshThesisMetrics(thesis.id);
  return json({ thesis: { ...db.theses.findById(thesis.id), sessions: undefined, tabs: undefined } });
}
