"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { AlertTriangle, Check, ClipboardCheck, Crosshair, Loader2, Send, X } from "lucide-react";
import { api, timeAgo } from "@/lib/client";
import { PanelShell } from "../Sidebars";
import { anchorStatusFor, AnchorStatus, locateQuote, tokenJaccard } from "@/lib/ai/anchor";
import type { AnchoredReviewComment, ReviewCategory, ReviewScope, ReviewSeverity } from "@/lib/ai/reviewer";
import type { ReviewRun, RubricCriterion } from "@/lib/db";

export interface ReviewerPanelProps {
  editor: Editor;
  thesisId: string;
  sessionId?: string;
  userId: string;
  /** Current selection in the editor, when any; enables the "Selection" scope. */
  selectionText?: string;
  canEdit: boolean;
  /** Called after comments were created, resolved or dismissed so the editor reloads its comment list. */
  onCommentsChanged: () => void;
  /** Called after the panel selected a comment's range, so the editor can mark it active. */
  onJumpToComment: (anchorId: string) => void;
  onClose: () => void;
}

/** An AI reviewer comment as stored by /api/theses/[id]/comments plus the live anchor status. */
interface ReviewItem {
  id: string;
  anchorId: string;
  reviewRunId?: string;
  quote: string;
  rationale: string;
  question?: string;
  category: ReviewCategory;
  severity: ReviewSeverity;
  resolved: boolean;
  dismissedReason?: string;
  createdAt: string;
  status: AnchorStatus;
}

interface CommentRow {
  id: string;
  anchorId: string;
  quote: string;
  text: string;
  resolved: boolean;
  createdAt: string;
  source?: "ai";
  category?: string;
  severity?: string;
  reviewRunId?: string;
  question?: string;
  anchorStatus?: AnchorStatus;
  dismissedReason?: string;
}

interface RunResponse {
  run: ReviewRun;
  comments: AnchoredReviewComment[];
  meta: { provider: string; model: string; label: string; billedTo: "institution" | "student" | "none"; demo: boolean; notice?: string; interactionId?: string };
  rejected: number;
}

const SEVERITIES: ReviewSeverity[] = ["high", "medium", "low"];
const SEVERITY_RANK: Record<ReviewSeverity, number> = { high: 0, medium: 1, low: 2 };
const SEVERITY_LABEL: Record<ReviewSeverity, string> = { high: "High", medium: "Medium", low: "Low" };
const SEVERITY_CLASS: Record<ReviewSeverity, string> = { high: "text-red-600", medium: "text-amber-600", low: "text-gray-500" };
const CATEGORY_CLASS: Record<ReviewCategory, string> = {
  argument: "bg-brand-50 text-brand-700",
  evidence: "bg-amber-50 text-prov-paste-deep",
  structure: "bg-gray-100 text-gray-700",
  clarity: "bg-accent-50 text-accent-700",
  citations: "bg-prov-ai-soft text-prov-ai-deep",
  method: "bg-brand-100 text-brand-800",
};
const PAGE = 5;
const QUESTION_PREFIX = "\n\nQuestion: ";
const sharedKey = (runId: string) => `reviewer_shared_${runId}`;

// ---------- plain text ↔ ProseMirror positions ----------

interface Seg {
  start: number;
  end: number;
  pos: number;
}

/** Plain text of a document range with a map from text offsets back to document positions. */
function plainText(editor: Editor, from: number, to: number): { text: string; segs: Seg[] } {
  let text = "";
  const segs: Seg[] = [];
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isText && node.text) {
      const s = Math.max(from, pos);
      const e = Math.min(to, pos + node.nodeSize);
      if (e <= s) return false;
      const t = node.text.slice(s - pos, e - pos);
      segs.push({ start: text.length, end: text.length + t.length, pos: s });
      text += t;
      return false;
    }
    if (node.type.name === "hardBreak") {
      text += "\n";
      return false;
    }
    if (node.isTextblock && text && !text.endsWith("\n")) text += "\n";
    return true;
  });
  return { text, segs };
}

function offsetToPos(segs: Seg[], off: number, isEnd: boolean): number | null {
  for (const s of segs) {
    if (isEnd ? off > s.start && off <= s.end : off >= s.start && off < s.end) return s.pos + (off - s.start);
  }
  if (isEnd) {
    const prev = [...segs].reverse().find((s) => s.end <= off);
    return prev ? prev.pos + (prev.end - prev.start) : null;
  }
  const next = segs.find((s) => s.start >= off);
  return next ? next.pos : null;
}

function rangeFor(segs: Seg[], start: number, end: number): { from: number; to: number } | null {
  const from = offsetToPos(segs, start, false);
  const to = offsetToPos(segs, end, true);
  return from !== null && to !== null && to > from ? { from, to } : null;
}

/** The section (heading block to the next heading of the same or higher level) the cursor is in. */
function sectionRange(editor: Editor): { from: number; to: number; label: string } {
  const { doc, selection } = editor.state;
  const cursor = selection.from;
  let from = 0;
  let to = doc.content.size;
  let label = "Start of document";
  let level = 0;
  let started = false;
  let closed = false;
  doc.forEach((node, offset) => {
    if (node.type.name !== "heading") return;
    if (offset <= cursor) {
      from = offset;
      label = node.textContent.trim() || "Untitled section";
      level = node.attrs.level as number;
      started = true;
      closed = false;
    } else if (!closed && (!started || (node.attrs.level as number) <= level)) {
      to = offset;
      closed = true;
    }
  });
  if (!closed) to = doc.content.size;
  return { from, to, label };
}

function markRange(editor: Editor, anchorId: string): { from: number; to: number } | null {
  let from = -1;
  let to = -1;
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.marks.some((m) => m.type.name === "commentMark" && m.attrs.id === anchorId)) return;
    if (from === -1) from = pos;
    to = pos + node.nodeSize;
  });
  return from === -1 ? null : { from, to };
}

function statusOf(editor: Editor, item: Pick<ReviewItem, "anchorId" | "quote">): AnchorStatus {
  const r = markRange(editor, item.anchorId);
  if (!r) return "orphaned";
  return anchorStatusFor(editor.state.doc.textBetween(r.from, r.to, " "), item.quote);
}

function toItem(editor: Editor, c: CommentRow): ReviewItem | null {
  if (c.source !== "ai") return null;
  const qi = c.text.indexOf(QUESTION_PREFIX);
  const rationale = qi === -1 ? c.text : c.text.slice(0, qi);
  const question = c.question || (qi === -1 ? undefined : c.text.slice(qi + QUESTION_PREFIX.length));
  const category = (["argument", "evidence", "structure", "clarity", "citations", "method"] as ReviewCategory[]).includes(c.category as ReviewCategory) ? (c.category as ReviewCategory) : "argument";
  const severity: ReviewSeverity = c.severity === "high" || c.severity === "low" ? c.severity : "medium";
  const item: ReviewItem = { id: c.id, anchorId: c.anchorId, reviewRunId: c.reviewRunId, quote: c.quote, rationale, question, category, severity, resolved: c.resolved, dismissedReason: c.dismissedReason, createdAt: c.createdAt, status: "live" };
  item.status = c.resolved ? "live" : statusOf(editor, item);
  return item;
}

// ---------- component ----------

export default function ReviewerPanel({ editor, thesisId, sessionId, userId, selectionText, canEdit, onCommentsChanged, onJumpToComment, onClose }: ReviewerPanelProps) {
  const [rubric, setRubric] = useState<RubricCriterion[]>([]);
  const [runs, setRuns] = useState<ReviewRun[]>([]);
  const [categories, setCategories] = useState<Set<ReviewCategory>>(new Set());
  const [scope, setScope] = useState<ReviewScope>(selectionText ? "selection" : "section");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [phase, setPhase] = useState<"idle" | "running" | "applying">("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [lastRun, setLastRun] = useState<{ run: ReviewRun; meta: RunResponse["meta"]; applied: number; dropped: number } | null>(null);
  const [visible, setVisible] = useState(PAGE);
  const [showResolved, setShowResolved] = useState(false);
  const [dismissing, setDismissing] = useState<{ id: string; reason: string } | null>(null);
  const [shared, setShared] = useState<Record<string, string>>({});
  const [sharing, setSharing] = useState(false);
  const selectionRef = useRef<{ from: number; to: number } | null>(null);
  const itemsRef = useRef<ReviewItem[]>([]);
  itemsRef.current = items;
  const [section, setSection] = useState(() => sectionRange(editor));

  // The "Section" scope follows the cursor.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setSection(sectionRange(editor)), 250);
    };
    editor.on("selectionUpdate", update);
    editor.on("update", update);
    return () => {
      clearTimeout(timer);
      editor.off("selectionUpdate", update);
      editor.off("update", update);
    };
  }, [editor]);

  // Remember the selection the "Selection" scope refers to, before focus moves into the panel.
  useEffect(() => {
    if (selectionText) {
      const { from, to } = editor.state.selection;
      if (to > from) selectionRef.current = { from, to };
    } else {
      selectionRef.current = null;
      setScope((s) => (s === "selection" ? "section" : s));
    }
  }, [selectionText, editor]);

  const loadItems = useCallback(async () => {
    const d = await api<{ comments: CommentRow[] }>(`/api/theses/${thesisId}/comments`).catch(() => ({ comments: [] as CommentRow[] }));
    setItems(d.comments.map((c) => toItem(editor, c)).filter((x): x is ReviewItem => !!x));
  }, [thesisId, editor]);

  useEffect(() => {
    api<{ runs: ReviewRun[]; rubric: RubricCriterion[] }>(`/api/ai/reviewer?thesisId=${encodeURIComponent(thesisId)}`)
      .then((d) => {
        setRuns(d.runs);
        setRubric(d.rubric);
        setCategories(new Set(d.rubric.filter((c) => c.weight > 0).map((c) => c.id)));
        const s: Record<string, string> = {};
        for (const run of d.runs) {
          try {
            const v = localStorage.getItem(sharedKey(run.id));
            if (v) s[run.id] = v;
          } catch {
            /* private mode */
          }
        }
        setShared(s);
      })
      .catch((e: Error) => setError(e.message));
    loadItems();
  }, [thesisId, loadItems]);

  // Re-check anchors after edits: a comment whose text drifted becomes "stale" instead of moving silently.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const recheck = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        let changed = false;
        const next = itemsRef.current.map((it) => {
          if (it.resolved) return it;
          const status = statusOf(editor, it);
          if (status === it.status) return it;
          changed = true;
          if (canEdit) api("/api/ai/reviewer", { method: "PATCH", json: { thesisId, commentId: it.id, anchorStatus: status } }).catch(() => {});
          return { ...it, status };
        });
        if (changed) setItems(next);
      }, 700);
    };
    editor.on("update", recheck);
    return () => {
      clearTimeout(timer);
      editor.off("update", recheck);
    };
  }, [editor, canEdit, thesisId]);

  const toggleCategory = (id: ReviewCategory) =>
    setCategories((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const scopeRange = (): { from: number; to: number; label?: string } | null => {
    if (scope === "selection") return selectionRef.current;
    if (scope === "section") return sectionRange(editor);
    return { from: 0, to: editor.state.doc.content.size };
  };

  const review = async () => {
    setError("");
    const range = scopeRange();
    if (!range || range.to <= range.from) {
      setError(scope === "selection" ? "Select some text in the document first." : "There is no text in this scope.");
      return;
    }
    const sent = plainText(editor, range.from, range.to);
    if (!sent.text.trim()) {
      setError("There is no text to review in this scope.");
      return;
    }
    setPhase("running");
    setProgress("Asking the reviewer…");
    let res: RunResponse;
    try {
      res = await api<RunResponse>("/api/ai/reviewer", { method: "POST", json: { thesisId, scope, text: sent.text, sectionLabel: scope === "section" ? range.label : undefined, sessionId, categories: Array.from(categories) } });
    } catch (e) {
      setPhase("idle");
      setError((e as Error).message);
      return;
    }
    setPhase("applying");
    setProgress(`Anchoring ${res.comments.length} comment${res.comments.length === 1 ? "" : "s"}…`);
    const keep = { from: editor.state.selection.from, to: editor.state.selection.to };
    // The document may have changed while the request ran: re-read the range and fall back to re-locating quotes.
    const live = plainText(editor, Math.min(range.from, editor.state.doc.content.size), Math.min(range.to, editor.state.doc.content.size));
    const whole = plainText(editor, 0, editor.state.doc.content.size);
    const unchanged = live.text === sent.text;
    const created: ReviewItem[] = [];
    let dropped = 0;
    for (let i = 0; i < res.comments.length; i++) {
      const c = res.comments[i];
      let pm = unchanged ? rangeFor(live.segs, c.start, c.end) : null;
      const matches = (r: { from: number; to: number } | null) => !!r && tokenJaccard(editor.state.doc.textBetween(r.from, r.to, " "), c.quote) >= 0.6;
      if (!matches(pm)) {
        const inLive = locateQuote(live.text, c.quote);
        const a = inLive || locateQuote(whole.text, c.quote);
        pm = a ? rangeFor(inLive ? live.segs : whole.segs, a.start, a.end) : null;
      }
      if (!matches(pm) || !pm) {
        dropped++;
        continue;
      }
      const anchorId = `cmt_ai_${Date.now().toString(36)}${i.toString(36)}`;
      if (canEdit) editor.chain().setTextSelection({ from: pm.from, to: pm.to }).setMark("commentMark", { id: anchorId }).run();
      const text = c.rationale + (c.question ? `${QUESTION_PREFIX}${c.question}` : "");
      try {
        const r = await api<{ comment: CommentRow }>(`/api/theses/${thesisId}/comments`, { method: "POST", json: { anchorId, quote: c.quote, text, source: "ai", category: c.category, severity: c.severity, reviewRunId: res.run.id, question: c.question } });
        // The generic comments route stores source/category/severity; the reviewer-only fields go through the reviewer route.
        await api("/api/ai/reviewer", { method: "PATCH", json: { thesisId, commentId: r.comment.id, reviewRunId: res.run.id, question: c.question, anchorStatus: "live" } }).catch(() => {});
        created.push({ id: r.comment.id, anchorId, reviewRunId: res.run.id, quote: c.quote, rationale: c.rationale, question: c.question, category: c.category, severity: c.severity, resolved: false, createdAt: r.comment.createdAt, status: "live" });
      } catch {
        if (canEdit) editor.commands.unsetComment(anchorId);
        dropped++;
      }
    }
    try {
      editor.commands.setTextSelection(keep);
    } catch {
      /* document shrank */
    }
    setItems((prev) => [...created, ...prev]);
    setRuns((prev) => [res.run, ...prev]);
    setLastRun({ run: res.run, meta: res.meta, applied: created.length, dropped: dropped + res.rejected });
    setVisible(PAGE);
    setPhase("idle");
    setProgress("");
    if (created.length) onCommentsChanged();
  };

  const locate = (it: ReviewItem) => {
    let r = markRange(editor, it.anchorId);
    if (!r) {
      const whole = plainText(editor, 0, editor.state.doc.content.size);
      const a = locateQuote(whole.text, it.quote);
      r = a ? rangeFor(whole.segs, a.start, a.end) : null;
    }
    if (!r) {
      setError("This passage is no longer in the document.");
      return;
    }
    editor.chain().focus().setTextSelection(r).run();
    const dom = editor.view.domAtPos(r.from).node;
    ((dom as HTMLElement).nodeType === 1 ? (dom as HTMLElement) : (dom as Text).parentElement)?.scrollIntoView({ behavior: "smooth", block: "center" });
    onJumpToComment(it.anchorId);
  };

  const resolve = async (it: ReviewItem) => {
    await api(`/api/theses/${thesisId}/comments/${it.id}`, { method: "PATCH", json: { resolved: true } }).catch((e: Error) => setError(e.message));
    if (canEdit) editor.commands.unsetComment(it.anchorId);
    setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, resolved: true } : x)));
    onCommentsChanged();
  };

  const dismiss = async (it: ReviewItem, reason: string) => {
    await api("/api/ai/reviewer", { method: "PATCH", json: { thesisId, commentId: it.id, dismissedReason: reason } }).catch((e: Error) => setError(e.message));
    if (canEdit) editor.commands.unsetComment(it.anchorId);
    setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, resolved: true, dismissedReason: reason || "No reason given" } : x)));
    setDismissing(null);
    onCommentsChanged();
  };

  const share = async (runId: string) => {
    setSharing(true);
    try {
      const d = await api<{ sharedAt: string }>("/api/ai/reviewer", { method: "PATCH", json: { thesisId, runId, share: true } });
      setShared((s) => ({ ...s, [runId]: d.sharedAt }));
      try {
        localStorage.setItem(sharedKey(runId), d.sharedAt);
      } catch {
        /* private mode */
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setSharing(false);
  };

  const open = items.filter((x) => !x.resolved).sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.createdAt.localeCompare(a.createdAt));
  const resolved = items.filter((x) => x.resolved);
  const shown = open.slice(0, visible);
  const counts = SEVERITIES.map((s) => [s, open.filter((x) => x.severity === s).length] as const).filter(([, n]) => n > 0);
  const busy = phase !== "idle";
  const latestRun = lastRun?.run || runs[0];
  const latestOpen = latestRun ? open.filter((x) => x.reviewRunId === latestRun.id).length : 0;

  return (
    <PanelShell title="AI reviewer" icon={<ClipboardCheck className="w-4 h-4 text-gray-500" />} onClose={onClose}>
      <div className="p-3 space-y-3">
        {/* Scope */}
        <div>
          <div className="text-[11px] font-medium text-gray-500 mb-1.5">Scope</div>
          <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-gray-100" role="group" aria-label="Review scope">
            {(["selection", "section", "document"] as ReviewScope[]).map((s) => {
              const disabled = s === "selection" && !selectionText;
              return (
                <button key={s} type="button" disabled={disabled || busy} aria-pressed={scope === s} onClick={() => setScope(s)} className={`text-xs py-1.5 rounded-md ${scope === s ? "bg-white shadow-sm font-medium text-gray-900" : "text-gray-600 hover:text-gray-900"} disabled:opacity-40`}>
                  {s === "selection" ? "Selection" : s === "section" ? "Section" : "Document"}
                </button>
              );
            })}
          </div>
          <div className="text-[11px] text-gray-500 mt-1.5 truncate">
            {scope === "selection" && selectionText ? `“${selectionText.slice(0, 80)}${selectionText.length > 80 ? "…" : ""}”` : scope === "section" ? `Section: ${section.label}` : "The whole document, chunked by paragraph."}
          </div>
        </div>

        {/* Rubric criteria */}
        <div>
          <div className="text-[11px] font-medium text-gray-500 mb-1.5">Criteria</div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Rubric criteria to review">
            {rubric.map((c) => {
              const on = categories.has(c.id);
              const off = c.weight === 0;
              return (
                <button key={c.id} type="button" disabled={off || busy} aria-pressed={on} title={off ? `${c.label}: disabled by your institution` : c.description} onClick={() => toggleCategory(c.id)} className={`text-[11px] px-2 py-1 rounded-[10px] border ${on && !off ? `${CATEGORY_CLASS[c.id]} border-transparent font-medium` : "border-gray-200 text-gray-500"} disabled:opacity-40 disabled:line-through`}>
                  {c.label}
                </button>
              );
            })}
            {!rubric.length && <span className="text-[11px] text-gray-400">Loading rubric…</span>}
          </div>
        </div>

        {/* Run */}
        <div>
          <button type="button" onClick={review} disabled={busy || !canEdit || !categories.size || (scope === "selection" && !selectionText)} className="btn-primary w-full flex items-center justify-center gap-2 text-sm py-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
            {busy ? progress : "Review"}
          </button>
          <p className="text-[11px] text-gray-500 mt-1.5 leading-snug">
            {canEdit ? "Creates anchored comments in this document. Your advisor is not notified until you share them. Logged as an AI interaction." : "The reviewer anchors comments in the document, so only someone who can edit it can run it."}
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 text-red-700 text-xs" role="alert">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError("")} aria-label="Dismiss message" className="text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {lastRun && (
          <div className="p-2.5 rounded-lg bg-gray-50 text-[11px] text-gray-600 space-y-1">
            <div>
              <span className="font-medium text-gray-800">{lastRun.applied} comment{lastRun.applied === 1 ? "" : "s"}</span> anchored{lastRun.dropped ? `, ${lastRun.dropped} dropped by validation` : ""} · {lastRun.meta.label}
              {lastRun.meta.billedTo === "institution" ? " · paid by your university" : lastRun.meta.billedTo === "student" ? " · your own account" : ""}
            </div>
            {lastRun.meta.demo && <div className="text-gray-500">Demo reviewer: comments come from simple textual cues, not from a model. Connect a provider for a real review.</div>}
            {lastRun.meta.notice && <div className="text-amber-700">{lastRun.meta.notice}</div>}
          </div>
        )}

        {/* Share */}
        {latestRun && (
          <div className="flex items-center gap-2">
            {shared[latestRun.id] ? (
              <div className="text-[11px] text-gray-500 flex items-center gap-1"><Check className="w-3.5 h-3.5 text-accent-600" />Shared with your advisor {timeAgo(shared[latestRun.id])}</div>
            ) : (
              <div className="flex-1">
                <button type="button" onClick={() => share(latestRun.id)} disabled={sharing || busy} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-40">
                  <Send className="w-3.5 h-3.5" />Share with advisor
                </button>
                <div className="text-[11px] text-gray-400 mt-1">Notifies your advisor about this review ({latestOpen} open). The comments and their status are already visible in the document.</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="border-t border-gray-100">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="text-xs font-semibold flex-1">Open comments <span className="text-gray-400 font-normal">{open.length}</span></div>
          {counts.map(([s, n]) => (
            <span key={s} className={`text-[10px] ${SEVERITY_CLASS[s]}`}>{n} {SEVERITY_LABEL[s].toLowerCase()}</span>
          ))}
        </div>
        {open.length === 0 && !busy && <div className="px-3 pb-3 text-xs text-gray-400">{items.length ? "Everything is resolved." : "Pick a scope and run the reviewer. Comments stay anchored to the text they refer to."}</div>}
        <ul className="px-3 pb-3 space-y-2">
          {shown.map((it, i) => {
            const newGroup = i === 0 || shown[i - 1].severity !== it.severity;
            return (
              <li key={it.id}>
                {newGroup && <div className={`text-[10px] font-semibold uppercase tracking-wide mt-1 mb-1 ${SEVERITY_CLASS[it.severity]}`}>{SEVERITY_LABEL[it.severity]} severity</div>}
                <article className="p-3 rounded-xl border border-gray-100 hover:border-gray-200">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-[10px] font-medium ${CATEGORY_CLASS[it.category]}`}>{rubric.find((r) => r.id === it.category)?.label || it.category}</span>
                    <span className={`text-[10px] ${SEVERITY_CLASS[it.severity]}`}>{SEVERITY_LABEL[it.severity]}</span>
                    {it.status === "stale" && <span className="text-[10px] px-1.5 py-0.5 rounded-[10px] bg-amber-50 text-amber-700" title="The text under this comment changed since the review">Text changed</span>}
                    {it.status === "orphaned" && <span className="text-[10px] px-1.5 py-0.5 rounded-[10px] bg-gray-100 text-gray-500" title="The anchored passage was removed">Anchor lost</span>}
                    <span className="flex-1" />
                    <span className="text-[10px] text-gray-400">{timeAgo(it.createdAt)}</span>
                  </div>
                  <blockquote className="text-[11px] text-gray-500 border-l-2 border-gray-200 pl-2 mb-1.5 line-clamp-2">{it.quote}</blockquote>
                  <p className="text-[13px] text-gray-800 leading-snug">{it.rationale}</p>
                  {it.question && <p className="text-[13px] text-brand-700 mt-1 leading-snug">{it.question}</p>}
                  {dismissing?.id === it.id ? (
                    <form
                      className="mt-2 flex gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        dismiss(it, dismissing.reason.trim());
                      }}
                    >
                      <input autoFocus value={dismissing.reason} onChange={(e) => setDismissing({ id: it.id, reason: e.target.value })} placeholder="Why does this not apply?" aria-label="Reason for dismissing" maxLength={200} className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-brand-400" />
                      <button type="submit" className="text-xs px-2.5 py-1 rounded-lg bg-gray-800 text-white">Dismiss</button>
                      <button type="button" onClick={() => setDismissing(null)} aria-label="Cancel dismissing" className="text-xs px-2 py-1 rounded-lg hover:bg-gray-100"><X className="w-3.5 h-3.5" /></button>
                    </form>
                  ) : (
                    <div className="mt-2 flex items-center gap-1">
                      <button type="button" onClick={() => locate(it)} className="text-xs px-2.5 py-1 rounded-lg hover:bg-gray-100 text-gray-700 flex items-center gap-1"><Crosshair className="w-3.5 h-3.5" />Locate</button>
                      <span className="flex-1" />
                      <button type="button" onClick={() => resolve(it)} className="text-xs px-2.5 py-1 rounded-lg hover:bg-accent-50 text-accent-700 flex items-center gap-1"><Check className="w-3.5 h-3.5" />Resolve</button>
                      <button type="button" onClick={() => setDismissing({ id: it.id, reason: "" })} className="text-xs px-2.5 py-1 rounded-lg hover:bg-gray-100 text-gray-500">Dismiss</button>
                    </div>
                  )}
                </article>
              </li>
            );
          })}
        </ul>
        {open.length > visible && (
          <div className="px-3 pb-3">
            <button type="button" onClick={() => setVisible((v) => v + PAGE)} className="w-full text-xs py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700">Show more ({open.length - visible} remaining)</button>
          </div>
        )}
        {resolved.length > 0 && (
          <div className="border-t border-gray-100 px-3 py-2">
            <button type="button" onClick={() => setShowResolved((v) => !v)} aria-expanded={showResolved} className="text-xs text-gray-500 hover:text-gray-700">
              {showResolved ? "Hide" : "Show"} resolved and dismissed ({resolved.length})
            </button>
            {showResolved && (
              <ul className="mt-2 space-y-1.5">
                {resolved.map((it) => (
                  <li key={it.id} className="text-[11px] text-gray-500 p-2 rounded-lg bg-gray-50">
                    <span className={`px-1.5 py-0.5 rounded-[10px] mr-1 ${CATEGORY_CLASS[it.category]}`}>{rubric.find((r) => r.id === it.category)?.label || it.category}</span>
                    <span className="line-clamp-1 mt-1">{it.rationale}</span>
                    <span className="block mt-0.5 text-gray-400">{it.dismissedReason ? `Dismissed: ${it.dismissedReason}` : "Resolved"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {runs.length > 0 && (
          <div className="border-t border-gray-100 px-3 py-2 text-[11px] text-gray-400">
            {runs.length} review{runs.length === 1 ? "" : "s"} on this thesis · last {timeAgo(runs[0].createdAt)} ({runs[0].scope}{runs[0].scopeLabel ? `: ${runs[0].scopeLabel}` : ""}, {runs[0].model}){runs[0].userId !== userId ? " · requested by someone else" : ""}
          </div>
        )}
      </div>
    </PanelShell>
  );
}
