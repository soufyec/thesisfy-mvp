"use client";

import { FileSpreadsheet, FileText, ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { privacyLines } from "@/components/library/primary";

/**
 * Inline card shown before the first file of a kind is attached in a session (docs/papers.md §4.5): what the assistant
 * receives from a spreadsheet or a document, and where the file is kept and who sees it. Nothing is uploaded until
 * the student presses "Attach".
 */
export default function PrivacyNotice({ fileName, sheet, onAttach, onCancel }: { fileName: string; sheet: boolean; onAttach: () => void; onCancel: () => void }) {
  const t = useT();
  const Icon = sheet ? FileSpreadsheet : FileText;
  return (
    <div className="mb-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm" role="dialog" aria-label={t("assistant.attach.privacyTitle")}>
      <div className="flex items-center gap-2 mb-1.5">
        <ShieldCheck className="w-4 h-4 text-brand-600 flex-shrink-0" aria-hidden="true" />
        <span className="text-xs font-semibold text-gray-900">{t("assistant.attach.privacyTitle")}</span>
      </div>
      <div className="flex items-center gap-1.5 text-[12px] text-gray-700 mb-1.5 min-w-0">
        <Icon className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" aria-hidden="true" />
        <span className="truncate font-medium">{fileName}</span>
      </div>
      <div className="space-y-1 text-[12px] leading-snug text-gray-600">
        {privacyLines(sheet, t, "assistant").map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <div className="flex gap-1.5 mt-2.5 text-xs">
        <button type="button" onClick={onAttach} className="px-[11px] py-1.5 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40">
          {t("assistant.attach.attach")}
        </button>
        <button type="button" onClick={onCancel} className="px-[11px] py-1.5 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-50">
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
