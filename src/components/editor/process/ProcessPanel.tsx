"use client";

// Writing process panel: session timeline, per-chapter provenance, snapshot replay and the AI-use declaration.
// The student and the advisor render the same component over the same data; `isOwner` only adds the
// generate / edit / sign actions. Nothing here estimates anything: every marker is a logged event.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, ClipboardPaste, Download, FileSignature, History, Link2, ShieldCheck, Sparkles } from "lucide-react";
import { api, timeAgo } from "@/lib/client";
import { downloadBlob, safeFileName, standaloneHtml } from "@/lib/export";
import { PanelShell } from "../Sidebars";
import { MODE_LABELS, PROVIDER_LABELS } from "../types";
import type { ChapterStats, LedgerSummary, ProcessTimeline, TimelineEvent, TimelineSegment } from "@/lib/process";

export interface ProcessPanelProps {
  thesisId: string;
  isOwner: boolean;
  onClose: () => void;
  onOpenConsent?: () => void;
  /** Receives the declaration as HTML (with an `ai` provenance mark when the wording came from the model). */
  onInsertDeclaration?: (html: string) => void;
  /** Render without the panel chrome (used inside a card on the tutor's page). */
  embedded?: boolean;
  /** Current writing session, passed along when the model rewords the declaration. */
  sessionId?: string | null;
}

interface ReplayStateLite {
  id: string;
  at: string;
  text: string;
  wordCount: number;
  full: boolean;
}

interface Chain {
  ok: boolean;
  brokenAt?: string;
  checked: number;
}

interface DeclarationItem {
  id: string;
  version: number;
  text: string;
  ledgerSummary: Record<string, unknown>;
  signedAt?: string;
  signedBy?: string;
  signedByName?: string;
  createdAt: string;
}

type Lang = "en" | "es" | "fr";

const EVENT_COLORS: Record<TimelineEvent["kind"], string> = {
  paste: "bg-prov-paste",
  ai_insert: "bg-prov-ai",
  ai_prompt: "bg-brand-500",
  snapshot: "bg-gray-400",
  version: "bg-gray-700",
};

const EVENT_LABELS: Record<TimelineEvent["kind"], string> = {
  paste: "Paste",
  ai_insert: "AI insert",
  ai_prompt: "AI prompt",
  snapshot: "Snapshot",
  version: "Named version",
};

const ATTRIBUTION_LABELS: Record<NonNullable<TimelineEvent["attribution"]>, string> = {
  source: "attributed to a source",
  copilot: "recognised from the Research copilot",
  assistant: "recognised from the assistant",
  unattributed: "unattributed",
  own: "declared as own text",
};

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const fmtDateTime = (iso: string) => `${fmtDate(iso)} ${fmtTime(iso)}`;
const fmtMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`);

function describe(e: TimelineEvent) {
  const parts: string[] = [EVENT_LABELS[e.kind]];
  if (e.words !== undefined && e.kind !== "ai_prompt") parts.push(`${e.words.toLocaleString()} words`);
  if (e.kind === "paste" && e.attribution) parts.push(ATTRIBUTION_LABELS[e.attribution]);
  if ((e.kind === "ai_insert" || e.kind === "ai_prompt") && e.mode) parts.push(MODE_LABELS[e.mode] || e.mode);
  if ((e.kind === "ai_insert" || e.kind === "ai_prompt") && (e.provider || e.model)) parts.push([e.provider ? PROVIDER_LABELS[e.provider] || e.provider : null, e.model].filter(Boolean).join(" "));
  if (e.costUsd) parts.push(`${e.costUsd.toFixed(4)} USD`);
  if (e.blocked) parts.push("declined by policy");
  if (e.kind === "version" && e.label) parts.push(e.label);
  return parts.join(" · ");
}

// ---------- Word-level diff for the replay (added words only; removed ones are counted) ----------

function addedWordIndexes(prev: string, next: string): { added: Set<number>; removed: number } {
  const a = prev.split(/\s+/).filter(Boolean);
  const b = next.split(/\s+/).filter(Boolean);
  const added = new Set<number>();
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const n = endA - start;
  const m = endB - start;
  if (!m) return { added, removed: n };
  if (!n || (n + 1) * (m + 1) > 1_500_000) {
    for (let j = start; j < endB; j++) added.add(j);
    return { added, removed: n };
  }
  const w = m + 1;
  const dp = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i * w + j] = a[start + i] === b[start + j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
  let i = 0;
  let j = 0;
  let removed = 0;
  while (i < n && j < m) {
    if (a[start + i] === b[start + j]) {
      i++;
      j++;
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
      i++;
      removed++;
    } else added.add(start + j++);
  }
  removed += n - i;
  while (j < m) added.add(start + j++);
  return { added, removed };
}

const REPLAY_WORD_CAP = 6000;

function ReplayText({ prev, next }: { prev: string; next: string }) {
  const { added, removed } = useMemo(() => addedWordIndexes(prev, next), [prev, next]);
  const lines = next.split("\n");
  let wi = 0;
  let shown = 0;
  const total = next.split(/\s+/).filter(Boolean).length;
  return (
    <div>
      <div className="text-[11px] text-gray-500 mb-1.5 flex items-center gap-2 flex-wrap">
        <span><span className="inline-block w-2 h-2 rounded-sm bg-brand-100 border border-brand-300 mr-1 align-middle" />{added.size.toLocaleString()} words added</span>
        <span>{removed.toLocaleString()} removed</span>
        <span>{total.toLocaleString()} words in this state</span>
      </div>
      <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-[12px] leading-relaxed text-gray-800 font-serif" aria-live="polite">
        {lines.map((line, li) => {
          if (shown >= REPLAY_WORD_CAP) return null;
          const words = line.split(/\s+/).filter(Boolean);
          if (!words.length) return null;
          return (
            <p key={li} className="mb-2 last:mb-0">
              {words.map((wd, k) => {
                const idx = wi++;
                shown++;
                return (
                  <span key={k} className={added.has(idx) ? "bg-brand-100 text-brand-900 rounded-[3px]" : ""}>
                    {wd}{k < words.length - 1 ? " " : ""}
                  </span>
                );
              })}
            </p>
          );
        })}
        {total > REPLAY_WORD_CAP && <p className="text-[11px] text-gray-400">Showing the first {REPLAY_WORD_CAP.toLocaleString()} words of this state.</p>}
        {!total && <p className="text-[11px] text-gray-400">Empty document at this point.</p>}
      </div>
    </div>
  );
}

// ---------- Declaration helpers ----------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Declaration as document HTML. Reworded text carries the `ai` provenance mark, as any model output does. */
export function declarationHtml(d: DeclarationItem) {
  const aiReworded = d.ledgerSummary?.aiReworded === true;
  const paragraphs = d.text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const [title, ...rest] = paragraphs;
  const body = rest.map((p) => `<p>${esc(p)}</p>`).join("");
  const wrapped = aiReworded ? `<span data-provenance="ai" data-source="Thesisfic assistant">${body}</span>` : body;
  const signed = d.signedAt ? `<p><em>Signed electronically on ${esc(fmtDate(d.signedAt))}${d.signedByName ? ` by ${esc(d.signedByName)}` : ""}.</em></p>` : "";
  return `<h1>${esc(title || "AI-use declaration")}</h1>${wrapped}${signed}`;
}

// ---------- Panel ----------

export default function ProcessPanel({ thesisId, isOwner, onClose, onOpenConsent, onInsertDeclaration, embedded, sessionId }: ProcessPanelProps) {
  const [timeline, setTimeline] = useState<ProcessTimeline | null>(null);
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [states, setStates] = useState<ReplayStateLite[]>([]);
  const [chain, setChain] = useState<Chain | null>(null);
  const [declarations, setDeclarations] = useState<DeclarationItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<TimelineEvent | null>(null);
  const [replayIdx, setReplayIdx] = useState(0);

  const [lang, setLang] = useState<Lang>("en");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<null | "generate" | "reword" | "save" | "sign">(null);
  const [proposal, setProposal] = useState<{ text: string; provider: string; model: string; demo: boolean; error?: string; costUsd?: number } | null>(null);
  const [note, setNote] = useState<{ text: string; kind: "info" | "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, s, d] = await Promise.all([
        api<{ timeline: ProcessTimeline; summary: LedgerSummary }>(`/api/theses/${thesisId}/process`),
        api<{ states: ReplayStateLite[]; chain: Chain }>(`/api/theses/${thesisId}/snapshots?tabId=submission&replay=1`),
        api<{ declarations: DeclarationItem[] }>(`/api/theses/${thesisId}/declaration`),
      ]);
      setTimeline(p.timeline);
      setSummary(p.summary);
      setStates(s.states);
      setChain(s.chain);
      setReplayIdx(Math.max(0, s.states.length - 1));
      setDeclarations(d.declarations);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message || "Could not load the process record");
    }
  }, [thesisId]);
  useEffect(() => {
    load();
  }, [load]);

  const latest = declarations[0];
  useEffect(() => {
    setDraft(latest?.text || "");
  }, [latest?.id, latest?.text]);

  const segments = timeline?.segments || [];
  const events = timeline?.events || [];
  const totalWeight = segments.reduce((a, g) => a + Math.max(1, g.minutes), 0) || 1;
  const bySession = useMemo(() => {
    const m = new Map<string, TimelineEvent[]>();
    for (const e of events) {
      if (!e.sessionId) continue;
      const list = m.get(e.sessionId) || [];
      list.push(e);
      m.set(e.sessionId, list);
    }
    return m;
  }, [events]);
  const outside = useMemo(() => events.filter((e) => !e.sessionId), [events]);
  const selectedSegment = segments.find((g) => g.sessionId === selected) || null;
  const listed = selected ? bySession.get(selected) || [] : [];

  const position = (g: TimelineSegment, at: string) => {
    const s = new Date(g.start).getTime();
    const e = Math.max(s + 1, new Date(g.end).getTime());
    return Math.min(100, Math.max(0, ((new Date(at).getTime() - s) / (e - s)) * 100));
  };

  const act = async (what: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(what);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setNote({ text: (e as Error).message || "Request failed", kind: "error" });
    } finally {
      setBusy(null);
    }
  };

  const generate = (rephrase: boolean) =>
    act(rephrase ? "reword" : "generate", async () => {
      const res = await api<{ declaration: DeclarationItem; rephrased?: { text: string; provider: string; model: string; demo: boolean; error?: string; costUsd?: number } }>(`/api/theses/${thesisId}/declaration`, { method: "POST", json: { lang, rephrase, sessionId: sessionId || undefined } });
      setDeclarations((ds) => [res.declaration, ...ds]);
      setProposal(rephrase && res.rephrased ? res.rephrased : null);
      setNote({ text: rephrase ? (res.rephrased?.demo ? "Demo mode: no model is connected, so the wording is unchanged." : "The model proposed a rewording. Check that every number is unchanged before accepting it.") : `Declaration v${res.declaration.version} generated from the ledger.`, kind: "success" });
    });

  const patch = (body: Record<string, unknown>, what: "save" | "sign", done: string) =>
    act(what, async () => {
      if (!latest) return;
      const res = await api<{ declaration: DeclarationItem }>(`/api/theses/${thesisId}/declaration`, { method: "PATCH", json: { id: latest.id, ...body } });
      setDeclarations((ds) => ds.map((d) => (d.id === res.declaration.id ? res.declaration : d)));
      setNote({ text: done, kind: "success" });
    });

  const download = (kind: "txt" | "html") => {
    if (!latest) return;
    const name = `${safeFileName(summary?.thesisTitle || "thesis")}-ai-use-declaration-v${latest.version}`;
    if (kind === "txt") downloadBlob(`${name}.txt`, new Blob([latest.text], { type: "text/plain;charset=utf-8" }));
    else downloadBlob(`${name}.html`, new Blob([standaloneHtml(declarationHtml(latest), `AI-use declaration · ${summary?.thesisTitle || ""}`)], { type: "text/html;charset=utf-8" }));
  };

  const dirty = !!latest && draft !== latest.text;
  const canEditText = isOwner && !!latest && !latest.signedAt;

  const body = (
    <div className="p-3 space-y-5 text-sm">
      {loadError && <div className="text-xs text-red-600 flex items-start gap-1"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{loadError}</div>}

      {/* Record integrity */}
      <div className={`flex items-start gap-1.5 text-[12px] ${chain && !chain.ok ? "text-amber-700" : "text-gray-600"}`}>
        {chain && !chain.ok ? <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> : <ShieldCheck className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-green-600" />}
        <span>
          {!chain ? "Checking the record…" : chain.checked === 0 ? "Record integrity: no snapshots yet. The first one is recorded with the next save." : chain.ok ? `Record integrity: chain verified (${chain.checked} snapshot${chain.checked === 1 ? "" : "s"}, hash-linked).` : `Record integrity: the chain breaks at snapshot ${chain.brokenAt}. Later snapshots are still listed but cannot be trusted.`}
        </span>
      </div>

      {/* Totals */}
      {timeline && (
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ["Sessions", timeline.totals.sessions],
            ["Time", fmtMinutes(timeline.totals.minutes)],
            ["Snapshots", timeline.totals.snapshots],
            ["Pastes", timeline.totals.pastes],
            ["AI inserts", timeline.totals.aiInserts],
            ["AI prompts", timeline.totals.aiPrompts],
          ].map(([l, v]) => (
            <div key={String(l)} className="bg-gray-50 rounded-lg py-2"><div className="text-base font-semibold tabular-nums">{typeof v === "number" ? v.toLocaleString() : v}</div><div className="text-[10px] text-gray-500">{l}</div></div>
          ))}
        </div>
      )}

      {/* Timeline */}
      <section aria-labelledby="process-timeline">
        <div className="flex items-center justify-between mb-1.5">
          <h3 id="process-timeline" className="text-xs font-medium">Timeline</h3>
          <span className="text-[11px] text-gray-400">{segments.length ? `${fmtDate(segments[0].start)} → ${fmtDate(segments[segments.length - 1].end)}` : ""}</span>
        </div>
        {segments.length === 0 ? (
          <p className="text-[12px] text-gray-400">No writing sessions recorded yet.{isOwner && onOpenConsent && !summary?.scopes ? " Sessions start once monitoring consent is on record." : ""}</p>
        ) : (
          <>
            <div className="flex items-stretch gap-[2px] h-9" role="group" aria-label="Writing sessions scaled by duration">
              {segments.map((g) => (
                <div
                  key={g.sessionId}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(selected === g.sessionId ? null : g.sessionId)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(selected === g.sessionId ? null : g.sessionId); } }}
                  style={{ flex: `${Math.max(1, g.minutes) / totalWeight} 0 22px` }}
                  className={`relative rounded-md border overflow-hidden min-w-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${selected === g.sessionId ? "border-brand-500 bg-brand-50" : "border-gray-200 bg-gray-100 hover:bg-gray-200"}`}
                  aria-pressed={selected === g.sessionId}
                  aria-label={`Session ${fmtDateTime(g.start)}, ${fmtMinutes(g.minutes)}, ${g.words} words, ${g.pastes} pastes, ${g.aiInserts} AI inserts`}
                  title={`${fmtDateTime(g.start)} · ${fmtMinutes(g.minutes)} · ${g.words} words`}
                >
                  {(bySession.get(g.sessionId) || []).map((e) => (
                    <span
                      key={e.id}
                      onMouseEnter={() => setHover(e)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(e)}
                      onBlur={() => setHover(null)}
                      tabIndex={0}
                      role="img"
                      aria-label={`${fmtTime(e.at)} ${describe(e)}`}
                      className={`absolute top-1 bottom-1 w-[3px] rounded-full ${EVENT_COLORS[e.kind]} ${e.kind === "snapshot" ? "opacity-70" : ""}`}
                      style={{ left: `calc(${position(g, e.at)}% - 1px)` }}
                    />
                  ))}
                </div>
              ))}
            </div>
            <div className="mt-1.5 min-h-[16px] text-[11px] text-gray-600" aria-live="polite">
              {hover ? `${fmtDateTime(hover.at)} · ${describe(hover)}` : <span className="text-gray-400">Hover a marker for details. Click a session to list its events.</span>}
            </div>
            <div className="flex gap-3 text-[11px] text-gray-600 mt-1 flex-wrap">
              {(["paste", "ai_insert", "ai_prompt", "snapshot", "version"] as TimelineEvent["kind"][]).map((k) => (
                <span key={k}><span className={`inline-block w-2 h-2 rounded-full mr-1 ${EVENT_COLORS[k]}`} />{EVENT_LABELS[k]}</span>
              ))}
            </div>
            {outside.length > 0 && <p className="text-[11px] text-gray-400 mt-1">{outside.length} event{outside.length === 1 ? "" : "s"} happened outside a recorded session (listed in the AI interaction log).</p>}
            {selectedSegment && (
              <div className="mt-2 rounded-xl border border-gray-200 p-2.5">
                <div className="flex items-center gap-2 text-[12px] flex-wrap">
                  <span className="font-medium">{fmtDateTime(selectedSegment.start)}</span>
                  <span className="text-gray-500">{fmtMinutes(selectedSegment.minutes)} · {selectedSegment.words} words · {selectedSegment.keystrokes.toLocaleString()} keys · {selectedSegment.device}</span>
                  {!selectedSegment.consented && <span className="badge bg-gray-100 text-gray-500 !text-[10px]">no consent record</span>}
                </div>
                <ul className="mt-1.5 max-h-40 overflow-y-auto space-y-1 text-[11px] text-gray-700">
                  {listed.length === 0 && <li className="text-gray-400">No pastes, AI events or snapshots in this session.</li>}
                  {listed.map((e) => (
                    <li key={e.id} className="flex items-start gap-1.5">
                      <span className={`inline-block w-2 h-2 rounded-full mt-1 flex-shrink-0 ${EVENT_COLORS[e.kind]}`} />
                      <span><span className="text-gray-400">{fmtTime(e.at)}</span> {describe(e)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      {/* Chapters */}
      <section aria-labelledby="process-chapters">
        <h3 id="process-chapters" className="text-xs font-medium mb-1.5">By chapter</h3>
        {!timeline || timeline.chapters.length === 0 ? (
          <p className="text-[12px] text-gray-400">Add H1 or H2 headings to the Final submission to see provenance per chapter.</p>
        ) : (
          <ul className="space-y-1.5">
            {timeline.chapters.map((c: ChapterStats, i) => {
              const t = Math.max(1, c.words);
              const pc = (n: number) => Math.round((n / t) * 100);
              return (
                <li key={i}>
                  <div className="flex items-center justify-between text-[12px] gap-2">
                    <span className={`truncate ${c.level === 2 ? "pl-3 text-gray-600" : "text-gray-800"}`} title={c.heading}>{c.heading}</span>
                    <span className="text-gray-400 tabular-nums flex-shrink-0">{c.words.toLocaleString()} w{c.ai ? ` · AI ${pc(c.ai)}%` : ""}</span>
                  </div>
                  <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 mt-0.5" role="img" aria-label={`${c.heading}: written ${pc(c.human)}%, quoted or pasted ${pc(c.paste)}%, AI-assisted ${pc(c.ai)}%`}>
                    <div className="bg-prov-human" style={{ width: `${pc(c.human)}%` }} />
                    <div className="bg-prov-paste" style={{ width: `${pc(c.paste)}%` }} />
                    <div className="bg-prov-ai" style={{ width: `${pc(c.ai)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex gap-3 text-[11px] text-gray-600 mt-1.5 flex-wrap">
          <span><span className="inline-block w-2 h-2 rounded-full bg-prov-human mr-1" />Written</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-prov-paste mr-1" />Quoted or pasted</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-prov-ai mr-1" />AI-assisted</span>
        </div>
      </section>

      {/* Replay */}
      <section aria-labelledby="process-replay">
        <div className="flex items-center justify-between mb-1.5">
          <h3 id="process-replay" className="text-xs font-medium flex items-center gap-1"><History className="w-3.5 h-3.5 text-gray-500" />Replay</h3>
          {states.length > 0 && <span className="text-[11px] text-gray-400">{replayIdx + 1} / {states.length} · {fmtDateTime(states[replayIdx].at)} · {states[replayIdx].wordCount.toLocaleString()} words</span>}
        </div>
        {states.length === 0 ? (
          <p className="text-[12px] text-gray-400">Snapshots of the Final submission appear here as you save. They are taken every few minutes or every 150 words, never per keystroke.</p>
        ) : (
          <>
            <input type="range" min={0} max={states.length - 1} value={replayIdx} onChange={(e) => setReplayIdx(Number(e.target.value))} className="w-full accent-brand-600" aria-label="Snapshot to replay" aria-valuetext={fmtDateTime(states[replayIdx].at)} />
            <ReplayText prev={replayIdx > 0 ? states[replayIdx - 1].text : ""} next={states[replayIdx].text} />
          </>
        )}
      </section>

      {/* Declaration */}
      <section aria-labelledby="process-declaration" className="border-t border-gray-200 pt-4">
        <h3 id="process-declaration" className="text-xs font-medium flex items-center gap-1 mb-1.5"><FileSignature className="w-3.5 h-3.5 text-gray-500" />AI-use declaration</h3>

        {summary && (
          <ul className="text-[11px] text-gray-600 space-y-0.5 mb-2">
            <li><Bot className="w-3 h-3 inline mr-1 text-gray-400" />{summary.interactions.total} assistant interactions{summary.interactions.copilot ? ` (${summary.interactions.copilot} Research copilot)` : ""}, {summary.words.ai.toLocaleString()} AI-assisted words ({summary.pct.ai}% of {summary.aiLimitPct}% limit)</li>
            <li><ClipboardPaste className="w-3 h-3 inline mr-1 text-gray-400" />{summary.pastes.events} pastes, {summary.pastes.attributedToSource} attributed to a source, {summary.pastes.recognisedFromAssistant} recognised as assistant text, {summary.pastes.unattributed} unattributed</li>
            {summary.budget && <li><Link2 className="w-3 h-3 inline mr-1 text-gray-400" />{summary.budget.institutionLocal.toFixed(2)} {summary.budget.currency} of university AI budget over {summary.budget.requests} requests</li>}
            {!summary.scopes && <li className="text-amber-700">No monitoring consent on record.{isOwner && onOpenConsent ? <> <button onClick={onOpenConsent} className="underline">Review privacy choices</button></> : null}</li>}
          </ul>
        )}

        {isOwner && (
          <div className="rounded-xl border border-gray-200 p-2.5 space-y-2">
            <p className="text-[11px] text-gray-500">Built from the ledger; every number is traceable. You can edit the wording before signing.</p>
            <div className="flex items-center gap-2 flex-wrap">
              <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} className="input-field !py-1 !px-2 !text-[12px] !w-auto !rounded-lg" aria-label="Declaration language">
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
              </select>
              <button onClick={() => generate(false)} disabled={busy !== null} className="btn-primary !py-1.5 !px-3 !text-[12px] disabled:opacity-50">{busy === "generate" ? "Generating…" : latest ? "Generate new version" : "Generate AI-use declaration"}</button>
            </div>
          </div>
        )}

        {latest ? (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2 text-[11px] text-gray-500 flex-wrap">
              <span className="font-medium text-gray-700">Version {latest.version}</span>
              <span>· generated {timeAgo(latest.createdAt)}</span>
              {latest.signedAt ? <span className="text-green-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Signed {fmtDate(latest.signedAt)}{latest.signedByName ? ` by ${latest.signedByName}` : ""}</span> : <span className="badge bg-gray-100 text-gray-600 !text-[10px]">draft, unsigned</span>}
              {latest.ledgerSummary?.aiReworded === true && <span className="badge bg-prov-ai-soft text-prov-ai-deep !text-[10px]">wording reworded by the model</span>}
            </div>

            {canEditText ? (
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={12} className="input-field !text-[12px] !leading-relaxed font-serif" aria-label="Declaration text" />
            ) : (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-[12px] leading-relaxed text-gray-800 whitespace-pre-wrap font-serif max-h-72 overflow-y-auto">{latest.text}</div>
            )}

            {canEditText && (
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => patch({ text: draft, aiReworded: latest.ledgerSummary?.aiReworded === true }, "save", "Wording saved.")} disabled={!dirty || busy !== null} className="btn-outline !py-1.5 !px-3 !text-[12px] disabled:opacity-50">{busy === "save" ? "Saving…" : "Save wording"}</button>
                <button onClick={() => generate(true)} disabled={busy !== null} className="btn-outline !py-1.5 !px-3 !text-[12px] disabled:opacity-50 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" />{busy === "reword" ? "Asking…" : "Ask the model to reword"}</button>
              </div>
            )}
            {canEditText && <p className="text-[11px] text-gray-500">Rewording creates a new version from the current ledger. The model's text is a proposal: it is marked AI-assisted wherever it is inserted and the numbers must stay unchanged.</p>}

            {proposal && canEditText && (
              <div className="rounded-xl border border-prov-ai-line bg-prov-ai-soft p-2.5 space-y-2">
                <div className="text-[11px] text-prov-ai-deep font-medium flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" />Proposed rewording · {PROVIDER_LABELS[proposal.provider] || proposal.provider} {proposal.model}{proposal.costUsd ? ` · ${proposal.costUsd.toFixed(4)} USD` : ""}</div>
                {proposal.error && <div className="text-[11px] text-red-600">{proposal.error}</div>}
                {proposal.demo && <div className="text-[11px] text-gray-600">Demo mode: no model is connected, so the proposal equals the ledger wording.</div>}
                <div className="text-[12px] leading-relaxed text-gray-800 whitespace-pre-wrap font-serif max-h-56 overflow-y-auto bg-white rounded-lg p-2 border border-prov-ai-line">{proposal.text}</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => { setDraft(proposal.text); patch({ text: proposal.text, aiReworded: !proposal.demo }, "save", "Rewording accepted and marked as AI-assisted."); setProposal(null); }} disabled={busy !== null || proposal.demo} className="btn-primary !py-1.5 !px-3 !text-[12px] disabled:opacity-50">Accept rewording</button>
                  <button onClick={() => setProposal(null)} className="btn-outline !py-1.5 !px-3 !text-[12px]">Keep the ledger wording</button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap pt-1">
              <button onClick={() => download("txt")} className="btn-outline !py-1.5 !px-3 !text-[12px] flex items-center gap-1"><Download className="w-3.5 h-3.5" />.txt</button>
              <button onClick={() => download("html")} className="btn-outline !py-1.5 !px-3 !text-[12px] flex items-center gap-1"><Download className="w-3.5 h-3.5" />.html</button>
              {isOwner && onInsertDeclaration && (
                <button onClick={() => { onInsertDeclaration(declarationHtml(latest)); setNote({ text: "Declaration appended to the Final submission.", kind: "success" }); }} disabled={dirty} title={dirty ? "Save the wording first" : undefined} className="btn-outline !py-1.5 !px-3 !text-[12px] disabled:opacity-50">Insert into Final submission as an appendix</button>
              )}
            </div>
            {isOwner && onInsertDeclaration && <p className="text-[11px] text-gray-500">Inserting adds the declaration at the end of the Final submission and counts toward its word count.</p>}

            {isOwner && !latest.signedAt && (
              <div className="rounded-xl border border-gray-200 p-2.5 space-y-1.5">
                <p className="text-[11px] text-gray-500">Signing is final for this version: the text can no longer be edited and your advisor is notified. Later changes need a new version.</p>
                <button onClick={() => patch({ sign: true }, "sign", `Version ${latest.version} signed.`)} disabled={dirty || busy !== null} title={dirty ? "Save the wording first" : undefined} className="btn-primary !py-1.5 !px-3 !text-[12px] disabled:opacity-50 flex items-center gap-1"><FileSignature className="w-3.5 h-3.5" />{busy === "sign" ? "Signing…" : "Sign"}</button>
              </div>
            )}
            {declarations.length > 1 && <p className="text-[11px] text-gray-400">{declarations.length - 1} earlier version{declarations.length > 2 ? "s" : ""} kept on record{declarations.some((d) => d.signedAt && d.id !== latest.id) ? ", including signed ones" : ""}.</p>}
          </div>
        ) : (
          <p className="text-[12px] text-gray-400 mt-2">{isOwner ? "No declaration yet." : "The student has not generated a declaration yet."}</p>
        )}

        {note && <div className={`mt-2 text-[11px] ${note.kind === "error" ? "text-red-600" : note.kind === "success" ? "text-green-700" : "text-gray-600"}`} role="status">{note.text}</div>}
        <p className="mt-3 text-[11px] text-gray-400">This record shows what happened inside the editor. It cannot detect external AI output typed in by hand, and it is not a probability score. {isOwner ? "Your advisor sees exactly the same panel." : "The student sees exactly the same panel."}</p>
      </section>
    </div>
  );

  if (embedded) return <div className="flex flex-col h-full min-h-0"><div className="flex-1 overflow-y-auto min-h-0">{body}</div></div>;
  return (
    <PanelShell title="Writing process" icon={<History className="w-4 h-4 text-gray-500" />} onClose={onClose}>
      {body}
    </PanelShell>
  );
}
