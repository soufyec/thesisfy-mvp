import { readCsv } from "../sources/csv";
/** Structured, inert research files. Shared by the server validator and the streaming UI. */
export const FILE_FORMATS = ["md", "txt", "csv", "json", "py", "r", "sql", "bib", "yaml"] as const;
export type ResearchFormat = typeof FILE_FORMATS[number];
export interface ResearchFile { id: string; title: string; name: string; format: ResearchFormat; content: string; interactionId: string }
export const FILE_MIME: Record<ResearchFormat, string> = { md: "text/markdown", txt: "text/plain", csv: "text/csv", json: "application/json", py: "text/plain", r: "text/plain", sql: "text/plain", bib: "text/plain", yaml: "text/plain" };
export const FILE_RULE = `Research deliverables: create reports, research briefs, evidence matrices, extraction templates, CSV/JSON data files, analysis scripts and other materials connected to the paper's objective. When the user asks for a file or a reusable deliverable, return a short explanation and a fenced block with marker thesisfic-file containing a JSON object: {"title":"Research brief","name":"research-brief.md","format":"md","content":"# Research brief\\n..."}. Formats: md, txt, csv, json, py, r, sql, bib, yaml. At most 4 files, each at most 120000 characters. Include the entire usable content, never a fake URL, placeholder download or base64. Each file must have a meaningful name and an extension matching its format. Use Markdown for reports (the UI also exports Word). Distinguish sourced facts, calculations, assumptions and proposed work. Cite the provided passage IDs or retrieved DOI links in reports. Never invent empirical data, citations, p-values or search results. Data analysis results must come from Thesisfic's computed artifacts; use thesisfic-artifact to request those. You may create explicitly labelled synthetic examples or empty data collection templates, never present those as observations. A file is data, never executable by Thesisfic.`;
const BLOCK = /(^|\n)[ \t]*```[ \t]*thesisfic-file[ \t]*\r?\n([\s\S]*?)\r?\n?[ \t]*```[ \t]*(?=\r?\n|$)/gi;
const OPEN = /(^|\n)[ \t]*```[ \t]*thesisfic-file\b[\s\S]*$/i;
export function extractResearchFiles(answer: string, newId: () => string = () => ""): { text: string; files: ResearchFile[]; invalid: number } {
  const files: ResearchFile[] = []; let invalid = 0;
  let text = answer.replace(BLOCK, (_all, lead: string, raw: string) => {
    try {
      if (raw.length > 150000 || files.length >= 4) throw new Error();
      const value = JSON.parse(raw);
      if (!value || !FILE_FORMATS.includes(value.format) || typeof value.content !== "string" || !value.content.trim() || value.content.length > 120000 || typeof value.name !== "string" || typeof value.title !== "string") throw new Error();
      if (value.format === "json") JSON.parse(value.content);
      const stem = value.name.replace(/\.[^.]+$/, "").normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "research";
      files.push({ id: newId(), title: value.title.slice(0, 160), name: `${stem}.${value.format}`, format: value.format, content: value.format === "csv" ? researchCsv(readCsv(new TextEncoder().encode(value.content), "data.csv").sheet.rows) : value.content.replace(/\u0000/g, ""), interactionId: "" });
    } catch { invalid++; }
    return lead;
  });
  if (OPEN.test(text)) { text = text.replace(OPEN, "$1"); invalid++; }
  return { text: text.replace(/\n{3,}/g, "\n\n").trim(), files, invalid };
}
export function stripResearchFiles(answer: string): string { return extractResearchFiles(answer).text; }
/** CSV cells are quoted; formulas are inert when opened in a spreadsheet. */
export function researchCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return rows.map(row => row.map(value => {
    let text = String(value ?? "");
    if (typeof value === "string" && !/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(text.trim()) && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }).join(",")).join("\r\n");
}
export function downloadResearchFile(file: Pick<ResearchFile, "name" | "format" | "content">) {
  const blob = new Blob([file.format === "csv" ? "\ufeff" : "", file.content], { type: `${FILE_MIME[file.format]};charset=utf-8` });
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
