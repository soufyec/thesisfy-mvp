"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";
import { AlertTriangle, ChevronDown, ChevronRight, Crosshair, ExternalLink, History, Scale, Search } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { useFormat, useLocale, useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/dictionary";
import { Spinner } from "@/components/ui";
import type { EvidenceCheck } from "@/lib/db";
import type { EvidenceResult, Stance } from "@/lib/ai/evidence";
import { PanelShell } from "../Sidebars";

/** A stored check whose results may carry the optional display fields added by `evidenceForClaim`. */
type Check = Omit<EvidenceCheck, "results"> & { results: EvidenceResult[] };

interface RunResponse {
  check: Check;
  aiUsed: boolean;
  aiAvailable: boolean;
  attribution: string;
  mode?: string;
  candidates?: number;
  warnings?: string[];
}

export interface EvidencePanelProps {
  editor: Editor;
  thesisId: string;
  sessionId?: string;
  /** Current selection in the document; becomes the default claim. */
  selectionText?: string;
  canEdit: boolean;
  /** Opens the Find support flow with the claim; the citation itself is inserted only from there. */
  onFindSupport?: (claim: string) => void;
  /** Applies a commentMark to the current selection and returns its id, so the check is tied to the sentence. */
  onAnchor?: (claim: string) => string | undefined;
  onClose: () => void;
}

/** `label` and `none` are message keys; the chip and heading classes are styling only. */
const STANCE_META: Record<Stance, { label: string; none: string; chip: string; heading: string }> = {
  supports: { label: "panelsResearch.evidence.stance.supports", none: "panelsResearch.evidence.none.supports", chip: "bg-accent-50 text-accent-800 border-accent-200", heading: "text-accent-800" },
  qualifies: { label: "panelsResearch.evidence.stance.qualifies", none: "panelsResearch.evidence.none.qualifies", chip: "bg-amber-50 text-amber-800 border-amber-200", heading: "text-amber-800" },
  contradicts: { label: "panelsResearch.evidence.stance.contradicts", none: "panelsResearch.evidence.none.contradicts", chip: "bg-red-50 text-red-700 border-red-200", heading: "text-red-700" },
  mentions: { label: "panelsResearch.evidence.stance.mentions", none: "panelsResearch.evidence.none.mentions", chip: "bg-gray-100 text-gray-600 border-gray-200", heading: "text-gray-600" },
};
const GROUPS: Stance[] = ["supports", "qualifies", "contradicts"];

const openUrl = (r: EvidenceResult) => (r.doi ? `https://doi.org/${r.doi}` : r.url);

/** Relative time ("5 min ago") in the active locale; older than a month falls back to a date. */
function relativeTime(iso: string, tag: string, t: Translate, date: (d: string) => string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return t("panelsResearch.time.justNow");
  const rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto", style: "short" });
  if (m < 60) return rtf.format(-m, "minute");
  const h = Math.round(m / 60);
  if (h < 24) return rtf.format(-h, "hour");
  const days = Math.round(h / 24);
  if (days < 30) return rtf.format(-days, "day");
  return date(iso);
}

export default function EvidencePanel({ editor, thesisId, sessionId, selectionText, canEdit, onFindSupport, onAnchor, onClose }: EvidencePanelProps) {
  const t = useT();
  const fmt = useFormat();
  const { tag } = useLocale();
  const [claim, setClaim] = useState(selectionText || "");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Check | null>(null);
  const [meta, setMeta] = useState<Omit<RunResponse, "check"> | null>(null);
  const [history, setHistory] = useState<Check[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showMentions, setShowMentions] = useState(false);

  // A new selection becomes the claim unless the student is already editing a different one.
  useEffect(() => {
    if (selectionText && selectionText.trim()) setClaim(selectionText.trim());
  }, [selectionText]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await api<{ checks: Check[] }>(`/api/ai/evidence?thesisId=${encodeURIComponent(thesisId)}`);
      setHistory(res.checks);
    } catch {
      /* history is optional */
    }
  }, [thesisId]);
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const run = async () => {
    const text = claim.replace(/\s+/g, " ").trim();
    if (text.split(" ").length < 3) return setError(t("panelsResearch.evidence.claimTooShort"));
    setError(null);
    setRunning(true);
    // Tie the check to the sentence only when the claim is the live selection.
    const anchorId = canEdit && onAnchor && selectionText && selectionText.trim() === text ? onAnchor(text) : undefined;
    try {
      const res = await api<RunResponse>("/api/ai/evidence", { method: "POST", json: { thesisId, claim: text, anchorId, sessionId } });
      setCurrent(res.check);
      setMeta({ aiUsed: res.aiUsed, aiAvailable: res.aiAvailable, attribution: res.attribution, mode: res.mode, candidates: res.candidates, warnings: res.warnings });
      setHistory((h) => [res.check, ...h.filter((c) => c.id !== res.check.id)].slice(0, 20));
      setShowMentions(false);
    } catch (e) {
      const err = e as ApiError;
      setError(err.code === "consent_required" ? t("panelsResearch.evidence.consentRequired") : err.message);
    } finally {
      setRunning(false);
    }
  };

  const reopen = (c: Check) => {
    setCurrent(c);
    setClaim(c.claimQuote);
    setMeta({ aiUsed: c.model !== "demo", aiAvailable: c.model !== "demo", attribution: "" });
    setShowMentions(false);
    setError(null);
  };

  /** Select the sentence the check was anchored to, when its comment mark is still in the document. */
  const showInDocument = (anchorId: string) => {
    let found: { from: number; to: number } | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (found) return false;
      if (node.isText && node.marks.some((m) => m.type.name === "commentMark" && m.attrs.id === anchorId)) found = { from: pos, to: pos + node.nodeSize };
      return !found;
    });
    if (!found) return;
    const f = found as { from: number; to: number };
    editor.chain().focus().setTextSelection({ from: f.from, to: f.to }).run();
    const dom = editor.view.domAtPos(f.from).node as HTMLElement | null;
    (dom?.nodeType === 3 ? dom.parentElement : dom)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const grouped = useMemo(() => {
    const g: Record<Stance, EvidenceResult[]> = { supports: [], qualifies: [], contradicts: [], mentions: [] };
    for (const r of current?.results || []) g[r.stance]?.push(r);
    return g;
  }, [current]);
  const total = current?.results.length || 0;

  return (
    <PanelShell title={t("panelsResearch.evidence.title")} icon={<Scale className="w-4 h-4 text-gray-500" />} onClose={onClose}>
      <div className="p-3 space-y-3 text-sm">
        <div>
          <label htmlFor="evidence-claim" className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{t("panelsResearch.evidence.claim")}</label>
          <textarea
            id="evidence-claim"
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
            placeholder={t("panelsResearch.evidence.claimPlaceholder")}
            rows={3}
            className="input-field mt-1 !py-2 !text-[13px] resize-none"
            aria-label={t("panelsResearch.evidence.claimLabel")}
          />
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] text-gray-500 leading-snug">{t("panelsResearch.evidence.note")}</p>
          <button onClick={run} disabled={running || !claim.trim()} className="btn-primary w-full !py-2 text-[13px] flex items-center justify-center gap-1.5 disabled:opacity-50" aria-label={t("panelsResearch.evidence.checkLabel")}>
            {running ? <Spinner className="w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
            {running ? t("panelsResearch.evidence.checking") : t("panelsResearch.evidence.check")}
          </button>
        </div>
        {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2" role="alert">{error}</div>}

        {current && (
          <div className="space-y-3">
            {meta && !meta.aiUsed && (
              <div className="text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-2">
                {meta.aiAvailable ? t("panelsResearch.evidence.noLabels") : t("panelsResearch.evidence.noModel")}
              </div>
            )}
            {meta?.warnings?.map((w, i) => (
              <div key={i} className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-2">{w}</div>
            ))}
            {current.anchorId && (
              <button onClick={() => showInDocument(current.anchorId!)} className="text-[11px] text-brand-700 hover:underline inline-flex items-center gap-1" aria-label={t("panelsResearch.evidence.showLabel")}>
                <Crosshair className="w-3 h-3" /> {t("panelsResearch.evidence.show")}
              </button>
            )}

            {total === 0 && <div className="text-xs text-gray-500">{t("panelsResearch.evidence.noPassages")}</div>}

            {GROUPS.map((s) => (
              <Group key={s} stance={s} results={grouped[s]} claim={current.claimQuote} onFindSupport={onFindSupport} />
            ))}

            {grouped.mentions.length > 0 && (
              <div>
                <button onClick={() => setShowMentions((v) => !v)} className="w-full flex items-center gap-1.5 text-xs font-semibold text-gray-600 py-1" aria-expanded={showMentions} aria-label={t("panelsResearch.evidence.toggleMentions")}>
                  {showMentions ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  {t(STANCE_META.mentions.label)} <span className="text-gray-400 font-normal">· {grouped.mentions.length}</span>
                </button>
                {showMentions && <div className="space-y-2 mt-1">{grouped.mentions.map((r, i) => <Row key={r.workId + i} r={r} claim={current.claimQuote} onFindSupport={onFindSupport} />)}</div>}
              </div>
            )}

            {total > 0 && (
              <p className="text-[11px] text-gray-500 border-t border-gray-100 pt-2">
                {t(total === 1 ? "panelsResearch.evidence.noScore_one" : "panelsResearch.evidence.noScore", { n: total })}
                {meta?.candidates ? ` ${t(meta.candidates === 1 ? "panelsResearch.evidence.candidates_one" : "panelsResearch.evidence.candidates", { n: meta.candidates })}` : ""}
              </p>
            )}
          </div>
        )}

        {history.length > 0 && (
          <div className="border-t border-gray-100 pt-2">
            <button onClick={() => setHistoryOpen((v) => !v)} className="w-full flex items-center gap-1.5 text-xs font-semibold text-gray-600 py-1" aria-expanded={historyOpen} aria-label={t("panelsResearch.evidence.toggleHistory")}>
              <History className="w-3.5 h-3.5" /> {t("panelsResearch.evidence.history")} <span className="text-gray-400 font-normal">· {history.length}</span>
            </button>
            {historyOpen && (
              <ul className="mt-1 space-y-1">
                {history.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => reopen(c)} className={`w-full text-left rounded-lg px-2 py-1.5 hover:bg-gray-50 ${current?.id === c.id ? "bg-brand-50" : ""}`} aria-label={t("panelsResearch.evidence.reopenLabel", { claim: c.claimQuote.slice(0, 80) })}>
                      <div className="text-xs text-gray-800 line-clamp-2">“{c.claimQuote}”</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">{counts(c.results, t)} · {relativeTime(c.createdAt, tag, t, fmt.date)}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p className="text-[11px] text-gray-400 pt-1">{meta?.attribution || t("panelsResearch.evidence.attribution")}</p>
      </div>
    </PanelShell>
  );
}

function counts(results: EvidenceResult[], t: Translate) {
  const n = (s: Stance) => results.filter((r) => r.stance === s).length;
  const part = (s: Stance) => t(n(s) === 1 ? `panelsResearch.evidence.count.${s}_one` : `panelsResearch.evidence.count.${s}`, { n: n(s) });
  const parts = [part("supports"), part("qualifies"), part("contradicts")];
  if (n("mentions")) parts.push(part("mentions"));
  return parts.join(" · ");
}

function Group({ stance, results, claim, onFindSupport }: { stance: Stance; results: EvidenceResult[]; claim: string; onFindSupport?: (claim: string) => void }) {
  const t = useT();
  const m = STANCE_META[stance];
  return (
    <section aria-label={`${t(m.label)}: ${results.length}`}>
      <h3 className={`text-xs font-semibold ${m.heading} flex items-center gap-1.5`}>
        {t(m.label)} <span className="text-gray-400 font-normal">· {results.length}</span>
      </h3>
      {results.length === 0 ? (
        <p className="text-[11px] text-gray-400 mt-0.5">{t(m.none)}</p>
      ) : (
        <div className="space-y-2 mt-1.5">{results.map((r, i) => <Row key={r.workId + i} r={r} claim={claim} onFindSupport={onFindSupport} />)}</div>
      )}
    </section>
  );
}

function Row({ r, claim, onFindSupport }: { r: EvidenceResult; claim: string; onFindSupport?: (claim: string) => void }) {
  const t = useT();
  const fmt = useFormat();
  const m = STANCE_META[r.stance];
  const href = openUrl(r);
  const metaLine = [r.authors, r.year, r.type, typeof r.citedByCount === "number" ? t("panelsResearch.evidence.citedBy", { n: fmt.number(r.citedByCount) }) : undefined].filter(Boolean).join(" · ");
  return (
    <article className="rounded-xl border border-gray-200 p-2.5 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-[10px] border ${m.chip}`}>{t(m.label)}</span>
        {r.isRetracted && (
          <span className="text-[11px] font-medium text-red-700 inline-flex items-center gap-1" role="note">
            <AlertTriangle className="w-3 h-3" /> {t("panelsResearch.evidence.retracted")}
          </span>
        )}
        {r.stance !== "mentions" && typeof r.confidence === "number" && r.confidence > 0 && <span className="text-[11px] text-gray-400 ml-auto" title={t("panelsResearch.evidence.confidenceTitle")}>{t("panelsResearch.evidence.confidence", { n: fmt.number(Math.round(r.confidence * 100) / 100) })}</span>}
      </div>
      <blockquote className="text-[13px] text-gray-800 leading-snug" style={{ fontFamily: "Georgia, serif" }}>“{r.quote}”</blockquote>
      <div className="text-xs text-gray-700 font-medium leading-snug">{r.title}</div>
      {metaLine && <div className="text-[11px] text-gray-500">{metaLine}</div>}
      <div className="flex items-center gap-3 pt-0.5">
        {href && (
          <a href={href} target="_blank" rel="noreferrer" className="text-[11px] text-brand-700 hover:underline inline-flex items-center gap-1" aria-label={t("panelsResearch.evidence.openLabel", { title: r.title })}>
            <ExternalLink className="w-3 h-3" /> {t("common.open")}
          </a>
        )}
        {onFindSupport && (
          <button onClick={() => onFindSupport(claim)} className="text-[11px] text-brand-700 hover:underline" aria-label={t("panelsResearch.evidence.useLabel", { feature: t("panelsResearch.evidence.findSupport") })}>
            {t("panelsResearch.evidence.use", { feature: t("panelsResearch.evidence.findSupport") })}
          </button>
        )}
      </div>
    </article>
  );
}
