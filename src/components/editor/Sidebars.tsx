"use client";

import { useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";
import { AlertTriangle, ArrowDown, ArrowUp, BookMarked, Check, CheckCircle2, History, Library, MessageSquare, Plus, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { api, timeAgo } from "@/lib/client";
import DatabaseCard, { ResearchDb } from "../library/DatabaseCard";
import { CommentItem, FlagItem, formatReference, Reference, ThesisDoc, VersionItem } from "./types";

export function PanelShell({ title, icon, onClose, children, actions }: { title: string; icon?: React.ReactNode; onClose: () => void; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 flex-shrink-0">
        {icon}
        <div className="text-sm font-semibold flex-1">{title}</div>
        {actions}
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1" aria-label="Close panel">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">{children}</div>
    </div>
  );
}

// ---------- Outline ----------
export function OutlinePanel({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [items, setItems] = useState<{ level: number; text: string; pos: number }[]>([]);
  useEffect(() => {
    const compute = () => {
      const out: { level: number; text: string; pos: number }[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading") out.push({ level: node.attrs.level, text: node.textContent || "(untitled)", pos });
      });
      setItems(out);
    };
    compute();
    editor.on("update", compute);
    return () => {
      editor.off("update", compute);
    };
  }, [editor]);
  return (
    <PanelShell title="Outline" onClose={onClose}>
      {items.length === 0 && <div className="p-4 text-xs text-gray-400">Headings you add to the document will appear here.</div>}
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
  const [reply, setReply] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const visible = comments.filter((c) => showResolved || !c.resolved);
  return (
    <PanelShell title="Comments" icon={<MessageSquare className="w-4 h-4 text-gray-500" />} onClose={onClose} actions={<label className="text-[11px] text-gray-500 flex items-center gap-1"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />resolved</label>}>
      {pendingQuote !== null && (
        <div className="m-3 p-3 rounded-xl border border-brand-200 bg-brand-50/50">
          <div className="text-[11px] text-gray-500 mb-1 line-clamp-2">“{pendingQuote || "…"}”</div>
          <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Comment or @advisor…" className="w-full text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:border-brand-400 resize-none" rows={3} />
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => { setDraft(""); onCancelCreate(); }} className="text-xs px-3 py-1.5 rounded-lg hover:bg-gray-100">Cancel</button>
            <button disabled={!draft.trim()} onClick={() => { onCreate(draft.trim()); setDraft(""); }} className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white disabled:opacity-40">Comment</button>
          </div>
        </div>
      )}
      {visible.length === 0 && pendingQuote === null && <div className="p-4 text-xs text-gray-400">Select text and press the comment button (or Ctrl+Alt+M) to start a discussion with your advisor.</div>}
      <div className="p-3 space-y-3">
        {visible.map((c) => (
          <div key={c.id} onClick={() => onJump(c)} className={`p-3 rounded-xl border cursor-pointer ${activeId === c.id ? "border-brand-400 shadow-sm" : "border-gray-100"} ${c.resolved ? "opacity-60" : ""}`}>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-[10px] font-semibold flex items-center justify-center">{c.authorName.split(" ").map((n) => n[0]).join("").slice(0, 2)}</div>
              <div className="text-xs font-medium flex-1 truncate">{c.authorName}{c.authorRole === "professor" && <span className="ml-1 text-[10px] text-brand-600">advisor</span>}</div>
              <div className="text-[10px] text-gray-400">{timeAgo(c.createdAt)}</div>
              {(canResolve || c.authorId === userId) && (
                <button onClick={(e) => { e.stopPropagation(); onResolve(c.id, !c.resolved); }} className="text-gray-400 hover:text-green-600" title={c.resolved ? "Re-open" : "Resolve"}>
                  {c.resolved ? <RotateCcw className="w-3.5 h-3.5" /> : <Check className="w-4 h-4" />}
                </button>
              )}
              {c.authorId === userId && (
                <button onClick={(e) => { e.stopPropagation(); onDelete(c.id); }} className="text-gray-300 hover:text-red-500" title="Delete">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {c.quote && <div className="text-[11px] text-gray-400 border-l-2 border-amber-300 pl-2 mb-1 line-clamp-2">{c.quote}</div>}
            <div className="text-sm whitespace-pre-wrap">{c.text}</div>
            {c.replies.map((r) => (
              <div key={r.id} className="mt-2 pl-3 border-l border-gray-100">
                <div className="text-[11px] font-medium">{r.authorName} <span className="text-gray-400 font-normal">{timeAgo(r.createdAt)}</span></div>
                <div className="text-sm whitespace-pre-wrap">{r.text}</div>
              </div>
            ))}
            {!c.resolved && (
              <div className="mt-2 flex gap-1" onClick={(e) => e.stopPropagation()}>
                <input value={reply[c.id] || ""} onChange={(e) => setReply({ ...reply, [c.id]: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && (reply[c.id] || "").trim()) { onReply(c.id, reply[c.id].trim()); setReply({ ...reply, [c.id]: "" }); } }} placeholder="Reply…" className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-brand-400" />
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
  return (
    <PanelShell title="Version history" icon={<History className="w-4 h-4 text-gray-500" />} onClose={onClose} actions={canRestore ? <button onClick={onCreate} className="text-[11px] text-brand-600 flex items-center gap-1 hover:underline"><Plus className="w-3 h-3" />Name current</button> : undefined}>
      {versions.length === 0 && <div className="p-4 text-xs text-gray-400">Versions are saved automatically as you write.</div>}
      <ul className="py-1">
        {versions.map((v) => (
          <li key={v.id} className="px-3 py-2 hover:bg-gray-50 group">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">{v.label || (v.kind === "autosave" ? "Autosave" : v.kind === "restore" ? "Before restore" : "Version")}</div>
                <div className="text-[11px] text-gray-400">{new Date(v.createdAt).toLocaleString()} · {v.wordCount.toLocaleString()} words · {v.authorName}</div>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${v.kind === "milestone" || v.kind === "manual" ? "bg-brand-50 text-brand-700" : "bg-gray-100 text-gray-500"}`}>{v.kind}</span>
            </div>
            <div className="flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => onPreview(v.id)} className="text-[11px] text-gray-600 hover:underline">Preview</button>
              {canRestore && <button onClick={() => onRestore(v.id)} className="text-[11px] text-brand-600 hover:underline">Restore</button>}
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
  const [form, setForm] = useState<Reference | null>(null);
  const sorted = useMemo(() => [...references].sort((a, b) => a.authors.localeCompare(b.authors)), [references]);
  const f = (k: keyof Reference) => ({ value: (form?.[k] as string) || "", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...(form as Reference), [k]: e.target.value }) });
  return (
    <PanelShell title="Citations" icon={<BookMarked className="w-4 h-4 text-gray-500" />} onClose={onClose} actions={<select value={style} onChange={(e) => onChangeStyle(e.target.value as ThesisDoc["citationStyle"])} className="text-[11px] border border-gray-200 rounded px-1 py-0.5">{["APA", "MLA", "Chicago", "IEEE", "Harvard"].map((s) => <option key={s}>{s}</option>)}</select>}>
      <div className="p-3 space-y-2">
        {canEdit && !form && (
          <div className="flex gap-2">
            {onAddWithAi && (
              <button onClick={onAddWithAi} className="flex-1 text-xs py-2 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 flex items-center justify-center gap-1 font-medium">
                <Sparkles className="w-3.5 h-3.5" /> Find source (DOI, URL…)
              </button>
            )}
            <button onClick={() => setForm({ ...emptyRef, id: `ref_${Date.now()}` })} className="flex-1 text-xs py-2 rounded-lg border border-dashed border-gray-300 text-gray-600 hover:border-brand-400 hover:text-brand-600 flex items-center justify-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add manually
            </button>
          </div>
        )}
        {form && (
          <div className="p-3 rounded-xl border border-brand-200 bg-brand-50/40 space-y-2 text-xs">
            <select {...f("type")} className="input-field !py-1.5 !text-xs">{["article", "book", "chapter", "web", "thesis"].map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <input {...f("authors")} placeholder="Authors (Last, F., Last, F.)" className="input-field !py-1.5 !text-xs" />
            <div className="grid grid-cols-2 gap-2"><input {...f("year")} placeholder="Year" className="input-field !py-1.5 !text-xs" /><input {...f("pages")} placeholder="Pages" className="input-field !py-1.5 !text-xs" /></div>
            <input {...f("title")} placeholder="Title" className="input-field !py-1.5 !text-xs" />
            <input {...f("source")} placeholder="Journal / publisher / website" className="input-field !py-1.5 !text-xs" />
            <div className="grid grid-cols-2 gap-2"><input {...f("volume")} placeholder="Volume" className="input-field !py-1.5 !text-xs" /><input {...f("issue")} placeholder="Issue" className="input-field !py-1.5 !text-xs" /></div>
            <input {...f("doi")} placeholder="DOI" className="input-field !py-1.5 !text-xs" />
            <input {...f("url")} placeholder="URL" className="input-field !py-1.5 !text-xs" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setForm(null)} className="px-3 py-1.5 rounded-lg hover:bg-gray-100">Cancel</button>
              <button disabled={!form.authors || !form.title || !form.year} onClick={() => { onAdd(form); setForm(null); }} className="px-3 py-1.5 rounded-lg bg-brand-600 text-white disabled:opacity-40">Save</button>
            </div>
          </div>
        )}
        {sorted.map((r) => {
          const fm = formatReference(r, style);
          return (
            <div key={r.id} className="p-2.5 rounded-xl border border-gray-100 hover:border-gray-200 text-xs">
              <div className="text-gray-700" dangerouslySetInnerHTML={{ __html: fm.full }} />
              <div className="flex items-center gap-2 mt-1.5">
                {canEdit && <button onClick={() => onInsertInText(r)} className="text-brand-600 hover:underline">Insert {fm.inText} at cursor</button>}
                {canEdit && <button onClick={() => onRemove(r.id)} className="text-gray-300 hover:text-red-500 ml-auto"><Trash2 className="w-3.5 h-3.5" /></button>}
              </div>
            </div>
          );
        })}
        {references.length === 0 && !form && <div className="text-xs text-gray-400 text-center py-4">No references yet. Add sources here and cite them in one click.</div>}
        {references.length > 0 && canEdit && (
          <button onClick={onInsertBibliography} className="w-full text-xs py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">Insert bibliography ({style})</button>
        )}
        <UniversityDatabases />
      </div>
    </PanelShell>
  );
}

// ---------- Find & replace ----------
export function FindPanel({ editor, onClose, canEdit }: { editor: Editor; onClose: () => void; canEdit: boolean }) {
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
    <PanelShell title="Find and replace" onClose={onClose}>
      <div className="p-3 space-y-2 text-sm">
        <div className="flex gap-1">
          <input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.shiftKey ? editor.commands.prevSearchResult() : editor.commands.nextSearchResult(); tick((n) => n + 1); } }} placeholder="Find" className="input-field !py-1.5 flex-1" />
          <button onClick={() => { editor.commands.prevSearchResult(); tick((n) => n + 1); }} className="tb-btn border border-gray-200" title="Previous"><ArrowUp className="w-4 h-4" /></button>
          <button onClick={() => { editor.commands.nextSearchResult(); tick((n) => n + 1); }} className="tb-btn border border-gray-200" title="Next"><ArrowDown className="w-4 h-4" /></button>
        </div>
        <div className="text-[11px] text-gray-500">{term ? (s.results.length ? `${s.index + 1} of ${s.results.length}` : "No results") : "Type to search the document"}</div>
        {canEdit && (
          <>
            <input value={replace} onChange={(e) => setReplace(e.target.value)} placeholder="Replace with" className="input-field !py-1.5" />
            <div className="flex gap-2">
              <button disabled={!s.results.length} onClick={() => { editor.commands.replaceCurrent(); setTimeout(() => tick((n) => n + 1), 10); }} className="btn-outline !py-1.5 !px-3 text-xs disabled:opacity-40">Replace</button>
              <button disabled={!s.results.length} onClick={() => { editor.commands.replaceAll(); setTimeout(() => tick((n) => n + 1), 10); }} className="btn-outline !py-1.5 !px-3 text-xs disabled:opacity-40">Replace all</button>
            </div>
          </>
        )}
        <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={cs} onChange={(e) => setCs(e.target.checked)} />Match case</label>
      </div>
    </PanelShell>
  );
}

// ---------- Integrity ----------
export function IntegrityPanel({ thesis, flags, session, maxAi, showProvenance, onToggleProvenance, onRespondFlag, onClose, isOwner }: { thesis: ThesisDoc; flags: FlagItem[]; session: Record<string, number> | null; maxAi: number; showProvenance: boolean; onToggleProvenance: () => void; onRespondFlag: (id: string, note: string) => void; onClose: () => void; isOwner: boolean }) {
  const total = Math.max(1, thesis.provenance.human + thesis.provenance.paste + thesis.provenance.ai);
  const pct = (n: number) => Math.round((n / total) * 100);
  const [note, setNote] = useState<Record<string, string>>({});
  const open = flags.filter((f) => !f.resolved);
  return (
    <PanelShell title="Integrity & provenance" onClose={onClose}>
      <div className="p-3 space-y-4 text-sm">
        <div className="flex items-center gap-3">
          <div className={`text-3xl font-bold ${thesis.integrityScore >= 90 ? "text-green-600" : thesis.integrityScore >= 70 ? "text-amber-600" : "text-red-600"}`}>{thesis.integrityScore}%</div>
          <div className="text-xs text-gray-500">Integrity score. Transparent by design: every deduction below is something you can fix.</div>
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1"><span>Who wrote this document</span><button onClick={onToggleProvenance} className="text-brand-600 hover:underline">{showProvenance ? "Hide" : "Show"} highlights</button></div>
          <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
            <div className="bg-green-500" style={{ width: `${pct(thesis.provenance.human)}%` }} title="You" />
            <div className="bg-amber-400" style={{ width: `${pct(thesis.provenance.paste)}%` }} title="Pasted" />
            <div className="bg-purple-500" style={{ width: `${pct(thesis.provenance.ai)}%` }} title="AI-assisted" />
          </div>
          <div className="flex gap-3 text-[11px] text-gray-600 mt-1 flex-wrap">
            <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />You {pct(thesis.provenance.human)}%</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />Pasted {pct(thesis.provenance.paste)}%</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-purple-500 mr-1" />AI-assisted {pct(thesis.provenance.ai)}% <span className="text-gray-400">(limit {maxAi}%)</span></span>
          </div>
          {pct(thesis.provenance.ai) > maxAi && <div className="mt-2 text-xs text-red-600 flex items-start gap-1"><AlertTriangle className="w-3.5 h-3.5 mt-0.5" />AI-assisted text is above your institution&apos;s limit. Rewrite AI passages in your own words to bring it down.</div>}
        </div>
        {session && (
          <div className="grid grid-cols-3 gap-2 text-center">
            {[["Keystrokes", session.keystrokes], ["Words", session.wordsWritten], ["AI assists", session.aiAssists], ["Pastes", session.pasteEvents], ["Tab switches", session.tabSwitches]].slice(0, 6).map(([l, v]) => (
              <div key={String(l)} className="bg-gray-50 rounded-lg py-2"><div className="text-base font-semibold">{Number(v || 0).toLocaleString()}</div><div className="text-[10px] text-gray-500">{l}</div></div>
            ))}
          </div>
        )}
        <div>
          <div className="text-xs font-medium mb-2 flex items-center gap-1">{open.length ? <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> : <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}{open.length ? `${open.length} open notice${open.length > 1 ? "s" : ""}` : "No open notices"}</div>
          <div className="space-y-2">
            {flags.map((f) => (
              <div key={f.id} className={`p-2.5 rounded-xl border text-xs ${f.resolved ? "border-gray-100 opacity-60" : f.severity === "high" ? "border-red-200 bg-red-50/40" : f.severity === "medium" ? "border-amber-200 bg-amber-50/40" : "border-gray-200"}`}>
                <div className="flex items-center gap-2 mb-1"><span className={`badge ${f.severity === "high" ? "badge-danger" : f.severity === "medium" ? "badge-warning" : "badge-info"} !text-[10px]`}>{f.severity}</span><span className="font-medium capitalize">{f.type.replace(/_/g, " ")}</span>{f.resolved && <span className="badge-success !text-[10px]">resolved</span>}<span className="ml-auto text-gray-400">{timeAgo(f.timestamp)}</span></div>
                <div className="whitespace-pre-wrap text-gray-700">{f.description}</div>
                {!f.resolved && isOwner && (
                  <div className="flex gap-1 mt-2">
                    <input value={note[f.id] || ""} onChange={(e) => setNote({ ...note, [f.id]: e.target.value })} placeholder="Explain or attribute…" className="flex-1 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-brand-400" />
                    <button disabled={!(note[f.id] || "").trim()} onClick={() => { onRespondFlag(f.id, note[f.id].trim()); setNote({ ...note, [f.id]: "" }); }} className="px-2 py-1 rounded-lg bg-brand-600 text-white disabled:opacity-40">Send</button>
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
  const [data, setData] = useState<{ databases: ResearchDb[]; settings: { proxyPrefix?: string }; university: string } | null>(null);
  useEffect(() => {
    api<{ databases: ResearchDb[]; settings: { proxyPrefix?: string }; university: string }>("/api/research-databases").then(setData).catch(() => {});
  }, []);
  if (!data || !data.databases.length) return null;
  return (
    <div className="pt-3 mt-1 border-t border-gray-100 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
        <Library className="w-3.5 h-3.5" />Search your university databases
      </div>
      {data.databases.slice(0, 6).map((d) => (
        <DatabaseCard key={d.id} d={d} university={data.university} proxyPrefix={data.settings.proxyPrefix} compact />
      ))}
      <a href="/dashboard/library" target="_blank" rel="noopener noreferrer" className="block text-[11px] text-brand-600 hover:underline">All {data.databases.length} databases and access instructions →</a>
    </div>
  );
}
