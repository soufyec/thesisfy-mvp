"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileText, Lock, Plus, Search, Table2, Trash2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { ConfirmDialog } from "@/components/editor/Dialogs";
import { Spinner, Toast } from "@/components/ui";
import { useUser } from "@/components/useUser";
import { referenceHtml, type LibraryReferenceView, type LibraryResponse, type LibrarySourceView } from "@/components/editor/types";
import { useFormat, useT } from "@/lib/i18n/client";
import AddLibraryItemDialog, { type AddKind } from "@/components/library/AddLibraryItemDialog";
import { libraryCall, LibraryRequestError } from "@/components/library/libraryApi";
import { CHIP, CutNotes, ItemLink, LibraryItemRow, ReferenceTypeBadge, referenceMeta, SourceBadges, sourceMeta } from "@/components/library/LibraryItemRow";
import DataPreviewModal from "@/components/library/DataPreviewModal";
import { isPrimary, readAsSummary } from "@/components/library/primary";
import { LockedHints, lockedHintId, ThesisToggleChip, UsedCheckbox } from "@/components/library/LibraryControls";

type Section = "sources" | "references";
type Show = "all" | "used" | "unused";
/** Sources tab filter (docs/papers.md §4.7): everything, the student's own material, or the literature they cite. */
type SourceFilter = "all" | "primary" | "literature";
type ToastState = { message: string; kind: "info" | "success" | "error" } | null;

const toggled = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
const only = (counts: Record<string, number>, ids: string[]) => Object.fromEntries(Object.entries(counts).filter(([id, n]) => n > 0 && ids.includes(id)));
const matches = (needle: string, ...fields: (string | undefined)[]) => !needle || fields.some((f) => !!f && f.toLowerCase().includes(needle));

/**
 * Sources & references (/dashboard/sources): the student's personal library. Everything added to a thesis lives here;
 * the student chooses which sources and references each thesis uses. `?thesis=<id>` preselects a thesis,
 * `?tab=references` opens the references section. Writes go to /api/library/*; the page applies them optimistically
 * and then keeps the server's answer.
 */
function SourcesInner() {
  const t = useT();
  const fmt = useFormat();
  const params = useSearchParams();
  const { user } = useUser();
  const paramThesis = params.get("thesis") || "";
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string>(paramThesis || "all");
  const [section, setSection] = useState<Section>(params.get("tab") === "references" ? "references" : "sources");
  const [q, setQ] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [preview, setPreview] = useState<LibrarySourceView | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<ToastState>(null);
  const [adding, setAdding] = useState<AddKind | null>(null);
  const [unlinkCited, setUnlinkCited] = useState<{ id: string; title: string; thesisIds: string[]; citedIn: Record<string, number> } | null>(null);
  const [delSource, setDelSource] = useState<LibrarySourceView | null>(null);
  /** `confirmCited`: the dialog states the citation consequence, so the DELETE carries `confirmCited=1`. */
  const [delRef, setDelRef] = useState<{ ref: LibraryReferenceView; citedIn: Record<string, number>; confirmCited: boolean } | null>(null);
  /** Writes in flight: a background refresh must not overwrite an optimistic state. */
  const inFlight = useRef(0);
  const closeToast = useCallback(() => setToast(null), []);

  const load = useCallback(async (quiet = false) => {
    try {
      const d = await libraryCall<LibraryResponse>("/api/library");
      setData(d);
      setFailed(false);
    } catch {
      if (!quiet) setFailed(true);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  // Links also change in the editor (often in another tab): refresh when this page becomes visible again.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && inFlight.current === 0) load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);
  useEffect(() => {
    setSelected(paramThesis || "all");
  }, [paramThesis]);

  const theses = useMemo(() => data?.theses || [], [data]);
  const thesisById = useMemo(() => new Map(theses.map((x) => [x.id, x])), [theses]);
  const current = selected === "all" ? null : thesisById.get(selected) || null;
  const isStudent = !user || user.role === "student";

  const choose = (id: string) => {
    setSelected(id);
    setShow("all");
    try {
      const url = new URL(window.location.href);
      if (id === "all") url.searchParams.delete("thesis");
      else url.searchParams.set("thesis", id);
      window.history.replaceState(null, "", url.pathname + url.search);
    } catch {
      /* the URL is a convenience; the selection already changed */
    }
  };

  const count = (key: string, n: number) => (n === 1 ? t(`${key}_one`, { n }) : t(key, { n }));
  const titleOf = (id: string) => thesisById.get(id)?.title || "";
  const citedList = (citedIn: Record<string, number>) =>
    Object.entries(citedIn)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => (n === 1 ? t("dashboard.sources.citedCount_one", { title: titleOf(id) }) : t("dashboard.sources.citedCount", { n, title: titleOf(id) })))
      .join("; ");

  // ----- Filtering -----
  const needle = q.trim().toLowerCase();
  const usedFilter = (ids: string[]) => !current || show === "all" || (show === "used") === ids.includes(current.id);
  const kindFilter = (s: LibrarySourceView) => sourceFilter === "all" || (sourceFilter === "primary") === isPrimary(s);
  const searchedSources = (data?.sources || []).filter((s) => matches(needle, s.title, s.authors, s.doi, s.venue, s.url, s.year, s.file?.name) && usedFilter(s.thesisIds));
  const sources = searchedSources.filter(kindFilter);
  const references = (data?.references || []).filter((r) => matches(needle, r.title, r.authors, r.doi, r.source, r.url, r.year) && usedFilter(r.thesisIds));
  const fullText = useMemo(() => {
    const ids = new Set<string>();
    const dois = new Set<string>();
    for (const s of data?.sources || []) {
      if (s.coverage === "none") continue;
      ids.add(s.id);
      if (s.doi) dois.add(s.doi.toLowerCase());
    }
    return { ids, dois };
  }, [data]);

  // ----- Writes -----
  const mark = (key: string, on: boolean) => {
    inFlight.current += on ? 1 : -1;
    setBusy((b) => {
      const next = { ...b };
      if (on) next[key] = true;
      else delete next[key];
      return next;
    });
  };
  const showError = (e: unknown) => {
    const err = e instanceof LibraryRequestError ? e : null;
    // Server errors arrive translated; no answer at all (network) or an empty body gets the generic sentence.
    setToast({ message: err?.message || t("dashboard.sources.error.generic"), kind: "error" });
    if (err?.body.code === "conflict" || err?.status === 404) load(true);
  };
  const openAdd = (kind: AddKind) => {
    // A toast from the last add would sit above the dialog (and its "Use in" chips) on a phone.
    setToast(null);
    setAdding(kind);
  };
  const lockedNotice = (title: string) => setToast({ message: t("library.error.locked", { title }), kind: "info" });
  const patchSource = (id: string, patch: Partial<LibrarySourceView>) => setData((d) => d && { ...d, sources: d.sources.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const patchReference = (id: string, patch: Partial<LibraryReferenceView>) => setData((d) => d && { ...d, references: d.references.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  const setSourceLinks = async (s: LibrarySourceView, thesisIds: string[]) => {
    const key = `s:${s.id}`;
    if (busy[key]) return;
    const before = s.thesisIds;
    patchSource(s.id, { thesisIds });
    mark(key, true);
    try {
      const r = await libraryCall<{ source: LibrarySourceView }>(`/api/library/sources/${encodeURIComponent(s.id)}`, { method: "PATCH", json: { thesisIds } });
      patchSource(s.id, r.source);
    } catch (e) {
      patchSource(s.id, { thesisIds: before });
      showError(e);
    } finally {
      mark(key, false);
    }
  };

  const setReferenceLinks = async (r: LibraryReferenceView, thesisIds: string[], confirmCited = false) => {
    const key = `r:${r.id}`;
    if (busy[key]) return;
    const removed = r.thesisIds.filter((id) => !thesisIds.includes(id));
    // Known citations: ask before the round trip. The server checks again (409 "cited") in case the text changed.
    const known = only(r.citedIn, removed);
    if (!confirmCited && Object.keys(known).length) return setUnlinkCited({ id: r.id, title: r.title, thesisIds, citedIn: known });
    const before = r.thesisIds;
    patchReference(r.id, { thesisIds });
    mark(key, true);
    try {
      const res = await libraryCall<{ reference: LibraryReferenceView }>(`/api/library/references/${encodeURIComponent(r.id)}`, { method: "PATCH", json: confirmCited ? { thesisIds, confirmCited: true } : { thesisIds } });
      patchReference(r.id, res.reference);
    } catch (e) {
      const err = e instanceof LibraryRequestError ? e : null;
      // A 409 "cited" carries the current counts: the row keeps them, so it no longer says "not cited".
      patchReference(r.id, err?.body.citedIn ? { thesisIds: before, citedIn: { ...r.citedIn, ...err.body.citedIn } } : { thesisIds: before });
      if (err?.body.code === "cited" && !confirmCited) setUnlinkCited({ id: r.id, title: r.title, thesisIds, citedIn: err.body.citedIn || known });
      else showError(e);
    } finally {
      mark(key, false);
    }
  };

  const deleteSource = async (s: LibrarySourceView) => {
    const key = `s:${s.id}`;
    mark(key, true);
    try {
      await libraryCall(`/api/library/sources/${encodeURIComponent(s.id)}`, { method: "DELETE" });
      setData((d) => d && { ...d, sources: d.sources.filter((x) => x.id !== s.id) });
      setToast({ message: t("dashboard.sources.toast.deleted"), kind: "success" });
    } catch (e) {
      showError(e);
    } finally {
      mark(key, false);
    }
  };

  const deleteReference = async (r: LibraryReferenceView, confirmCited: boolean) => {
    const key = `r:${r.id}`;
    mark(key, true);
    try {
      await libraryCall(`/api/library/references/${encodeURIComponent(r.id)}${confirmCited ? "?confirmCited=1" : ""}`, { method: "DELETE" });
      setData((d) => d && { ...d, references: d.references.filter((x) => x.id !== r.id) });
      setToast({ message: t("dashboard.sources.toast.deleted"), kind: "success" });
    } catch (e) {
      const err = e instanceof LibraryRequestError ? e : null;
      if (err?.body.citedIn) patchReference(r.id, { citedIn: { ...r.citedIn, ...err.body.citedIn } });
      // Cited since the page loaded: show the consequence and ask again.
      if (err?.body.code === "cited" && !confirmCited) setDelRef({ ref: r, citedIn: err.body.citedIn || {}, confirmCited: true });
      else showError(e);
    } finally {
      mark(key, false);
    }
  };

  const onSourceAdded = (s: LibrarySourceView, existing: boolean, linked: number) => {
    setData((d) => d && { ...d, sources: [s, ...d.sources.filter((x) => x.id !== s.id)] });
    setSection("sources");
    const primary = isPrimary(s) && s.parseStatus !== "failed";
    const message = existing ? t(linked ? "dashboard.sources.toast.existing" : "dashboard.sources.toast.existingNoLink") : primary ? t("library.ui.toast.primaryAdded", { summary: readAsSummary(s, t, (n) => fmt.number(n)) || "" }).trim() : s.parseStatus === "parsed" && s.coverage === "full_text" ? t("dashboard.sources.toast.sourceAdded") : s.coverage === "abstract" ? t("dashboard.sources.toast.sourceAbstract") : t("dashboard.sources.toast.sourceNoText");
    if (!existing && primary && sourceFilter === "literature") setSourceFilter("all");
    if (!existing && !primary && sourceFilter === "primary") setSourceFilter("all");
    setToast({ message, kind: existing || primary || s.coverage === "full_text" ? "success" : "info" });
  };
  const onReferenceAdded = (r: LibraryReferenceView, existing: boolean, linked: number) => {
    setData((d) => d && { ...d, references: d.references.some((x) => x.id === r.id) ? d.references.map((x) => (x.id === r.id ? r : x)) : [r, ...d.references] });
    setSection("references");
    setToast({ message: existing ? t(linked ? "dashboard.sources.toast.existing" : "dashboard.sources.toast.existingNoLink") : t("dashboard.sources.toast.referenceAdded"), kind: "success" });
  };

  // ----- Pieces -----
  const selection = (thesisIds: string[], onSet: (ids: string[]) => void, isBusy: boolean) => {
    if (!isStudent || theses.length === 0) return null;
    if (current) {
      return (
        <div className="mt-2.5 flex items-center gap-2">
          <UsedCheckbox on={thesisIds.includes(current.id)} locked={current.locked} busy={isBusy} describedBy={lockedHintId(current.id)} onLocked={() => lockedNotice(current.title)} onToggle={() => onSet(toggled(thesisIds, current.id))} />
          {isBusy && <Spinner className="w-3.5 h-3.5 text-gray-400" />}
        </div>
      );
    }
    return (
      <div className="mt-3 flex flex-wrap items-center gap-1.5 min-w-0">
        <span className="text-[11px] text-gray-500 mr-0.5">{t("dashboard.sources.usedIn")}</span>
        {theses.map((x) => (
          <ThesisToggleChip key={x.id} title={x.title} on={thesisIds.includes(x.id)} locked={x.locked} busy={isBusy} describedBy={lockedHintId(x.id)} onLocked={() => lockedNotice(x.title)} onToggle={() => onSet(toggled(thesisIds, x.id))} />
        ))}
        {isBusy && <Spinner className="w-3.5 h-3.5 text-gray-400" />}
      </div>
    );
  };

  /**
   * Trash button of a row. While an approved or submitted thesis uses the item the server refuses the delete, so the
   * button says why (aria-disabled, tooltip, a toast on click) instead of opening a dialog whose consequence cannot happen.
   */
  const deleteButton = (itemKey: string, thesisIds: string[], onClick: () => void) => {
    const lockedBy = thesisIds.map((id) => thesisById.get(id)).find((x) => x?.locked);
    const hintId = `library-delete-locked-${itemKey}`;
    return (
      <>
        {lockedBy && (
          <span id={hintId} className="sr-only">
            {t("dashboard.sources.deleteLockedHint")}
          </span>
        )}
        <button
          type="button"
          onClick={lockedBy ? () => setToast({ message: t("dashboard.sources.deleteLocked", { title: lockedBy.title }), kind: "info" }) : onClick}
          aria-disabled={lockedBy ? true : undefined}
          aria-describedby={lockedBy ? hintId : undefined}
          className={`p-1.5 rounded-lg text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${lockedBy ? "opacity-50 cursor-not-allowed" : "hover:text-red-600 hover:bg-red-50"}`}
          aria-label={t("dashboard.sources.delete")}
          title={lockedBy ? t("dashboard.sources.deleteLockedHint") : t("dashboard.sources.delete")}
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
      </>
    );
  };

  const emptyState = (text: string, action?: { label: string; kind: AddKind }) => (
    <div className="px-6 py-10 text-center">
      <p className="text-sm text-gray-500 max-w-md mx-auto break-words [overflow-wrap:anywhere]">{text}</p>
      {action && isStudent && (
        <button onClick={() => openAdd(action.kind)} className="btn-primary !py-2 !px-4 text-sm mt-4">
          <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
          {action.label}
        </button>
      )}
    </div>
  );

  const sectionEmpty = (total: number, kind: AddKind) => {
    if (total === 0) return emptyState(t(`dashboard.sources.empty.${section}`), { label: t(kind === "source" ? "dashboard.sources.empty.addSource" : "dashboard.sources.empty.addReference"), kind });
    if (kind === "source" && sourceFilter !== "all" && !needle && searchedSources.length > 0) return emptyState(t(sourceFilter === "primary" ? "dashboard.sources.empty.primary" : "dashboard.sources.empty.literature"), { label: t("dashboard.sources.empty.addSource"), kind });
    if (needle) return emptyState(t("dashboard.sources.empty.noMatch", { q: q.trim() }));
    if (current && show === "used") return emptyState(t("dashboard.sources.empty.usedNone"));
    if (current && show === "unused") return emptyState(t("dashboard.sources.empty.unusedNone"));
    return emptyState(t("dashboard.sources.empty.noMatch", { q: q.trim() }));
  };

  const header = (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">{t("glossary.sourcesReferences")}</h1>
        {isStudent && <p className="text-gray-500 mt-1 text-sm max-w-3xl">{t("dashboard.sources.subtitle")}</p>}
      </div>
      {isStudent && data && (
        <button onClick={() => openAdd(section === "references" ? "reference" : "source")} className="btn-primary !px-4 !py-2.5 self-start flex-shrink-0">
          <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
          {t("dashboard.sources.add")}
        </button>
      )}
    </div>
  );

  if (user && user.role !== "student") {
    return (
      <div className="max-w-6xl space-y-6">
        {header}
        <div className="card p-10 text-center text-sm text-gray-500">{t("library.error.studentsOnly")}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-6xl space-y-6">
        {header}
        {failed ? (
          <div className="card p-10 text-center">
            <p className="text-sm text-gray-500">{t("dashboard.sources.loadFailed")}</p>
            <button onClick={() => load()} className="btn-outline !py-2 !px-4 text-sm mt-4">{t("common.retry")}</button>
          </div>
        ) : (
          <div className="card p-10 text-center text-sm text-gray-400">{t("common.loading")}…</div>
        )}
      </div>
    );
  }

  const usedSources = current ? data.sources.filter((s) => s.thesisIds.includes(current.id)).length : 0;
  const usedReferences = current ? data.references.filter((r) => r.thesisIds.includes(current.id)).length : 0;
  const chipClass = (on: boolean) => `inline-flex items-center gap-1.5 max-w-full rounded-[10px] border px-3 py-1.5 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${on ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`;

  return (
    <div className="max-w-6xl space-y-5 min-w-0">
      {header}

      {/* Thesis selector */}
      <div role="group" aria-label={t("dashboard.sources.thesisFilter")} className="flex flex-wrap gap-1.5 min-w-0">
        <button type="button" aria-pressed={!current} onClick={() => choose("all")} className={chipClass(!current)}>
          {t("dashboard.sources.allTheses")}
        </button>
        {theses.map((x) => (
          <button key={x.id} type="button" aria-pressed={current?.id === x.id} onClick={() => choose(x.id)} className={chipClass(current?.id === x.id)} aria-label={x.locked ? t("dashboard.sources.lockedChip", { title: x.title }) : undefined} title={x.locked ? t("dashboard.sources.lockedHint") : x.title}>
            {x.locked && <Lock className="w-[15px] h-[15px] flex-shrink-0" aria-hidden="true" />}
            <span className="truncate max-w-[16rem]">{x.title}</span>
          </button>
        ))}
      </div>

      {theses.length === 0 && (
        <div className="rounded-xl bg-gray-100 px-4 py-3 text-sm text-gray-600 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{t("dashboard.sources.noTheses")}</span>
          <Link href="/dashboard/papers?new=1" className="text-brand-600 font-medium hover:underline">{t("dashboard.theses.new")}</Link>
        </div>
      )}

      {current && (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="text-sm text-gray-700 min-w-0">
            <p className="break-words">{t("dashboard.sources.selectedSummary", { title: current.title, sources: count("dashboard.theses.sourceCount", usedSources), references: count("dashboard.theses.referenceCount", usedReferences) })}</p>
            {current.locked && (
              <p className="flex items-center gap-1.5 text-xs text-amber-700 mt-1">
                <Lock className="w-[15px] h-[15px] flex-shrink-0" aria-hidden="true" />
                {t("dashboard.sources.lockedHint")}
              </p>
            )}
          </div>
          <Link href={`/dashboard/editor/${current.id}`} className="inline-flex items-center gap-1.5 text-sm text-brand-600 font-medium hover:underline whitespace-nowrap self-start sm:self-auto">
            <FileText className="w-4 h-4" aria-hidden="true" />
            {t("dashboard.sources.openEditor")}
          </Link>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
        <label className="relative flex-1 sm:max-w-sm min-w-0">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("dashboard.sources.search")} aria-label={t("dashboard.sources.search")} className="input-field !py-2 !pl-9" />
        </label>
        {current && (
          <label className="text-xs text-gray-500 inline-flex items-center gap-2">
            {t("dashboard.sources.show")}
            <select value={show} onChange={(e) => setShow(e.target.value as Show)} className="input-field !py-2 !w-auto">
              <option value="all">{t("dashboard.sources.show.all")}</option>
              <option value="used">{t("dashboard.sources.show.used")}</option>
              <option value="unused">{t("dashboard.sources.show.unused")}</option>
            </select>
          </label>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm min-w-0">
        <div role="tablist" aria-label={t("dashboard.sources.tabs")} className="flex border-b border-gray-100 px-2 sm:px-3">
          {(["sources", "references"] as Section[]).map((s) => {
            const on = section === s;
            const n = s === "sources" ? sources.length : references.length;
            return (
              <button key={s} type="button" role="tab" id={`library-tab-${s}`} aria-controls={`library-panel-${s}`} aria-selected={on} tabIndex={on ? 0 : -1} onClick={() => setSection(s)} onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { const next = s === "sources" ? "references" : "sources"; setSection(next); document.getElementById(`library-tab-${next}`)?.focus(); } }} className={`relative px-3 sm:px-4 py-3 text-sm font-medium inline-flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/40 rounded-t-lg ${on ? "text-brand-700" : "text-gray-500 hover:text-gray-800"}`}>
                {t(`dashboard.sources.tab.${s}`)}
                <span className={`${CHIP} ${on ? "bg-brand-50 text-brand-700" : "bg-gray-100 text-gray-600"}`}>{n}</span>
                {on && <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-brand-600 rounded-full" aria-hidden="true" />}
              </button>
            );
          })}
        </div>

        <div role="tabpanel" id={`library-panel-${section}`} aria-labelledby={`library-tab-${section}`}>
          <p className="px-4 sm:px-5 pt-3 text-xs text-gray-500">{t(`dashboard.sources.help.${section}`)}</p>
          {section === "sources" && (data.sources.length > 0) && (
            <div role="group" aria-label={t("library.ui.filter.label")} className="px-4 sm:px-5 pt-3 flex flex-wrap gap-1.5">
              {(["all", "primary", "literature"] as SourceFilter[]).map((f) => {
                const n = f === "all" ? searchedSources.length : searchedSources.filter((s) => (f === "primary") === isPrimary(s)).length;
                const on = sourceFilter === f;
                return (
                  <button key={f} type="button" aria-pressed={on} onClick={() => setSourceFilter(f)} className={chipClass(on)}>
                    {f === "all" ? t("library.ui.filter.all") : f === "primary" ? t("glossary.primaryData") : t("library.ui.filter.literature")}
                    <span className={`tabular-nums ${on ? "text-white/80" : "text-gray-400"}`}>{n}</span>
                  </button>
                );
              })}
            </div>
          )}
          {section === "sources" ? (
            sources.length === 0 ? (
              sectionEmpty(data.sources.length, "source")
            ) : (
              <ul className="divide-y divide-gray-50">
                {sources.map((s) => (
                  <LibraryItemRow
                    key={s.id}
                    kind={s.kind}
                    title={s.title}
                    meta={sourceMeta(s) || (s.file && s.file.name !== s.title ? s.file.name : undefined)}
                    busy={!!busy[`s:${s.id}`]}
                    badges={
                      <>
                        <SourceBadges source={s} />
                        <ItemLink doi={s.doi} url={s.url} />
                        {s.kind === "sheet" && s.dataset && s.dataset.sheets.length > 0 && (
                          <button type="button" onClick={() => setPreview(s)} className="inline-flex items-center gap-1 text-[12px] text-brand-600 font-medium hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 rounded" aria-label={t("library.ui.preview.buttonAria", { title: s.title })}>
                            <Table2 className="w-[15px] h-[15px]" aria-hidden="true" />
                            {t("library.ui.preview.button")}
                          </button>
                        )}
                      </>
                    }
                    extra={s.kind === "sheet" ? <CutNotes source={s} /> : undefined}
                    actions={deleteButton(`s-${s.id}`, s.thesisIds, () => setDelSource(s))}
                  >
                    {selection(s.thesisIds, (ids) => setSourceLinks(s, ids), !!busy[`s:${s.id}`])}
                  </LibraryItemRow>
                ))}
              </ul>
            )
          ) : references.length === 0 ? (
            sectionEmpty(data.references.length, "reference")
          ) : (
            <ul className="divide-y divide-gray-50">
              {references.map((r) => {
                const cited = Object.entries(r.citedIn).filter(([id, n]) => n > 0 && (!current || id === current.id));
                // Citations in a thesis that no longer lists the reference have no bibliography entry: said apart, in amber.
                const linkedCites = cited.filter(([id]) => r.thesisIds.includes(id));
                const danglingCites = cited.filter(([id]) => !r.thesisIds.includes(id));
                const extra =
                  cited.length > 0 ? (
                    <>
                      {linkedCites.length > 0 && <span className="block">{linkedCites.map(([id, n]) => t("dashboard.sources.citedIn", { n, title: titleOf(id) })).join(" · ")}</span>}
                      {danglingCites.length > 0 && (
                        <span className="block text-amber-700">
                          {danglingCites.map(([id, n]) => t("dashboard.sources.citedInUnlinked", { n, title: titleOf(id) })).join(" · ")}. {t("dashboard.sources.citedInUnlinkedHint")}
                        </span>
                      )}
                    </>
                  ) : current && r.thesisIds.includes(current.id) ? (
                    t("dashboard.sources.notCitedHere")
                  ) : undefined;
                const hasFullText = (r.sourceId && fullText.ids.has(r.sourceId)) || (!!r.doi && fullText.dois.has(r.doi.toLowerCase()));
                const retracted = r.isRetracted || r.verification?.status === "retracted";
                return (
                  <LibraryItemRow
                    key={r.id}
                    kind="reference"
                    title={r.title}
                    // With a thesis selected: the entry as that thesis's bibliography prints it (its citation style).
                    meta={current ? <span dangerouslySetInnerHTML={{ __html: referenceHtml(r, current.citationStyle) }} /> : referenceMeta(r)}
                    busy={!!busy[`r:${r.id}`]}
                    badges={
                      <>
                        <ReferenceTypeBadge type={r.type} />
                        {retracted && <span className={`${CHIP} bg-red-50 text-red-700`}>{t("dashboard.sources.retracted")}</span>}
                        {hasFullText && <span className={`${CHIP} bg-accent-50 text-accent-900`}>{t("dashboard.sources.fullTextAvailable")}</span>}
                        <ItemLink doi={r.doi} url={r.url} />
                      </>
                    }
                    extra={extra}
                    actions={deleteButton(`r-${r.id}`, r.thesisIds, () => {
                      const citedIn = only(r.citedIn, r.thesisIds);
                      setDelRef({ ref: r, citedIn, confirmCited: Object.keys(citedIn).length > 0 });
                    })}
                  >
                    {selection(r.thesisIds, (ids) => setReferenceLinks(r, ids), !!busy[`r:${r.id}`])}
                  </LibraryItemRow>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <DataPreviewModal open={!!preview} onClose={() => setPreview(null)} source={preview} thesisId={preview ? (current && preview.thesisIds.includes(current.id) ? current.id : preview.thesisIds[0]) : undefined} />

      <AddLibraryItemDialog open={!!adding} onClose={() => setAdding(null)} initialKind={adding || "source"} theses={theses} defaultThesisId={current?.id} onSourceAdded={onSourceAdded} onReferenceAdded={onReferenceAdded} />

      <ConfirmDialog
        open={!!unlinkCited}
        onClose={() => setUnlinkCited(null)}
        title={t("dashboard.sources.unlinkCited.title")}
        danger
        confirmLabel={t("dashboard.sources.unlinkCited.confirm")}
        body={unlinkCited ? t("dashboard.sources.unlinkCited.body", { title: unlinkCited.title, list: citedList(unlinkCited.citedIn) || "…" }) : null}
        onConfirm={() => {
          const u = unlinkCited;
          const latest = u && data.references.find((x) => x.id === u.id);
          if (u && latest) setReferenceLinks(latest, u.thesisIds, true);
        }}
      />

      <ConfirmDialog
        open={!!delSource}
        onClose={() => setDelSource(null)}
        title={t("dashboard.sources.deleteSource.title")}
        danger
        confirmLabel={t("common.delete")}
        body={
          delSource && (
            <>
              <p>{t("dashboard.sources.deleteSource.body", { title: delSource.title })}</p>
              {delSource.thesisIds.length > 0 && <p className="mt-2">{t("dashboard.sources.usedBy", { list: delSource.thesisIds.map(titleOf).filter(Boolean).join(", ") })}</p>}
            </>
          )
        }
        onConfirm={() => {
          if (delSource) deleteSource(delSource);
        }}
      />

      <ConfirmDialog
        open={!!delRef}
        onClose={() => setDelRef(null)}
        title={t("dashboard.sources.deleteReference.title")}
        danger
        confirmLabel={t("common.delete")}
        body={
          delRef && (
            <>
              <p>{t("dashboard.sources.deleteReference.body", { title: delRef.ref.title })}</p>
              {delRef.ref.thesisIds.length > 0 && <p className="mt-2">{t("dashboard.sources.usedBy", { list: delRef.ref.thesisIds.map(titleOf).filter(Boolean).join(", ") })}</p>}
              {delRef.confirmCited && <p className="mt-2 text-amber-800">{t("dashboard.sources.deleteReference.cited", { list: citedList(delRef.citedIn) || "…" })}</p>}
            </>
          )
        }
        onConfirm={() => {
          if (delRef) deleteReference(delRef.ref, delRef.confirmCited);
        }}
      />

      {toast && <Toast message={toast.message} kind={toast.kind} onClose={closeToast} />}
      {/* Last child: sr-only text, kept out of the space-y flow so the header never moves when a thesis is locked. */}
      <LockedHints theses={theses} />
    </div>
  );
}

export default function SourcesPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={null}>
        <SourcesInner />
      </Suspense>
    </DashboardLayout>
  );
}
