"use client";

import { useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";
import { AlertTriangle, ArrowDown, ArrowUp, BookMarked, Bot, Check, CheckCircle2, History, Library, MessageSquare, Plus, RotateCcw, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { api } from "@/lib/client";
import { useFormat, useT } from "@/lib/i18n/client";
import DatabaseCard, { ResearchDb } from "../library/DatabaseCard";
import { CommentItem, FlagItem, formatReference, formatTimeAgo, IntegrityBreakdown, IntegrityFix, Reference, ThesisDoc, VersionItem } from "./types";

export function PanelShell({ title, icon, onClose, children, actions }: { title: string; icon?: React.ReactNode; onClose: () => void; children: React.ReactNode; actions?: React.ReactNode }) {
  const t = useT();
  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 flex-shrink-0">
        {icon}
        <div className="text-sm font-semibold flex-1">{title}</div>
        {actions}
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1" aria-label={t("common.close")}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">{children}</div>
    </div>
  );
}

// ---------- Outline ----------
export function OutlinePanel({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const t = useT();
  const [items, setItems] = useState<{ level: number; text: string; pos: number }[]>([]);
  useEffect(() => {
    const compute = () => {
      const out: { level: number; text: string; pos: number }[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading") out.push({ level: node.attrs.level, text: node.textContent || t("editor.outline.untitled"), pos });
      });
      setItems(out);
    };
    compute();
    editor.on("update", compute);
    return () => {
      editor.off("update", compute);
    };
  }, [editor, t]);
  return (
    <PanelShell title={t("editor.panel.outline")} onClose={onClose}>
      {items.length === 0 && <div className="p-4 text-xs text-gray-400">{t("editor.outline.empty")}</div>}
      <ul className="py-2">
        {items.map((it, i) => (
          <li key={i}>
            <button
              onClick={() => {
                editor.chain().focus().setTextSelection(it.pos + 1).run();
                const dom = editor.view.nodeDOM(it.pos) as HTMLElement | null;
                dom?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="w-full text-left text-[13px] py-1 pr-3 hover:bg-gray-50 truncate text-gray-700"
              style={{ paddingLeft: `${8 + (it.level - 1) * 14}px`, fontWeight: it.level <= 2 ? 500 : 400 }}
            >
              {it.text}
            </button>
          </li>
        ))}
      </ul>
    </PanelShell>
  );
}

// ---------- Comments ----------
export function CommentsPanel({ comments, activeId, canResolve, userId, onJump, onReply, onResolve, onDelete, onClose, pendingQuote, onCreate, onCancelCreate }: { comments: CommentItem[]; activeId: string | null; canResolve: boolean; userId: string; onJump: (c: CommentItem) => void; onReply: (id: string, text: string) => void; onResolve: (id: string, resolved: boolean) => void; onDelete: (id: string) => void; onClose: () => void; pendingQuote: string | null; onCreate: (text: string) => void; onCancelCreate: () => void }) {
  const t = useT();
  const fmt = useFormat();
  const ago = (iso: string) => formatTimeAgo(iso, t, (d) => fmt.date(d));
  const [reply, setReply] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const visible = comments.filter((c) => showResolved || !c.resolved);
  return (
    <PanelShell title={t("editor.panel.comments")} icon={<MessageSquare className="w-4 h-4 text-gray-500" />} onClose={onClose} actions={<label className="text-[11px] text-gray-500 flex items-center gap-1"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />{t("editor.comments.resolved")}</label>}>
      {pendingQuote !== null && (
        <div className="m-3 p-3 rounded-xl border border-brand-200 bg-brand-50/50">
          <div className="text-[11px] text-gray-500 mb-1 line-clamp-2">“{pendingQuote || "…"}”</div>
          <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("editor.comments.placeholder")} className="w-full text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:border-brand-400 resize-none" rows={3} />
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => { setDraft(""); onCancelCreate(); }} className="text-xs px-3 py-1.5 rounded-lg hover:bg-gray-100">{t("common.cancel")}</button>
            <button disabled={!draft.trim()} onClick={() => { onCreate(draft.trim()); setDraft(""); }} className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white disabled:opacity-40">{t("editor.comment")}</button>
          </div>
        </div>
      )}
      {visible.length === 0 && pendingQuote === null && <div className="p-4 text-xs text-gray-400">{t("editor.comments.empty")}</div>}
      <div className="p-3 space-y-3">
        {visible.map((c) => (
          <div key={c.id} onClick={() => onJump(c)} className={`p-3 rounded-xl border cursor-pointer ${activeId === c.id ? "border-brand-400 shadow-sm" : "border-gray-100"} ${c.resolved ? "opacity-60" : ""}`}>
            <div className="flex items-center gap-2 mb-1">
              {c.authorRole === "ai" ? (
                <div className="w-6 h-6 rounded-full bg-prov-ai-soft text-prov-ai-deep flex items-center justify-center" aria-hidden="true"><Bot className="w-3.5 h-3.5" /></div>
              ) : (
                <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-[10px] font-semibold flex items-center justify-center">{c.authorName.split(" ").map((n) => n[0]).join("").slice(0, 2)}</div>
              )}
              <div className="text-xs font-medium flex-1 truncate">{c.authorName}{c.authorRole === "professor" && <span className="ml-1 text-[10px] text-brand-600">{t("editor.comments.advisorTag")}</span>}</div>
              <div className="text-[10px] text-gray-400">{ago(c.createdAt)}</div>
              {(canResolve || c.authorId === userId) && (
                <button onClick={(e) => { e.stopPropagation(); onResolve(c.id, !c.resolved); }} className="text-gray-400 hover:text-green-600" title={c.resolved ? t("editor.comments.reopen") : t("editor.comments.resolve")} aria-label={c.resolved ? t("editor.comments.reopen") : t("editor.comments.resolve")}>
                  {c.resolved ? <RotateCcw className="w-3.5 h-3.5" /> : <Check className="w-4 h-4" />}
                </button>
              )}
              {c.authorId === userId && (
                <button onClick={(e) => { e.stopPropagation(); onDelete(c.id); }} className="text-gray-300 hover:text-red-500" title={t("common.delete")} aria-label={t("common.delete")}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {c.quote && <div className="text-[11px] text-gray-400 border-l-2 border-amber-300 pl-2 mb-1 line-clamp-2">{c.quote}</div>}
            <div className="text-sm whitespace-pre-wrap">{c.text}</div>
            {c.replies.map((r) => (
              <div key={r.id} className="mt-2 pl-3 border-l border-gray-100">
                <div className="text-[11px] font-medium">{r.authorName} <span className="text-gray-400 font-normal">{ago(r.createdAt)}</span></div>
                <div className="text-sm whitespace-pre-wrap">{r.text}</div>
              </div>
            ))}
            {!c.resolved && (
              <div className="mt-2 flex gap-1" onClick={(e) => e.stopPropagation()}>
                <input value={reply[c.id] || ""} onChange={(e) => setReply({ ...reply, [c.id]: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && (reply[c.id] || "").trim()) { onReply(c.id, reply[c.id].trim()); setReply({ ...reply, [c.id]: "" }); } }} placeholder={t("editor.comments.reply")} className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-brand-400" />
              </div>
            )}
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

// ---------- Versions ----------
export function VersionsPanel({ versions, onRestore, onPreview, onCreate, onClose, canRestore }: { versions: VersionItem[]; onRestore: (id: string) => void; onPreview: (id: string) => void; onCreate: () => void; onClose: () => void; canRestore: boolean }) {
  const t = useT();
  const fmt = useFormat();
  const kindLabel = (k: string) => {
    const key = `editor.versions.kind.${k}`;
    const l = t(key);
    return l === key ? k : l;
  };
  return (
    <PanelShell title={t("editor.panel.versions")} icon={<History className="w-4 h-4 text-gray-500" />} onClose={onClose} actions={canRestore ? <button onClick={onCreate} className="text-[11px] text-brand-600 flex items-center gap-1 hover:underline"><Plus className="w-3 h-3" />{t("editor.versions.nameCurrent")}</button> : undefined}>
      {versions.length === 0 && <div className="p-4 text-xs text-gray-400">{t("editor.versions.empty")}</div>}
      <ul className="py-1">
        {versions.map((v) => (
          <li key={v.id} className="px-3 py-2 hover:bg-gray-50 group">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">{v.label || (v.kind === "autosave" ? t("editor.versions.autosave") : v.kind === "restore" ? t("editor.versions.beforeRestore") : t("editor.versions.version"))}</div>
                <div className="text-[11px] text-gray-400">{fmt.dateTime(v.createdAt)} · {t("common.words", { n: fmt.number(v.wordCount) })} · {v.authorName}</div>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${v.kind === "milestone" || v.kind === "manual" ? "bg-brand-50 text-brand-700" : "bg-gray-100 text-gray-500"}`}>{kindLabel(v.kind)}</span>
            </div>
            <div className="flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => onPreview(v.id)} className="text-[11px] text-gray-600 hover:underline">{t("editor.versions.preview")}</button>
              {canRestore && <button onClick={() => onRestore(v.id)} className="text-[11px] text-brand-600 hover:underline">{t("editor.versions.restore")}</button>}
            </div>
          </li>
        ))}
      </ul>
    </PanelShell>
  );
}

// ---------- References ----------
const emptyRef: Reference = { id: "", type: "article", authors: "", year: "", title: "", source: "", url: "", doi: "", pages: "", volume: "", issue: "" };

export function ReferencesPanel({ references, style, onChangeStyle, onAdd, onRemove, onInsertInText, onInsertBibliography, onAddWithAi, onClose, canEdit }: { references: Reference[]; style: ThesisDoc["citationStyle"]; onChangeStyle: (s: ThesisDoc["citationStyle"]) => void; onAdd: (r: Reference) => void; onRemove: (id: string) => void; onInsertInText: (r: Reference) => void; onInsertBibliography: () => void; onAddWithAi?: () => void; onClose: () => void; canEdit: boolean }) {
  const t = useT();
  const [form, setForm] = useState<Reference | null>(null);
  const sorted = useMemo(() => [...references].sort((a, b) => a.authors.localeCompare(b.authors)), [references]);
  const f = (k: keyof Reference) => ({ value: (form?.[k] as string) || "", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...(form as Reference), [k]: e.target.value }) });
  return (
    <PanelShell title={t("editor.panel.citations")} icon={<BookMarked className="w-4 h-4 text-gray-500" />} onClose={onClose} actions={<select value={style} onChange={(e) => onChangeStyle(e.target.value as ThesisDoc["citationStyle"])} className="text-[11px] border border-gray-200 rounded px-1 py-0.5">{["APA", "MLA", "Chicago", "IEEE", "Harvard"].map((s) => <option key={s}>{s}</option>)}</select>}>
      <div className="p-3 space-y-2">
        {canEdit && !form && (
          <div className="flex gap-2">
            {onAddWithAi && (
              <button onClick={onAddWithAi} className="flex-1 text-xs py-2 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 flex items-center justify-center gap-1 font-medium">
                <Sparkles className="w-3.5 h-3.5" /> {t("editor.refs.findSource")}
              </button>
            )}
            <button onClick={() => setForm({ ...emptyRef, id: `ref_${Date.now()}` })} className="flex-1 text-xs py-2 rounded-lg border border-dashed border-gray-300 text-gray-600 hover:border-brand-400 hover:text-brand-600 flex items-center justify-center gap-1">
              <Plus className="w-3.5 h-3.5" /> {t("editor.refs.addManually")}
            </button>
          </div>
        )}
        {form && (
          <div className="p-3 rounded-xl border border-brand-200 bg-brand-50/40 space-y-2 text-xs">
            <select {...f("type")} className="input-field !py-1.5 !text-xs">{["article", "book", "chapter", "web", "thesis"].map((ty) => <option key={ty} value={ty}>{t(`editor.refs.type.${ty}`)}</option>)}</select>
            <input {...f("authors")} placeholder={t("editor.refs.authors")} className="input-field !py-1.5 !text-xs" />
            <div className="grid grid-cols-2 gap-2"><input {...f("year")} placeholder={t("editor.refs.year")} className="input-field !py-1.5 !text-xs" /><input {...f("pages")} placeholder={t("editor.refs.pages")} className="input-field !py-1.5 !text-xs" /></div>
            <input {...f("title")} placeholder={t("editor.refs.title")} className="input-field !py-1.5 !text-xs" />
            <input {...f("source")} placeholder={t("editor.refs.sourceField")} className="input-field !py-1.5 !text-xs" />
            <div className="grid grid-cols-2 gap-2"><input {...f("volume")} placeholder={t("editor.refs.volume")} className="input-field !py-1.5 !text-xs" /><input {...f("issue")} placeholder={t("editor.refs.issue")} className="input-field !py-1.5 !text-xs" /></div>
            <input {...f("doi")} placeholder={t("editor.refs.doi")} className="input-field !py-1.5 !text-xs" />
            <input {...f("url")} placeholder={t("editor.refs.url")} className="input-field !py-1.5 !text-xs" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setForm(null)} className="px-3 py-1.5 rounded-lg hover:bg-gray-100">{t("common.cancel")}</button>
              <button disabled={!form.authors || !form.title || !form.year} onClick={() => { onAdd(form); setForm(null); }} className="px-3 py-1.5 rounded-lg bg-brand-600 text-white disabled:opacity-40">{t("common.save")}</button>
            </div>
          </div>
        )}
        {sorted.map((r) => {
          const fm = formatReference(r, style);
          return (
            <div key={r.id} className="p-2.5 rounded-xl border border-gray-100 hover:border-gray-200 text-xs">
              <div className="text-gray-700" dangerouslySetInnerHTML={{ __html: fm.full }} />
              <div className="flex items-center gap-2 mt-1.5">
                {canEdit && <button onClick={() => onInsertInText(r)} className="text-brand-600 hover:underline">{t("editor.refs.insertInText", { cite: fm.inText })}</button>}
                {canEdit && <button onClick={() => onRemove(r.id)} className="text-gray-300 hover:text-red-500 ml-auto" aria-label={t("common.remove")} title={t("common.remove")}><Trash2 className="w-3.5 h-3.5" /></button>}
              </div>
            </div>
          );
        })}
        {references.length === 0 && !form && <div className="text-xs text-gray-400 text-center py-4">{t("editor.refs.empty")}</div>}
        {references.length > 0 && canEdit && (
          <button onClick={onInsertBibliography} className="w-full text-xs py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">{t("editor.refs.insertBibliography", { style })}</button>
        )}
        <UniversityDatabases />
      </div>
    </PanelShell>
  );
}

// ---------- Find & replace ----------
export function FindPanel({ editor, onClose, canEdit }: { editor: Editor; onClose: () => void; canEdit: boolean }) {
  const t = useT();
  const [term, setTerm] = useState("");
  const [replace, setReplace] = useState("");
  const [cs, setCs] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    editor.commands.setSearchTerm(term, replace, cs);
    tick((n) => n + 1);
    return () => {
      /* keep highlights until panel closes */
    };
  }, [term, replace, cs, editor]);
  useEffect(() => () => { editor.commands.clearSearch(); }, [editor]);
  const s = editor.storage.search as { results: { from: number; to: number }[]; index: number };
  return (
    <PanelShell title={t("editor.panel.find")} onClose={onClose}>
      <div className="p-3 space-y-2 text-sm">
        <div className="flex gap-1">
          <input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.shiftKey ? editor.commands.prevSearchResult() : editor.commands.nextSearchResult(); tick((n) => n + 1); } }} placeholder={t("editor.find.placeholder")} className="input-field !py-1.5 flex-1" />
          <button onClick={() => { editor.commands.prevSearchResult(); tick((n) => n + 1); }} className="tb-btn border border-gray-200" title={t("editor.find.previous")} aria-label={t("editor.find.previous")}><ArrowUp className="w-4 h-4" /></button>
          <button onClick={() => { editor.commands.nextSearchResult(); tick((n) => n + 1); }} className="tb-btn border border-gray-200" title={t("editor.find.next")} aria-label={t("editor.find.next")}><ArrowDown className="w-4 h-4" /></button>
        </div>
        <div className="text-[11px] text-gray-500">{term ? (s.results.length ? t("editor.find.position", { i: s.index + 1, n: s.results.length }) : t("editor.find.noResults")) : t("editor.find.hint")}</div>
        {canEdit && (
          <>
            <input value={replace} onChange={(e) => setReplace(e.target.value)} placeholder={t("editor.find.replaceWith")} className="input-field !py-1.5" />
            <div className="flex gap-2">
              <button disabled={!s.results.length} onClick={() => { editor.commands.replaceCurrent(); setTimeout(() => tick((n) => n + 1), 10); }} className="btn-outline !py-1.5 !px-3 text-xs disabled:opacity-40">{t("editor.find.replace")}</button>
              <button disabled={!s.results.length} onClick={() => { editor.commands.replaceAll(); setTimeout(() => tick((n) => n + 1), 10); }} className="btn-outline !py-1.5 !px-3 text-xs disabled:opacity-40">{t("editor.find.replaceAll")}</button>
            </div>
          </>
        )}
        <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={cs} onChange={(e) => setCs(e.target.checked)} />{t("editor.find.matchCase")}</label>
      </div>
    </PanelShell>
  );
}

// ---------- Integrity ledger ----------
const NOTICE_TYPES = ["bulk_paste", "unattributed_ai", "policy_limit", "rapid_typing", "ai_generation", "style_inconsistency"];
const LINE_CODES = ["ai_share", "paste_unattributed", "paste_attributed", "open_notice", "floor"];

/** Notice titles by type, shared by the ledger, the toasts and the pill (`editor.notice.type.<type>`). */
export function useNoticeLabel() {
  const t = useT();
  return (type: string) => (NOTICE_TYPES.indexOf(type) !== -1 ? t(`editor.notice.type.${type}`) : type.replace(/_/g, " "));
}

/**
 * Integrity ledger: the score as a list of visible deductions, each with the action that removes it, followed by
 * the provenance split, the session counters and the notices. Student and advisor see the same ledger.
 */
export function IntegrityLedger({ thesis, flags, session, maxAi, breakdown, showProvenance, onToggleProvenance, onFix, onRespondFlag, onClose, isOwner }: { thesis: ThesisDoc; flags: FlagItem[]; session: Record<string, number> | null; maxAi: number; breakdown: IntegrityBreakdown | null; showProvenance: boolean; onToggleProvenance: () => void; onFix: (fix: IntegrityFix, noticeId?: string) => void; onRespondFlag: (id: string, note: string) => void; onClose: () => void; isOwner: boolean }) {
  const t = useT();
  const fmt = useFormat();
  const ago = (iso: string) => formatTimeAgo(iso, t, (d) => fmt.date(d));
  const noticeLabel = useNoticeLabel();
  /** Ledger rows arrive as codes + values from the server; the words are the viewer's language. */
  const lineLabel = (l: IntegrityBreakdown["lines"][number]) => {
    if (LINE_CODES.indexOf(l.code) === -1) return l.reason;
    if (l.code === "open_notice") {
      const notice = noticeLabel(String(l.vars.type || ""));
      return l.vars.words !== undefined ? t("editor.ledger.line.open_notice_words", { notice, words: fmt.number(Number(l.vars.words)) }) : t("editor.ledger.line.open_notice", { notice });
    }
    return t(`editor.ledger.line.${l.code}`, l.vars);
  };
  const severityLabel = (sv: string) => {
    const key = `editor.ledger.severity.${sv}`;
    const l = t(key);
    return l === key ? sv : l;
  };
  const total = Math.max(1, thesis.provenance.human + thesis.provenance.paste + thesis.provenance.ai);
  const pct = (n: number) => Math.round((n / total) * 100);
  // Compared unrounded: 25.4% is above a 25% limit even though it displays as 25%.
  const aiAboveLimit = (thesis.provenance.ai / total) * 100 > maxAi;
  const [note, setNote] = useState<Record<string, string>>({});
  const [focusNotice, setFocusNotice] = useState<string | null>(null);
  const open = flags.filter((f) => !f.resolved);
  const score = breakdown?.score ?? thesis.integrityScore;
  const scoreColor = score >= 90 ? "text-green-600" : score >= 70 ? "text-amber-600" : "text-red-600";
  const pointsClass = (p: number) => (p <= 0 ? "text-green-600" : p <= 4 ? "text-amber-600" : "text-red-600");
  const fmtPoints = (p: number) => (p < 0 ? `+${Math.abs(p)}` : `−${p}`);

  const jumpToNotice = (id: string) => {
    setFocusNotice(id);
    document.getElementById(`notice-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <PanelShell title={t("glossary.integrityLedger")} icon={<ShieldCheck className="w-4 h-4 text-gray-500" />} onClose={onClose}>
      <div className="p-3 space-y-4 text-sm">
        <div>
          <div className="divide-y divide-gray-200 border-y border-gray-200 text-[13px]">
            <div className="flex items-center justify-between py-2">
              <span className="text-gray-700">{t("editor.ledger.starting")}</span>
              <span className="font-semibold text-gray-900">{breakdown?.starting ?? 100}</span>
            </div>
            {breakdown ? (
              breakdown.lines.map((l, i) => (
                <div key={i} className="py-2">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-gray-700">{lineLabel(l)}</span>
                    <span className={`font-semibold tabular-nums ${pointsClass(l.points)}`}>{fmtPoints(l.points)}</span>
                  </div>
                  {l.points > 0 && l.fix && l.fix !== "none" && (
                    <button onClick={() => (l.fix === "open_notice" && l.noticeId ? jumpToNotice(l.noticeId) : onFix(l.fix as IntegrityFix, l.noticeId))} className="mt-0.5 text-[12px] text-brand-700 hover:underline">
                      {t(`editor.ledger.fix.${l.fix}`)} →
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="py-2 text-[12px] text-gray-400">{t("editor.ledger.loading")}</div>
            )}
            <div className="flex items-center justify-between py-2">
              <span className="text-[14px] font-bold text-gray-900">{t("glossary.integrity")}</span>
              <span className={`text-[14px] font-bold ${scoreColor}`}>{score}</span>
            </div>
          </div>
          <p className="mt-2 text-[12px] text-gray-500">{t("editor.ledger.caption")}</p>
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1"><span>{t("editor.ledger.whoWrote")}</span><button onClick={onToggleProvenance} className="text-brand-600 hover:underline">{showProvenance ? t("editor.ledger.hideProvenance") : t("editor.ledger.showProvenance")}</button></div>
          <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
            <div className="bg-prov-human" style={{ width: `${pct(thesis.provenance.human)}%` }} title={t("glossary.written")} />
            <div className="bg-prov-paste" style={{ width: `${pct(thesis.provenance.paste)}%` }} title={t("glossary.quotedOrPasted")} />
            <div className="bg-prov-ai" style={{ width: `${pct(thesis.provenance.ai)}%` }} title={t("glossary.aiAssisted")} />
          </div>
          <div className="flex gap-3 text-[11px] text-gray-600 mt-1 flex-wrap">
            <span><span className="inline-block w-2 h-2 rounded-full bg-prov-human mr-1" />{t("glossary.written")} {pct(thesis.provenance.human)}%</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-prov-paste mr-1" />{t("glossary.quotedOrPasted")} {pct(thesis.provenance.paste)}%</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-prov-ai mr-1" />{t("glossary.aiAssisted")} {pct(thesis.provenance.ai)}% <span className="text-gray-400">{t("editor.ledger.limit", { n: maxAi })}</span></span>
          </div>
          {aiAboveLimit && <div className="mt-2 text-xs text-red-600 flex items-start gap-1"><AlertTriangle className="w-3.5 h-3.5 mt-0.5" />{t("editor.ledger.aboveLimit")}</div>}
        </div>

        {session && (
          <div>
            <div className="text-xs font-medium mb-1.5">{t("editor.ledger.thisSession")}</div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[[t("editor.ledger.keystrokes"), session.keystrokes], [t("editor.ledger.wordsWritten"), session.wordsWritten], [t("editor.ledger.aiAssists"), session.aiAssists], [t("editor.ledger.pastes"), session.pasteEvents], [t("editor.ledger.tabSwitches"), session.tabSwitches]].map(([l, v]) => (
                <div key={String(l)} className="bg-gray-50 rounded-lg py-2"><div className="text-base font-semibold">{fmt.number(Number(v || 0))}</div><div className="text-[10px] text-gray-500">{l}</div></div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="text-xs font-medium mb-2 flex items-center gap-1">{open.length ? <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> : <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}{open.length ? (open.length === 1 ? t("editor.ledger.openNotices_one") : t("editor.ledger.openNotices", { n: open.length })) : t("editor.ledger.noOpenNotices")}</div>
          <div className="space-y-2">
            {flags.map((f) => (
              <div key={f.id} id={`notice-${f.id}`} className={`p-2.5 rounded-xl border text-xs transition-shadow ${focusNotice === f.id ? "ring-2 ring-brand-300" : ""} ${f.resolved ? "border-gray-100 opacity-60" : f.severity === "high" ? "border-red-200 bg-red-50/40" : f.severity === "medium" ? "border-amber-200 bg-amber-50/40" : "border-gray-200"}`}>
                <div className="flex items-center gap-2 mb-1"><span className={`badge ${f.severity === "high" ? "badge-danger" : f.severity === "medium" ? "badge-warning" : "badge-info"} !text-[10px]`}>{severityLabel(f.severity)}</span><span className="font-medium">{noticeLabel(f.type)}</span>{f.resolved && <span className="badge-success !text-[10px]">{t("editor.ledger.resolved")}</span>}<span className="ml-auto text-gray-400">{ago(f.timestamp)}</span></div>
                <div className="whitespace-pre-wrap text-gray-700">{f.description}</div>
                {!f.resolved && isOwner && (
                  <div className="flex gap-1 mt-2">
                    <input value={note[f.id] || ""} onChange={(e) => setNote({ ...note, [f.id]: e.target.value })} placeholder={t("editor.ledger.respondPlaceholder")} className="flex-1 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-brand-400" />
                    <button disabled={!(note[f.id] || "").trim()} onClick={() => { onRespondFlag(f.id, note[f.id].trim()); setNote({ ...note, [f.id]: "" }); }} className="px-2 py-1 rounded-lg bg-brand-600 text-white disabled:opacity-40">{t("editor.ledger.send")}</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </PanelShell>
  );
}


/** The university's research databases, one click away while citing. */
function UniversityDatabases() {
  const t = useT();
  const [data, setData] = useState<{ databases: ResearchDb[]; settings: { proxyPrefix?: string }; university: string } | null>(null);
  useEffect(() => {
    api<{ databases: ResearchDb[]; settings: { proxyPrefix?: string }; university: string }>("/api/research-databases").then(setData).catch(() => {});
  }, []);
  if (!data || !data.databases.length) return null;
  return (
    <div className="pt-3 mt-1 border-t border-gray-100 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
        <Library className="w-3.5 h-3.5" />{t("editor.refs.databasesTitle")}
      </div>
      {data.databases.slice(0, 6).map((d) => (
        <DatabaseCard key={d.id} d={d} university={data.university} proxyPrefix={data.settings.proxyPrefix} compact />
      ))}
      <a href="/dashboard/library" target="_blank" rel="noopener noreferrer" className="block text-[11px] text-brand-600 hover:underline">{t("editor.refs.allDatabases", { n: data.databases.length })}</a>
    </div>
  );
}
