"use client";

import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, FileText, Library, Loader2, Paperclip, Upload } from "lucide-react";
import { useFormat, useT } from "@/lib/i18n/client";
import { compactSummary } from "@/components/library/primary";
import { attachedName, type AttachedSource } from "./AttachmentChips";

/**
 * The paperclip of the copilot's composer (docs/papers.md §4.5): "Upload a file", "From this paper" (the paper's
 * primary sources) and "From your library" (primary sources not used in this paper yet; picking one links it).
 * Disabled with a reason when there is no paper to attach to.
 */
export default function AttachMenu({ disabledReason, canUpload, loading, paperItems, libraryItems, onOpen, onUpload, onPick, busy }: { disabledReason?: string; canUpload: boolean; loading: boolean; paperItems: AttachedSource[]; libraryItems: AttachedSource[]; onOpen: () => void; onUpload: () => void; onPick: (s: AttachedSource, fromLibrary: boolean) => void; busy?: boolean }) {
  const t = useT();
  const fmt = useFormat();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const toggle = () => {
    // Without a paper the menu only says why (a tooltip alone never shows on a phone).
    if (!open && !disabledReason) onOpen();
    setOpen((o) => !o);
  };

  const item = (s: AttachedSource, fromLibrary: boolean) => {
    const Icon = s.kind === "sheet" ? FileSpreadsheet : FileText;
    const summary = compactSummary(s, t, (n) => fmt.number(n));
    return (
      <li key={s.id}>
        <button type="button" role="menuitem" onClick={() => { setOpen(false); onPick(s, fromLibrary); }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-start gap-2 focus:outline-none focus-visible:bg-gray-50">
          <Icon className={`w-4 h-4 mt-px flex-shrink-0 ${s.kind === "sheet" ? "text-brand-600" : "text-gray-500"}`} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] text-gray-800">{attachedName(s)}</span>
            {summary && <span className="block text-[11px] leading-snug text-gray-500">{summary}</span>}
          </span>
        </button>
      </li>
    );
  };

  const heading = "px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[.06em] text-gray-500";
  const empty = !loading && !paperItems.length && !libraryItems.length;

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-disabled={disabledReason ? true : undefined}
        aria-label={disabledReason || t("assistant.attach.button")}
        title={disabledReason || t("assistant.attach.button")}
        disabled={busy}
        className={`w-7 h-7 rounded-lg flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${disabledReason ? "text-gray-300 cursor-not-allowed" : open ? "bg-brand-50 text-brand-700" : "text-gray-500 hover:bg-gray-200 hover:text-gray-700"}`}
      >
        <Paperclip className="w-4 h-4" aria-hidden="true" />
      </button>
      {open && disabledReason && (
        <div role="status" className="absolute left-0 bottom-full mb-2 w-64 max-w-[calc(100vw-48px)] bg-white rounded-[10px] shadow-xl border border-gray-100 z-30 px-3 py-2 text-[12px] text-gray-600">
          {disabledReason}
        </div>
      )}
      {open && !disabledReason && (
        <div role="menu" aria-label={t("assistant.attach.button")} className="absolute left-0 bottom-full mb-2 w-72 max-w-[calc(100vw-48px)] max-h-80 overflow-y-auto bg-white rounded-[10px] shadow-xl border border-gray-100 z-30 py-1 text-sm">
          {canUpload && (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onUpload(); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-start gap-2 focus:outline-none focus-visible:bg-gray-50">
              <Upload className="w-4 h-4 mt-px text-brand-600 flex-shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-gray-900">{t("assistant.attach.upload")}</span>
                <span className="block text-[11px] leading-snug text-gray-500">{t("assistant.attach.uploadHint")}</span>
              </span>
            </button>
          )}
          {loading && (
            <div className="px-3 py-2 flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> {t("common.loading")}…
            </div>
          )}
          {paperItems.length > 0 && (
            <>
              <div className={`${heading} border-t border-gray-100 mt-1`}>{t("assistant.attach.fromPaper")}</div>
              <ul>{paperItems.map((s) => item(s, false))}</ul>
            </>
          )}
          {libraryItems.length > 0 && (
            <>
              <div className={`${heading} border-t border-gray-100 mt-1 flex items-center gap-1`}>
                <Library className="w-3 h-3" aria-hidden="true" />
                {t("assistant.attach.fromLibrary")}
              </div>
              <ul>{libraryItems.map((s) => item(s, true))}</ul>
              <p className="px-3 pb-1.5 text-[11px] leading-snug text-gray-500">{t("assistant.attach.fromLibraryHint")}</p>
            </>
          )}
          {empty && <p className="px-3 py-2 border-t border-gray-100 mt-1 text-[12px] text-gray-500">{t("assistant.attach.empty")}</p>}
        </div>
      )}
    </div>
  );
}
