import type { AnalysisSpec, Artifact, ChartData, Dataset, DatasetSheet, WritingLanguage } from "../db";
import { quantileSorted } from "./stats";
import { summarizeSheet } from "./summarize";
import { tryRunAnalysis } from "./analysis";
import { CHART_LIMITS } from "../charts/render";
import type { Translate } from "./labels";

export interface DataSelection { sheet: number; range: string }
export interface WorkspaceRequest extends DataSelection {
  output: "table" | "chart" | "analysis";
  title: string;
  chartType: ChartData["type"];
  x: string;
  ys: string[];
  analysis: AnalysisSpec;
}

export function columnLetter(index: number): string {
  let out = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + (n - 1) % 26) + out;
  return out;
}
export function fullRange(sheet: Pick<DatasetSheet, "columns" | "rowCount" | "headerRow" | "rowNumbers"> & { lastRow?: number }): string {
  return `A${sheet.headerRow + 1}:${columnLetter(sheet.columns.length - 1)}${sheet.lastRow ?? sheet.rowNumbers?.[sheet.rowNumbers.length - 1] ?? sheet.headerRow + sheet.rowCount}`;
}
function colIndex(s: string): number { return s.split("").reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1; }

/** Selects original worksheet coordinates, excluding the parsed header. Never mutates or silently clips the file. */
export function selectDataset(dataset: Dataset, selection: DataSelection): Dataset {
  const sheet = dataset.sheets[selection.sheet];
  if (!sheet) throw new Error("workspace.invalidRange");
  const raw = (selection.range || fullRange(sheet)).replace(/\$/g, "").trim().toUpperCase();
  const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(raw);
  if (!match) throw new Error("workspace.invalidRange");
  const firstCol = colIndex(match[1]), lastCol = colIndex(match[3]);
  const firstRow = Math.max(sheet.headerRow + 1, Number(match[2])), lastRow = Number(match[4]);
  if (firstCol < 0 || firstCol > lastCol || lastCol >= sheet.columns.length || Number(match[2]) < 1 || firstRow > lastRow || lastRow > (sheet.rowNumbers?.[sheet.rowNumbers.length - 1] ?? sheet.headerRow + sheet.rowCount)) throw new Error("workspace.invalidRange");
  const keptRows = Array.from({ length: sheet.rowCount }, (_, i) => i).filter(i => { const row = sheet.rowNumbers?.[i] ?? sheet.headerRow + i + 1; return row >= firstRow && row <= lastRow; });
  if (!keptRows.length) throw new Error("workspace.invalidRange");
  const selected = summarizeSheet(sheet.name, sheet.columns.slice(firstCol, lastCol + 1).map(c => c.name), sheet.data.slice(firstCol, lastCol + 1).map(c => keptRows.map(i => c[i])), { headerRow: firstRow - 1, truncated: sheet.truncated });
  selected.rowNumbers = keptRows.map(i => sheet.rowNumbers?.[i] ?? sheet.headerRow + i + 1);
  return { ...dataset, selection, sheets: [selected], cells: selected.columns.length * selected.rowCount };
}

/** Explicit user selections bypass the assistant's automatic choice of variables and category folding. */
export function createWorkspaceArtifact(dataset: Dataset, request: WorkspaceRequest, meta: { id: string; interactionId: string; fileName: string; lang: WritingLanguage }, tr: Translate): Artifact {
  const selected = selectDataset(dataset, request);
  const sheet = selected.sheets[0];
  if (request.output === "analysis" || request.chartType === "histogram") sheet.columns = sheet.columns.map(c => c.type === "number" ? { ...c, role: "measure" as const } : c);
  const title = request.title?.trim().slice(0, 200) || tr(`workspace.${request.output}`);
  let artifact: Artifact;
  if (request.output === "analysis" || (request.output === "chart" && request.chartType === "histogram")) {
    const spec: AnalysisSpec = request.output === "analysis" ? { ...request.analysis, sheet: sheet.name } : { op: "distribution", column: request.ys[0], by: request.chartType === "box" ? request.x || undefined : undefined, chart: request.chartType, bins: request.analysis.bins };
    const result = tryRunAnalysis(spec, selected, { id: meta.id, sourceId: dataset.sourceId, fileName: meta.fileName, interactionId: meta.interactionId, lang: meta.lang }, tr);
    if (!result.ok) throw new Error(`data.error.${result.code}`);
    artifact = result.artifact;
  } else {
    const find = (name: string) => sheet.columns.findIndex(c => c.name === name);
    const x = find(request.x);
    const ys = request.ys.map(find);
    if (!ys.length || ys.some(i => i < 0) || (request.output === "chart" && request.chartType !== "box" && x < 0)) throw new Error("workspace.chooseColumns");
    const indices = request.output === "table" ? ys : x < 0 ? ys : [x, ...ys.filter(i => i !== x)];
    const table = { columns: indices.map(i => sheet.columns[i].label), rows: Array.from({ length: sheet.rowCount }, (_, row) => indices.map(i => { const v = sheet.data[i][row]; return typeof v === "boolean" ? String(v) : v ?? null; })), precision: indices.map(i => sheet.columns[i].precision ?? 2) };
    artifact = { id: meta.id, interactionId: meta.interactionId, kind: request.output, title, spec: { op: "describe", columns: indices.map(i => sheet.columns[i].name) }, sourceId: dataset.sourceId, fileName: meta.fileName, sheet: sheet.name, datasetSha256: dataset.sha256, n: sheet.rowCount, lang: meta.lang, table, computedAt: new Date().toISOString() };
    if (request.output === "chart") {
      if (sheet.rowCount > CHART_LIMITS.categories || ys.length > CHART_LIMITS.series) throw new Error("workspace.tooLarge");
      if (ys.some(i => sheet.columns[i].type !== "number")) throw new Error("workspace.numeric");
      const values = (i: number) => sheet.data[i].map(v => typeof v === "number" && Number.isFinite(v) ? v : NaN);
      const chart: ChartData = { type: request.chartType, xLabel: x >= 0 ? sheet.columns[x].label : "", yLabel: ys.map(i => sheet.columns[i].label).join(", "), categories: x >= 0 ? sheet.data[x].map(v => String(v ?? "")) : [], series: ys.map(i => ({ name: sheet.columns[i].label, values: values(i) })) };
      if (chart.type === "box") {
        if (ys.length !== 1) throw new Error("workspace.chooseColumns");
        const groups = new Map<string, number[]>();
        for (let row = 0; row < sheet.rowCount; row++) {
          const value = sheet.data[ys[0]][row];
          if (typeof value !== "number" || !Number.isFinite(value)) continue;
          const key = x >= 0 ? String(sheet.data[x][row] ?? "") : sheet.columns[ys[0]].label;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(value);
        }
        chart.series = [];
        chart.boxes = Array.from(groups.entries()).map(([label, values]) => {
          const sorted = values.slice().sort((a, b) => a - b);
          const q1 = quantileSorted(sorted, .25)!, median = quantileSorted(sorted, .5)!, q3 = quantileSorted(sorted, .75)!;
          const low = q1 - 1.5 * (q3 - q1), high = q3 + 1.5 * (q3 - q1);
          const inside = sorted.filter(v => v >= low && v <= high);
          return { label, n: sorted.length, min: sorted[0], max: sorted[sorted.length - 1], q1, median, q3, whiskerLow: inside[0], whiskerHigh: inside[inside.length - 1], outliers: sorted.filter(v => v < low || v > high) };
        });
        if (chart.boxes.length > CHART_LIMITS.boxes) throw new Error("workspace.tooLarge");
        artifact.table = { columns: [tr("workspace.category"), "n", "Min", "Q1", tr("workspace.stat.median"), "Q3", "Max"], rows: chart.boxes.map(b => [b.label, b.n, b.min, b.q1, b.median, b.q3, b.max]), precision: [0, 0, 2, 2, 2, 2, 2] };
      }
      if (chart.type === "scatter") {
        if (sheet.columns[x].type !== "number") throw new Error("workspace.numeric");
        chart.series = ys.map(i => ({ name: sheet.columns[i].label, points: sheet.data[x].flatMap((v, row) => typeof v === "number" && Number.isFinite(v) && typeof sheet.data[i][row] === "number" && Number.isFinite(sheet.data[i][row]) ? [[v, sheet.data[i][row]] as [number, number]] : []) }));
      }
      if (chart.type === "pie") {
        if (ys.length !== 1 || values(ys[0]).some(v => !Number.isFinite(v) || v < 0) || !values(ys[0]).some(v => v > 0) || sheet.rowCount > CHART_LIMITS.series) throw new Error("workspace.pieValues");
        chart.series = sheet.data[x].map((v, row) => ({ name: String(v ?? ""), values: [values(ys[0])[row]] }));
      }
      artifact.chart = chart;
    }
  }
  if (artifact.chart && encodeURIComponent(JSON.stringify(artifact.chart)).length > 350_000) throw new Error("workspace.tooLarge");
  return { ...artifact, title, dataSelection: { ...request, sheet: request.sheet, range: request.range || fullRange(dataset.sheets[request.sheet]) } };
}
