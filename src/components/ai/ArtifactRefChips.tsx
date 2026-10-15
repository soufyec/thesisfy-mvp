"use client";

import { BarChart3, FileSpreadsheet, FileText, Network, Paperclip, Sigma, Table2 } from "lucide-react";
import type { ArtifactRef, SourceKind } from "@/components/editor/types";
import { useT } from "@/lib/i18n/client";

const ICON = { table: Table2, chart: BarChart3, test: Sigma, diagram: Network, equation: Sigma } as const;

/**
 * What an AI interaction produced and read, as chips for interaction lists (the student's analytics and the tutor's
 * view of a paper, docs/papers.md §4.7): "Table: {title}", "Figure: {title}", "Test: {title}", "Equation", and the
 * files attached to the request. The same chips for both (principle 2).
 */
export default function ArtifactRefChips({ artifacts, attachments }: { artifacts?: ArtifactRef[]; attachments?: { id: string; name: string; kind?: SourceKind }[] }) {
  const t = useT();
  if (!(artifacts && artifacts.length) && !(attachments && attachments.length)) return null;
  const chip = "inline-flex items-center gap-1 max-w-full rounded-[10px] px-2 py-0.5 text-[11px]";
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {(artifacts || []).map((a) => {
        const Icon = ICON[a.kind] || Table2;
        const label = a.kind === "equation" ? t("assistant.ref.equation") : t(`assistant.ref.${a.kind === "diagram" ? "chart" : a.kind}`, { title: a.title });
        return (
          <span key={a.id} className={`${chip} bg-prov-ai-soft text-prov-ai-deep`} title={label}>
            <Icon className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
            <span className="truncate max-w-[18rem]">{label}</span>
          </span>
        );
      })}
      {(attachments || []).map((f) => {
        const Icon = f.kind === "sheet" ? FileSpreadsheet : f.kind ? FileText : Paperclip;
        const label = t("assistant.ref.attached", { file: f.name });
        return (
          <span key={f.id} className={`${chip} bg-gray-100 text-gray-600`} title={label}>
            <Icon className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
            <span className="truncate max-w-[16rem]">{label}</span>
          </span>
        );
      })}
    </div>
  );
}
