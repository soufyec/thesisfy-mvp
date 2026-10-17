"use client";

import { cloneElement, isValidElement, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { api } from "@/lib/client";
import { normalizeChart, renderChartSvg } from "@/lib/charts/render";
import { CHART_SERIES } from "@/lib/charts/palette";
import type { Artifact, ChartData } from "@/lib/db";
import type { ChartNodeSpec } from "../chart";

function NumberCell({ value, onChange, label }: { value?: number; onChange: (value: number) => void; label: string }) {
  const [draft, setDraft] = useState(Number.isFinite(value) ? String(value) : "");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (document.activeElement !== input.current) setDraft(Number.isFinite(value) ? String(value) : ""); }, [value]);
  return <input ref={input} aria-label={label} className="w-28 border border-gray-200 rounded px-2 py-1 text-xs tabular-nums" inputMode="decimal" value={draft} onChange={event => { const text = event.target.value; setDraft(text); const n = Number(text.replace(",", ".")); if (text.trim() && Number.isFinite(n)) onChange(n); }} onBlur={() => { onChange(draft.trim() ? Number(draft.replace(",", ".")) : NaN); }} />;
}

/** Editable data and presentation of the saved object, with a preview and one undoable Apply action. */
export default function ChartDialog({ initial, thesisId, onClose, onApply }: { initial: ChartNodeSpec; thesisId?: string; onClose: () => void; onApply: (value: ChartNodeSpec) => void }) {
  const t = useT();
  const [spec, setSpec] = useState<ChartNodeSpec>(() => JSON.parse(JSON.stringify(initial)));
  const [activeSeries, setActiveSeries] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState(initial.dataSelection?.range || "");
  const chart = spec.chart!;
  const setChart = (value: ChartData) => { setError(""); setSpec(s => ({ ...s, chart: value })); };
  const series = chart.series[activeSeries] || chart.series[0];
  const patchSeries = (value: Partial<ChartData["series"][number]>) => setChart({ ...chart, fit: value.points || value.values ? undefined : chart.fit, series: chart.series.map((s, i) => i === activeSeries ? { ...s, ...value } : s) });
  const numericInput = (value: number | undefined, onChange: (value: number) => void, label: string) => <NumberCell value={value} onChange={onChange} label={label} />;
  const svg = useMemo(() => renderChartSvg(chart, { width: 640, height: 400, title: spec.title, desc: spec.title, lang: spec.lang }), [chart, spec.title, spec.lang]);
  const field = (label: string, child: React.ReactNode) => <label className="block text-xs font-medium text-gray-700 space-y-1"><span>{label}</span>{isValidElement(child) ? cloneElement(child as React.ReactElement<{ "aria-label"?: string }>, { "aria-label": label }) : child}</label>;
  const changeType = (type: ChartData["type"]) => {
    if (type === chart.type) return;
    let nextSeries = chart.series;
    let categories = chart.categories;
    if (chart.type === "box") { categories = (chart.boxes || []).map(b => b.label); nextSeries = [{ name: chart.yLabel, values: (chart.boxes || []).map(b => b.median) }]; }
    if (chart.type === "pie") { categories = chart.series.map(s => s.name); nextSeries = [{ name: chart.yLabel, values: chart.series.map(s => s.values?.[0] ?? NaN) }]; }
    if (chart.type === "scatter") { categories = (series?.points || []).map(p => String(p[0])); nextSeries = chart.series.map(s => ({ ...s, values: (s.points || []).map(p => p[1]) })); }
    if (type === "scatter") nextSeries = nextSeries.map(s => ({ ...s, points: (s.values || []).map((y, i) => [categories?.[i]?.trim() && Number.isFinite(Number(categories[i])) ? Number(categories[i]) : i + 1, y]) }));
    if (type === "pie") nextSeries = (categories || []).map((name, i) => ({ name, values: [nextSeries[0]?.values?.[i] ?? NaN] }));
    if (!nextSeries.length) nextSeries = [{ name: t("workspace.series"), values: (categories || []).map(() => 0), points: type === "scatter" ? [[0, 0]] : undefined }];
    setActiveSeries(0);
    setChart({ ...chart, type, series: nextSeries, categories, fit: undefined });
  };
  const addRow = () => {
    if (chart.type === "pie") return setChart({ ...chart, series: [...chart.series, { name: t("workspace.category"), values: [0] }] });
    if (chart.type === "box") return setChart({ ...chart, boxes: [...(chart.boxes || []), { label: t("workspace.category"), n: 0, min: 0, q1: 0, median: 0, q3: 0, max: 0, whiskerLow: 0, whiskerHigh: 0, outliers: [] }] });
    if (chart.type === "scatter") return patchSeries({ points: [...(series?.points || []), [0, 0]] });
    setChart({ ...chart, categories: [...(chart.categories || []), t("workspace.category")], series: chart.series.map(s => ({ ...s, values: [...(s.values || []), 0] })) });
  };
  const recompute = async () => {
    if (!spec.dataSelection || !thesisId || !spec.sourceId) return;
    setBusy(true); setError("");
    try {
      const result = await api<{ artifact: Artifact }>(`/api/theses/${thesisId}/artifacts`, { method: "POST", json: { sourceId: spec.sourceId, config: { ...spec.dataSelection, range, ...(spec.dataSelection.output === "chart" ? { chartType: chart.type } : {}), title: spec.title }, preview: true } });
      if (!result.artifact.chart) throw new Error(t("workspace.invalidData"));
      setSpec(s => ({ ...s, chart: { ...result.artifact.chart!, style: s.chart?.style, series: result.artifact.chart!.series.map(series => ({ ...series, color: s.chart?.series.find(previous => previous.name === series.name)?.color })) }, dataSelection: result.artifact.dataSelection, n: result.artifact.n }));
      setActiveSeries(0);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  const apply = () => {
    if (chart.type !== "box" && !chart.series.length) return setError(t("workspace.invalidData"));
    if (chart.type === "pie" && (chart.series.some(s => !Number.isFinite(s.values?.[0]) || (s.values?.[0] ?? 0) < 0) || !chart.series.some(s => (s.values?.[0] ?? 0) > 0))) return setError(t("workspace.pieValues"));
    if (chart.type === "box" && chart.boxes?.some(b => ![b.min, b.q1, b.median, b.q3, b.max, b.whiskerLow, b.whiskerHigh].every(Number.isFinite) || b.min > b.q1 || b.q1 > b.median || b.median > b.q3 || b.q3 > b.max || b.whiskerLow > b.q1 || b.whiskerHigh < b.q3)) return setError(t("workspace.invalidData"));
    const next = { ...spec, chart: normalizeChart(chart), originalChart: initial.originalChart || initial.chart, editedAt: new Date().toISOString() };
    if (encodeURIComponent(JSON.stringify(next)).length > 1_000_000 || chart.series.length > 128 || (chart.categories?.length || 0) > 10000 || chart.series.some(s => (s.points?.length || 0) > 10000)) return setError(t("workspace.tooLarge"));
    onApply(next);
  };
  return <Modal open size="xl" onClose={onClose} title={t("workspace.editChart")} footer={<><button className="btn-outline text-sm" onClick={onClose}>{t("common.cancel")}</button><button className="btn-primary text-sm" disabled={busy} onClick={apply}>{t("editor.apply")}</button></>}>
    <div className="grid lg:grid-cols-[240px_minmax(0,1fr)] gap-4">
      <div className="space-y-3">
        {field(t("workspace.name"), <input className="input-field !py-1.5" value={spec.title} onChange={e => setSpec(s => ({ ...s, title: e.target.value }))} />)}
        {field(t("workspace.chartType"), <select className="input-field !py-1.5" value={chart.type} onChange={e => changeType(e.target.value as ChartData["type"])}>{["bar", "groupedBar", "line", "scatter", "pie", ...(chart.type === "histogram" ? ["histogram"] : []), ...(chart.type === "box" ? ["box"] : [])].map(k => <option key={k} value={k}>{t(`workspace.chart.${k}`)}</option>)}</select>)}
        {field(t("workspace.x"), <input className="input-field !py-1.5" value={chart.xLabel} onChange={e => setChart({ ...chart, xLabel: e.target.value })} />)}
        {field(t("workspace.y"), <input className="input-field !py-1.5" value={chart.yLabel} onChange={e => setChart({ ...chart, yLabel: e.target.value })} />)}
        {field(t("workspace.fontSize"), <input type="number" min={9} max={20} className="input-field !py-1.5" value={chart.style?.fontSize || 12} onChange={e => setChart({ ...chart, style: { ...chart.style, fontSize: Number(e.target.value) } })} />)}
        {chart.type === "box" && field(t("workspace.color"), <input type="color" value={chart.style?.color || CHART_SERIES[0]} onChange={e => setChart({ ...chart, style: { ...chart.style, color: e.target.value } })} />)}
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={chart.style?.showGrid !== false} onChange={e => setChart({ ...chart, style: { ...chart.style, showGrid: e.target.checked } })} />{t("workspace.grid")}</label>
        {spec.dataSelection && thesisId && <div className="space-y-2 border-t border-gray-100 pt-3">{field(t("workspace.range"), <input className="input-field !py-1.5 font-mono" value={range} onChange={e => setRange(e.target.value)} />)}<button className="btn-outline text-xs" disabled={busy} onClick={recompute}>{t("workspace.recompute")}</button></div>}
        <p className="text-xs text-gray-500">{t("workspace.editNotice")}</p>
        <button className="btn-outline text-xs" onClick={() => { setSpec(s => ({ ...s, chart: initial.originalChart || initial.chart })); setActiveSeries(0); }}>{t("workspace.restoreData")}</button>
      </div>
      <div className="min-w-0 space-y-3">
        <h3 className="text-sm font-semibold">{spec.title}</h3><div className="[&>svg]:w-full [&>svg]:h-auto" dangerouslySetInnerHTML={{ __html: svg }} />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {chart.type !== "pie" && chart.type !== "box" && <div className="flex gap-2 flex-wrap items-end">
          {field(t("workspace.series"), <select className="input-field !py-1.5" value={activeSeries} onChange={e => setActiveSeries(Number(e.target.value))}>{chart.series.map((s, i) => <option key={i} value={i}>{s.name || i + 1}</option>)}</select>)}
          {series && <>{field(t("workspace.seriesName"), <input className="input-field !py-1.5" value={series.name} onChange={e => patchSeries({ name: e.target.value })} />)}{field(t("workspace.color"), <input type="color" value={series.color || CHART_SERIES[activeSeries % CHART_SERIES.length]} onChange={e => patchSeries({ color: e.target.value })} />)}</>}
          <button className="btn-outline text-xs" onClick={() => { setChart({ ...chart, series: [...chart.series, { name: t("workspace.series"), values: (chart.categories || []).map(() => 0), points: chart.type === "scatter" ? [[0, 0]] : undefined }] }); setActiveSeries(chart.series.length); }}>{t("workspace.addSeries")}</button>
          {chart.series.length > 1 && <button className="btn-outline text-xs" onClick={() => { setChart({ ...chart, series: chart.series.filter((_, i) => i !== activeSeries) }); setActiveSeries(0); }}>{t("workspace.removeSeries")}</button>}
        </div>}
        <div className="max-h-72 overflow-auto border border-gray-200 rounded-lg"><table className="min-w-full text-xs"><thead><tr>{(chart.type === "box" ? ["label", "n", "min", "q1", "median", "q3", "max", "whiskerLow", "whiskerHigh"] : chart.type === "pie" ? ["category", "value", "color"] : [chart.type === "scatter" ? "x" : "category", "value"]).map(k => <th key={k} className="p-2 text-left">{t(`workspace.cell.${k}`)}</th>)}<th /></tr></thead><tbody>
          {chart.type === "box" ? (chart.boxes || []).map((box, i) => <tr key={i}>{(["label", "n", "min", "q1", "median", "q3", "max", "whiskerLow", "whiskerHigh"] as const).map(k => <td key={k} className="p-1">{k === "label" ? <input aria-label={`${t("workspace.category")} ${i + 1}`} className="w-28 border rounded p-1" value={box.label} onChange={e => setChart({ ...chart, boxes: chart.boxes!.map((b, j) => j === i ? { ...b, label: e.target.value } : b) })} /> : numericInput(box[k], v => setChart({ ...chart, boxes: chart.boxes!.map((b, j) => j === i ? { ...b, [k]: v } : b) }), `${k} ${i + 1}`)}</td>)}<td><button onClick={() => setChart({ ...chart, boxes: chart.boxes!.filter((_, j) => j !== i) })} aria-label={t("workspace.removeRow")}>×</button></td></tr>)
            : chart.type === "pie" ? chart.series.map((s, i) => <tr key={i}><td className="p-1"><input aria-label={`${t("workspace.category")} ${i + 1}`} className="w-36 border rounded p-1" value={s.name} onChange={e => setChart({ ...chart, series: chart.series.map((v, j) => j === i ? { ...v, name: e.target.value } : v) })} /></td><td>{numericInput(s.values?.[0], v => setChart({ ...chart, series: chart.series.map((s, j) => j === i ? { ...s, values: [v] } : s) }), `${t("workspace.value")} ${i + 1}`)}</td><td><input type="color" aria-label={`${t("workspace.color")} ${i + 1}`} value={s.color || CHART_SERIES[i % CHART_SERIES.length]} onChange={e => setChart({ ...chart, series: chart.series.map((s, j) => j === i ? { ...s, color: e.target.value } : s) })} /></td><td><button onClick={() => setChart({ ...chart, series: chart.series.filter((_, j) => j !== i) })} aria-label={t("workspace.removeRow")}>×</button></td></tr>)
              : (chart.type === "scatter" ? series?.points || [] : chart.categories || []).map((row, i) => <tr key={i}><td className="p-1">{chart.type === "scatter" ? numericInput((row as [number, number])[0], v => patchSeries({ points: series.points!.map((p, j) => j === i ? [v, p[1]] : p) }), `X ${i + 1}`) : <input aria-label={`${t("workspace.category")} ${i + 1}`} className="w-36 border rounded p-1" value={String(row)} onChange={e => setChart({ ...chart, categories: chart.categories!.map((c, j) => j === i ? e.target.value : c) })} />}</td><td>{numericInput(chart.type === "scatter" ? series.points?.[i][1] : series?.values?.[i], v => chart.type === "scatter" ? patchSeries({ points: series.points!.map((p, j) => j === i ? [p[0], v] : p) }) : patchSeries({ values: series.values!.map((n, j) => j === i ? v : n) }), `${t("workspace.value")} ${i + 1}`)}</td><td><button aria-label={t("workspace.removeRow")} onClick={() => chart.type === "scatter" ? patchSeries({ points: series.points!.filter((_, j) => j !== i) }) : setChart({ ...chart, categories: chart.categories!.filter((_, j) => j !== i), series: chart.series.map(s => ({ ...s, values: s.values?.filter((_, j) => j !== i) })) })}>×</button></td></tr>)}
        </tbody></table></div>
        <button className="btn-outline text-xs" onClick={addRow}>{t("workspace.addRow")}</button>
      </div>
    </div>
  </Modal>;
}
