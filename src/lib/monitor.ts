"use client";

export interface PasteMatch {
  kind: "assistant" | "source";
  provider?: string;
  /** Source-library match */
  sourceId?: string;
  title?: string;
  authors?: string;
  year?: string;
  page?: number;
  model?: string;
  mode?: string;
  interactionId?: string;
  /** Share of the pasted sentences that came from the assistant (0-1). */
  share?: number;
  at?: string;
}

import { fingerprint, passages } from "./client";

export interface ConsentScopes {
  keystrokes: boolean;
  paste: boolean;
  aiInteractions: boolean;
  tabActivity: boolean;
}

export interface MonitorFlag {
  id: string;
  type: string;
  severity: string;
  description: string;
}

/** Metrics the server recomputes after an event; the editor shows them in the pill and the ledger alike. */
export interface MonitorMetrics {
  integrityScore: number;
  aiUsagePercent: number;
  integrityBreakdown?: unknown;
}

/**
 * What the student said about a paste. `pending` is the dialog still open (the paste is recorded, nothing is
 * judged yet); `none` is a paste that was never declared (dialog dismissed, or too short for the dialog).
 */
export type PasteAttribution = "own" | "source" | "ai" | "none" | "pending";

export interface MonitorHandlers {
  onFlags?: (f: MonitorFlag[]) => void;
  onStats?: (s: Record<string, number>) => void;
  onMetrics?: (m: MonitorMetrics) => void;
}

interface QueuedEvent {
  type: string;
  data: Record<string, unknown>;
}

interface SessionResponse {
  flags: MonitorFlag[];
  matches?: Record<string, unknown>[];
  session?: Record<string, number>;
  metrics?: MonitorMetrics;
}

const HEARTBEAT_MS = 60000;

/**
 * Client-side writing-session monitor. Batches events (counts, timings, fingerprints — never the text
 * itself) and sends them to the session endpoint. Honors the student's consent scopes locally as well.
 */
export class SessionMonitor {
  readonly sessionId: string;
  private scopes: ConsentScopes;
  private queue: QueuedEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private typing = { keystrokes: 0, words: 0, windowStart: Date.now(), lastKey: 0 };
  private handlers: MonitorHandlers;
  ended = false;
  private visibilityHandler = () => {
    if (!document.hidden) this.sendHeartbeat();
    if (!this.scopes.tabActivity) return;
    this.push(document.hidden ? "tab_hidden" : "tab_visible", {});
  };
  private unloadHandler = () => this.end();

  constructor(sessionId: string, scopes: ConsentScopes, handlers: MonitorHandlers = {}) {
    this.sessionId = sessionId;
    this.scopes = scopes;
    this.handlers = handlers;
    this.flushTimer = setInterval(() => this.flush(), 5000);
    // One heartbeat a minute while the tab is visible: "minutes in the editor" is startedAt → last heartbeat.
    this.heartbeat = setInterval(() => { if (!document.hidden) this.sendHeartbeat(); }, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", this.visibilityHandler);
    window.addEventListener("pagehide", this.unloadHandler);
  }

  /** Rebinds the callbacks (a remounted editor reusing this session passes its own setters). */
  setHandlers(handlers: MonitorHandlers) {
    this.handlers = handlers;
  }

  private sendHeartbeat() {
    if (this.ended) return;
    fetch(`/api/sessions/${this.sessionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
  }

  private push(type: string, data: Record<string, unknown>) {
    if (this.ended) return;
    this.queue.push({ type, data });
  }

  /** Called on each editor transaction that changed the document by typing (never for pastes or commands). */
  recordTyping(charDelta: number, wordDelta: number) {
    if (!this.scopes.keystrokes) return;
    const now = Date.now();
    if (now - this.typing.windowStart > 10000) this.flushTyping();
    this.typing.keystrokes += Math.max(1, Math.abs(charDelta));
    this.typing.words += Math.max(0, wordDelta);
    this.typing.lastKey = now;
  }

  private flushTyping() {
    const t = this.typing;
    if (t.keystrokes > 0) {
      const minutes = Math.max(0.05, (Date.now() - t.windowStart) / 60000);
      this.push("typing", { keystrokes: t.keystrokes, words: t.words, wpm: Math.round(t.words / minutes) });
    }
    this.typing = { keystrokes: 0, words: 0, windowStart: Date.now(), lastKey: 0 };
  }

  /**
   * Paste: only sizes and fingerprints (whole text, paragraphs, sentences) leave the browser.
   * Resolves with the server's attribution when the text came from a Thesisfic assistant answer or a library source.
   * With `attribution: "pending"` the paste is recorded but not judged until `declarePaste` says what it was.
   */
  async recordPaste(text: string, attribution: PasteAttribution = "none"): Promise<{ fingerprint: string | null; match: PasteMatch | null }> {
    if (!this.scopes.paste) return { fingerprint: null, match: null };
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const fp = await fingerprint(text);
    const parts = passages(text);
    const fingerprints = Array.from(new Set([fp, ...(await Promise.all(parts.map(fingerprint)))]));
    // Sent in its own request so the attribution answer cannot be lost to a concurrent timed flush.
    this.flushTyping();
    const res = await this.send([{ type: "paste", data: { words, chars: text.length, fingerprint: fp, fingerprints, attribution } }]);
    const ev = res?.matches?.find((m) => m.fingerprint === fp) as { matchedAi?: PasteMatch; matchedSource?: PasteMatch } | undefined;
    return { fingerprint: fp, match: ev?.matchedAi || ev?.matchedSource || null };
  }

  /** Completes a pending paste with the student's declaration; the server judges it only now. */
  async declarePaste(fp: string | null, attribution: Exclude<PasteAttribution, "pending">, label?: string) {
    if (!this.scopes.paste || !fp) return null;
    this.flushTyping();
    return this.send([{ type: "paste", data: { fingerprint: fp, declared: true, attribution, label: label || undefined } }]);
  }

  recordAiInsert(words: number, provider: string, mode: string, interactionId?: string) {
    if (!this.scopes.aiInteractions) return;
    this.push("ai_insert", { words, provider, mode, interactionId });
    this.flush();
  }

  recordAiRejected(provider: string, mode: string) {
    if (!this.scopes.aiInteractions) return;
    this.push("ai_suggestion_rejected", { provider, mode });
  }

  async flush(): Promise<SessionResponse | null> {
    if (this.ended) return null;
    this.flushTyping();
    if (!this.queue.length) return null;
    return this.send(this.queue.splice(0, this.queue.length));
  }

  private async send(events: QueuedEvent[]): Promise<SessionResponse | null> {
    if (this.ended) return null;
    try {
      const res = await fetch(`/api/sessions/${this.sessionId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events }) });
      if (!res.ok) return null;
      const data = (await res.json()) as SessionResponse;
      if (data.flags?.length) this.handlers.onFlags?.(data.flags);
      if (data.session) this.handlers.onStats?.(data.session);
      if (data.metrics) this.handlers.onMetrics?.(data.metrics);
      return data;
    } catch {
      return null;
    }
  }

  updateScopes(scopes: ConsentScopes) {
    this.scopes = scopes;
  }

  end() {
    if (this.ended) return;
    this.flushTyping();
    this.ended = true;
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    document.removeEventListener("visibilitychange", this.visibilityHandler);
    window.removeEventListener("pagehide", this.unloadHandler);
    const events = this.queue.splice(0, this.queue.length);
    const url = `/api/sessions/${this.sessionId}`;
    // keepalive lets both requests outlive the page on pagehide; the server also closes sessions after 5 min without a heartbeat.
    const finish = () => fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "end" }), keepalive: true }).catch(() => {});
    if (events.length) fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events }), keepalive: true }).catch(() => {}).finally(finish);
    else finish();
  }
}

// ---------- one session per open editor ----------

interface PoolEntry {
  monitor: SessionMonitor | null;
  starting: Promise<SessionMonitor | null> | null;
  releaseTimer: ReturnType<typeof setTimeout> | null;
  released: boolean;
}

const pool = new Map<string, PoolEntry>();
/** A remount within this window (React strict mode, a fast back-and-forth) reuses the open session instead of starting another. */
const REUSE_GRACE_MS = 10000;

/**
 * Returns the monitor for `key` (one per thesis per browser tab), starting a session only when none is open or
 * being opened. Concurrent calls share the same start request, so a double mount never creates two sessions.
 */
export function acquireSessionMonitor(key: string, start: () => Promise<SessionMonitor | null>, handlers?: MonitorHandlers): Promise<SessionMonitor | null> {
  let entry = pool.get(key);
  if (entry) {
    entry.released = false;
    if (entry.releaseTimer) { clearTimeout(entry.releaseTimer); entry.releaseTimer = null; }
    if (entry.monitor && !entry.monitor.ended) {
      if (handlers) entry.monitor.setHandlers(handlers);
      return Promise.resolve(entry.monitor);
    }
    if (entry.starting) return entry.starting.then((m) => { if (m && handlers) m.setHandlers(handlers); return m; });
  }
  entry = { monitor: null, starting: null, releaseTimer: null, released: false };
  pool.set(key, entry);
  const e = entry;
  e.starting = start()
    .then((m) => {
      e.monitor = m;
      e.starting = null;
      if (!m) pool.delete(key);
      else if (e.released) scheduleRelease(key, e);
      return m;
    })
    .catch((err) => {
      pool.delete(key);
      throw err;
    });
  return e.starting;
}

function scheduleRelease(key: string, e: PoolEntry) {
  if (e.releaseTimer) clearTimeout(e.releaseTimer);
  e.releaseTimer = setTimeout(() => {
    if (!e.released) return;
    e.monitor?.end();
    if (pool.get(key) === e) pool.delete(key);
  }, REUSE_GRACE_MS);
}

/** The editor unmounted: the session ends after a short grace unless the editor comes back first. */
export function releaseSessionMonitor(key: string) {
  const e = pool.get(key);
  if (!e) return;
  e.released = true;
  if (e.monitor) scheduleRelease(key, e);
}
