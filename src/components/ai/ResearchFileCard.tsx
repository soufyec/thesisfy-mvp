"use client";
import { useState } from "react";
import { Download, FileText } from "lucide-react";
import Markdown, { markdownToHtml } from "../Markdown";
import { useT } from "@/lib/i18n/client";
import { countWords } from "@/lib/countable";
import { downloadResearchFile, type ResearchFile } from "@/lib/ai/files";

export default function ResearchFileCard({ file, conversationId, ctx, onInsert, onNotes, onUse, onDrag, onDragEnd }: { file: ResearchFile; conversationId?: string; ctx?: { wordCount: number; aiWords: number; limitPct: number; onFinalSubmission?: boolean }; onInsert?: (html: string, words: number) => void; onNotes?: (html: string, words: number) => void; onUse?: (file: File) => void; onDrag?: (event: React.DragEvent, html: string, words: number) => void; onDragEnd?: () => void }) {
  const t = useT(); const [open, setOpen] = useState(false); const [pending, setPending] = useState<"insert" | "notes" | null>(null); const [error, setError] = useState("");
  const text = file.format === "md" || file.format === "txt";
  const html = markdownToHtml(file.format === "txt" ? file.content.replace(/[<>]/g, c => c === "<" ? "&lt;" : "&gt;") : file.content);
  const words = countWords(html), next = ctx ? (ctx.aiWords + words) / (ctx.wordCount + words || 1) * 100 : 0;
  const dragOver = ctx?.onFinalSubmission !== false && !!ctx && next > ctx.limitPct;
  const over = pending === "insert" && ctx?.onFinalSubmission !== false && !!ctx && next > ctx.limitPct;
  const downloadWord = async () => {
    setError(""); try { const { htmlToDocx, downloadBlob } = await import("@/lib/export"); downloadBlob(file.name.replace(/\.[^.]+$/, ".docx"), await htmlToDocx(html, { title: file.title })); } catch { setError(t("copilot.downloadError")); }
  };
  const cls = "inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50";
  return <section className="mt-2 rounded-xl border border-gray-200 p-3 space-y-2" aria-label={file.title}>
    <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-gray-400" /><div className="min-w-0 flex-1"><h3 className="text-xs font-semibold truncate">{file.title}</h3><p className="text-[11px] text-gray-400 truncate">{file.name}</p></div><button className={cls} onClick={() => setOpen(v => !v)} aria-expanded={open}>{t(open ? "copilot.hide" : "copilot.preview")}</button></div>
    {open && <div className="max-h-72 overflow-auto text-xs">{file.format === "md" ? <Markdown text={file.content} /> : <pre className="whitespace-pre-wrap break-words font-mono">{file.content}</pre>}</div>}
    <div className="flex flex-wrap gap-1.5">
      {conversationId ? <a className={cls} href={`/api/ai/conversations/${conversationId}/files/${file.id}`} download={file.name}><Download className="w-3 h-3" />{t("copilot.download")}</a> : <button className={cls} onClick={() => downloadResearchFile(file)}><Download className="w-3 h-3" />{t("copilot.download")}</button>}
      {text && <button className={cls} onClick={downloadWord}>{t("copilot.word")}</button>}
      {text && onDrag && <button className={`${cls} cursor-grab disabled:opacity-40`} draggable={!dragOver} disabled={dragOver} onDragStart={e => onDrag(e, html, words)} onDragEnd={onDragEnd}>{t("workspace.drag")}</button>}
      {text && onInsert && <button className={cls} onClick={() => setPending(p => p === "insert" ? null : "insert")}>{t("assistant.action.insert")}</button>}
      {text && onNotes && <button className={cls} onClick={() => setPending(p => p === "notes" ? null : "notes")}>{t("assistant.action.notes")}</button>}
      {file.format === "csv" && onUse && <button className={cls} onClick={() => onUse(new File([file.content], file.name, { type: "text/csv" }))}>{t("copilot.useData")}</button>}
    </div>
    {text && onDrag && <p className="text-[11px] text-gray-500">{ctx?.onFinalSubmission === false ? t("copilot.notesCost", { words }) : t("copilot.insertCost", { words, next: Math.round(next), limit: ctx?.limitPct ?? 100 })}</p>}
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    {pending && <div role="group" aria-label={t("assistant.cost.title")} className="rounded-lg bg-prov-ai-soft p-2 text-xs text-prov-ai-deep space-y-2">
      <p>{pending === "notes" || ctx?.onFinalSubmission === false ? t("copilot.notesCost", { words }) : t("copilot.insertCost", { words, next: Math.round(next), limit: ctx?.limitPct ?? 100 })}</p>
      {over && <p>{t("assistant.cost.over", { next: Math.round(next), limit: ctx!.limitPct })}</p>}
      <div className="flex gap-2"><button className="btn-primary !text-xs !py-1" disabled={over} onClick={() => { (pending === "notes" ? onNotes : onInsert)?.(html, words); setPending(null); }}>{t(pending === "notes" ? "assistant.action.notes" : "assistant.action.insert")}</button><button onClick={() => setPending(null)}>{t("common.cancel")}</button></div>
    </div>}
  </section>;
}
