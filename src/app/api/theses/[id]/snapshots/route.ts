import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { canAccessThesis } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";
import { makeSnapshot, replaySnapshots, verifyChain } from "@/lib/process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_INTERVAL_MS = 3 * 60 * 1000;
const MIN_WORD_DELTA = 150;
const REPLAY_CAP = 200;

/**
 * GET ?tabId=submission            → { snapshots (metadata only), chain }
 * GET ?tabId=submission&replay=1   → { states: [{ at, text, wordCount }] } (last 200)
 * Owner, advisor and admin all see the same record.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error("Thesis not found", 404);
  const url = new URL(request.url);
  const tabId = (url.searchParams.get("tabId") || "submission").slice(0, 40);
  const list = db.snapshots.list(thesis.id, tabId);

  if (url.searchParams.get("replay") === "1") {
    const states = replaySnapshots(list)
      .slice(-REPLAY_CAP)
      .map((s) => ({ id: s.snapshotId, at: s.at, text: s.text, wordCount: s.wordCount, full: s.full }));
    return json({ states, chain: verifyChain(list), total: list.length });
  }

  return json({
    snapshots: list.map(({ html: _h, diff: _d, ...meta }) => ({ ...meta, full: _h !== undefined })),
    chain: verifyChain(list),
  });
}

/** POST { tabId, html, wordCount, provenance, sessionId? } → { snapshot } or { skipped: true }. Owner only. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const r = await requireUser(request);
  if ("response" in r) return r.response;
  const thesis = canAccessThesis(r.user, params.id);
  if (!thesis) return error("Thesis not found", 404);
  if (thesis.studentId !== r.user.id) return error("Only the author records snapshots", 403);

  const body = await request.json().catch(() => null);
  if (!body || typeof body.html !== "string") return error("html is required");
  if (body.html.length > 2_000_000) return error("Snapshot is too large");
  const tabId = typeof body.tabId === "string" && body.tabId.trim() ? body.tabId.trim().slice(0, 40) : "submission";
  const wordCount = Number.isFinite(Number(body.wordCount)) ? Math.max(0, Math.round(Number(body.wordCount))) : undefined;
  const p = body.provenance;
  const provenance = p && typeof p === "object" && ["human", "ai", "paste"].every((k) => Number.isFinite(Number(p[k]))) ? { human: Math.max(0, Math.round(Number(p.human))), ai: Math.max(0, Math.round(Number(p.ai))), paste: Math.max(0, Math.round(Number(p.paste))) } : undefined;
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
  if (sessionId) {
    const session = db.sessions.findById(sessionId);
    if (!session || session.thesisId !== thesis.id || session.userId !== r.user.id) return error("Session not found", 404);
  }

  const chain = db.snapshots.list(thesis.id, tabId);
  const last = chain[chain.length - 1];
  if (last) {
    const age = Date.now() - new Date(last.createdAt).getTime();
    const delta = Math.abs((wordCount ?? last.wordCount) - last.wordCount);
    if (age < MIN_INTERVAL_MS && delta < MIN_WORD_DELTA) return json({ skipped: true, reason: "throttled", nextAt: new Date(new Date(last.createdAt).getTime() + MIN_INTERVAL_MS).toISOString() });
  }

  const draft = makeSnapshot({ thesisId: thesis.id, tabId, userId: r.user.id, sessionId, html: body.html, wordCount, provenance }, chain);
  // Nothing changed since the last snapshot: do not lengthen the chain.
  if (last && draft.diff === "" && draft.wordCount === last.wordCount) return json({ skipped: true, reason: "unchanged" });
  const snapshot = db.snapshots.create(draft);
  const { html: _h, diff: _d, ...meta } = snapshot;
  return json({ snapshot: { ...meta, full: _h !== undefined }, chainLength: chain.length + 1 }, 201);
}
