"use client";

import { cloneElement, isValidElement, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { api } from "@/lib/client";
import type { Artifact } from "@/lib/db";
import type { DataPageBody } from "@/lib/sources/dataPage";
import { buildSheets } from "@/lib/sources/sheets";
import { readCsv } from "@/lib/sources/csv";
import { columnLetter, fullRange, type DataSelection, type WorkspaceRequest } from "@/lib/data/workspace";
import ArtifactCard from "./ArtifactCard";
import type { AttachedSource } from "./AttachmentChips";

const OPS = ["describe", "frequencies", "crosstab", "groupSummary", "correlation", "distribution", "trend", "scatter", "ttest", "pairedTtest", "anova", "chisquare", "correlationTest", "mannWhitney", "kruskal", "regression", "gantt"] as const;
const CHARTS = ["bar", "groupedBar", "line", "scatter", "pie", "histogram", "box"] as const;
export default function DataWorkbench({ thesisId, source, conversationId, initial, onClose, onSelect, onCreated }: { thesisId: string; source: AttachedSource; conversationId?: string; initial?: DataSelection; onClose: () => void; onSelect: (selection: DataSelection) => void; onCreated: (artifact: Artifact, conversationId: string) => void }) {
  const t = useT();
  const [page, setPage] = useState<DataPageBody | null>(null);
  const [sheetIndex, setSheetIndex] = useState(initial?.sheet ?? 0);
  const [manual, setManual] = useState(source.kind !== "sheet");
  const [tableText, setTableText] = useState("");
  const [config, setConfig] = useState<WorkspaceRequest>({ sheet: initial?.sheet ?? 0, range: initial?.range || "", output: "chart", chartType: "bar", title: "", x: "", ys: [], analysis: { op: "describe" } });
  const [preview, setPreview] = useState<Artifact | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const epoch = useRef(0);
  const patch = (value: Partial<WorkspaceRequest>) => { epoch.current++; setConfig(c => ({ ...c, ...value })); setPreview(null); setError(""); };
  useEffect(() => {
    if (manual) return;
    let live = true;
    setError(""); setPage(null);
    api<DataPageBody>(`/api/theses/${thesisId}/sources/${source.id}/data?sheet=${sheetIndex}&limit=20`)
      .then(data => {
        if (!live) return;
        setPage(data);
        const cols = data.sheet.columns;
        const x = cols.find(c => c.type !== "number")?.name || cols[0]?.name || "";
        setConfig(c => ({ ...c, sheet: sheetIndex, range: initial?.sheet === sheetIndex ? initial.range : fullRange(data.sheet), x, ys: cols.filter(col => col.type === "number" && col.name !== x).map(col => col.name) }));
      }).catch(err => live && setError(err.message));
    return () => { live = false; };
  }, [thesisId, source.id, sheetIndex, manual, initial]);
  const readPasted = () => {
    try {
      const read = readCsv(new TextEncoder().encode(tableText), source.title);
      const built = buildSheets([read.sheet]);
      const sheet = built.sheets[0];
      if (!sheet) throw new Error(t("workspace.invalidData"));
      setPage({ rowNumbers: sheet.rowNumbers?.slice(0, 20), sheet, rows: Array.from({ length: Math.min(20, sheet.rowCount) }, (_, row) => sheet.data.map(c => c[row])), offset: 0, limit: 20, total: sheet.rowCount, sheets: [{ name: sheet.name, rowCount: sheet.rowCount }] });
      patch({ sheet: 0, range: fullRange(sheet), x: sheet.columns[0].name, ys: sheet.columns.filter(c => c.type === "number").map(c => c.name) });
    } catch { setError(t("workspace.invalidData")); }
  };
  const run = async (save: boolean) => {
    setBusy(true); setError("");
    const version = epoch.current;
    try {
      const result = await api<{ artifact: Artifact; conversationId: string }>(`/api/theses/${thesisId}/artifacts`, { method: "POST", json: { sourceId: source.id, config, conversationId, preview: !save, ...(manual ? { tableText } : {}) } });
      if (version !== epoch.current) return;
      if (save) { if (!manual) onSelect({ sheet: config.sheet, range: config.range }); onCreated(result.artifact, result.conversationId); onClose(); }
      else setPreview(result.artifact);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  const applyRange = async () => {
    setBusy(true); setError("");
    try { await api(`/api/theses/${thesisId}/artifacts`, { method: "POST", json: { sourceId: source.id, config, selectionOnly: true } }); onSelect({ sheet: config.sheet, range: config.range }); onClose(); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  };
  const columns = page?.sheet.columns || [];
  const field = (label: string, children: React.ReactNode) => <label className="block text-xs font-medium text-gray-700 space-y-1"><span>{label}</span>{isValidElement(children) ? cloneElement(children as React.ReactElement<{ "aria-label"?: string }>, { "aria-label": label }) : children}</label>;
  const choose = (value: string, onChange: (v: string) => void, empty = true) => <select className="input-field !py-1.5 !text-sm" value={value} onChange={e => onChange(e.target.value)}>{empty && <option value="">{t("workspace.none")}</option>}{columns.map(c => <option key={c.name} value={c.name}>{c.label}</option>)}</select>;
  const updateAnalysis = (value: Partial<WorkspaceRequest["analysis"]>) => patch({ analysis: { ...config.analysis, ...value } });
  return (
    <Modal open onClose={onClose} size="xl" title={t("workspace.title")} footer={<>
      {!manual && <button className="btn-outline text-sm" disabled={busy || !page} onClick={applyRange}>{t("workspace.useRange")}</button>}
      <button className="btn-outline text-sm" disabled={busy || !page} onClick={() => run(false)}>{t("workspace.preview")}</button>
      <button className="btn-primary text-sm" disabled={busy || !preview} onClick={() => run(true)}>{busy ? t("common.loading") : t("workspace.create")}</button>
    </>}>
      <p className="text-sm text-gray-600 mb-3">{source.file?.name || source.title}</p>
      {source.kind === "sheet" && <label className="flex items-center gap-2 text-xs mb-3"><input type="checkbox" checked={manual} onChange={e => { setManual(e.target.checked); setPage(null); setPreview(null); }} />{t("workspace.pasteInstead")}</label>}
      {manual && <div className="mb-4 space-y-2"><p className="text-xs text-gray-600">{t("workspace.pasteHelp")}</p><textarea aria-label={t("workspace.pasteData")} className="input-field font-mono !text-xs min-h-28" value={tableText} onChange={e => { setTableText(e.target.value); setPage(null); setPreview(null); epoch.current++; }} /><button className="btn-outline text-xs" onClick={readPasted}>{t("workspace.readData")}</button></div>}
      {error && <p className="text-sm text-red-600 mb-3" role="alert">{error}</p>}
      {page && <fieldset disabled={busy} className="grid lg:grid-cols-[280px_minmax(0,1fr)] gap-5">
        <div className="space-y-3">
          {!manual && field(t("workspace.sheet"), <select className="input-field !py-1.5 !text-sm" value={sheetIndex} onChange={e => { epoch.current++; setSheetIndex(Number(e.target.value)); setPreview(null); }}>{page.sheets.map((s, i) => <option key={i} value={i}>{s.name}</option>)}</select>)}
          {field(t("workspace.range"), <input className="input-field !py-1.5 !text-sm font-mono" value={config.range} onChange={e => patch({ range: e.target.value })} />)}
          <p className="text-xs text-gray-500">{t("workspace.rangeHelp")}</p>
          {field(t("workspace.output"), <select className="input-field !py-1.5 !text-sm" value={config.output} onChange={e => patch({ output: e.target.value as WorkspaceRequest["output"] })}>{["chart", "table", "analysis"].map(k => <option key={k} value={k}>{t(`workspace.${k}`)}</option>)}</select>)}
          {field(t("workspace.name"), <input className="input-field !py-1.5 !text-sm" value={config.title} onChange={e => patch({ title: e.target.value })} />)}
          {config.output === "chart" && <>
            {field(t("workspace.chartType"), <select className="input-field !py-1.5 !text-sm" value={config.chartType} onChange={e => patch({ chartType: e.target.value as WorkspaceRequest["chartType"], ys: ["pie", "box", "histogram"].includes(e.target.value) ? config.ys.slice(0, 1) : config.ys })}>{CHARTS.map(k => <option key={k} value={k}>{t(`workspace.chart.${k}`)}</option>)}</select>)}
            {field(t("workspace.x"), choose(config.x, x => patch({ x })))}
            {config.chartType === "histogram" && field(t("workspace.bins"), <input type="number" min={2} max={1000} className="input-field !py-1.5" value={config.analysis.bins || ""} onChange={e => updateAnalysis({ bins: Number(e.target.value) || undefined })} />)}
          </>}
          {config.output === "analysis" && <>
            {field(t("workspace.operation"), <select className="input-field !py-1.5 !text-sm" value={config.analysis.op} onChange={e => updateAnalysis({ op: e.target.value as WorkspaceRequest["analysis"]["op"] })}>{OPS.map(k => <option key={k} value={k}>{t(`workspace.op.${k}`)}</option>)}</select>)}
            {(({ describe: [], frequencies: ["column"], crosstab: ["row", "col"], groupSummary: ["value", "by"], correlation: [], distribution: ["column", "by"], trend: ["x", "y", "by"], scatter: ["x", "y", "by"], ttest: ["value", "by"], pairedTtest: ["x", "y"], anova: ["value", "by"], chisquare: ["row", "col"], correlationTest: ["x", "y"], mannWhitney: ["value", "by"], kruskal: ["value", "by"], regression: ["y"], gantt: ["label", "start", "end", "group"] } as Record<string, ("column" | "value" | "by" | "x" | "y" | "row" | "col" | "label" | "start" | "end" | "group")[]>)[config.analysis.op] || []).map(k => <div key={k}>{field(t(`workspace.field.${k}`), choose(config.analysis[k] || "", v => updateAnalysis({ [k]: v || undefined })))}</div>)}
            {field(t("workspace.stat"), <select className="input-field !py-1.5 !text-sm" value={config.analysis.stat || "mean"} onChange={e => updateAnalysis({ stat: e.target.value as "mean" })}>{["mean", "median", "sum", "count"].map(k => <option key={k} value={k}>{t(`workspace.stat.${k}`)}</option>)}</select>)}
            {field(t("workspace.bins"), <input className="input-field !py-1.5" type="number" min={1} value={config.analysis.bins || ""} onChange={e => updateAnalysis({ bins: Number(e.target.value) || undefined })} />)}
          </>}
          <fieldset className="space-y-1"><legend className="text-xs font-medium text-gray-700 mb-1">{t("workspace.columns")}</legend>{columns.filter(c => config.output !== "chart" || c.type === "number").map(c => <label key={c.name} className="flex gap-2 text-xs text-gray-700"><input type={config.output === "chart" && ["pie", "box", "histogram"].includes(config.chartType) ? "radio" : "checkbox"} name="workspace-values" checked={config.ys.includes(c.name)} onChange={e => { const ys = config.output === "chart" && ["pie", "box", "histogram"].includes(config.chartType) ? [c.name] : e.target.checked ? [...config.ys, c.name] : config.ys.filter(n => n !== c.name); patch({ ys, analysis: { ...config.analysis, columns: ys, predictors: ys } }); }} />{c.label}</label>)}</fieldset>
        </div>
        <div className="min-w-0 space-y-3">
          <p className="text-xs text-gray-500">{t("workspace.rawHelp")}</p>
          <div className="overflow-auto max-h-64 border border-gray-200 rounded-lg"><table className="min-w-full text-xs"><thead><tr><th className="p-2">#</th>{columns.map(c => <th key={c.name} className="p-2 text-left whitespace-nowrap">{columnLetter(columns.indexOf(c))} · {c.label}</th>)}</tr></thead><tbody>{page.rows.map((row, i) => <tr key={i} className="border-t border-gray-100"><td className="p-2 text-gray-500">{page.rowNumbers?.[i] ?? page.sheet.headerRow + i + 1}</td>{row.map((v, j) => <td key={j} className="p-2 whitespace-nowrap">{String(v ?? "")}</td>)}</tr>)}</tbody></table></div>
          {preview ? <ArtifactCard artifact={preview} insertable={false} /> : <p className="p-6 bg-gray-50 rounded-xl text-sm text-gray-500">{t("workspace.previewHelp")}</p>}
          <p className="text-xs text-gray-600">{t("workspace.consequence")}</p>
        </div>
      </fieldset>}
    </Modal>
  );
}
