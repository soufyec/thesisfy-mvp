"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ExternalLink, FileText, Library, Link2, Loader2, Quote, Trash2, Upload, Type as TypeIcon } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { useFormat, useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/dictionary";
import Markdown from "@/components/Markdown";
import { Modal, Spinner } from "@/components/ui";
import { PanelShell } from "../Sidebars";

/** A source as `/api/theses/[id]/sources` returns it (no extracted text). */
export interface LibrarySource {
  id: string;
  thesisId: string;
  kind: "doi" | "url" | "pdf" | "text";
  title: string;
  authors?: string;
  year?: string;
  venue?: string;
  doi?: string;
  url?: string;
  abstract?: string;
  pages?: number;
  wordCount: number;
  parseStatus?: "pending" | "parsed" | "no_text" | "failed";
  license?: string;
  openalexId?: string;
  addedAt: string;
  lastUsedAt?: string;
  coverage: "full_text" | "abstract" | "none";
  chunkCount: number;
}

export interface LibraryChunk {
  id: string;
  index: number;
  page?: number;
  section?: string;
  text: string;
}

export interface LibraryCitation {
  ref: string;
  sourceId: string;
  chunkId: string;
  page?: number;
  section?: string;
  quote: string;
  label: string;
  title: string;
  authors?: string;
  year?: string;
}

export interface CitationRef {
  authors: string;
  year: string;
  title: string;
  source: string;
  doi?: string;
  url?: string;
}

export interface SourcesPanelProps {
  thesisId: string;
  canEdit: boolean;
  /** Current editor selection; pre-fills the question box. */
  selectionText?: string;
  onInsertCitation?: (ref: CitationRef) => void;
  onClose: () => void;
  /** Writing session id, so questions are attached to the session's event log. */
  sessionId?: string;
  /** Called when the server asks for monitoring consent (HTTP 428). */
  onConsentRequired?: () => void;
}

type AddTab = "doi" | "url" | "pdf" | "text";

/** `label` is a plain string for the technical names (DOI, URL, PDF) and a message key for "Text". */
const TABS: { id: AddTab; label: string; translate?: boolean; icon: React.ReactNode }[] = [
  { id: "doi", label: "DOI", icon: <BookOpen className="w-3.5 h-3.5" /> },
  { id: "url", label: "URL", icon: <Link2 className="w-3.5 h-3.5" /> },
  { id: "pdf", label: "PDF", icon: <Upload className="w-3.5 h-3.5" /> },
  { id: "text", label: "panelsResearch.sources.tabText", translate: true, icon: <TypeIcon className="w-3.5 h-3.5" /> },
];

function statusChip(s: LibrarySource, t: Translate): { label: string; className: string } {
  if (s.parseStatus === "pending") return { label: t("panelsResearch.sources.status.indexing"), className: "bg-gray-100 text-gray-600" };
  if (s.parseStatus === "failed") return { label: t("panelsResearch.sources.status.failed"), className: "bg-red-50 text-red-700" };
  if (s.parseStatus === "no_text") return { label: t(s.kind === "pdf" ? "panelsResearch.sources.status.noTextScanned" : "panelsResearch.sources.status.noText"), className: "bg-amber-50 text-amber-700" };
  if (s.coverage === "abstract") return { label: t("panelsResearch.sources.status.abstractOnly"), className: "bg-amber-50 text-amber-700" };
  return { label: t("panelsResearch.sources.status.parsed"), className: "bg-accent-50 text-accent-700" };
}

/** "N pages" / "1 page": the `_one` key carries the singular. */
const countLabel = (t: Translate, key: string, n: number) => t(n === 1 ? `${key}_one` : key, { n });

function hostOf(url?: string) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

function toCitationRef(s: LibrarySource): CitationRef {
  return { authors: s.authors || "", year: s.year || "", title: s.title, source: s.venue || hostOf(s.url) || (s.kind === "pdf" ? "PDF" : ""), doi: s.doi, url: s.url };
}

/** Index of `quote` inside `text`, ignoring case and whitespace/quote differences; -1 when absent. */
function locateQuote(text: string, quote: string): { start: number; end: number } | null {
  const fold = (c: string) => c.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  const q = fold(quote).replace(/\s+/g, " ").trim();
  if (!q) return null;
  // Map folded, whitespace-collapsed text back to original offsets.
  const map: number[] = [];
  let folded = "";
  let lastSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = fold(text[i]);
    if (/\s/.test(ch)) {
      if (lastSpace) continue;
      lastSpace = true;
      folded += " ";
      map.push(i);
    } else {
      lastSpace = false;
      folded += ch;
      map.push(i);
    }
  }
  const at = folded.indexOf(q);
  if (at < 0) return null;
  return { start: map[at], end: map[Math.min(at + q.length - 1, map.length - 1)] + 1 };
}

export default function SourcesPanel({ thesisId, canEdit, selectionText, onInsertCitation, onClose, sessionId, onConsentRequired }: SourcesPanelProps) {
  const t = useT();
  const fmt = useFormat();
  const [sources, setSources] = useState<LibrarySource[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ text: string; kind: "info" | "error" } | null>(null);

  // Add form
  const [tab, setTab] = useState<AddTab>("doi");
  const [value, setValue] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [adding, setAdding] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Per-source actions
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ source: LibrarySource; text: string; meta?: Record<string, unknown> } | null>(null);
  const [viewer, setViewer] = useState<{ source: LibrarySource; chunks: LibraryChunk[]; highlight?: { chunkId?: string; quote: string } } | null>(null);

  // Ask my sources
  const [question, setQuestion] = useState(selectionText || "");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<{ answer: string; citations: LibraryCitation[]; meta: Record<string, unknown> } | null>(null);
  const questionTouched = useRef(false);

  useEffect(() => {
    if (!questionTouched.current && selectionText) setQuestion(selectionText.slice(0, 1500));
  }, [selectionText]);

  const load = useCallback(async () => {
    try {
      const d = await api<{ sources: LibrarySource[] }>(`/api/theses/${thesisId}/sources`);
      setSources(d.sources);
    } catch (e) {
      setNotice({ text: (e as Error).message, kind: "error" });
    } finally {
      setLoading(false);
    }
  }, [thesisId]);
  useEffect(() => {
    load();
  }, [load]);

  const indexed = useMemo(() => sources.filter((s) => s.parseStatus === "parsed" && s.chunkCount > 0), [sources]);

  const say = (text: string, kind: "info" | "error" = "info") => {
    setNotice({ text, kind });
    window.setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), 6000);
  };

  const handleApiError = (e: unknown, fallback: string) => {
    if (e instanceof ApiError && e.status === 428) {
      onConsentRequired?.();
      say(t("panelsResearch.sources.consentRequired"), "error");
      return;
    }
    say((e as Error).message || fallback, "error");
  };

  const add = async () => {
    if (adding) return;
    setAdding(true);
    try {
      let res: { source: LibrarySource };
      if (tab === "pdf") {
        if (!file) return say(t("panelsResearch.sources.choosePdfFirst"), "error");
        const form = new FormData();
        form.append("file", file);
        if (title.trim()) form.append("title", title.trim());
        res = await api<{ source: LibrarySource }>(`/api/theses/${thesisId}/sources`, { method: "POST", body: form });
      } else {
        if (!value.trim()) return say(tab === "text" ? t("panelsResearch.sources.pasteTextFirst") : t("panelsResearch.sources.enterFirst", { kind: tab.toUpperCase() }), "error");
        res = await api<{ source: LibrarySource }>(`/api/theses/${thesisId}/sources`, { method: "POST", json: { kind: tab, value: value.trim(), title: title.trim() || undefined } });
      }
      setSources((list) => [res.source, ...list.filter((s) => s.id !== res.source.id)]);
      setValue("");
      setTitle("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      const chip = statusChip(res.source, t).label;
      const from = res.source.pages ? t(res.source.pages === 1 ? "panelsResearch.sources.fromPages_one" : "panelsResearch.sources.fromPages", { n: res.source.pages }) : "";
      say(res.source.parseStatus === "parsed" ? t(res.source.chunkCount === 1 ? "panelsResearch.sources.added_one" : "panelsResearch.sources.added", { n: res.source.chunkCount, from }) : t("panelsResearch.sources.addedButStatus", { status: chip.toLowerCase(), detail: res.source.abstract || t("panelsResearch.sources.couldNotIndex") }), res.source.parseStatus === "parsed" ? "info" : "error");
    } catch (e) {
      handleApiError(e, t("panelsResearch.sources.errAdd"));
    } finally {
      setAdding(false);
    }
  };

  const remove = async (s: LibrarySource) => {
    setBusyId(s.id);
    try {
      await api(`/api/theses/${thesisId}/sources/${s.id}`, { method: "DELETE" });
      setSources((list) => list.filter((x) => x.id !== s.id));
      setConfirmRemove(null);
    } catch (e) {
      handleApiError(e, t("panelsResearch.sources.errRemove"));
    } finally {
      setBusyId(null);
    }
  };

  const summarize = async (s: LibrarySource) => {
    setBusyId(s.id);
    try {
      const d = await api<{ summary: string; meta?: Record<string, unknown> }>(`/api/theses/${thesisId}/sources/${s.id}`, { method: "POST", json: { action: "summarize", sessionId } });
      setSummary({ source: s, text: d.summary, meta: d.meta });
    } catch (e) {
      handleApiError(e, t("panelsResearch.sources.errSummary"));
    } finally {
      setBusyId(null);
    }
  };

  const openViewer = async (s: LibrarySource, highlight?: { chunkId?: string; quote: string }) => {
    setBusyId(s.id);
    try {
      const d = await api<{ source: LibrarySource; chunks: LibraryChunk[] }>(`/api/theses/${thesisId}/sources/${s.id}`);
      setViewer({ source: d.source, chunks: d.chunks, highlight });
    } catch (e) {
      handleApiError(e, t("panelsResearch.sources.errOpen"));
    } finally {
      setBusyId(null);
    }
  };

  /** Fixed server answers (`meta.code`) are rendered from the UI strings; model answers are shown as they came. */
  const localizedAnswer = (a: { answer: string; citations: LibraryCitation[]; meta: Record<string, unknown> }) => {
    const code = a.meta?.code;
    if (code === "no_match") return t("panelsResearch.sources.answer.noMatch");
    if (code === "no_index") return t("panelsResearch.sources.answer.noIndex");
    if (code === "demo_extract") return `${t("panelsResearch.sources.answer.demoExtract")}\n\n${a.citations.map((c) => `- ${c.quote} [${c.ref}]`).join("\n")}\n\n_${t("panelsResearch.sources.answer.demoConnect")}_`;
    return a.answer;
  };

  const ask = async () => {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    setAnswer(null);
    try {
      const d = await api<{ answer: string; citations: LibraryCitation[]; meta: Record<string, unknown> }>("/api/ai/sources/ask", { method: "POST", json: { thesisId, question: q, sessionId } });
      setAnswer(d);
    } catch (e) {
      handleApiError(e, t("panelsResearch.sources.errAsk"));
    } finally {
      setAsking(false);
    }
  };

  const jump = (c: LibraryCitation) => {
    const s = sources.find((x) => x.id === c.sourceId);
    if (s) openViewer(s, { chunkId: c.chunkId, quote: c.quote });
  };

  return (
    <PanelShell title={t("panelsResearch.sources.title")} icon={<Library className="w-4 h-4 text-gray-500" />} onClose={onClose} actions={<span className="text-[11px] text-gray-400">{sources.length}/40</span>}>
      <div className="p-3 space-y-3 text-[13px]">
        {notice && (
          <div role="status" className={`text-xs rounded-lg px-3 py-2 ${notice.kind === "error" ? "bg-red-50 text-red-700" : "bg-brand-50 text-brand-700"}`}>
            {notice.text}
          </div>
        )}

        {canEdit && (
          <section aria-label={t("panelsResearch.sources.addLabel")} className="rounded-2xl border border-gray-200 p-3 space-y-2">
            <div className="flex gap-1" role="tablist" aria-label={t("panelsResearch.sources.typeLabel")}>
              {TABS.map((tb) => (
                <button key={tb.id} role="tab" aria-selected={tab === tb.id} onClick={() => setTab(tb.id)} className={`flex-1 inline-flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg ${tab === tb.id ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-600 hover:bg-gray-100"}`}>
                  {tb.icon}
                  {tb.translate ? t(tb.label) : tb.label}
                </button>
              ))}
            </div>
            {tab === "doi" && <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="10.1038/s41586-019-0912-1" aria-label="DOI" className="input-field !py-2 !text-[13px]" onKeyDown={(e) => e.key === "Enter" && add()} />}
            {tab === "url" && <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://…" aria-label="URL" className="input-field !py-2 !text-[13px]" onKeyDown={(e) => e.key === "Enter" && add()} />}
            {tab === "pdf" && (
              <label className="flex items-center gap-2 text-xs text-gray-600 border border-dashed border-gray-300 rounded-xl px-3 py-2.5 cursor-pointer hover:border-brand-400">
                <Upload className="w-4 h-4 text-gray-400" />
                <span className="flex-1 truncate">{file ? `${file.name} (${(file.size / 1048576).toFixed(1)} MB)` : t("panelsResearch.sources.choosePdf")}</span>
                <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label={t("panelsResearch.sources.pdfFile")} onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
            )}
            {tab === "text" && <textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder={t("panelsResearch.sources.textPlaceholder")} aria-label={t("panelsResearch.sources.sourceText")} rows={4} className="input-field !py-2 !text-[13px] resize-y" />}
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tab === "doi" ? t("panelsResearch.sources.titlePlaceholderDoi") : t("panelsResearch.sources.titlePlaceholder")} aria-label={t("panelsResearch.sources.titleLabel")} className="input-field !py-2 !text-[13px]" />
            <p className="text-[11px] text-gray-500">
              {tab === "doi" && t("panelsResearch.sources.hintDoi")}
              {tab === "url" && t("panelsResearch.sources.hintUrl", { n: fmt.number(200000) })}
              {tab === "pdf" && t("panelsResearch.sources.hintPdf")}
              {tab === "text" && t("panelsResearch.sources.hintText")}
            </p>
            <button onClick={add} disabled={adding} className="btn-primary w-full !py-2 text-[13px] disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {adding ? t("panelsResearch.sources.adding") : t("panelsResearch.sources.addToLibrary")}
            </button>
          </section>
        )}

        <section aria-label={t("panelsResearch.sources.libraryLabel")}>
          {loading && (
            <div className="flex items-center gap-2 text-xs text-gray-500 py-3">
              <Spinner /> {t("panelsResearch.sources.loading")}
            </div>
          )}
          {!loading && sources.length === 0 && <div className="text-xs text-gray-400 text-center py-4">{t("panelsResearch.sources.empty")}</div>}
          <ul className="space-y-2">
            {sources.map((s) => {
              const chip = statusChip(s, t);
              const link = s.doi ? `https://doi.org/${s.doi}` : s.url;
              const busy = busyId === s.id;
              return (
                <li key={s.id} className="rounded-2xl border border-gray-100 hover:border-gray-200 p-2.5">
                  <div className="flex items-start gap-2">
                    <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-800 leading-snug line-clamp-2">{s.title}</div>
                      <div className="text-xs text-gray-500 truncate">{[s.authors, s.year, s.venue].filter(Boolean).join(" · ") || (s.kind === "text" ? t("panelsResearch.sources.tabText") : s.kind).toUpperCase()}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[11px]">
                    <span className={`px-2 py-0.5 rounded-full ${chip.className}`}>{chip.label}</span>
                    {s.pages ? <span className="text-gray-500">{countLabel(t, "panelsResearch.sources.pages", s.pages)}</span> : null}
                    {s.wordCount ? <span className="text-gray-500">{s.wordCount === 1 ? t("common.word_one") : t("common.words", { n: fmt.number(s.wordCount) })}</span> : null}
                    {s.license && <span className="text-gray-500">{s.license}</span>}
                  </div>
                  {s.parseStatus !== "parsed" && s.abstract && <p className="text-[11px] text-gray-500 mt-1.5">{s.abstract}</p>}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs">
                    {link ? (
                      <a href={link} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline inline-flex items-center gap-1" aria-label={t("panelsResearch.sources.openNewTab", { title: s.title })}>
                        <ExternalLink className="w-3 h-3" /> {t("common.open")}
                      </a>
                    ) : (
                      <button onClick={() => openViewer(s)} disabled={busy || !s.chunkCount} className="text-brand-600 hover:underline disabled:opacity-40" aria-label={t("panelsResearch.sources.openText", { title: s.title })}>
                        {t("common.open")}
                      </button>
                    )}
                    {s.chunkCount > 0 && link && (
                      <button onClick={() => openViewer(s)} disabled={busy} className="text-brand-600 hover:underline" aria-label={t("panelsResearch.sources.showPassages", { title: s.title })}>
                        {t("panelsResearch.sources.passagesBtn")}
                      </button>
                    )}
                    <button onClick={() => summarize(s)} disabled={busy || s.parseStatus !== "parsed"} className="text-brand-600 hover:underline disabled:opacity-40" aria-label={t("panelsResearch.sources.summarizeLabel", { title: s.title })}>
                      {t("panelsResearch.sources.summarize")}
                    </button>
                    {onInsertCitation && canEdit && (
                      <button onClick={() => onInsertCitation(toCitationRef(s))} className="text-brand-600 hover:underline inline-flex items-center gap-1" aria-label={t("panelsResearch.sources.citeLabel", { title: s.title })}>
                        <Quote className="w-3 h-3" /> {t("panelsResearch.sources.cite")}
                      </button>
                    )}
                    {canEdit && confirmRemove !== s.id && (
                      <button onClick={() => setConfirmRemove(s.id)} className="text-gray-400 hover:text-red-600 ml-auto" aria-label={t("panelsResearch.sources.removeLabel", { title: s.title })}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 ml-auto" aria-label={t("panelsResearch.sources.working")} />}
                  </div>
                  {confirmRemove === s.id && (
                    <div className="mt-2 rounded-xl bg-gray-50 p-2 text-xs text-gray-600 flex flex-wrap items-center gap-2">
                      <span className="flex-1">{t("panelsResearch.sources.removeConsequence")}</span>
                      <button onClick={() => setConfirmRemove(null)} className="px-2 py-1 rounded-lg hover:bg-gray-200">{t("panelsResearch.sources.keep")}</button>
                      <button onClick={() => remove(s)} className="px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700">{t("common.remove")}</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-label={t("panelsResearch.sources.askTitle")} className="rounded-2xl border border-brand-100 bg-brand-50/40 p-3 space-y-2">
          <div className="text-sm font-semibold text-gray-800">{t("panelsResearch.sources.askTitle")}</div>
          <textarea
            value={question}
            onChange={(e) => {
              questionTouched.current = true;
              setQuestion(e.target.value);
            }}
            placeholder={indexed.length ? t("panelsResearch.sources.askPlaceholder") : t("panelsResearch.sources.askPlaceholderEmpty")}
            aria-label={t("panelsResearch.sources.askLabel")}
            rows={3}
            disabled={!indexed.length}
            className="input-field !py-2 !text-[13px] resize-y bg-white"
          />
          <p className="text-[11px] text-gray-500">{t("panelsResearch.sources.askNote")}</p>
          <button onClick={ask} disabled={asking || !question.trim() || !indexed.length} className="btn-primary w-full !py-2 text-[13px] disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {asking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {asking ? t("panelsResearch.sources.asking") : t("panelsResearch.sources.ask")}
          </button>
          {answer && (
            <div className="rounded-xl bg-white border border-gray-100 p-3 space-y-3">
              <Markdown text={localizedAnswer(answer)} className="text-[13px] leading-relaxed text-gray-800" />
              {answer.citations.length > 0 && (
                <ol className="space-y-2 border-t border-gray-100 pt-2" aria-label={t("panelsResearch.sources.citedPassages")}>
                  {answer.citations.map((c, i) => (
                    <li key={`${c.ref}-${i}`} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{c.ref}</span>
                        <span className="text-gray-700 font-medium truncate">{c.label}</span>
                        <button onClick={() => jump(c)} className="ml-auto text-brand-600 hover:underline flex-shrink-0" aria-label={t("panelsResearch.sources.jumpLabel", { ref: c.ref })}>
                          {t("panelsResearch.sources.jump")}
                        </button>
                      </div>
                      <blockquote className="mt-1 pl-2 border-l-2 border-accent-500 text-gray-600 italic">“{c.quote}”</blockquote>
                      <div className="mt-0.5 text-[11px] text-accent-700">{t("panelsResearch.sources.quoteVerified")}</div>
                    </li>
                  ))}
                </ol>
              )}
              {typeof answer.meta?.label === "string" && <div className="text-[11px] text-gray-400">{String(answer.meta.label)}{answer.meta.demo ? ` · ${t("panelsResearch.sources.demoMode")}` : ""}{answer.meta.reranked ? ` · ${t("panelsResearch.sources.reranked")}` : ""}</div>}
            </div>
          )}
        </section>

        <footer className="text-[11px] text-gray-500 px-1 pb-2">{t("panelsResearch.sources.footer", { useMine: t("panelsResearch.sources.useMySources") })}</footer>
      </div>

      <Modal open={!!summary} onClose={() => setSummary(null)} title={summary ? t("panelsResearch.sources.summaryTitle", { title: summary.source.title }) : undefined} size="md" footer={<button onClick={() => setSummary(null)} className="btn-outline !py-2 !px-4 text-sm">{t("common.close")}</button>}>
        {summary && (
          <div className="space-y-3">
            <Markdown text={summary.text} className="text-sm leading-relaxed text-gray-800" />
            <p className="text-[11px] text-gray-400">{t("panelsResearch.sources.summaryNote", { label: typeof summary.meta?.label === "string" ? ` · ${String(summary.meta.label)}` : "", aiAssisted: t("glossary.aiAssisted") })}</p>
          </div>
        )}
      </Modal>

      <ChunkViewer viewer={viewer} onClose={() => setViewer(null)} />
    </PanelShell>
  );
}

function ChunkViewer({ viewer, onClose }: { viewer: { source: LibrarySource; chunks: LibraryChunk[]; highlight?: { chunkId?: string; quote: string } } | null; onClose: () => void }) {
  const t = useT();
  const targetRef = useRef<HTMLDivElement>(null);
  const hit = useMemo(() => {
    if (!viewer?.highlight) return null;
    const { chunkId, quote } = viewer.highlight;
    const ordered = chunkId ? [...viewer.chunks.filter((c) => c.id === chunkId), ...viewer.chunks.filter((c) => c.id !== chunkId)] : viewer.chunks;
    for (const c of ordered) {
      const pos = locateQuote(c.text, quote);
      if (pos) return { chunkId: c.id, ...pos };
    }
    return chunkId ? { chunkId, start: -1, end: -1 } : null;
  }, [viewer]);
  useEffect(() => {
    if (viewer && targetRef.current) targetRef.current.scrollIntoView({ block: "center" });
  }, [viewer, hit]);
  if (!viewer) return null;
  const { source, chunks } = viewer;
  return (
    <Modal open onClose={onClose} title={source.title} size="lg" footer={<button onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">{t("common.close")}</button>}>
      <div className="text-xs text-gray-500 mb-3">
        {[source.authors, source.year, source.venue].filter(Boolean).join(" · ")}
        {source.pages ? ` · ${countLabel(t, "panelsResearch.sources.pages", source.pages)}` : ""} · {countLabel(t, "panelsResearch.sources.passages", chunks.length)}
        {hit && hit.start < 0 && <span className="text-amber-700"> · {t("panelsResearch.sources.quoteNotLocated")}</span>}
      </div>
      <div className="space-y-3">
        {chunks.map((c) => {
          const active = hit?.chunkId === c.id;
          return (
            <div key={c.id} ref={active ? targetRef : undefined} className={`rounded-xl border p-3 text-[13px] leading-relaxed text-gray-800 ${active ? "border-accent-500 bg-accent-50/40" : "border-gray-100"}`}>
              <div className="text-[11px] text-gray-500 mb-1 flex gap-2">
                <span>#{c.index + 1}</span>
                {c.page ? <span>{t("panelsResearch.sources.pageAbbr", { n: c.page })}</span> : null}
                {c.section ? <span className="truncate">{c.section}</span> : null}
              </div>
              {active && hit && hit.start >= 0 ? (
                <p>
                  {c.text.slice(0, hit.start)}
                  <mark className="bg-accent-100 text-gray-900 rounded px-0.5">{c.text.slice(hit.start, hit.end)}</mark>
                  {c.text.slice(hit.end)}
                </p>
              ) : (
                <p>{c.text}</p>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
