"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Link2, Loader2, Search, Sparkles } from "lucide-react";
import { Modal } from "../ui";
import { api } from "@/lib/client";
import { useT } from "@/lib/i18n/client";
import { formatReference, Reference, ThesisDoc } from "./types";

type Candidate = Omit<Reference, "id"> & { origin: "crossref" | "openlibrary" | "page" | "ai" | "library" | "manual"; verified: boolean; note?: string };

export interface CitationInsert {
  reference: Reference;
  isNew: boolean;
  inText: string;
  linkUrl?: string;
  markPassage: boolean;
}

const EMPTY: Candidate = { type: "article", authors: "", year: "", title: "", source: "", volume: "", issue: "", pages: "", doi: "", url: "", origin: "manual", verified: false };

const sameRef = (a: Partial<Reference>, b: Partial<Reference>) =>
  (!!a.doi && !!b.doi && a.doi.toLowerCase() === b.doi.toLowerCase()) || (!!a.url && !!b.url && a.url === b.url) || (!!a.title && !!b.title && a.title.trim().toLowerCase() === b.title.trim().toLowerCase());

export default function CitationDialog({
  open,
  onClose,
  selection,
  thesis,
  sessionId,
  onInsert,
  insertMode,
}: {
  open: boolean;
  onClose: () => void;
  selection: string;
  thesis: ThesisDoc;
  sessionId?: string | null;
  onInsert: (c: CitationInsert) => void;
  insertMode: "selection" | "cursor" | "library";
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [picked, setPicked] = useState<number>(-1);
  const [form, setForm] = useState<Candidate>(EMPTY);
  const [locator, setLocator] = useState("");
  const [style, setStyle] = useState<ThesisDoc["citationStyle"]>(thesis.citationStyle);
  const [linkText, setLinkText] = useState(false);
  const [markPassage, setMarkPassage] = useState(true);
  const [meta, setMeta] = useState<{ aiUsed: boolean; aiAvailable: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setError("");
    setCandidates([]);
    setPicked(-1);
    setForm(EMPTY);
    setLocator("");
    setStyle(thesis.citationStyle);
    setLinkText(false);
    setMarkPassage(insertMode === "selection");
    setMeta(null);
  }, [open, thesis.citationStyle, insertMode]);

  const search = async () => {
    setLoading(true);
    setError("");
    try {
      const d = await api<{ candidates: Candidate[]; aiUsed: boolean; aiAvailable: boolean }>("/api/ai/cite", { method: "POST", json: { query, selection, thesisId: thesis.id, sessionId } });
      setMeta({ aiUsed: d.aiUsed, aiAvailable: d.aiAvailable });
      setCandidates(d.candidates);
      if (d.candidates.length) choose(d.candidates[0], 0);
      else setError(query ? t("editor.cite.noMatch") : t("editor.cite.noMatchSelection"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const choose = (c: Candidate, i: number) => {
    setPicked(i);
    setForm({ ...EMPTY, ...c, volume: c.volume || "", issue: c.issue || "", pages: c.pages || "", doi: c.doi || "", url: c.url || "" });
  };

  const existing = useMemo(() => thesis.references.find((r) => sameRef(r, form)), [thesis.references, form]);
  const sorted = useMemo(() => [...thesis.references].sort((a, b) => a.authors.localeCompare(b.authors)), [thesis.references]);
  const preview = useMemo(() => {
    const ref: Reference = { ...form, id: existing?.id || "preview" } as Reference;
    const f = formatReference(ref, style);
    let inText = f.inText;
    if (style === "IEEE") {
      const list = existing ? sorted : [...sorted, ref].sort((a, b) => a.authors.localeCompare(b.authors));
      const n = list.findIndex((r) => r.id === ref.id || sameRef(r, ref)) + 1;
      inText = `[${n || list.length}${locator ? `, p. ${locator}` : ""}]`;
    } else if (locator) {
      inText = inText.replace(/\)$/, style === "MLA" ? "" : `, p. ${locator})`);
      if (style === "MLA") inText = inText.replace(/\)?$/, ` ${locator})`);
    }
    return { full: f.full, inText };
  }, [form, style, locator, existing, sorted]);

  const valid = form.authors.trim() && form.title.trim() && form.year.trim();
  const linkUrl = form.url || (form.doi ? `https://doi.org/${form.doi}` : "");

  const submit = () => {
    if (!valid) return;
    const { origin: _o, verified: _v, note: _n, ...fields } = form;
    const reference: Reference = existing ? { ...existing, ...fields, id: existing.id } : { ...(fields as Omit<Reference, "id">), id: `ref_${Date.now().toString(36)}` };
    onInsert({ reference, isNew: !existing, inText: preview.inText, linkUrl: linkText && linkUrl ? linkUrl : undefined, markPassage: markPassage && insertMode === "selection" });
    onClose();
  };

  const set = (k: keyof Candidate) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value, origin: form.origin === "manual" ? "manual" : form.origin });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("editor.cite.title")}
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">{t("common.cancel")}</button>
          <button onClick={submit} disabled={!valid} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40">
            {insertMode === "library" ? (existing ? t("editor.cite.updateReference") : t("editor.cite.addToReferences")) : t("editor.cite.insert")}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {selection && insertMode === "selection" && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
            <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wide mb-1">{t("editor.cite.passage")}</div>
            <div className="text-gray-700 line-clamp-3">“{selection}”</div>
          </div>
        )}

        <div>
          <label htmlFor="cite-query" className="block text-xs font-medium text-gray-500 mb-1">{t("editor.cite.queryLabel")}</label>
          <div className="flex gap-2">
            <input
              id="cite-query"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }}
              placeholder={t("editor.cite.queryPlaceholder")}
              className="input-field !py-2"
            />
            <button onClick={search} disabled={loading || (!query.trim() && !selection)} className="btn-primary !py-2 !px-3 text-sm whitespace-nowrap disabled:opacity-40">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : query.trim() ? <Search className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
              <span className="ml-1.5">{query.trim() ? t("editor.cite.find") : t("editor.cite.suggest")}</span>
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            {t("editor.cite.registryNote")}
            {meta && !meta.aiAvailable && t("editor.cite.noAiAccount")}
          </p>
          {error && <div className="mt-2 p-2.5 rounded-lg bg-amber-50 text-amber-800 text-xs">{error}</div>}
        </div>

        {(candidates.length > 0 || sorted.length > 0) && (
          <div className="space-y-1.5">
            {candidates.length > 0 && <div className="text-xs font-medium text-gray-500">{t("editor.cite.results")}</div>}
            {candidates.map((c, i) => (
              <label key={`${c.title}-${i}`} className={`flex gap-2 p-2.5 rounded-xl border cursor-pointer ${picked === i ? "border-brand-500 bg-brand-50/50" : "border-gray-200 hover:border-gray-300"}`}>
                <input type="radio" name="cand" checked={picked === i} onChange={() => choose(c, i)} className="mt-1" />
                <div className="min-w-0">
                  <div className="font-medium text-gray-800 line-clamp-2">{c.title || t("editor.cite.untitled")}</div>
                  <div className="text-xs text-gray-500 truncate">{[c.authors, c.year, c.source].filter(Boolean).join(" · ")}</div>
                  <div className={`text-[10px] mt-0.5 inline-flex items-center gap-1 ${c.verified ? "text-emerald-700" : "text-amber-700"}`}>{c.verified && <BadgeCheck className="w-3 h-3" />}{t(`editor.cite.origin.${c.origin}`)}</div>
                </div>
              </label>
            ))}
            {sorted.length > 0 && (
              <div className="pt-1">
                <label htmlFor="cite-existing" className="text-xs font-medium text-gray-500">{t("editor.cite.reuse")}</label>
                <select
                  id="cite-existing"
                  value=""
                  onChange={(e) => {
                    const r = sorted.find((x) => x.id === e.target.value);
                    if (r) { setPicked(-1); setForm({ ...EMPTY, ...r, origin: "library", verified: true } as Candidate); }
                  }}
                  className="input-field !py-1.5 mt-1 text-xs"
                >
                  <option value="">{t("editor.cite.chooseSaved")}</option>
                  {sorted.map((r) => <option key={r.id} value={r.id}>{`${r.authors.split(",")[0]} (${r.year}) — ${r.title.slice(0, 70)}`}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        <div className="border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-gray-700">{t("editor.cite.review")}</div>
            {form.note && <span className="text-[11px] text-amber-700">{form.note}</span>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
            <label className="col-span-2 sm:col-span-1">{t("editor.cite.type")}<select value={form.type} onChange={set("type")} className="input-field !py-1.5 !text-xs mt-0.5">{["article", "book", "chapter", "web", "thesis"].map((ty) => <option key={ty} value={ty}>{t(`editor.refs.type.${ty}`)}</option>)}</select></label>
            <label className="col-span-2 sm:col-span-4">{t("editor.cite.authors")}<input value={form.authors} onChange={set("authors")} placeholder={t("editor.cite.authorsPlaceholder")} className="input-field !py-1.5 !text-xs mt-0.5" /></label>
            <label className="col-span-2 sm:col-span-1">{t("editor.refs.year")}<input value={form.year} onChange={set("year")} className="input-field !py-1.5 !text-xs mt-0.5" /></label>
            <label className="col-span-2 sm:col-span-6">{t("editor.refs.title")}<input value={form.title} onChange={set("title")} className="input-field !py-1.5 !text-xs mt-0.5" /></label>
            <label className="col-span-2 sm:col-span-3">{t("editor.refs.sourceField")}<input value={form.source} onChange={set("source")} className="input-field !py-1.5 !text-xs mt-0.5" /></label>
            <label>{t("editor.refs.volume")}<input value={form.volume} onChange={set("volume")} className="input-field !py-1.5 !text-xs mt-0.5" /></label>
            <label>{t("editor.refs.issue")}<input value={form.issue} onChange={set("issue")} className="input-field !py-1.5 !text-xs mt-0.5" /></label>
            <label>{t("editor.refs.pages")}<input value={form.pages} onChange={set("pages")} className="input-field !py-1.5 !text-xs mt-0.5" /></label>
            <label className="col-span-2 sm:col-span-3">{t("editor.refs.doi")}<input value={form.doi} onChange={set("doi")} className="input-field !py-1.5 !text-xs mt-0.5" /></label>
            <label className="col-span-2 sm:col-span-3">{t("editor.cite.link")}<input value={form.url} onChange={set("url")} placeholder="https://…" className="input-field !py-1.5 !text-xs mt-0.5" /></label>
          </div>
        </div>

        {insertMode !== "library" && (
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2 text-xs">
              <label className="flex items-center gap-2">{t("editor.cite.style")}<select value={style} onChange={(e) => setStyle(e.target.value as ThesisDoc["citationStyle"])} className="input-field !py-1 !text-xs !w-auto">{["APA", "MLA", "Chicago", "IEEE", "Harvard"].map((s) => <option key={s}>{s}</option>)}</select></label>
              <label className="flex items-center gap-2">{t("editor.cite.pageCited")}<input value={locator} onChange={(e) => setLocator(e.target.value)} placeholder={t("editor.cite.pagePlaceholder")} className="input-field !py-1 !text-xs !w-28" /></label>
              {insertMode === "selection" && (
                <>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={markPassage} onChange={(e) => setMarkPassage(e.target.checked)} />{t("editor.cite.highlightPassage")}</label>
                  <label className={`flex items-center gap-2 ${linkUrl ? "" : "opacity-40"}`}><input type="checkbox" disabled={!linkUrl} checked={linkText && !!linkUrl} onChange={(e) => setLinkText(e.target.checked)} /><Link2 className="w-3.5 h-3.5" />{t("editor.cite.linkPassage")}</label>
                </>
              )}
            </div>
            <div className="p-3 rounded-xl bg-gray-50 text-xs space-y-1.5 min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{t("editor.cite.preview")}</div>
              <div><span className="text-gray-400">{t("editor.cite.inText")}</span> <span className="font-medium text-emerald-800">{valid ? preview.inText : "—"}</span></div>
              <div className="text-gray-700 break-words"><span className="text-gray-400">{t("editor.cite.referenceList")}</span> {valid ? <span dangerouslySetInnerHTML={{ __html: preview.full.replace(/<(?!\/?em>)[^>]*>/g, "") }} /> : "—"}</div>
              {existing && <div className="text-[11px] text-brand-700">{t("editor.cite.reused")}</div>}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
