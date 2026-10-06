"use client";

// Client helper that records a hash-chained snapshot after a successful save.
// Throttled here too (3 minutes or 150 words), so the server rarely has to answer `skipped`.

import { useCallback, useRef } from "react";
import { api } from "@/lib/client";

export const SNAPSHOT_MIN_INTERVAL_MS = 3 * 60 * 1000;
export const SNAPSHOT_MIN_WORD_DELTA = 150;

export interface SnapshotPayload {
  tabId: string;
  html: string;
  wordCount: number;
  provenance: { human: number; ai: number; paste: number };
  sessionId?: string | null;
}

export interface SnapshotMeta {
  id: string;
  tabId: string;
  wordCount: number;
  hash: string;
  prevHash?: string;
  createdAt: string;
  full: boolean;
}

export type SnapshotResult = { skipped: true; reason: string; nextAt?: string } | { skipped: false; snapshot: SnapshotMeta; chainLength: number };

const lastSent = new Map<string, { at: number; words: number }>();

/**
 * Records a snapshot of a tab unless one was sent less than 3 minutes ago with fewer than 150 words of change.
 * Resolves to null on a network or permission error; it never throws so the save path is not affected.
 */
export async function recordSnapshot(thesisId: string, p: SnapshotPayload, opts: { force?: boolean } = {}): Promise<SnapshotResult | null> {
  const key = `${thesisId}:${p.tabId}`;
  const prev = lastSent.get(key);
  if (!opts.force && prev && Date.now() - prev.at < SNAPSHOT_MIN_INTERVAL_MS && Math.abs(p.wordCount - prev.words) < SNAPSHOT_MIN_WORD_DELTA) {
    return { skipped: true, reason: "client-throttled", nextAt: new Date(prev.at + SNAPSHOT_MIN_INTERVAL_MS).toISOString() };
  }
  try {
    const res = await api<{ skipped?: boolean; reason?: string; nextAt?: string; snapshot?: SnapshotMeta; chainLength?: number }>(`/api/theses/${thesisId}/snapshots`, {
      method: "POST",
      json: { tabId: p.tabId, html: p.html, wordCount: p.wordCount, provenance: p.provenance, sessionId: p.sessionId || undefined },
    });
    if (res.skipped) {
      // The server has a fresher snapshot than we knew about: align the local throttle with it.
      lastSent.set(key, { at: Date.now(), words: p.wordCount });
      return { skipped: true, reason: res.reason || "throttled", nextAt: res.nextAt };
    }
    lastSent.set(key, { at: Date.now(), words: p.wordCount });
    return res.snapshot ? { skipped: false, snapshot: res.snapshot, chainLength: res.chainLength || 0 } : null;
  } catch {
    return null;
  }
}

/** Hook form: `const { record } = useSnapshots(thesisId); record({ tabId, html, wordCount, provenance, sessionId })`. */
export function useSnapshots(thesisId: string) {
  const pending = useRef<Promise<SnapshotResult | null> | null>(null);
  const record = useCallback(
    (p: SnapshotPayload, opts?: { force?: boolean }) => {
      // One request in flight at a time; a save that lands during a request is folded into the next one.
      if (pending.current) return pending.current;
      const run = recordSnapshot(thesisId, p, opts).finally(() => {
        pending.current = null;
      });
      pending.current = run;
      return run;
    },
    [thesisId]
  );
  return { record };
}
