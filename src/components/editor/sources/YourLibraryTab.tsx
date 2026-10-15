"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookMarked, FileSpreadsheet, FileText, Loader2, Plus, Search } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { Spinner } from "@/components/ui";
import { libraryCall, LibraryRequestError } from "@/components/library/libraryApi";
import { PrimaryBadges } from "@/components/library/LibraryItemRow";
import { isPrimary } from "@/components/library/primary";
import { LibraryReferenceView, LibraryResponse, LibrarySourceView, Reference, referenceHtml, ThesisDoc } from "../types";
import type { LibrarySource } from "./SourcesPanel";

export interface YourLibraryTabProps {
  thesisId: string;
  style: ThesisDoc["citationStyle"];
  /** What this thesis already uses, so an item linked a moment ago never shows up as available. */
  references: Reference[];
  sources: LibrarySource[];
  /** After a reference was added to this thesis: the editor re-reads thesis.references from the server. */
  onReferenceAdded: () => Promise<void> | void;
  /** After a source was added to this thesis: the editor re-reads the sources of the thesis. */
  onSourceAdded: () => Promise<void> | void;
  notify: (message: string, kind?: "info" | "success" | "error") => void;
}

/** Client copy for the conflict codes of the library routes; any other error shows the server's (translated) message, or the tab's own. */
const ERROR_KEYS: Record<string, string> = {
  locked: "editor.library.err.locked",
  thesis_cap: "editor.library.err.thesisCap",
  conflict: "editor.library.err.conflict",
  duplicate: "editor.library.err.duplicate",
};

const matches = (q: string, ...fields: (string | undefined)[]) => !q || fields.some((f) => (f || "").toLowerCase().includes(q));

/**
 * "Your library" tab of the Sources & references panel (owner of an editable thesis only): the items of the student's
 * library that this thesis does not use yet, each with "Add to this thesis". Adding links the item; nothing is copied
 * into other theses and nothing is removed anywhere: the links are re-read from the server right before each add, so a
 * change made meanwhile on the library page (often in another browser tab) is kept.
 */
export default function YourLibraryTab({ thesisId, style, references, sources, onReferenceAdded, onSourceAdded, notify }: YourLibraryTabProps) {
  const t = useT();
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  /** Server message when there is one (already translated), else the tab's own sentence. */
  const messageOf = useCallback((e: unknown, fallback: string) => (e instanceof LibraryRequestError && e.message) || t(fallback), [t]);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setError("");
      try {
        setData(await libraryCall<LibraryResponse>("/api/library"));
        setError("");
      } catch (e) {
        if (!quiet) setError(messageOf(e, "editor.library.errLoad"));
      }
    },
    [messageOf]
  );
  useEffect(() => {
    load();
  }, [load]);
  // Back from the library page or another tab: the list may have changed there.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const q = query.trim().toLowerCase();
  const usedRefs = useMemo(() => new Set(references.map((r) => r.id)), [references]);
  const usedSources = useMemo(() => new Set(sources.map((s) => s.id)), [sources]);
  const freeSources = useMemo(() => (data?.sources || []).filter((s) => !s.thesisIds.includes(thesisId) && !usedSources.has(s.id)), [data, thesisId, usedSources]);
  const freeRefs = useMemo(() => (data?.references || []).filter((r) => !r.thesisIds.includes(thesisId) && !usedRefs.has(r.id)), [data, thesisId, usedRefs]);
  const shownSources = freeSources.filter((s) => matches(q, s.title, s.authors, s.doi, s.venue));
  const shownRefs = freeRefs.filter((r) => matches(q, r.title, r.authors, r.doi, r.source));

  const errorText = (e: unknown) => {
    const code = e instanceof LibraryRequestError ? e.body.code : undefined;
    if (code && ERROR_KEYS[code]) return t(ERROR_KEYS[code], { max: 40 });
    return messageOf(e, "editor.library.errAdd");
  };

  /**
   * The PATCH routes set an item's links exactly, so the body is built from the links the server has now, never from
   * the list read when the tab opened: adding to this thesis must not undo a link made meanwhile elsewhere.
   */
  const fresh = async () => {
    const d = await libraryCall<LibraryResponse>("/api/library");
    setData(d);
    return d;
  };

  const addSource = async (s: LibrarySourceView) => {
    setBusy(s.id);
    try {
      const now = (await fresh()).sources.find((x) => x.id === s.id);
      if (!now) return notify(t("editor.library.errAdd"), "error");
      if (!now.thesisIds.includes(thesisId)) {
        const d = await libraryCall<{ source: LibrarySourceView }>(`/api/library/sources/${encodeURIComponent(s.id)}`, { method: "PATCH", json: { thesisIds: [...now.thesisIds, thesisId] } });
        setData((x) => (x ? { ...x, sources: x.sources.map((y) => (y.id === s.id ? d.source : y)) } : x));
      }
      await onSourceAdded();
      notify(t("editor.library.addedSource"), "success");
    } catch (e) {
      notify(errorText(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const addReference = async (r: LibraryReferenceView) => {
    setBusy(r.id);
    try {
      const now = (await fresh()).references.find((x) => x.id === r.id);
      if (!now) return notify(t("editor.library.errAdd"), "error");
      if (!now.thesisIds.includes(thesisId)) {
        const d = await libraryCall<{ reference: LibraryReferenceView }>(`/api/library/references/${encodeURIComponent(r.id)}`, { method: "PATCH", json: { thesisIds: [...now.thesisIds, thesisId] } });
        setData((x) => (x ? { ...x, references: x.references.map((y) => (y.id === r.id ? d.reference : y)) } : x));
      }
      await onReferenceAdded();
      notify(t("editor.library.addedReference"), "success");
    } catch (e) {
      notify(errorText(e), "error");
    } finally {
      setBusy(null);
    }
  };

  /** "Used in 2 other theses": the other theses are counted, never named (the tutor's view never reaches this tab anyway). */
  const usedElsewhere = (ids: string[]) => {
    const n = ids.filter((id) => id !== thesisId).length;
    return n ? t(n === 1 ? "editor.library.usedIn_one" : "editor.library.usedIn", { n }) : t("editor.library.notUsed");
  };

  const addButton = (id: string, title: string, onClick: () => void) => (
    <button onClick={onClick} disabled={busy !== null} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-brand-600 text-white hover:bg-brand-700 font-medium disabled:opacity-40 flex-shrink-0" aria-label={t("editor.library.addAria", { title })}>
      {busy === id ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Plus className="w-3.5 h-3.5" aria-hidden="true" />}
      {t("editor.library.add")}
    </button>
  );

  if (!data && !error)
    return (
      <div className="p-3 flex items-center gap-2 text-xs text-gray-500">
        <Spinner /> {t("editor.library.loading")}
      </div>
    );

  const empty = !!data && !data.sources.length && !data.references.length;

  return (
    <div className="p-3 space-y-3 text-[13px]">
      <p className="text-[12px] text-gray-500">{t("editor.library.intro")}</p>
      {error && (
        <div role="alert" className="text-xs rounded-lg px-3 py-2 bg-red-50 text-red-700 flex items-center gap-2">
          <span className="flex-1">{error}</span>
          <button onClick={() => load()} className="underline hover:no-underline">{t("editor.library.retry")}</button>
        </div>
      )}
      {data && !empty && (freeSources.length > 0 || freeRefs.length > 0) && (
        <label className="relative block">
          <Search className="w-[15px] h-[15px] text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("editor.library.search")} aria-label={t("editor.library.searchLabel")} className="input-field !py-2 !pl-8 !text-[13px]" />
        </label>
      )}
      {empty && <div className="text-xs text-gray-400 text-center py-4">{t("editor.library.emptyLibrary")}</div>}
      {data && !empty && !freeSources.length && !freeRefs.length && <div className="text-xs text-gray-400 text-center py-4">{t("editor.library.allUsed")}</div>}
      {data && (freeSources.length > 0 || freeRefs.length > 0) && !shownSources.length && !shownRefs.length && <div className="text-xs text-gray-400 text-center py-4">{t("editor.library.noMatch")}</div>}

      {shownSources.length > 0 && (
        <section aria-label={t("editor.library.tabSources")} className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-700">{t("editor.library.tabSources")} · {shownSources.length}</h3>
          <ul className="space-y-2">
            {shownSources.map((s) => (
              <li key={s.id} className="p-2.5 rounded-xl border border-gray-100 hover:border-gray-200 text-xs">
                <div className="flex items-start gap-2">
                  {s.kind === "sheet" ? <FileSpreadsheet className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" aria-hidden="true" /> : <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" aria-hidden="true" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-800 text-[13px] leading-snug line-clamp-2">{s.title}</div>
                    <div className="text-gray-500 truncate">{[s.authors, s.year, s.venue].filter(Boolean).join(" · ") || s.file?.name}</div>
                    {isPrimary(s) && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <PrimaryBadges source={s} />
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[11px] text-gray-500 flex-1 min-w-0 truncate">{usedElsewhere(s.thesisIds)}</span>
                  {addButton(s.id, s.title, () => addSource(s))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {shownRefs.length > 0 && (
        <section aria-label={t("editor.library.tabReferences")} className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-700">{t("editor.library.tabReferences")} · {shownRefs.length}</h3>
          <ul className="space-y-2">
            {shownRefs.map((r) => (
              <li key={r.id} className="p-2.5 rounded-xl border border-gray-100 hover:border-gray-200 text-xs">
                <div className="flex items-start gap-2">
                  <BookMarked className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1 text-gray-700" dangerouslySetInnerHTML={{ __html: referenceHtml(r, style) }} />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[11px] text-gray-500 flex-1 min-w-0 truncate">{usedElsewhere(r.thesisIds)}</span>
                  {addButton(r.id, r.title, () => addReference(r))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
