"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Check, CircleAlert, Code2, Network, PieChart, Sigma, Table2 } from "lucide-react";
import type { Artifact } from "@/lib/db";
import { useFormat, useT } from "@/lib/i18n/client";
import { renderChartSvg } from "@/lib/charts/render";
import { diagramWarningText, renderDiagramSvg } from "@/lib/diagrams";
import { latexToMathML } from "@/lib/math/mathml";
import { artifactCaption, artifactCellPrecision, artifactCellText } from "@/lib/data/artifactHtml";
import { formatNumber } from "@/lib/data/labels";
import { artifactErrorAvailable, artifactErrorReason, isComputed, tooWide, writingTr, type ArtifactErrorInfo } from "./artifactText";

/** Charts and diagrams are drawn at the measured width of the card, never narrower (§3.4). */
const MIN_FIGURE_WIDTH = 320;
const MAX_FIGURE_WIDTH = 640;
/** Rows shown before the data view scrolls inside the card. */
const SCROLL_AFTER_ROWS = 10;

const KIND_ICON = { table: Table2, chart: BarChart3, test: Sigma, diagram: Network, equation: Sigma } as const;

/** Stops a drag of the drawing or the table out of the panel: a figure only enters the paper through "Insert". */
const noDrag = (e: React.DragEvent) => e.preventDefault();

/** Width of an element, followed with a ResizeObserver (0 until mounted). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** The data view: header in gray-50, no vertical rules, numbers right-aligned in the writing language. Not selectable. */
export function ArtifactTableView({ artifact, compact = false }: { artifact: Artifact; compact?: boolean }) {
  const t = useT();
  const table = artifact.table;
  const numeric = useMemo(() => table.columns.map((_, j) => table.rows.some((r) => typeof r[j] === "number") && table.rows.every((r) => r[j] === null || r[j] === undefined || typeof r[j] === "number")), [table]);
  if (!table.columns.length) return null;
  const scroll = table.rows.length > SCROLL_AFTER_ROWS;
  return (
    <div className={`overflow-x-auto select-none ${scroll ? "max-h-72 overflow-y-auto" : ""} ${compact ? "" : "rounded-lg border border-gray-100"}`} onCopy={(e) => e.preventDefault()} onDragStart={noDrag} aria-label={t("assistant.artifact.dataView", { title: artifact.title })} role="region" tabIndex={0}>
      <table className="min-w-full text-[12px] leading-snug tabular-nums">
        <thead className={`bg-gray-50 ${scroll ? "sticky top-0" : ""}`}>
          <tr>
            {table.columns.map((c, j) => (
              <th key={j} scope="col" className={`px-2.5 py-1.5 font-semibold text-gray-700 whitespace-nowrap ${numeric[j] ? "text-right" : "text-left"}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {table.rows.map((r, i) => (
            <tr key={i}>
              {table.columns.map((_, j) => (
                <td key={j} className={`px-2.5 py-1 whitespace-nowrap text-gray-800 ${typeof r[j] === "number" ? "text-right" : "text-left"}`}>
                  {artifactCellText(r[j], artifact.lang, artifactCellPrecision(table, i, j))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** An inline drawing (chart or diagram SVG string), never an <img>: "Copy image" and dragging give no file. */
function Drawing({ svg, label }: { svg: string; label: string }) {
  return (
    <div
      className="overflow-x-auto select-none [&>svg]:block [&>svg]:max-w-none"
      draggable={false}
      onDragStart={noDrag}
      onContextMenu={(e) => e.preventDefault()}
      role="img"
      aria-label={label}
      // The SVG is produced by our own renderers from validated data, with every string escaped.
      dangerouslySetInnerHTML={{ __html: svg.replace("<svg ", '<svg draggable="false" aria-hidden="true" ') }}
    />
  );
}

/** A LaTeX equation drawn as MathML (src/lib/math), with its source on demand. */
export function EquationView({ latex, display, showSource }: { latex: string; display: boolean; showSource: boolean }) {
  const t = useT();
  const r = useMemo(() => latexToMathML(latex, { display }), [latex, display]);
  return (
    <div className="select-none" onCopy={(e) => e.preventDefault()} onDragStart={noDrag}>
      {r.ok ? (
        <div className="overflow-x-auto py-2 px-1 text-[17px] text-gray-900 text-center" dangerouslySetInnerHTML={{ __html: r.mathml }} />
      ) : (
        <p className="text-xs text-red-700">{t("assistant.artifactError.latex_invalid", { command: r.error.command || "…" })}</p>
      )}
      {showSource && <pre className="mt-1 rounded-lg bg-gray-50 border border-gray-100 px-2.5 py-2 text-xs text-gray-700 whitespace-pre-wrap break-all font-mono">{latex}</pre>}
    </div>
  );
}

export interface ArtifactCardProps {
  artifact: Artifact;
  drag?: { onStart: (event: React.DragEvent) => void; onEnd: () => void; hint: string; disabled: boolean };
  /** Insert and "Keep as notes" are offered (mode artifactsInsertable, editable paper, a handler from the editor). */
  insertable: boolean;
  /** Pressed: opens the cost card. Never inserts by itself. */
  onAction?: (action: "insert" | "notes" | "equation") => void;
  /** The cost card (or nothing), shown under the card's actions. */
  costCard?: React.ReactNode;
  /** Shows a check on the action that just ran. */
  done?: "insert" | "notes" | "equation" | null;
  /** The page variant (/dashboard/ai-chat): nothing is inserted from there. */
  insertHint?: string;
}

/**
 * One table, chart, test result, diagram or equation of a copilot answer (docs/papers.md §4.5, §9.4). Numbers come
 * from Thesisfic; the card shows them, says where they come from, and offers "Insert, marked as AI" only through the
 * cost card. No download, no drag, no selectable copy: a result enters the paper marked, or not at all.
 */
export default function ArtifactCard({ artifact: a, insertable, onAction, costCard, done, insertHint, drag }: ArtifactCardProps) {
  const t = useT();
  const fmt = useFormat();
  const { ref: bodyRef, width } = useWidth<HTMLDivElement>();
  const [showData, setShowData] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const wTr = useMemo(() => writingTr(a.lang), [a.lang]);
  const computed = isComputed(a);
  // At most the inserted size (640): on the full-page assistant a wider chart would only grow taller.
  const measured = width > 0;
  // In 40 px steps, so resizing the panel redraws the figure a few times rather than on every pixel.
  const figureWidth = Math.max(MIN_FIGURE_WIDTH, Math.min(Math.floor(width / 40) * 40, MAX_FIGURE_WIDTH));
  const desc = computed ? artifactCaption(a, wTr) : a.title;

  const chartSvg = useMemo(() => {
    if (a.kind !== "chart" || !a.chart || !measured) return "";
    try {
      return renderChartSvg(a.chart, { width: figureWidth, height: Math.round(figureWidth * 0.62), interactive: true, title: a.title, desc, lang: a.lang });
    } catch {
      return "";
    }
  }, [a, measured, figureWidth, desc]);

  const diagramSvg = useMemo(() => {
    if (a.kind !== "diagram" || !a.diagram || !measured) return "";
    try {
      return renderDiagramSvg(a.diagram, { width: figureWidth, lang: a.lang, tr: wTr, title: a.title, desc, formatNumber: (n) => formatNumber(n, a.lang, 0) }).svg;
    } catch {
      return "";
    }
  }, [a, measured, figureWidth, wTr, desc]);

  const hasData = a.table && a.table.columns.length > 0 && a.table.rows.length > 0;
  const Icon = a.kind === "chart" && a.chart?.type === "pie" ? PieChart : KIND_ICON[a.kind] || Table2;
  const wide = tooWide(a);
  // A CSV's only sheet is named after the file: the footer names it once.
  const sheet = a.sheet && a.sheet !== a.fileName && a.sheet !== a.fileName.replace(/\.[a-z0-9]+$/i, "") && !/^sheet ?1$/i.test(a.sheet) ? a.sheet : "";
  const notes: string[] = a.kind === "test" ? a.test?.notes || a.table.notes || [] : a.table?.notes || [];
  const warnings = (a.warnings || []).map((w) => diagramWarningText(w, t, (n) => fmt.number(n)));
  const figureView = (a.kind === "chart" || a.kind === "diagram") && !showData;
  const toggleLabel = a.kind === "chart" ? (showData ? t("assistant.artifact.showChart") : t("assistant.artifact.showData")) : a.kind === "diagram" ? (showData ? t("assistant.artifact.showDiagram") : t("assistant.artifact.showData")) : null;
  const btn = "text-xs px-2.5 py-[5px] rounded-lg border border-gray-200 bg-white font-medium inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40";

  return (
    <figure draggable={!!drag && !drag.disabled} onDragStart={event => { if (drag && !drag.disabled) drag.onStart(event); else event.preventDefault(); }} onDragEnd={() => drag?.onEnd()} className="mt-2 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden" aria-label={a.title}>
      <figcaption className="px-3 pt-2.5 pb-1.5 flex items-start gap-2">
        <span className="w-6 h-6 rounded-lg bg-prov-ai-soft text-prov-ai-deep flex items-center justify-center flex-shrink-0 mt-px" aria-hidden="true">
          <Icon className="w-3.5 h-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium uppercase tracking-[.05em] text-gray-500">{t(`assistant.artifact.kind.${a.kind}`)}</span>
          <span className="block text-[13px] font-semibold leading-snug text-gray-900 break-words">{a.title}</span>
        </span>
      </figcaption>

      <div className="px-3 pb-2 min-w-0">
        <div ref={bodyRef} className="min-w-0">
          {a.kind === "chart" && (figureView ? chartSvg ? <Drawing svg={chartSvg} label={desc} /> : <div className="h-40" /> : <ArtifactTableView artifact={a} />)}
          {a.kind === "diagram" && (figureView ? diagramSvg ? <Drawing svg={diagramSvg} label={desc} /> : <div className="h-40" /> : <ArtifactTableView artifact={a} />)}
          {a.kind === "table" && <ArtifactTableView artifact={a} />}
          {a.kind === "test" && (
            <div className="space-y-2">
              {hasData && <ArtifactTableView artifact={a} />}
              {a.test?.line && <p className="text-[13px] text-gray-900 tabular-nums select-none" onCopy={(e) => e.preventDefault()}>{a.test.line}</p>}
            </div>
          )}
          {(a.kind === "equation" || (a.kind === "test" && a.equation)) && a.equation && (
            <div className={a.kind === "test" ? "mt-2 border-t border-gray-100 pt-1" : ""}>
              {a.kind === "test" && <div className="text-xs font-medium text-gray-500">{t("assistant.artifact.fittedEquation")}</div>}
              <EquationView latex={a.equation.latex} display={a.equation.display !== false} showSource={showSource} />
            </div>
          )}
        </div>
        {(notes.length > 0 || warnings.length > 0) && (
          <ul className="mt-2 space-y-0.5 text-xs leading-snug">
            {warnings.map((w, i) => (
              <li key={`w${i}`} className="flex gap-1.5 text-amber-700">
                <CircleAlert className="w-3 h-3 mt-px flex-shrink-0" aria-hidden="true" />
                <span>{w}</span>
              </li>
            ))}
            {notes.map((n, i) => (
              <li key={`n${i}`} className="text-gray-500">{n}</li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-gray-500 break-words">
          {computed
            ? sheet
              ? t("assistant.artifact.computedFrom", { file: a.fileName, sheet, n: fmt.number(a.n) })
              : t("assistant.artifact.computedFromFile", { file: a.fileName, n: fmt.number(a.n) })
            : t("assistant.artifact.proposed")}
        </p>
      </div>

      {drag && <div className="px-3 pb-2 text-xs text-gray-600"><p>{drag.hint}</p><button type="button" draggable={!drag.disabled} disabled={drag.disabled} onDragStart={event => { event.stopPropagation(); drag.onStart(event); }} onDragEnd={drag.onEnd} className="mt-1 inline-flex items-center border border-gray-200 rounded-lg px-2 py-1 cursor-grab active:cursor-grabbing disabled:opacity-40" aria-label={t("workspace.drag")}>{t("workspace.drag")}</button></div>}
      <div className="px-3 pb-2.5 flex flex-wrap items-center gap-1.5">
        {insertable && onAction && (a.kind !== "test" || hasData) && (
          <button type="button" onClick={() => onAction("insert")} disabled={wide} className={`${btn} text-prov-ai-deep border-prov-ai-line hover:bg-prov-ai-soft`} aria-describedby={wide ? `wide-${a.id}` : undefined}>
            {done === "insert" && <Check className="w-3 h-3" aria-hidden="true" />}
            {t("assistant.action.insert")}
          </button>
        )}
        {insertable && onAction && a.kind === "test" && a.equation && (
          <button type="button" onClick={() => onAction("equation")} className={`${btn} text-prov-ai-deep border-prov-ai-line hover:bg-prov-ai-soft`}>
            {done === "equation" && <Check className="w-3 h-3" aria-hidden="true" />}
            {t("assistant.artifact.insertEquation")}
          </button>
        )}
        {insertable && onAction && (
          <button type="button" onClick={() => onAction("notes")} className={`${btn} text-brand-700 hover:bg-brand-50`} title={t("assistant.action.notesTitle")}>
            {done === "notes" && <Check className="w-3 h-3" aria-hidden="true" />}
            {t("assistant.action.notes")}
          </button>
        )}
        {toggleLabel && hasData && (
          <button type="button" onClick={() => setShowData((v) => !v)} aria-pressed={showData} className={`${btn} text-gray-600 hover:bg-gray-50`}>
            {showData ? <BarChart3 className="w-3 h-3" aria-hidden="true" /> : <Table2 className="w-3 h-3" aria-hidden="true" />}
            {toggleLabel}
          </button>
        )}
        {a.equation && (
          <button type="button" onClick={() => setShowSource((v) => !v)} aria-pressed={showSource} className={`${btn} text-gray-600 hover:bg-gray-50`}>
            <Code2 className="w-3 h-3" aria-hidden="true" />
            {showSource ? t("assistant.artifact.hideSource") : t("assistant.artifact.showSource")}
          </button>
        )}
      </div>
      {insertable && wide && (
        <p id={`wide-${a.id}`} className="px-3 pb-2.5 -mt-1 text-xs text-gray-500">
          {t("assistant.artifact.tooWide", { n: a.table.columns.length })}
        </p>
      )}
      {insertHint && <p className="px-3 pb-2.5 -mt-1 text-xs text-gray-500">{insertHint}</p>}
      {costCard && <div className="px-3 pb-3">{costCard}</div>}
    </figure>
  );
}

/** "Computing from {file}…" while a requested artifact is being computed. */
export function ArtifactSkeleton({ file }: { file?: string }) {
  const t = useT();
  return (
    <div className="mt-2 rounded-xl border border-gray-200 bg-white p-3" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-[12px] text-gray-500">
        <span className="w-6 h-6 rounded-lg bg-gray-100 animate-pulse" aria-hidden="true" />
        {file ? t("assistant.artifact.computing", { file }) : t("assistant.artifact.computingGeneric")}
      </div>
      <div className="mt-2.5 space-y-1.5 motion-safe:animate-pulse" aria-hidden="true">
        <div className="h-2.5 rounded bg-gray-100 w-3/4" />
        <div className="h-24 rounded-lg bg-gray-50" />
      </div>
    </div>
  );
}

/** "Thesisfic could not compute this: …", with the columns the request could use. */
export function ArtifactErrorCard({ error }: { error: ArtifactErrorInfo }) {
  const t = useT();
  const available = artifactErrorAvailable(error, t);
  return (
    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900" role="note">
      <div className="flex gap-2">
        <CircleAlert className="w-4 h-4 mt-px flex-shrink-0 text-amber-600" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-medium">{t("assistant.artifactError.title")}</p>
          <p className="mt-0.5 break-words">{artifactErrorReason(error, t)}</p>
          {available && <p className="mt-1 text-xs text-amber-800 break-words">{available}</p>}
          {error.file && <p className="mt-1 text-xs text-amber-700 break-words">{t("assistant.artifactError.file", { file: error.file })}</p>}
        </div>
      </div>
    </div>
  );
}
