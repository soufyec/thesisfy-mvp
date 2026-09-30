"use client";

import { fingerprint } from "./client";

export interface ConsentScopes {
  keystrokes: boolean;
  paste: boolean;
  aiInteractions: boolean;
  tabActivity: boolean;
  extensionActivity: boolean;
  extensionPromptText: boolean;
}

export interface MonitorFlag {
  id: string;
  type: string;
  severity: string;
  description: string;
}

interface QueuedEvent {
  type: string;
  data: Record<string, unknown>;
}

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
  private onFlags: (flags: MonitorFlag[]) => void;
  private onStats: (stats: Record<string, number>) => void;
  private ended = false;
  private visibilityHandler = () => {
    if (!this.scopes.tabActivity) return;
    this.push(document.hidden ? "tab_hidden" : "tab_visible", {});
  };
  private unloadHandler = () => this.end(true);

  constructor(sessionId: string, scopes: ConsentScopes, handlers: { onFlags?: (f: MonitorFlag[]) => void; onStats?: (s: Record<string, number>) => void } = {}) {
    this.sessionId = sessionId;
    this.scopes = scopes;
    this.onFlags = handlers.onFlags || (() => {});
    this.onStats = handlers.onStats || (() => {});
    this.flushTimer = setInterval(() => this.flush(), 5000);
    this.heartbeat = setInterval(() => fetch(`/api/sessions/${sessionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {}), 60000);
    document.addEventListener("visibilitychange", this.visibilityHandler);
    window.addEventListener("pagehide", this.unloadHandler);
  }

  private push(type: string, data: Record<string, unknown>) {
    if (this.ended) return;
    this.queue.push({ type, data });
  }

  /** Called on each editor transaction that changed the document by typing. */
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

  /** Paste: only size and a fingerprint leave the browser. Resolves with the server's attribution match, if any. */
  async recordPaste(text: string, attributed = false): Promise<{ provider?: string; host?: string } | null> {
    if (!this.scopes.paste) return null;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const fp = await fingerprint(text);
    this.push("paste", { words, chars: text.length, fingerprint: fp, attributed });
    const res = await this.flush();
    const match = res?.matches?.find((m) => m.fingerprint === fp)?.matchedExternal as { provider?: string; host?: string } | undefined;
    return match || null;
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

  async flush(): Promise<{ flags: MonitorFlag[]; matches?: Record<string, unknown>[]; session?: Record<string, number> } | null> {
    if (this.ended) return null;
    this.flushTyping();
    if (!this.queue.length) return null;
    const events = this.queue.splice(0, this.queue.length);
    try {
      const res = await fetch(`/api/sessions/${this.sessionId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events }) });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.flags?.length) this.onFlags(data.flags);
      if (data.session) this.onStats(data.session);
      return data;
    } catch {
      return null;
    }
  }

  updateScopes(scopes: ConsentScopes) {
    this.scopes = scopes;
  }

  end(beacon = false) {
    if (this.ended) return;
    this.flushTyping();
    this.ended = true;
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    document.removeEventListener("visibilitychange", this.visibilityHandler);
    window.removeEventListener("pagehide", this.unloadHandler);
    const events = this.queue.splice(0, this.queue.length);
    const url = `/api/sessions/${this.sessionId}`;
    if (beacon && navigator.sendBeacon) {
      if (events.length) navigator.sendBeacon(url, new Blob([JSON.stringify({ events })], { type: "application/json" }));
      // PATCH cannot be beaconed; the server closes stale sessions after 5 minutes without a heartbeat.
      return;
    }
    const finish = () => fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "end" }), keepalive: true }).catch(() => {});
    if (events.length) fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events }), keepalive: true }).catch(() => {}).finally(finish);
    else finish();
  }
}
