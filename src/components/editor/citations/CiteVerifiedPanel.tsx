"use client";

import { useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";
import { AlertTriangle, BookMarked, BookOpenCheck, CheckCircle2, ExternalLink, HelpCircle, Library, Loader2, RotateCcw, Search, X } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { useFormat, useT } from "@/lib/i18n/client";
import type { ScholarWork } from "@/lib/scholar";
import { formatReference, Reference, ThesisDoc } from "../types";

// ---------- Types shared with /api/ai/cite-verified and /api/theses/[id]/references/check ----------

export interface SupportCandidate {
  work: ScholarWork;
  quote: string;
  relevance: number;
  why: string;
  section?: string;
  verified: true;
}

interface FindResponse {
  candidates: SupportCandidate[];
  candidateCount: number;
  aiUsed: boolean;
  aiAvailable: boolean;
  attribution: string[];
  warnings: string[];
  interactionId?: string;
}

interface CheckResponse {
  references: Reference[];
  checked: number;
}

export interface CiteVerifiedPanelProps {
  editor: Editor;
  thesisId: string;
  sessionId?: string;
  /** Current selection in the document; becomes the claim to find support for. */
  selectionText?: string;
  references: Reference[];
  citationStyle: string;
  canEdit: boolean;
  /** Inserts the citation mark (and, with `markPassage`, the CitedPassage mark on the selection). Wire to DocsEditor's `insertCitation`. */
  onInsertCitation: (ref: Reference, opts: { markPassage: boolean; link?: string }) => void;
  /** Called with the full, updated reference list after a check (persist through the thesis PUT). */
  onReferencesChanged: (refs: Reference[]) => void;
  onAddToLibrary?: (work: { doi?: string; url?: string; title: string }) => void;
  onConsentRequired?: () => void;
  onClose: () => void;
  initialTab?: Tab;
}

type Tab = "find" | "check";
type Status = NonNullable<Reference["verification"]>["status"];

const STATUS: Record<Status, { label: string; summary: string; className: string; icon: React.ReactNode }> = {
  verified: { label: "panelsReview.cite.statusVerified", summary: "panelsReview.cite.summaryVerified", className: "bg-accent-50 text-accent-800 border-accent-100", icon: <CheckCircle2 className="w-3 h-3" /> },
  unverified: { label: "panelsReview.cite.statusUnverified", summary: "panelsReview.cite.summaryUnverified", className: "bg-gray-100 text-gray-600 border-gray-200", icon: <HelpCircle className="w-3 h-3" /> },
  mismatch: { label: "panelsReview.cite.statusMismatch", summary: "panelsReview.cite.summaryMismatch", className: "bg-amber-50 text-amber-800 border-amber-100", icon: <AlertTriangle className="w-3 h-3" /> },
  retracted: { label: "panelsReview.cite.statusRetracted", summary: "panelsReview.cite.summaryRetracted", className: "bg-red-50 text-red-700 border-red-100", icon: <AlertTriangle className="w-3 h-3" /> },
};

const sameWork = (r: Reference, w: ScholarWork) =>
  (!!r.doi && !!w.doi && r.doi.toLowerCase() === w.doi.toLowerCase()) || (!!r.openalexId && !!w.openalexId && r.openalexId === w.openalexId) || (!!r.s2Id && !!w.s2Id && r.s2Id === w.s2Id) || r.title.trim().toLowerCase() === w.title.trim().toLowerCase();

const refType = (t?: string): Reference["type"] => (/chapter/.test(t || "") ? "chapter" : /book|monograph/.test(t || "") ? "book" : /dissertation|thesis/.test(t || "") ? "thesis" : /report|posted-content|preprint|web/.test(t || "") ? "web" : "article");

/** Builds (or updates) a Reference from a verified candidate. Mirrors `referenceFromWork` in src/lib/ai/citeVerified.ts for the browser. */
export function referenceFromCandidate(c: SupportCandidate, existing: Reference | undefined, interactionId?: string): Reference {
  const w = c.work;
  const base: Reference = existing || {
    id: `ref_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    type: refType(w.type),
    authors: w.authors || "",
    year: w.year || "",
    title: w.title,
    source: w.venue || "",
    doi: w.doi,
    url: w.doi ? `https://doi.org/${w.doi}` : w.landingUrl || w.oaUrl,
  };
  return {
    ...base,
    doi: base.doi || w.doi,
    openalexId: w.openalexId || base.openalexId,
    s2Id: w.s2Id || base.s2Id,
    pmid: w.pmid || base.pmid,
    isRetracted: !!w.isRetracted,
    verification: { status: w.isRetracted ? "retracted" : "verified", checkedAt: new Date().toISOString(), source: w.source },
    supportSnippet: { text: c.quote, workId: w.id, section: c.section },
    interactionId: interactionId || base.interactionId,
  };
}

const typeLabel = (t?: string) => (t ? t.replace(/-/g, " ") : "");

export default function CiteVerifiedPanel({ thesisId, sessionId, selectionText, references, citationStyle, canEdit, onInsertCitation, onReferencesChanged, onAddToLibrary, onConsentRequired, onClose, initialTab }: CiteVerifiedPanelProps) {
  const t = useT();
  const [tab, setTab] = useState<Tab>(initialTab || "find");
  const style = (["APA", "MLA", "Chicago", "IEEE", "Harvard"].includes(citationStyle) ? citationStyle : "APA") as ThesisDoc["citationStyle"];

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 flex-shrink-0">
        <BookOpenCheck className="w-4 h-4 text-gray-500" />
        <div className="text-sm font-semibold flex-1">{t("panelsReview.cite.title")}</div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1" aria-label={t("panelsReview.cite.closeAria")}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex border-b border-gray-100 flex-shrink-0 px-3" role="tablist" aria-label={t("panelsReview.cite.title")}>
        {([["find", t("panelsReview.cite.tabFind")], ["check", t("panelsReview.cite.tabCheck")]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`px-3 py-2 text-[13px] border-b-2 -mb-px ${tab === k ? "border-brand-600 text-brand-700 font-medium" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === "find" ? (
          <FindSupport thesisId={thesisId} sessionId={sessionId} selectionText={selectionText} references={references} style={style} canEdit={canEdit} onInsertCitation={onInsertCitation} onAddToLibrary={onAddToLibrary} onConsentRequired={onConsentRequired} />
        ) : (
          <ReferenceCheck thesisId={thesisId} references={references} style={style} canEdit={canEdit} onReferencesChanged={onReferencesChanged} />
        )}
      </div>
    </div>
  );
}

// ---------- Tab 1: Find support ----------

function FindSupport({ thesisId, sessionId, selectionText, references, style, canEdit, onInsertCitation, onAddToLibrary, onConsentRequired }: { thesisId: string; sessionId?: string; selectionText?: string; references: Reference[]; style: ThesisDoc["citationStyle"]; canEdit: boolean; onInsertCitation: CiteVerifiedPanelProps["onInsertCitation"]; onAddToLibrary?: CiteVerifiedPanelProps["onAddToLibrary"]; onConsentRequired?: () => void }) {
  const t = useT();
  const [claim, setClaim] = useState(selectionText || "");
  const [fromSelection, setFromSelection] = useState(!!selectionText);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<FindResponse | null>(null);
  const [markPassage, setMarkPassage] = useState(!!selectionText);
  const [linkText, setLinkText] = useState(false);

  useEffect(() => {
    if (selectionText) {
      setClaim(selectionText);
      setFromSelection(true);
      setMarkPassage(true);
    }
  }, [selectionText]);

  const words = claim.trim().split(/\s+/).filter(Boolean).length;

  const search = async () => {
    if (words < 3) return;
    setLoading(true);
    setError("");
    setData(null);
    try {
      const d = await api<FindResponse>("/api/ai/cite-verified", { method: "POST", json: { thesisId, claim: claim.trim(), sessionId } });
      setData(d);
    } catch (e) {
      const err = e as ApiError;
      if (err.code === "consent_required" && onConsentRequired) onConsentRequired();
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const cite = (c: SupportCandidate) => {
    const existing = references.find((r) => sameWork(r, c.work));
    const ref = referenceFromCandidate(c, existing, data?.interactionId);
    const link = linkText ? ref.url || (ref.doi ? `https://doi.org/${ref.doi}` : undefined) : undefined;
    onInsertCitation(ref, { markPassage: markPassage && fromSelection && !!selectionText, link });
  };

  return (
    <div className="p-3 space-y-3 text-sm">
      <div>
        <label htmlFor="cite-verified-claim" className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
          {fromSelection ? t("panelsReview.cite.claimSelected") : t("panelsReview.cite.claimToSupport")}
        </label>
        <textarea
          id="cite-verified-claim"
          value={claim}
          onChange={(e) => {
            setClaim(e.target.value);
            setFromSelection(false);
          }}
          rows={3}
          placeholder={t("panelsReview.cite.claimPlaceholder")}
          className="input-field !py-2 !px-3 !text-[13px] mt-1 resize-y"
        />
      </div>
      <div className="space-y-1.5">
        <p className="text-[12px] text-gray-500">{t("panelsReview.cite.searchNote", { sources: data?.attribution.includes("Semantic Scholar") ? t("panelsReview.cite.sourcesBoth") : t("panelsReview.cite.sourcesDefault") })}</p>
        <button onClick={search} disabled={loading || words < 3} className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-brand-600 text-white text-[13px] font-medium hover:bg-brand-700 disabled:opacity-40" aria-label={t("panelsReview.cite.searchAria")}>
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          {loading ? t("panelsReview.cite.searching") : t("panelsReview.cite.search")}
        </button>
      </div>

      {error && <div className="p-2.5 rounded-lg bg-red-50 text-red-700 text-xs">{error}</div>}

      {data && (
        <>
          {!data.aiAvailable && <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-100 text-xs text-gray-600">{t("panelsReview.cite.noAi")}</div>}
          {data.warnings.map((w, i) => (
            <div key={i} className="p-2.5 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-800">{w}</div>
          ))}
          {data.candidates.length > 0 && canEdit && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
              {fromSelection && !!selectionText && (
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={markPassage} onChange={(e) => setMarkPassage(e.target.checked)} className="rounded border-gray-300" /> {t("panelsReview.cite.markPassage")}
                </label>
              )}
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={linkText} onChange={(e) => setLinkText(e.target.checked)} className="rounded border-gray-300" /> {t("panelsReview.cite.linkDoi")}
              </label>
            </div>
          )}
          {data.candidates.length === 0 && !data.warnings.length && <div className="text-xs text-gray-400 text-center py-4">{t("panelsReview.cite.noResults")}</div>}
          <ul className="space-y-2" aria-label={t("panelsReview.cite.sourcesAria")}>
            {data.candidates.map((c, i) => (
              <li key={`${c.work.id}-${i}`}>
                <CandidateCard c={c} inLibrary={references.some((r) => sameWork(r, c.work))} style={style} canEdit={canEdit} onCite={() => cite(c)} onAddToLibrary={onAddToLibrary ? () => onAddToLibrary({ doi: c.work.doi, url: c.work.doi ? `https://doi.org/${c.work.doi}` : c.work.landingUrl || c.work.oaUrl, title: c.work.title }) : undefined} />
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-gray-400 pt-1">{t("panelsReview.cite.dataNote", { sources: data.attribution.length ? data.attribution.join(" · ") : "OpenAlex · Semantic Scholar" })}</p>
        </>
      )}
      {!data && !loading && <p className="text-[11px] text-gray-400">{t("panelsReview.cite.dataShort")}</p>}
    </div>
  );
}

function RelevanceDots({ value }: { value: number }) {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={t("panelsReview.cite.relevanceAria", { n: value })}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`w-1.5 h-1.5 rounded-full ${n <= value ? "bg-brand-600" : "bg-gray-200"}`} />
      ))}
    </span>
  );
}

function CandidateCard({ c, inLibrary, style, canEdit, onCite, onAddToLibrary }: { c: SupportCandidate; inLibrary: boolean; style: ThesisDoc["citationStyle"]; canEdit: boolean; onCite: () => void; onAddToLibrary?: () => void }) {
  const t = useT();
  const fmt = useFormat();
  const w = c.work;
  const preview = useMemo(() => formatReference(referenceFromCandidate(c, undefined), style), [c, style]);
  const record = w.doi ? `https://doi.org/${w.doi}` : w.openalexId ? `https://openalex.org/${w.openalexId}` : w.landingUrl;
  return (
    <div className={`p-2.5 rounded-xl border text-xs ${w.isRetracted ? "border-red-200 bg-red-50/40" : "border-gray-100 hover:border-gray-200"}`}>
      <div className="font-medium text-gray-900 text-[13px] leading-snug">{w.title}</div>
      <div className="text-gray-600 mt-0.5">
        {w.authors || t("panelsReview.cite.unknownAuthors")}
        {w.year ? ` · ${w.year}` : ""}
        {w.venue ? ` · ${w.venue}` : ""}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px] text-gray-500">
        {w.type && <span className="px-1.5 py-0.5 rounded-[10px] bg-gray-100 text-gray-600">{typeLabel(w.type)}</span>}
        {typeof w.citedByCount === "number" && <span>{t("panelsReview.cite.citedBy", { n: fmt.number(w.citedByCount) })}</span>}
        <RelevanceDots value={c.relevance} />
        {inLibrary && <span className="text-brand-700">{t("panelsReview.cite.inReferences")}</span>}
      </div>
      {w.isRetracted && (
        <div className="mt-1.5 flex items-start gap-1.5 text-red-700" role="alert">
          <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" />
          <span>{t("panelsReview.cite.retractedWork")}</span>
        </div>
      )}
      <blockquote className="mt-2 pl-2 border-l-2 border-prov-paste text-gray-800 leading-relaxed">
        <mark className="bg-amber-50 text-gray-800 px-0.5 rounded">“{c.quote}”</mark>
        <div className="text-[11px] text-gray-400 mt-0.5 not-italic">{t("panelsReview.cite.verbatim", { section: c.section || t("panelsReview.cite.passage") })}</div>
      </blockquote>
      {c.why && <div className="text-gray-600 mt-1.5">{c.why}</div>}
      <div className="text-gray-400 mt-1.5 line-clamp-2" dangerouslySetInnerHTML={{ __html: preview.full }} />
      <div className="flex flex-wrap items-center gap-2 mt-2">
        {canEdit && (
          <button onClick={onCite} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-brand-600 text-white hover:bg-brand-700 font-medium" aria-label={t("panelsReview.cite.citeAria", { title: w.title })}>
            <BookMarked className="w-3 h-3" /> {t("panelsReview.cite.cite", { citation: preview.inText })}
          </button>
        )}
        {onAddToLibrary && (
          <button onClick={onAddToLibrary} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-gray-200 text-gray-700 hover:border-brand-300 hover:text-brand-700" aria-label={t("panelsReview.cite.addToLibraryAria", { title: w.title })}>
            <Library className="w-3 h-3" /> {t("panelsReview.cite.addToLibrary")}
          </button>
        )}
        {record && (
          <a href={record} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-gray-500 hover:text-brand-700" aria-label={t("panelsReview.cite.openRecordAria", { title: w.title })}>
            {t("panelsReview.cite.openRecord")} <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}

// ---------- Tab 2: Reference check ----------

function ReferenceCheck({ thesisId, references, style, canEdit, onReferencesChanged }: { thesisId: string; references: Reference[]; style: ThesisDoc["citationStyle"]; canEdit: boolean; onReferencesChanged: (refs: Reference[]) => void }) {
  const t = useT();
  const fmt = useFormat();
  const [busy, setBusy] = useState<"all" | string | null>(null);
  const [error, setError] = useState("");
  const sorted = useMemo(() => [...references].sort((a, b) => a.authors.localeCompare(b.authors)), [references]);
  const checked = references.filter((r) => r.verification).length;
  const counts = useMemo(() => {
    const c: Record<Status, number> = { verified: 0, unverified: 0, mismatch: 0, retracted: 0 };
    for (const r of references) if (r.verification) c[r.verification.status]++;
    return c;
  }, [references]);

  const run = async (ids?: string[]) => {
    setBusy(ids ? ids[0] : "all");
    setError("");
    try {
      const d = await api<CheckResponse>(`/api/theses/${thesisId}/references/check`, { method: "POST", json: ids ? { referenceIds: ids } : {} });
      onReferencesChanged(d.references);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const n = Math.min(references.length, 40);

  return (
    <div className="p-3 space-y-3 text-sm">
      {references.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[12px] text-gray-500">
            {t(n === 1 ? "panelsReview.cite.checkNote_one" : "panelsReview.cite.checkNote", { n })}
            {references.length > 40 ? t("panelsReview.cite.firstForty") : ""}
          </p>
          <button onClick={() => run()} disabled={busy !== null} className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-brand-600 text-white text-[13px] font-medium hover:bg-brand-700 disabled:opacity-40" aria-label={checked ? t("panelsReview.cite.recheckAllAria") : t("panelsReview.cite.checkAllAria")}>
            {busy === "all" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : checked ? <RotateCcw className="w-3.5 h-3.5" /> : <BookOpenCheck className="w-3.5 h-3.5" />}
            {busy === "all" ? t("panelsReview.cite.checking") : checked ? t("panelsReview.cite.recheckAll") : t("panelsReview.cite.checkAll")}
          </button>
        </div>
      )}
      {error && <div className="p-2.5 rounded-lg bg-red-50 text-red-700 text-xs">{error}</div>}

      {checked > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label={t("panelsReview.cite.summaryAria")}>
          {(Object.keys(STATUS) as Status[]).filter((s) => counts[s] > 0).map((s) => (
            <span key={s} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[10px] border text-[11px] ${STATUS[s].className}`}>
              {STATUS[s].icon} {t(STATUS[s].summary, { n: counts[s] })}
            </span>
          ))}
        </div>
      )}

      {references.length === 0 && <div className="text-xs text-gray-400 text-center py-4">{t("panelsReview.cite.noReferences")}</div>}

      <ul className="space-y-2" aria-label={t("panelsReview.cite.referencesAria")}>
        {sorted.map((r) => {
          const v = r.verification;
          const s = v ? STATUS[v.status] : null;
          const record = r.doi ? `https://doi.org/${r.doi}` : r.openalexId ? `https://openalex.org/${r.openalexId}` : r.url;
          return (
            <li key={r.id} className={`p-2.5 rounded-xl border text-xs ${v?.status === "retracted" ? "border-red-200 bg-red-50/40" : "border-gray-100"}`}>
              <div className="flex items-start gap-2">
                <div className="flex-1 text-gray-700" dangerouslySetInnerHTML={{ __html: formatReference(r, style).full }} />
                {s ? (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[10px] border text-[11px] whitespace-nowrap ${s.className}`} title={v ? t("panelsReview.cite.checkedTitle", { date: fmt.dateTime(v.checkedAt), source: v.source }) : undefined}>
                    {s.icon} {t(s.label)}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-[10px] border border-dashed border-gray-200 text-[11px] text-gray-400 whitespace-nowrap">{t("panelsReview.cite.notChecked")}</span>
                )}
              </div>
              {v?.status === "retracted" && (
                <div className="mt-1.5 flex items-start gap-1.5 text-red-700" role="alert">
                  <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" />
                  <span>{t("panelsReview.cite.retractedNote")}</span>
                </div>
              )}
              {v?.mismatches && v.mismatches.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-amber-800">
                  {v.mismatches.map((m, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              )}
              {v?.status === "unverified" && <div className="mt-1.5 text-gray-500">{t("panelsReview.cite.unverifiedNote")}</div>}
              {r.supportSnippet?.text && <div className="mt-1.5 text-gray-500 line-clamp-2">{t("panelsReview.cite.supportingPassage", { text: r.supportSnippet.text })}</div>}
              <div className="flex items-center gap-3 mt-1.5">
                {record && (
                  <a href={record} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-gray-500 hover:text-brand-700" aria-label={t("panelsReview.cite.openRecordAria", { title: r.title })}>
                    {t("panelsReview.cite.openRecord")} <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {canEdit && (
                  <button onClick={() => run([r.id])} disabled={busy !== null} className="ml-auto inline-flex items-center gap-1 text-brand-600 hover:underline disabled:opacity-40" aria-label={t(v ? "panelsReview.cite.recheckAria" : "panelsReview.cite.checkAria", { title: r.title })}>
                    {busy === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />} {v ? t("panelsReview.cite.recheck") : t("panelsReview.cite.check")}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {references.length > 0 && (
        <p className="text-[11px] text-gray-400">
          {t("panelsReview.cite.footnote")}
        </p>
      )}
    </div>
  );
}
