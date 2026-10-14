"use client";

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { BookMarked, ExternalLink, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { Reference, ThesisDoc } from "../types";
import ReferencesTab from "./ReferencesTab";
import SourcesTab, { type LibrarySource } from "./SourcesPanel";
import YourLibraryTab from "./YourLibraryTab";

/** The tabs of the panel. They are also the SidebarKind values that open it ("references", "sources", "library"). */
export type LibraryTab = "references" | "sources" | "library";

export interface LibraryPanelProps {
  tab: LibraryTab;
  onTab: (tab: LibraryTab) => void;
  onClose: () => void;
  editor: Editor;
  thesisId: string;
  /** Owner of an editable thesis (not locked, not review mode): add, remove, link, and the "Your library" tab. */
  canEdit: boolean;
  /** Owner of the thesis (also when it is locked): the "Manage all" link to the library page. */
  isOwner: boolean;
  references: Reference[];
  style: ThesisDoc["citationStyle"];
  sources: LibrarySource[];
  sourcesLoading: boolean;
  /** Set when the sources could not be loaded: the Sources tab shows it with a retry, and no count is shown. */
  sourcesError?: string;
  onRetrySources?: () => void;
  onSourcesChange: (update: (list: LibrarySource[]) => LibrarySource[]) => void;
  /** In-text citations per reference id: the live editor HTML plus every other tab. Must be stable. */
  countCitations: () => Record<string, number>;
  selectionText?: string;
  sessionId?: string;
  onConsentRequired?: () => void;
  notify: (message: string, kind?: "info" | "success" | "error") => void;
  // References tab
  onChangeStyle: (s: ThesisDoc["citationStyle"]) => void;
  onAddReference: (r: Reference) => void;
  onRemoveReference: (id: string) => void;
  onInsertReference: (r: Reference) => void;
  onInsertBibliography: () => void;
  onFindReference: () => void;
  onCheckReferences: () => void;
  // Sources tab
  onCiteSource: (s: LibrarySource) => void;
  // Your library tab
  onReferenceAdded: () => Promise<void> | void;
  onSourceAdded: () => Promise<void> | void;
}

/**
 * Sources & references: one side panel for what this thesis cites (References), what it reads in full text (Sources)
 * and what the student's library holds that this thesis does not use yet (Your library). Read-only viewers (tutor
 * review, locked thesis) see the first two tabs as lists.
 */
export default function LibraryPanel(props: LibraryPanelProps) {
  const { tab, onTab, onClose, editor, thesisId, canEdit, isOwner, references, style, sources, sourcesLoading, sourcesError, countCitations } = props;
  /** No count while the list is loading or failed to load: "0 sources" would be wrong. */
  const sourcesUnknown = sourcesLoading || !!sourcesError;
  const t = useT();
  const [citations, setCitations] = useState<Record<string, number>>(() => countCitations());
  const [focusSource, setFocusSource] = useState<string | null>(null);

  // Citation counts follow the text: recounted shortly after each edit, and when the reference list changes.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const recount = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setCitations(countCitations()), 400);
    };
    setCitations(countCitations());
    editor.on("update", recount);
    return () => {
      editor.off("update", recount);
      if (timer) clearTimeout(timer);
    };
  }, [editor, countCitations, references]);

  const active: LibraryTab = tab === "library" && !canEdit ? "references" : tab;
  const tabs: { id: LibraryTab; label: string; count?: number }[] = [
    { id: "references", label: t("editor.library.tabReferences"), count: references.length },
    { id: "sources", label: t("editor.library.tabSources"), count: sourcesUnknown ? undefined : sources.length },
    ...(canEdit ? [{ id: "library" as const, label: t("glossary.library") }] : []),
  ];
  const summary = [sourcesUnknown ? null : t(sources.length === 1 ? "editor.session.sources_one" : "editor.session.sources", { n: sources.length }), t(references.length === 1 ? "editor.session.references_one" : "editor.session.references", { n: references.length })].filter(Boolean).join(" · ");

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    onTab(next.id);
    document.getElementById(`library-tab-${next.id}`)?.focus();
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 flex-shrink-0">
        <BookMarked className="w-4 h-4 text-gray-500 flex-shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{t("glossary.sourcesReferences")}</div>
          <div className="text-[11px] text-gray-500 truncate">{summary}</div>
        </div>
        {isOwner && (
          <a href={`/dashboard/sources?thesis=${encodeURIComponent(thesisId)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-brand-600 hover:underline flex-shrink-0" title={t("editor.library.manageAllAria")}>
            {t("editor.library.manageAll")}
            <ExternalLink className="w-3 h-3" aria-hidden="true" />
          </a>
        )}
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0" aria-label={t("common.close")}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex border-b border-gray-100 flex-shrink-0 px-2 overflow-x-auto no-scrollbar" role="tablist" aria-label={t("editor.library.tabsLabel")}>
        {tabs.map((tb, i) => (
          <button
            key={tb.id}
            id={`library-tab-${tb.id}`}
            role="tab"
            aria-selected={active === tb.id}
            aria-controls="library-tabpanel"
            tabIndex={active === tb.id ? 0 : -1}
            onClick={() => {
              setFocusSource(null);
              onTab(tb.id);
            }}
            onKeyDown={(e) => onTabKey(e, i)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-2 text-[13px] border-b-2 -mb-px whitespace-nowrap ${active === tb.id ? "border-brand-600 text-brand-700 font-medium" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            {tb.label}
            {tb.count !== undefined && <span className={`text-[11px] px-1.5 rounded-[10px] ${active === tb.id ? "bg-brand-50 text-brand-700" : "bg-gray-100 text-gray-500"}`}>{tb.count}</span>}
          </button>
        ))}
      </div>
      {!canEdit && <div className="px-3 pt-2 text-[11px] text-gray-500 flex-shrink-0">{t("editor.library.readOnly")}</div>}
      <div className="flex-1 overflow-y-auto min-h-0" role="tabpanel" id="library-tabpanel" aria-labelledby={`library-tab-${active}`}>
        {active === "references" && (
          <ReferencesTab
            references={references}
            style={style}
            canEdit={canEdit}
            sources={sources}
            citations={citations}
            onChangeStyle={props.onChangeStyle}
            onAdd={props.onAddReference}
            onRemove={props.onRemoveReference}
            onInsertInText={props.onInsertReference}
            onInsertBibliography={props.onInsertBibliography}
            onFindReference={props.onFindReference}
            onCheckReferences={props.onCheckReferences}
            onShowSource={(id) => {
              setFocusSource(id);
              onTab("sources");
            }}
          />
        )}
        {active === "sources" && (
          <SourcesTab
            thesisId={thesisId}
            canEdit={canEdit}
            sources={sources}
            loading={sourcesLoading}
            loadError={sourcesError}
            onRetry={props.onRetrySources}
            onSourcesChange={props.onSourcesChange}
            references={references}
            citations={citations}
            selectionText={props.selectionText}
            onCite={props.onCiteSource}
            sessionId={props.sessionId}
            onConsentRequired={props.onConsentRequired}
            focusId={focusSource}
          />
        )}
        {active === "library" && <YourLibraryTab thesisId={thesisId} style={style} references={references} sources={sources} onReferenceAdded={props.onReferenceAdded} onSourceAdded={props.onSourceAdded} notify={props.notify} />}
      </div>
    </div>
  );
}
