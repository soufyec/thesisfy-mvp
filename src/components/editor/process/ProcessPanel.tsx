"use client";

// Writing process panel: session timeline, per-chapter provenance, snapshot replay and the AI-use declaration.
// The student and the advisor render the same component over the same data; `isOwner` only adds the
// generate / edit / sign actions. Nothing here estimates anything: every marker is a logged event.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, ClipboardPaste, Download, FileSignature, History, Link2, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "@/lib/client";
import { useFormat, useLocale, useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/dictionary";
import { downloadBlob, safeFileName, standaloneHtml } from "@/lib/export";
import { PanelShell } from "../Sidebars";
import { modeLabel, providerLabel } from "../types";
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
  paste: "panelsResearch.process.event.paste",
  ai_insert: "panelsResearch.process.event.aiInsert",
  ai_prompt: "panelsResearch.process.event.aiPrompt",
  snapshot: "panelsResearch.process.event.snapshot",
  version: "panelsResearch.process.event.version",
};

const ATTRIBUTION_LABELS: Record<NonNullable<TimelineEvent["attribution"]>, string> = {
  source: "panelsResearch.process.attr.source",
  copilot: "panelsResearch.process.attr.copilot",
  assistant: "panelsResearch.process.attr.assistant",
  unattributed: "panelsResearch.process.attr.unattributed",
  own: "panelsResearch.process.attr.own",
};

type Fmt = ReturnType<typeof useFormat>;

/** "N words" / "1 word" in the active language. */
const wordsLabel = (t: Translate, fmt: Fmt, n: number) => (n === 1 ? t("common.word_one") : t("common.words", { n: fmt.number(n) }));

/** Relative time ("5 min ago") with the active locale; older than a month falls back to a date. */
function relativeTime(iso: string, tag: string, t: Translate, fmt: Fmt) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return t("panelsResearch.time.justNow");
  const rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto", style: "short" });
  if (m < 60) return rtf.format(-m, "minute");
  const h = Math.round(m / 60);
  if (h < 24) return rtf.format(-h, "hour");
  const days = Math.round(h / 24);
  if (days < 30) return rtf.format(-days, "day");
  return fmt.date(iso);
}

function describe(e: TimelineEvent, t: Translate, fmt: Fmt) {
  const parts: string[] = [t(EVENT_LABELS[e.kind])];
  if (e.words !== undefined && e.kind !== "ai_prompt") parts.push(wordsLabel(t, fmt, e.words));
  if (e.kind === "paste" && e.attribution) parts.push(t(ATTRIBUTION_LABELS[e.attribution]));
  if ((e.kind === "ai_insert" || e.kind === "ai_prompt") && e.mode) parts.push(modeLabel(t, e.mode));
  if ((e.kind === "ai_insert" || e.kind === "ai_prompt") && (e.provider || e.model)) parts.push([e.provider ? providerLabel(t, e.provider) : null, e.model].filter(Boolean).join(" "));
  if (e.costUsd) parts.push(`${fmt.number(e.costUsd, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} USD`);
  if (e.blocked) parts.push(t("panelsResearch.process.declinedByPolicy"));
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
  const t = useT();
  const fmt = useFormat();
  const { added, removed } = useMemo(() => addedWordIndexes(prev, next), [prev, next]);
  const lines = next.split("\n");
  let wi = 0;
  let shown = 0;
  const total = next.split(/\s+/).filter(Boolean).length;
  return (
    <div>
      <div className="text-[11px] text-gray-500 mb-1.5 flex items-center gap-2 flex-wrap">
        <span><span className="inline-block w-2 h-2 rounded-sm bg-brand-100 border border-brand-300 mr-1 align-middle" />{t("panelsResearch.process.replay.added", { n: fmt.number(added.size) })}</span>
        <span>{t("panelsResearch.process.replay.removed", { n: fmt.number(removed) })}</span>
        <span>{t("panelsResearch.process.replay.inState", { n: fmt.number(total) })}</span>
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
        {total > REPLAY_WORD_CAP && <p className="text-[11px] text-gray-400">{t("panelsResearch.process.replay.capped", { n: fmt.number(REPLAY_WORD_CAP) })}</p>}
        {!total && <p className="text-[11px] text-gray-400">{t("panelsResearch.process.replay.emptyDoc")}</p>}
      </div>
    </div>
  );
}

// ---------- Declaration helpers ----------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Declaration as document HTML. The appendix is a record of the process, not thesis text the student wrote, so every
 * paragraph (title and signature line included) carries a provenance mark labelled with the declaration's name and
 * `data-declaration="true"`: `paste` for the deterministic template, `ai` when the wording came from the model.
 * Counting code (server `computeProvenance`, client ledger) excludes `data-declaration="true"` spans from all totals,
 * so inserting the declaration can neither raise nor lower the AI share.
 */
export const DECLARATION_ATTR = "data-declaration";

export function declarationHtml(d: DeclarationItem, t: Translate, fmt: Fmt) {
  const aiReworded = d.ledgerSummary?.aiReworded === true;
  const paragraphs = d.text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const [title, ...rest] = paragraphs;
  const label = esc(t("panelsResearch.process.decl.title"));
  const mark = (inner: string) => `<span data-provenance="${aiReworded ? "ai" : "paste"}" data-source="${label}" ${DECLARATION_ATTR}="true">${inner}</span>`;
  const body = rest.map((p) => `<p>${mark(esc(p))}</p>`).join("");
  const by = d.signedByName ? t("panelsResearch.process.decl.signedBy", { name: esc(d.signedByName) }) : "";
  const signed = d.signedAt ? `<p>${mark(`<em>${t("panelsResearch.process.decl.signedHtml", { date: esc(fmt.date(d.signedAt)), by })}</em>`)}</p>` : "";
  return `<h1>${mark(esc(title || t("panelsResearch.process.decl.title")))}</h1>${body}${signed}`;
}

// ---------- Panel ----------

export default function ProcessPanel({ thesisId, isOwner, onClose, onOpenConsent, onInsertDeclaration, embedded, sessionId }: ProcessPanelProps) {
  const t = useT();
  const fmt = useFormat();
  const { tag } = useLocale();
  const fmtTime = (iso: string) => fmt.time(iso);
  const fmtDate = (iso: string) => fmt.date(iso);
  const fmtDateTime = (iso: string) => `${fmtDate(iso)} ${fmtTime(iso)}`;
  const fmtMinutes = (m: number) => (m >= 60 ? t("panelsResearch.process.hoursMinutes", { h: Math.floor(m / 60), m: m % 60 }) : t("common.minutes", { n: m }));
  const finalSubmission = t("glossary.finalSubmission");
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
      setLoadError((e as Error).message || t("panelsResearch.process.loadError"));
    }
  }, [thesisId, t]);
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
      setNote({ text: (e as Error).message || t("panelsResearch.process.requestFailed"), kind: "error" });
    } finally {
      setBusy(null);
    }
  };

  const generate = (rephrase: boolean) =>
    act(rephrase ? "reword" : "generate", async () => {
      const res = await api<{ declaration: DeclarationItem; rephrased?: { text: string; provider: string; model: string; demo: boolean; error?: string; costUsd?: number } }>(`/api/theses/${thesisId}/declaration`, { method: "POST", json: { lang, rephrase, sessionId: sessionId || undefined } });
      setDeclarations((ds) => [res.declaration, ...ds]);
      setProposal(rephrase && res.rephrased ? res.rephrased : null);
      setNote({ text: rephrase ? (res.rephrased?.demo ? t("panelsResearch.process.decl.demoUnchanged") : t("panelsResearch.process.decl.proposed")) : t("panelsResearch.process.decl.generatedNote", { n: res.declaration.version }), kind: "success" });
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
    else downloadBlob(`${name}.html`, new Blob([standaloneHtml(declarationHtml(latest, t, fmt), `${t("panelsResearch.process.decl.title")} · ${summary?.thesisTitle || ""}`)], { type: "text/html;charset=utf-8" }));
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
          {!chain ? t("panelsResearch.process.chain.checking") : chain.checked === 0 ? t("panelsResearch.process.chain.empty") : chain.ok ? t(chain.checked === 1 ? "panelsResearch.process.chain.ok_one" : "panelsResearch.process.chain.ok", { n: chain.checked }) : t("panelsResearch.process.chain.broken", { id: chain.brokenAt })}
        </span>
      </div>

      {/* Totals */}
      {timeline && (
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            [t("panelsResearch.process.totals.sessions"), timeline.totals.sessions],
            [t("panelsResearch.process.totals.time"), fmtMinutes(timeline.totals.minutes)],
            [t("panelsResearch.process.totals.snapshots"), timeline.totals.snapshots],
            [t("panelsResearch.process.totals.pastes"), timeline.totals.pastes],
            [t("panelsResearch.process.totals.aiInserts"), timeline.totals.aiInserts],
            [t("panelsResearch.process.totals.aiPrompts"), timeline.totals.aiPrompts],
          ].map(([l, v]) => (
            <div key={String(l)} className="bg-gray-50 rounded-lg py-2"><div className="text-base font-semibold tabular-nums">{typeof v === "number" ? fmt.number(v) : v}</div><div className="text-[10px] text-gray-500">{l}</div></div>
          ))}
        </div>
      )}

      {/* Timeline */}
      <section aria-labelledby="process-timeline">
        <div className="flex items-center justify-between mb-1.5">
          <h3 id="process-timeline" className="text-xs font-medium">{t("panelsResearch.process.timeline.title")}</h3>
          <span className="text-[11px] text-gray-400">{segments.length ? `${fmtDate(segments[0].start)} → ${fmtDate(segments[segments.length - 1].end)}` : ""}</span>
        </div>
        {segments.length === 0 ? (
          <p className="text-[12px] text-gray-400">{t("panelsResearch.process.timeline.empty")}{isOwner && onOpenConsent && !summary?.scopes ? ` ${t("panelsResearch.process.timeline.emptyConsent")}` : ""}</p>
        ) : (
          <>
            <div className="flex items-stretch gap-[2px] h-9" role="group" aria-label={t("panelsResearch.process.timeline.groupLabel")}>
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
                  aria-label={t("panelsResearch.process.timeline.sessionLabel", { when: fmtDateTime(g.start), duration: fmtMinutes(g.minutes), words: wordsLabel(t, fmt, g.words), pastes: g.pastes, inserts: g.aiInserts })}
                  title={`${fmtDateTime(g.start)} · ${fmtMinutes(g.minutes)} · ${wordsLabel(t, fmt, g.words)}`}
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
                      aria-label={`${fmtTime(e.at)} ${describe(e, t, fmt)}`}
                      className={`absolute top-1 bottom-1 w-[3px] rounded-full ${EVENT_COLORS[e.kind]} ${e.kind === "snapshot" ? "opacity-70" : ""}`}
                      style={{ left: `calc(${position(g, e.at)}% - 1px)` }}
                    />
                  ))}
                </div>
              ))}
            </div>
            <div className="mt-1.5 min-h-[16px] text-[11px] text-gray-600" aria-live="polite">
              {hover ? `${fmtDateTime(hover.at)} · ${describe(hover, t, fmt)}` : <span className="text-gray-400">{t("panelsResearch.process.timeline.hint")}</span>}
            </div>
            <div className="flex gap-3 text-[11px] text-gray-600 mt-1 flex-wrap">
              {(["paste", "ai_insert", "ai_prompt", "snapshot", "version"] as TimelineEvent["kind"][]).map((k) => (
                <span key={k}><span className={`inline-block w-2 h-2 rounded-full mr-1 ${EVENT_COLORS[k]}`} />{t(EVENT_LABELS[k])}</span>
              ))}
            </div>
            {outside.length > 0 && <p className="text-[11px] text-gray-400 mt-1">{t(outside.length === 1 ? "panelsResearch.process.timeline.outside_one" : "panelsResearch.process.timeline.outside", { n: outside.length })}</p>}
            {selectedSegment && (
              <div className="mt-2 rounded-xl border border-gray-200 p-2.5">
                <div className="flex items-center gap-2 text-[12px] flex-wrap">
                  <span className="font-medium">{fmtDateTime(selectedSegment.start)}</span>
                  <span className="text-gray-500">{fmtMinutes(selectedSegment.minutes)} · {wordsLabel(t, fmt, selectedSegment.words)} · {t("panelsResearch.process.timeline.keys", { n: fmt.number(selectedSegment.keystrokes) })} · {selectedSegment.device}</span>
                  {!selectedSegment.consented && <span className="badge bg-gray-100 text-gray-500 !text-[10px]">{t("panelsResearch.process.timeline.noConsent")}</span>}
                </div>
                <ul className="mt-1.5 max-h-40 overflow-y-auto space-y-1 text-[11px] text-gray-700">
                  {listed.length === 0 && <li className="text-gray-400">{t("panelsResearch.process.timeline.noEvents")}</li>}
                  {listed.map((e) => (
                    <li key={e.id} className="flex items-start gap-1.5">
                      <span className={`inline-block w-2 h-2 rounded-full mt-1 flex-shrink-0 ${EVENT_COLORS[e.kind]}`} />
                      <span><span className="text-gray-400">{fmtTime(e.at)}</span> {describe(e, t, fmt)}</span>
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
        <h3 id="process-chapters" className="text-xs font-medium mb-1.5">{t("panelsResearch.process.chapters.title")}</h3>
        {!timeline || timeline.chapters.length === 0 ? (
          <p className="text-[12px] text-gray-400">{t("panelsResearch.process.chapters.empty", { section: finalSubmission })}</p>
        ) : (
          <ul className="space-y-1.5">
            {timeline.chapters.map((c: ChapterStats, i) => {
              const tot = Math.max(1, c.words);
              const pc = (n: number) => Math.round((n / tot) * 100);
              return (
                <li key={i}>
                  <div className="flex items-center justify-between text-[12px] gap-2">
                    <span className={`truncate ${c.level === 2 ? "pl-3 text-gray-600" : "text-gray-800"}`} title={c.heading}>{c.heading}</span>
                    <span className="text-gray-400 tabular-nums flex-shrink-0">{t("panelsResearch.process.chapters.wordsShort", { n: fmt.number(c.words) })}{c.ai ? ` · ${t("panelsResearch.process.chapters.aiPct", { pct: pc(c.ai) })}` : ""}</span>
                  </div>
                  <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 mt-0.5" role="img" aria-label={t("panelsResearch.process.chapters.ariaLabel", { heading: c.heading, written: t("glossary.written"), w: pc(c.human), quoted: t("glossary.quotedOrPasted"), p: pc(c.paste), ai: t("glossary.aiAssisted"), a: pc(c.ai) })}>
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
          <span><span className="inline-block w-2 h-2 rounded-full bg-prov-human mr-1" />{t("glossary.written")}</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-prov-paste mr-1" />{t("glossary.quotedOrPasted")}</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-prov-ai mr-1" />{t("glossary.aiAssisted")}</span>
        </div>
      </section>

      {/* Replay */}
      <section aria-labelledby="process-replay">
        <div className="flex items-center justify-between mb-1.5">
          <h3 id="process-replay" className="text-xs font-medium flex items-center gap-1"><History className="w-3.5 h-3.5 text-gray-500" />{t("panelsResearch.process.replay.title")}</h3>
          {states.length > 0 && <span className="text-[11px] text-gray-400">{replayIdx + 1} / {states.length} · {fmtDateTime(states[replayIdx].at)} · {wordsLabel(t, fmt, states[replayIdx].wordCount)}</span>}
        </div>
        {states.length === 0 ? (
          <p className="text-[12px] text-gray-400">{t("panelsResearch.process.replay.empty", { section: finalSubmission })}</p>
        ) : (
          <>
            <input type="range" min={0} max={states.length - 1} value={replayIdx} onChange={(e) => setReplayIdx(Number(e.target.value))} className="w-full accent-brand-600" aria-label={t("panelsResearch.process.replay.slider")} aria-valuetext={fmtDateTime(states[replayIdx].at)} />
            <ReplayText prev={replayIdx > 0 ? states[replayIdx - 1].text : ""} next={states[replayIdx].text} />
          </>
        )}
      </section>

      {/* Declaration */}
      <section aria-labelledby="process-declaration" className="border-t border-gray-200 pt-4">
        <h3 id="process-declaration" className="text-xs font-medium flex items-center gap-1 mb-1.5"><FileSignature className="w-3.5 h-3.5 text-gray-500" />{t("panelsResearch.process.decl.title")}</h3>

        {summary && (
          <ul className="text-[11px] text-gray-600 space-y-0.5 mb-2">
            <li><Bot className="w-3 h-3 inline mr-1 text-gray-400" />{t("panelsResearch.process.decl.interactions", { n: summary.interactions.total, copilot: summary.interactions.copilot ? t("panelsResearch.process.decl.interactionsCopilot", { n: summary.interactions.copilot }) : "", words: fmt.number(summary.words.ai), pct: summary.pct.ai, limit: summary.aiLimitPct })}</li>
            <li><ClipboardPaste className="w-3 h-3 inline mr-1 text-gray-400" />{t("panelsResearch.process.decl.pastes", { events: summary.pastes.events, source: summary.pastes.attributedToSource, assistant: summary.pastes.recognisedFromAssistant, unattributed: summary.pastes.unattributed })}</li>
            {summary.budget && <li><Link2 className="w-3 h-3 inline mr-1 text-gray-400" />{t("panelsResearch.process.decl.budget", { amount: fmt.number(summary.budget.institutionLocal, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), currency: summary.budget.currency, requests: summary.budget.requests })}</li>}
            {!summary.scopes && <li className="text-amber-700">{t("panelsResearch.process.decl.noConsent")}{isOwner && onOpenConsent ? <> <button onClick={onOpenConsent} className="underline">{t("panelsResearch.process.decl.reviewPrivacy")}</button></> : null}</li>}
          </ul>
        )}

        {isOwner && (
          <div className="rounded-xl border border-gray-200 p-2.5 space-y-2">
            <p className="text-[11px] text-gray-500">{t("panelsResearch.process.decl.builtFromLedger")}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} className="input-field !py-1 !px-2 !text-[12px] !w-auto !rounded-lg" aria-label={t("panelsResearch.process.decl.languageLabel")}>
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
              </select>
              <button onClick={() => generate(false)} disabled={busy !== null} className="btn-primary !py-1.5 !px-3 !text-[12px] disabled:opacity-50">{busy === "generate" ? t("panelsResearch.process.decl.generating") : latest ? t("panelsResearch.process.decl.generateNew") : t("panelsResearch.process.decl.generate")}</button>
            </div>
          </div>
        )}

        {latest ? (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2 text-[11px] text-gray-500 flex-wrap">
              <span className="font-medium text-gray-700">{t("panelsResearch.process.decl.version", { n: latest.version })}</span>
              <span>· {t("panelsResearch.process.decl.generated", { when: relativeTime(latest.createdAt, tag, t, fmt) })}</span>
              {latest.signedAt ? <span className="text-green-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{t("panelsResearch.process.decl.signed", { date: fmtDate(latest.signedAt) })}{latest.signedByName ? t("panelsResearch.process.decl.signedBy", { name: latest.signedByName }) : ""}</span> : <span className="badge bg-gray-100 text-gray-600 !text-[10px]">{t("panelsResearch.process.decl.draftUnsigned")}</span>}
              {latest.ledgerSummary?.aiReworded === true && <span className="badge bg-prov-ai-soft text-prov-ai-deep !text-[10px]">{t("panelsResearch.process.decl.reworded")}</span>}
            </div>

            {canEditText ? (
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={12} className="input-field !text-[12px] !leading-relaxed font-serif" aria-label={t("panelsResearch.process.decl.textLabel")} />
            ) : (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-[12px] leading-relaxed text-gray-800 whitespace-pre-wrap font-serif max-h-72 overflow-y-auto">{latest.text}</div>
            )}

            {canEditText && (
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => patch({ text: draft, aiReworded: latest.ledgerSummary?.aiReworded === true }, "save", t("panelsResearch.process.decl.saved"))} disabled={!dirty || busy !== null} className="btn-outline !py-1.5 !px-3 !text-[12px] disabled:opacity-50">{busy === "save" ? t("panelsResearch.process.decl.saving") : t("panelsResearch.process.decl.saveWording")}</button>
                <button onClick={() => generate(true)} disabled={busy !== null} className="btn-outline !py-1.5 !px-3 !text-[12px] disabled:opacity-50 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" />{busy === "reword" ? t("panelsResearch.process.decl.asking") : t("panelsResearch.process.decl.reword")}</button>
              </div>
            )}
            {canEditText && <p className="text-[11px] text-gray-500">{t("panelsResearch.process.decl.rewordNote")}</p>}

            {proposal && canEditText && (
              <div className="rounded-xl border border-prov-ai-line bg-prov-ai-soft p-2.5 space-y-2">
                <div className="text-[11px] text-prov-ai-deep font-medium flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" />{t("panelsResearch.process.decl.proposalTitle")} · {providerLabel(t, proposal.provider)} {proposal.model}{proposal.costUsd ? ` · ${proposal.costUsd.toFixed(4)} USD` : ""}</div>
                {proposal.error && <div className="text-[11px] text-red-600">{proposal.error}</div>}
                {proposal.demo && <div className="text-[11px] text-gray-600">{t("panelsResearch.process.decl.demoProposal")}</div>}
                <div className="text-[12px] leading-relaxed text-gray-800 whitespace-pre-wrap font-serif max-h-56 overflow-y-auto bg-white rounded-lg p-2 border border-prov-ai-line">{proposal.text}</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => { setDraft(proposal.text); patch({ text: proposal.text, aiReworded: !proposal.demo }, "save", t("panelsResearch.process.decl.accepted")); setProposal(null); }} disabled={busy !== null || proposal.demo} className="btn-primary !py-1.5 !px-3 !text-[12px] disabled:opacity-50">{t("panelsResearch.process.decl.accept")}</button>
                  <button onClick={() => setProposal(null)} className="btn-outline !py-1.5 !px-3 !text-[12px]">{t("panelsResearch.process.decl.keepLedger")}</button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap pt-1">
              <button onClick={() => download("txt")} className="btn-outline !py-1.5 !px-3 !text-[12px] flex items-center gap-1"><Download className="w-3.5 h-3.5" />.txt</button>
              <button onClick={() => download("html")} className="btn-outline !py-1.5 !px-3 !text-[12px] flex items-center gap-1"><Download className="w-3.5 h-3.5" />.html</button>
              {isOwner && onInsertDeclaration && (
                <button onClick={() => { onInsertDeclaration(declarationHtml(latest, t, fmt)); setNote({ text: t("panelsResearch.process.decl.appended", { section: finalSubmission }), kind: "success" }); }} disabled={dirty} title={dirty ? t("panelsResearch.process.decl.saveFirst") : undefined} className="btn-outline !py-1.5 !px-3 !text-[12px] disabled:opacity-50">{t("panelsResearch.process.decl.insertAppendix", { section: finalSubmission })}</button>
              )}
            </div>
            {isOwner && onInsertDeclaration && <p className="text-[11px] text-gray-500">{t("panelsResearch.process.decl.insertNote", { section: finalSubmission })}</p>}

            {isOwner && !latest.signedAt && (
              <div className="rounded-xl border border-gray-200 p-2.5 space-y-1.5">
                <p className="text-[11px] text-gray-500">{t("panelsResearch.process.decl.signNote")}</p>
                <button onClick={() => patch({ sign: true }, "sign", t("panelsResearch.process.decl.signedDone", { n: latest.version }))} disabled={dirty || busy !== null} title={dirty ? t("panelsResearch.process.decl.saveFirst") : undefined} className="btn-primary !py-1.5 !px-3 !text-[12px] disabled:opacity-50 flex items-center gap-1"><FileSignature className="w-3.5 h-3.5" />{busy === "sign" ? t("panelsResearch.process.decl.signing") : t("panelsResearch.process.decl.sign")}</button>
              </div>
            )}
            {declarations.length > 1 && <p className="text-[11px] text-gray-400">{t(declarations.length > 2 ? "panelsResearch.process.decl.earlier" : "panelsResearch.process.decl.earlier_one", { n: declarations.length - 1, signed: declarations.some((d) => d.signedAt && d.id !== latest.id) ? t("panelsResearch.process.decl.earlierSigned") : "" })}</p>}
          </div>
        ) : (
          <p className="text-[12px] text-gray-400 mt-2">{isOwner ? t("panelsResearch.process.decl.none") : t("panelsResearch.process.decl.studentNone")}</p>
        )}

        {note && <div className={`mt-2 text-[11px] ${note.kind === "error" ? "text-red-600" : note.kind === "success" ? "text-green-700" : "text-gray-600"}`} role="status">{note.text}</div>}
        <p className="mt-3 text-[11px] text-gray-400">{t("panelsResearch.process.decl.footer")} {isOwner ? t("panelsResearch.process.decl.footerOwner") : t("panelsResearch.process.decl.footerViewer")}</p>
      </section>
    </div>
  );

  if (embedded) return <div className="flex flex-col h-full min-h-0"><div className="flex-1 overflow-y-auto min-h-0">{body}</div></div>;
  return (
    <PanelShell title={t("panelsResearch.process.title")} icon={<History className="w-4 h-4 text-gray-500" />} onClose={onClose}>
      {body}
    </PanelShell>
  );
}
