"use client";

import { useMemo, useState } from "react";
import { BookOpenCheck, FileText, Plus, Quote, Sparkles, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { ConfirmDialog } from "../Dialogs";
import { UniversityDatabases } from "../Sidebars";
import { inTextCitation, Reference, referenceHtml, ThesisDoc } from "../types";
import { newReferenceId, sourceForReference } from "./match";
import type { LibrarySource } from "./SourcesPanel";

const STYLES: ThesisDoc["citationStyle"][] = ["APA", "MLA", "Chicago", "IEEE", "Harvard"];
const emptyRef: Reference = { id: "", type: "article", authors: "", year: "", title: "", source: "", url: "", doi: "", pages: "", volume: "", issue: "" };

export interface ReferencesTabProps {
  references: Reference[];
  style: ThesisDoc["citationStyle"];
  /** Owner of an editable thesis. Read-only viewers see the list and its chips only. */
  canEdit: boolean;
  /** Sources linked to the thesis, for the "Full text" chip. */
  sources: LibrarySource[];
  /** In-text citations per reference id (current editor HTML plus every other tab). */
  citations: Record<string, number>;
  onChangeStyle: (s: ThesisDoc["citationStyle"]) => void;
  onAdd: (r: Reference) => void;
  /** Removes the reference from this thesis (it stays in the library); called after the confirmation. */
  onRemove: (id: string) => void;
  onInsertInText: (r: Reference) => void;
  onInsertBibliography: () => void;
  /** Opens the citation dialog to find a reference by DOI, URL or title. */
  onFindReference?: () => void;
  /** Shows a linked source in the Sources tab. */
  onShowSource: (sourceId: string) => void;
  /** Opens Find support › Reference check. */
  onCheckReferences: () => void;
  /**
   * Why the citation style cannot change on this paper (set in the teacher's brief, or the paper is handed in): the
   * style shows as text with this sentence instead of the select (docs/papers.md §4.4).
   */
  styleLock?: string | null;
}

/** References tab of the Sources & references panel: this thesis's reference list, its style and the bibliography. */
export default function ReferencesTab({ references, style, canEdit, sources, citations, onChangeStyle, onAdd, onRemove, onInsertInText, onInsertBibliography, onFindReference, onShowSource, onCheckReferences, styleLock }: ReferencesTabProps) {
  const t = useT();
  const [form, setForm] = useState<Reference | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Reference | null>(null);
  const sorted = useMemo(() => [...references].sort((a, b) => a.authors.localeCompare(b.authors)), [references]);
  const f = (k: keyof Reference) => ({ value: (form?.[k] as string) || "", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...(form as Reference), [k]: e.target.value }) });
  const removing = confirmRemove ? citations[confirmRemove.id] || 0 : 0;

  return (
    <div className="p-3 space-y-2 text-[13px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-600">
        {canEdit && styleLock ? (
          <span>
            {t("editor.library.styleLabel")} <span className="font-medium text-gray-800">{style}</span> <span className="text-xs text-gray-500">{styleLock}</span>
          </span>
        ) : canEdit ? (
          <label className="inline-flex items-center gap-1.5">
            {t("editor.library.styleLabel")}
            <select value={style} onChange={(e) => onChangeStyle(e.target.value as ThesisDoc["citationStyle"])} className="text-xs border border-gray-200 rounded-md px-1.5 py-1 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
              {STYLES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
        ) : (
          <span>{t("editor.library.styleLabel")} <span className="font-medium text-gray-800">{style}</span></span>
        )}
        {references.length > 0 && (
          <button onClick={onCheckReferences} className="ml-auto inline-flex items-center gap-1 text-brand-600 hover:underline">
            <BookOpenCheck className="w-[15px] h-[15px]" aria-hidden="true" />
            {t("editor.library.checkReferences")}
          </button>
        )}
      </div>

      {canEdit && !form && (
        <div className="flex gap-2">
          {onFindReference && (
            <button onClick={onFindReference} className="flex-1 text-xs py-2 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 flex items-center justify-center gap-1 font-medium">
              <Sparkles className="w-[15px] h-[15px]" aria-hidden="true" /> {t("editor.refs.findSource")}
            </button>
          )}
          <button onClick={() => setForm({ ...emptyRef, id: newReferenceId() })} className="flex-1 text-xs py-2 rounded-lg border border-dashed border-gray-300 text-gray-600 hover:border-brand-400 hover:text-brand-600 flex items-center justify-center gap-1">
            <Plus className="w-[15px] h-[15px]" aria-hidden="true" /> {t("editor.refs.addManually")}
          </button>
        </div>
      )}
      {form && (
        <div className="p-3 rounded-xl border border-brand-200 bg-brand-50/40 space-y-2 text-xs">
          <select {...f("type")} aria-label={t("editor.cite.type")} className="input-field !py-1.5 !text-xs">{["article", "book", "chapter", "web", "thesis"].map((ty) => <option key={ty} value={ty}>{t(`editor.refs.type.${ty}`)}</option>)}</select>
          <input {...f("authors")} placeholder={t("editor.refs.authors")} aria-label={t("editor.refs.authors")} className="input-field !py-1.5 !text-xs" />
          <div className="grid grid-cols-2 gap-2"><input {...f("year")} placeholder={t("editor.refs.year")} aria-label={t("editor.refs.year")} className="input-field !py-1.5 !text-xs" /><input {...f("pages")} placeholder={t("editor.refs.pages")} aria-label={t("editor.refs.pages")} className="input-field !py-1.5 !text-xs" /></div>
          <input {...f("title")} placeholder={t("editor.refs.title")} aria-label={t("editor.refs.title")} className="input-field !py-1.5 !text-xs" />
          <input {...f("source")} placeholder={t("editor.refs.sourceField")} aria-label={t("editor.refs.sourceField")} className="input-field !py-1.5 !text-xs" />
          <div className="grid grid-cols-2 gap-2"><input {...f("volume")} placeholder={t("editor.refs.volume")} aria-label={t("editor.refs.volume")} className="input-field !py-1.5 !text-xs" /><input {...f("issue")} placeholder={t("editor.refs.issue")} aria-label={t("editor.refs.issue")} className="input-field !py-1.5 !text-xs" /></div>
          <input {...f("doi")} placeholder={t("editor.refs.doi")} aria-label={t("editor.refs.doi")} className="input-field !py-1.5 !text-xs" />
          <input {...f("url")} placeholder={t("editor.refs.url")} aria-label={t("editor.refs.url")} className="input-field !py-1.5 !text-xs" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setForm(null)} className="px-3 py-1.5 rounded-lg hover:bg-gray-100">{t("common.cancel")}</button>
            <button disabled={!form.authors || !form.title || !form.year} onClick={() => { onAdd(form); setForm(null); }} className="px-3 py-1.5 rounded-lg bg-brand-600 text-white disabled:opacity-40">{t("common.save")}</button>
          </div>
        </div>
      )}

      <ul className="space-y-2" aria-label={t("editor.library.referencesLabel")}>
        {sorted.map((r) => {
          const source = sourceForReference(r, sources);
          const cited = citations[r.id] || 0;
          return (
            <li key={r.id} className="p-2.5 rounded-xl border border-gray-100 hover:border-gray-200 text-xs">
              <div className="text-gray-700" dangerouslySetInnerHTML={{ __html: referenceHtml(r, style) }} />
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px]">
                {source && (
                  <button onClick={() => onShowSource(source.id)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[10px] bg-accent-50 text-accent-700 hover:bg-accent-100" aria-label={t("editor.library.fullTextAria", { title: r.title })}>
                    <FileText className="w-3 h-3" aria-hidden="true" /> {t("editor.library.fullText")}
                  </button>
                )}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[10px] ${cited ? "bg-brand-50 text-brand-700" : "bg-gray-100 text-gray-500"}`} title={t("editor.library.citedTitle")}>
                  <Quote className="w-3 h-3" aria-hidden="true" />
                  {cited ? t("editor.library.citedTimes", { n: cited }) : t("editor.library.notCited")}
                </span>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2 mt-1.5">
                  <button onClick={() => onInsertInText(r)} className="text-brand-600 hover:underline">{t("editor.refs.insertInText", { cite: inTextCitation(r, style, references) })}</button>
                  <button onClick={() => setConfirmRemove(r)} className="text-gray-400 hover:text-red-600 ml-auto" aria-label={t("editor.library.removeRefLabel", { title: r.title })} title={t("editor.library.removeRefLabel", { title: r.title })}>
                    <Trash2 className="w-[15px] h-[15px]" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {references.length === 0 && !form && <div className="text-xs text-gray-400 text-center py-4">{t(canEdit ? "editor.refs.empty" : "editor.library.refsEmptyReadOnly")}</div>}
      {references.length > 0 && canEdit && (
        <button onClick={onInsertBibliography} className="w-full text-xs py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">{t("editor.refs.insertBibliography", { style })}</button>
      )}
      {canEdit && <UniversityDatabases />}

      <ConfirmDialog
        open={!!confirmRemove}
        onClose={() => setConfirmRemove(null)}
        title={t("editor.library.removeRefTitle")}
        danger
        confirmLabel={t("editor.library.removeRefConfirm")}
        body={
          confirmRemove ? (
            <>
              {t("editor.library.removeRefBody", { title: confirmRemove.title })}{" "}
              {removing ? t(removing === 1 ? "editor.library.removeRefCited_one" : "editor.library.removeRefCited", { n: removing }) : t("editor.library.removeRefNotCited")}
            </>
          ) : null
        }
        onConfirm={() => confirmRemove && onRemove(confirmRemove.id)}
      />
    </div>
  );
}
