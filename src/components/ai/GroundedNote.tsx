"use client";

import { FileText } from "lucide-react";
import { useFormat, useT } from "@/lib/i18n/client";

/** One attached document an answer read (`meta.groundedFiles` of POST /api/ai/chat). */
export interface GroundedFile {
  sourceId: string;
  file: string;
  passages: number;
}

/** "Used {n} passages from {file}" under an answer, once per attached document it read (docs/papers.md §3.5, §4.5). */
export default function GroundedNote({ files }: { files?: GroundedFile[] }) {
  const t = useT();
  const fmt = useFormat();
  if (!files || !files.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {files.map((f) => (
        <span key={f.sourceId} className="inline-flex items-center gap-1 max-w-full rounded-[10px] bg-accent-50 text-accent-800 px-2 py-0.5 text-[11px]">
          <FileText className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
          <span className="truncate">{f.passages === 1 ? t("assistant.grounded.one", { file: f.file }) : f.passages > 1 ? t("assistant.grounded.many", { n: fmt.number(f.passages), file: f.file }) : t("assistant.grounded.none", { file: f.file })}</span>
        </span>
      ))}
    </div>
  );
}

/** Parses `meta.groundedFiles` defensively (the SSE payload is untyped). */
export function groundedFilesOf(meta: Record<string, unknown>): GroundedFile[] | undefined {
  const raw = meta.groundedFiles;
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .filter((x): x is GroundedFile => !!x && typeof x === "object" && typeof (x as GroundedFile).file === "string" && typeof (x as GroundedFile).sourceId === "string")
    .map((x) => ({ sourceId: x.sourceId, file: x.file, passages: Number(x.passages) || 0 }));
  return out.length ? out : undefined;
}
