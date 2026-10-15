"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Modal, Spinner } from "@/components/ui";
import { api } from "@/lib/client";
import { useFormat, useT } from "@/lib/i18n/client";
import type { DatasetCell, DatasetColumn, DatasetSummary } from "@/components/editor/types";
import { CHIP } from "./LibraryItemRow";
import { cutNotes, readAsSummary, type PrimaryLike } from "./primary";

const PAGE = 100;

interface DataPage {
  sheet: { name: string; columns: DatasetColumn[]; rowCount: number; headerRow: number; truncated: boolean };
  rows: DatasetCell[][];
  offset: number;
  limit: number;
  total: number;
  sheets: { name: string; rowCount: number }[];
}

type PreviewSource = PrimaryLike & { id: string; title: string; dataset?: DatasetSummary };

/**
 * "Preview data" of a spreadsheet source (docs/papers.md §4.7): its columns with their readable label, type and role,
 * then its rows, 100 per page. The student, the paper's teacher and the institution's administration see the same
 * table (principle 2): the rows come from `GET /api/theses/[id]/sources/[sourceId]/data`, which applies that access.
 * Without a paper (the owner's library page), they come from the owner-only `GET /api/library/sources/[id]/data`.
 */
export default function DataPreviewModal({ open, onClose, source, thesisId }: { open: boolean; onClose: () => void; source: PreviewSource | null; thesisId?: string }) {
  const t = useT();
  const fmt = useFormat();
  const [sheet, setSheet] = useState(0);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<DataPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState("");

  useEffect(() => {
    if (open) {
      setSheet(0);
      setOffset(0);
      setPage(null);
      setFailed("");
    }
  }, [open, source?.id]);

  useEffect(() => {
    const id = source?.id;
    if (!open || !id) return;
    let alive = true;
    setLoading(true);
    setFailed("");
    const base = thesisId ? `/api/theses/${encodeURIComponent(thesisId)}/sources/${encodeURIComponent(id)}/data` : `/api/library/sources/${encodeURIComponent(id)}/data`;
    api<DataPage>(`${base}?sheet=${sheet}&offset=${offset}&limit=${PAGE}`)
      .then((d) => alive && setPage(d))
      .catch((e) => alive && setFailed((e as Error).message || t("library.ui.preview.failed")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, source?.id, thesisId, sheet, offset, t]);

  if (!source) return null;
  const num = (n: number) => fmt.number(n);
  const summarySheets = source.dataset?.sheets || [];
  const sheetNames = page?.sheets?.length ? page.sheets.map((s) => s.name) : summarySheets.map((s) => s.name);
  const columns: { name: string; label: string; type: DatasetColumn["type"]; role: DatasetColumn["role"]; precision?: number }[] = page ? page.sheet.columns : summarySheets[sheet]?.columns || [];
  const total = page ? page.total : summarySheets[sheet]?.rowCount || 0;
  const readAs = readAsSummary(source, t, num);
  const notes = cutNotes(source, t, num);

  const cell = (v: DatasetCell, c: (typeof columns)[number]) => {
    if (v === null || v === undefined || v === "") return "";
    if (typeof v === "boolean") return v ? t("library.ui.preview.yes") : t("library.ui.preview.no");
    if (typeof v === "number") {
      const prec = c.type === "number" ? Math.min(6, Math.max(0, c.precision ?? 0)) : 0;
      return fmt.number(v, { minimumFractionDigits: prec, maximumFractionDigits: Math.max(prec, 6), useGrouping: false });
    }
    if (c.type === "date" && /^\d{4}-\d{2}-\d{2}T00:00(:00(\.000)?)?Z?$/.test(v)) return v.slice(0, 10);
    return v;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("library.ui.preview.title", { title: source.title })}
      size="xl"
      footer={<button onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">{t("common.close")}</button>}
    >
      <div className="space-y-4 text-sm min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
          {source.file?.name && <span className="font-medium text-gray-700 break-all">{source.file.name}</span>}
          {readAs && <span>{readAs}</span>}
        </div>
        {notes.length > 0 && (
          <ul className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 space-y-0.5">
            {notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        )}

        {sheetNames.length > 1 && (
          <div role="group" aria-label={t("library.ui.preview.sheets")} className="flex flex-wrap gap-1.5">
            {sheetNames.map((name, i) => (
              <button key={`${name}-${i}`} type="button" aria-pressed={sheet === i} onClick={() => { setSheet(i); setOffset(0); }} className={`rounded-[10px] border px-3 py-1 text-xs font-medium ${sheet === i ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}>
                {name}
              </button>
            ))}
          </div>
        )}

        <section aria-labelledby="preview-columns">
          <h3 id="preview-columns" className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">{t("library.ui.preview.columns", { n: num(columns.length) })}</h3>
          <div className="flex flex-wrap gap-1.5">
            {columns.map((c) => (
              <span key={c.name} className="inline-flex items-center gap-1.5 rounded-[10px] border border-gray-200 bg-white px-2 py-1 text-[12px] max-w-full" title={c.name !== c.label ? c.name : undefined}>
                <span className="font-medium text-gray-800 truncate">{c.label || c.name}</span>
                <span className="text-gray-500">{t(`library.ui.colType.${c.type}`)}</span>
                <span className={`${CHIP} !px-1.5 !py-0 ${c.role === "identifier" || c.role === "freeText" ? "bg-gray-100 text-gray-600" : "bg-brand-50 text-brand-700"}`}>{t(`library.ui.colRole.${c.role}`)}</span>
              </span>
            ))}
          </div>
        </section>

        <section aria-labelledby="preview-rows" className="min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <h3 id="preview-rows" className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t("library.ui.preview.rowsTitle")}</h3>
            {total > 0 && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <span className="tabular-nums">{t("library.ui.preview.range", { from: num(offset + 1), to: num(Math.min(total, offset + PAGE)), total: num(total) })}</span>
                <button type="button" onClick={() => setOffset((o) => Math.max(0, o - PAGE))} disabled={offset === 0 || loading} className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-30" aria-label={t("library.ui.preview.prev")}>
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => setOffset((o) => o + PAGE)} disabled={offset + PAGE >= total || loading} className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-30" aria-label={t("library.ui.preview.next")}>
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
          {failed ? (
            <p role="alert" className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">{failed}</p>
          ) : !page ? (
            <div className="flex items-center gap-2 text-xs text-gray-500 py-6 justify-center"><Spinner /> {t("common.loading")}…</div>
          ) : (
            <div className={`overflow-auto max-h-[50vh] rounded-xl border border-gray-100 ${loading ? "opacity-60" : ""}`}>
              <table className="min-w-full text-[12px] tabular-nums">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th scope="col" className="px-2 py-1.5 text-right font-medium text-gray-500 w-10">#</th>
                    {columns.map((c) => (
                      <th key={c.name} scope="col" className={`px-2.5 py-1.5 font-semibold text-gray-700 whitespace-nowrap ${c.type === "number" ? "text-right" : "text-left"}`}>{c.label || c.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {page.rows.map((r, i) => (
                    <tr key={page.offset + i}>
                      <td className="px-2 py-1 text-right text-gray-500">{num(page.offset + i + 1)}</td>
                      {columns.map((c, j) => (
                        <td key={c.name} className={`px-2.5 py-1 whitespace-nowrap max-w-[16rem] truncate ${typeof r[j] === "number" ? "text-right" : "text-left"} text-gray-800`}>{cell(r[j], c)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
