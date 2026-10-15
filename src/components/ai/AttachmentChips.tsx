"use client";

import { FileSpreadsheet, FileText, Loader2, X } from "lucide-react";
import { useFormat, useT } from "@/lib/i18n/client";
import { compactSummary, type PrimaryLike } from "@/components/library/primary";
import type { SourceFile } from "@/components/editor/types";

/** A primary source attached to the copilot conversation (a source of the paper's owner, linked to the paper). */
export interface AttachedSource extends PrimaryLike {
  id: string;
  title: string;
  file?: SourceFile;
}

export const attachedName = (s: Pick<AttachedSource, "title" | "file">) => s.file?.name || s.title;

/**
 * Chips above the composer (docs/papers.md §4.5): each attached file with its icon, name and what Thesisfic read, and
 * a button that takes it out of the conversation's context (the file stays in the library and the paper). While a
 * file uploads, a "Reading {file}…" chip; after it, the "Read as: …" line.
 */
export default function AttachmentChips({ attached, uploading, readAs, onRemove, disabled, onConfigure, selections }: { onConfigure?: (source: AttachedSource) => void; selections?: Record<string, import("@/lib/data/workspace").DataSelection>; attached: AttachedSource[]; uploading?: string | null; readAs?: string | null; onRemove: (id: string) => void; disabled?: boolean }) {
  const t = useT();
  const fmt = useFormat();
  if (!attached.length && !uploading) return null;
  return (
    <div className="mb-2">
      <ul className="flex flex-wrap gap-1.5" aria-label={t("assistant.attach.listLabel")}>
        {attached.map((s) => {
          const Icon = s.kind === "sheet" ? FileSpreadsheet : FileText;
          const summary = compactSummary(s, t, (n) => fmt.number(n));
          const name = attachedName(s);
          return (
            <li key={s.id} className="inline-flex items-center gap-1.5 max-w-full rounded-[10px] border border-gray-200 bg-white pl-2 pr-1 py-1 text-[12px]" title={summary ? `${name} · ${summary}` : name}>
              <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${s.kind === "sheet" ? "text-brand-600" : "text-gray-500"}`} aria-hidden="true" />
              <span className="truncate max-w-[11rem] font-medium text-gray-800">{name}</span>
              {selections?.[s.id] && <span className="font-mono text-brand-700">{selections[s.id].range}</span>}
              {onConfigure && <button type="button" disabled={disabled} onClick={() => onConfigure(s)} className="rounded px-1.5 py-0.5 text-brand-700 hover:bg-brand-50" aria-label={t("workspace.configureFile", { file: name })}>{t("workspace.configure")}</button>}
              {summary && <span className="hidden sm:inline text-gray-500 whitespace-nowrap">{summary}</span>}
              <button type="button" onClick={() => onRemove(s.id)} disabled={disabled} className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-40" aria-label={t("assistant.attach.remove", { file: name })} title={t("assistant.attach.remove", { file: name })}>
                <X className="w-3 h-3" aria-hidden="true" />
              </button>
            </li>
          );
        })}
        {uploading && (
          <li className="inline-flex items-center gap-1.5 max-w-full rounded-[10px] border border-dashed border-gray-300 bg-gray-50 px-2 py-1 text-[12px] text-gray-600" role="status" aria-live="polite">
            <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" aria-hidden="true" />
            <span className="truncate max-w-[14rem]">{t("assistant.attach.reading", { file: uploading })}</span>
          </li>
        )}
      </ul>
      {readAs && <p className="mt-1 text-[11px] text-gray-500" role="status">{readAs}</p>}
    </div>
  );
}
