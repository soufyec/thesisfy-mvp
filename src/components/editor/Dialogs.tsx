"use client";

import { useEffect, useState } from "react";
import { Modal } from "../ui";
import { useFormat, useT } from "@/lib/i18n/client";
import { richText, type ThesisDoc } from "./types";

export function LinkDialog({ open, onClose, initial, onSubmit, onRemove }: { open: boolean; onClose: () => void; initial: string; onSubmit: (url: string) => void; onRemove: () => void }) {
  const t = useT();
  const [url, setUrl] = useState(initial);
  useEffect(() => setUrl(initial), [initial, open]);
  return (
    <Modal open={open} onClose={onClose} title={t("editor.link.title")} size="sm" footer={<><button onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">{t("common.cancel")}</button>{initial && <button onClick={() => { onRemove(); onClose(); }} className="btn-outline !py-2 !px-4 text-sm text-red-600">{t("common.remove")}</button>}<button onClick={() => { onSubmit(url.trim()); onClose(); }} disabled={!url.trim()} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40">{t("editor.apply")}</button></>}>
      <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && url.trim()) { onSubmit(url.trim()); onClose(); } }} placeholder="https://…" className="input-field" />
    </Modal>
  );
}

export function ImageDialog({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (src: string, alt: string) => void }) {
  const t = useT();
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [preview, setPreview] = useState("");
  const file = (f: File) => {
    if (f.size > 2 * 1024 * 1024) return alert(t("editor.image.tooLarge"));
    const r = new FileReader();
    r.onload = () => { setPreview(String(r.result)); setUrl(String(r.result)); };
    r.readAsDataURL(f);
  };
  return (
    <Modal open={open} onClose={onClose} title={t("editor.image.title")} size="md" footer={<><button onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">{t("common.cancel")}</button><button disabled={!url} onClick={() => { onSubmit(url, alt); setUrl(""); setAlt(""); setPreview(""); onClose(); }} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40">{t("editor.insert")}</button></>}>
      <div className="space-y-3">
        <label className="block border-2 border-dashed border-gray-200 rounded-xl p-6 text-center text-sm text-gray-500 hover:border-brand-300 cursor-pointer" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) file(f); }}>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && file(e.target.files[0])} />
          {preview ? <img src={preview} alt="" className="max-h-40 mx-auto rounded" /> : t("editor.image.drop")}
        </label>
        <div className="text-xs text-gray-400 text-center">{t("editor.image.or")}</div>
        <input value={url.startsWith("data:") ? "" : url} onChange={(e) => { setUrl(e.target.value); setPreview(""); }} placeholder={t("editor.image.urlPlaceholder")} className="input-field" />
        <input value={alt} onChange={(e) => setAlt(e.target.value)} placeholder={t("editor.image.altPlaceholder")} className="input-field" />
      </div>
    </Modal>
  );
}

export function TableDialog({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (rows: number, cols: number, header: boolean) => void }) {
  const t = useT();
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [header, setHeader] = useState(true);
  const [hover, setHover] = useState<[number, number]>([0, 0]);
  return (
    <Modal open={open} onClose={onClose} title={t("editor.table.title")} size="sm" footer={<><button onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">{t("common.cancel")}</button><button onClick={() => { onSubmit(rows, cols, header); onClose(); }} className="btn-primary !py-2 !px-4 text-sm">{t("editor.table.insertSize", { rows, cols })}</button></>}>
      <div className="grid gap-1 mb-3" style={{ gridTemplateColumns: "repeat(8, 1fr)" }} onMouseLeave={() => setHover([0, 0])}>
        {Array.from({ length: 48 }).map((_, i) => {
          const r = Math.floor(i / 8) + 1, c = (i % 8) + 1;
          const on = r <= (hover[0] || rows) && c <= (hover[1] || cols);
          return <button key={i} onMouseEnter={() => setHover([r, c])} onClick={() => { setRows(r); setCols(c); }} className={`h-6 rounded border ${on ? "bg-brand-200 border-brand-400" : "bg-gray-50 border-gray-200"}`} />;
        })}
      </div>
      <div className="flex items-center gap-3 text-sm">
        <label className="flex items-center gap-1">{t("editor.table.rows")} <input type="number" min={1} max={30} value={rows} onChange={(e) => setRows(Number(e.target.value))} className="input-field !py-1 !w-16" /></label>
        <label className="flex items-center gap-1">{t("editor.table.columns")} <input type="number" min={1} max={12} value={cols} onChange={(e) => setCols(Number(e.target.value))} className="input-field !py-1 !w-16" /></label>
      </div>
      <label className="flex items-center gap-2 text-sm mt-3"><input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} />{t("editor.table.header")}</label>
    </Modal>
  );
}

export function PageSetupDialog({ open, onClose, value, onSubmit }: { open: boolean; onClose: () => void; value: ThesisDoc["pageSetup"]; onSubmit: (v: ThesisDoc["pageSetup"]) => void }) {
  const t = useT();
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value, open]);
  return (
    <Modal open={open} onClose={onClose} title={t("editor.pageSetup.title")} size="sm" footer={<><button onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">{t("common.cancel")}</button><button onClick={() => { onSubmit(v); onClose(); }} className="btn-primary !py-2 !px-4 text-sm">{t("editor.ok")}</button></>}>
      <div className="space-y-4 text-sm">
        <div><div className="text-xs font-medium text-gray-500 mb-1">{t("editor.pageSetup.orientation")}</div><div className="flex gap-2">{(["portrait", "landscape"] as const).map((o) => <button key={o} onClick={() => setV({ ...v, orientation: o })} className={`flex-1 py-2 rounded-xl border ${v.orientation === o ? "border-brand-500 bg-brand-50" : "border-gray-200"}`}>{t(`editor.pageSetup.${o}`)}</button>)}</div></div>
        <div><div className="text-xs font-medium text-gray-500 mb-1">{t("editor.pageSetup.paperSize")}</div><div className="flex gap-2">{(["A4", "Letter"] as const).map((o) => <button key={o} onClick={() => setV({ ...v, size: o })} className={`flex-1 py-2 rounded-xl border ${v.size === o ? "border-brand-500 bg-brand-50" : "border-gray-200"}`}>{o}</button>)}</div></div>
        <label className="block"><div className="text-xs font-medium text-gray-500 mb-1">{t("editor.pageSetup.margins")}</div><input type="number" step={0.1} min={1} max={5} value={v.margin} onChange={(e) => setV({ ...v, margin: Number(e.target.value) })} className="input-field !py-1.5" /></label>
        <label className="block"><div className="text-xs font-medium text-gray-500 mb-1">{t("editor.pageSetup.lineSpacing")}</div><select value={v.lineSpacing} onChange={(e) => setV({ ...v, lineSpacing: Number(e.target.value) })} className="input-field !py-1.5">{[1, 1.15, 1.5, 2].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      </div>
    </Modal>
  );
}

export function WordCountDialog({ open, onClose, stats, thesis }: { open: boolean; onClose: () => void; stats: { words: number; chars: number; charsNoSpaces: number; paragraphs: number; headings: number; pages: number; readingMin: number }; thesis: ThesisDoc }) {
  const t = useT();
  const fmt = useFormat();
  const total = Math.max(1, thesis.provenance.human + thesis.provenance.paste + thesis.provenance.ai);
  return (
    <Modal open={open} onClose={onClose} title={t("editor.details.title")} size="sm" footer={<button onClick={onClose} className="btn-primary !py-2 !px-4 text-sm">{t("common.done")}</button>}>
      <table className="w-full text-sm">
        <tbody>
          {[[t("editor.details.pages"), stats.pages], [t("editor.details.words"), fmt.number(stats.words)], [t("editor.details.characters"), fmt.number(stats.chars)], [t("editor.details.charactersNoSpaces"), fmt.number(stats.charsNoSpaces)], [t("editor.details.paragraphs"), stats.paragraphs], [t("editor.details.headings"), stats.headings], [t("editor.details.readingTime"), t("common.minutes", { n: stats.readingMin })], [t("editor.details.target"), t("editor.details.targetValue", { target: fmt.number(thesis.targetWords), pct: Math.min(100, Math.round((stats.words / thesis.targetWords) * 100)) })], [t("editor.details.aiShare"), `${Math.round((thesis.provenance.ai / total) * 100)}%`], [t("editor.details.pastedShare"), `${Math.round((thesis.provenance.paste / total) * 100)}%`]].map(([k, v]) => (
            <tr key={String(k)} className="border-b border-gray-50"><td className="py-1.5 text-gray-500">{k}</td><td className="py-1.5 text-right font-medium">{v}</td></tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

export function ShareDialog({ open, onClose, thesis }: { open: boolean; onClose: () => void; thesis: ThesisDoc }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}/admin/theses/${thesis.id}` : "";
  return (
    <Modal open={open} onClose={onClose} title={t("editor.share.title")} size="sm" footer={<button onClick={onClose} className="btn-primary !py-2 !px-4 text-sm">{t("common.done")}</button>}>
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
          <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold">{thesis.professorName.split(" ").map((n) => n[0]).join("").slice(0, 2)}</div>
          <div className="flex-1"><div className="font-medium">{thesis.professorName}</div><div className="text-xs text-gray-500">{t("editor.share.advisorRole")}</div></div>
          <span className="badge-success">{t("editor.share.shared")}</span>
        </div>
        <p className="text-xs text-gray-500">{t("editor.share.body")}</p>
        <div className="flex gap-2">
          <input readOnly value={link} className="input-field !py-2 text-xs" />
          <button onClick={() => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="btn-outline !py-2 !px-3 text-xs whitespace-nowrap">{copied ? t("common.copied") : t("editor.share.copyLink")}</button>
        </div>
      </div>
    </Modal>
  );
}

export function TextPromptDialog({ open, onClose, title, label, initial = "", onSubmit, submitLabel }: { open: boolean; onClose: () => void; title: string; label?: string; initial?: string; onSubmit: (v: string) => void; submitLabel?: string }) {
  const t = useT();
  const [v, setV] = useState(initial);
  useEffect(() => setV(initial), [initial, open]);
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={<><button onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">{t("common.cancel")}</button><button disabled={!v.trim()} onClick={() => { onSubmit(v.trim()); onClose(); }} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40">{submitLabel || t("editor.ok")}</button></>}>
      {label && <div className="text-xs text-gray-500 mb-1">{label}</div>}
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && v.trim()) { onSubmit(v.trim()); onClose(); } }} className="input-field" />
    </Modal>
  );
}

export function ConfirmDialog({ open, onClose, title, body, onConfirm, confirmLabel, danger }: { open: boolean; onClose: () => void; title: string; body: React.ReactNode; onConfirm: () => void; confirmLabel?: string; danger?: boolean }) {
  const t = useT();
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={<><button onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">{t("common.cancel")}</button><button onClick={() => { onConfirm(); onClose(); }} className={`${danger ? "bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold" : "btn-primary"} !py-2 !px-4 text-sm`}>{confirmLabel || t("common.confirm")}</button></>}>
      <div className="text-sm text-gray-600">{body}</div>
    </Modal>
  );
}

export type PasteDecision = "own" | "source" | "ai";

export interface PasteMatchInfo {
  kind: "assistant" | "source";
  provider?: string;
  sourceId?: string;
  title?: string;
  authors?: string;
  year?: string;
  page?: number;
  model?: string;
  mode?: string;
  interactionId?: string;
  share?: number;
  at?: string;
}

/**
 * Where does the pasted text come from? "Continue" declares it; closing the dialog (X, Escape, backdrop) inserts
 * the text as pasted without attribution, which the ledger shows and may open a notice.
 */
export function PasteAttributionDialog({ open, words, matched, onDecide, onDismiss }: { open: boolean; words: number; matched: PasteMatchInfo | null; onDecide: (d: PasteDecision, label?: string) => void; onDismiss: () => void }) {
  const t = useT();
  const fmt = useFormat();
  const [label, setLabel] = useState("");
  const [choice, setChoice] = useState<PasteDecision>(matched ? "ai" : "own");
  const assistant = matched?.kind === "assistant";
  const fromSource = matched?.kind === "source";
  const share = matched?.share !== undefined && matched.share < 1 ? t("editor.paste.shareSome", { pct: Math.round(matched.share * 100) }) : t("editor.paste.shareAll");
  const defaultLabel = assistant ? (matched?.mode === "copilot" ? t("editor.label.copilot") : t("editor.label.assistant")) : fromSource ? `${matched?.authors || matched?.title || t("editor.source")}${matched?.year ? ` (${matched.year})` : ""}${matched?.page ? `, p. ${matched.page}` : ""}` : "";
  useEffect(() => { setChoice(assistant ? "ai" : fromSource ? "source" : "own"); setLabel(defaultLabel); }, [matched, open, defaultLabel, assistant, fromSource]);
  return (
    <Modal open={open} onClose={onDismiss} title={t("editor.paste.title")} size="sm" footer={<button onClick={() => onDecide(choice, label)} className="btn-primary !py-2 !px-4 text-sm">{t("common.continue")}</button>}>
      {assistant && (
        <div className="mb-3 p-3 rounded-xl bg-purple-50 border border-purple-100 text-xs text-purple-800">
          {richText(t("editor.paste.assistantNotice", { aiAssisted: t("glossary.aiAssisted") }), { share, label: <strong>{defaultLabel}</strong>, model: matched?.model ? ` (${matched.model})` : "", at: matched?.at ? `, ${fmt.dateTime(matched.at)}` : "" })}
        </div>
      )}
      {fromSource && (
        <div className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-800">
          {richText(t("editor.paste.sourceNotice"), { share, title: <strong>{matched?.title}</strong> })}
        </div>
      )}
      <p className="text-sm text-gray-600 mb-3">{richText(t("editor.paste.intro"), { words: <strong>{t("common.words", { n: words })}</strong> })}</p>
      <div className="space-y-2">
        {([["own", t("editor.paste.own"), t("editor.paste.ownHelp")], ["source", t("editor.paste.source"), t("editor.paste.sourceHelp")], ["ai", t("editor.paste.ai"), t("editor.paste.aiHelp", { aiAssisted: t("glossary.aiAssisted") })]] as [PasteDecision, string, string][]).map(([k, t, d]) => (
          <label key={k} className={`flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer ${choice === k ? "border-brand-500 bg-brand-50" : "border-gray-200"} ${assistant && k !== "ai" ? "opacity-50" : ""}`}>
            <input type="radio" name="paste" checked={choice === k} disabled={assistant && k !== "ai"} onChange={() => setChoice(k)} className="mt-1" />
            <div><div className="text-sm font-medium">{t}</div><div className="text-xs text-gray-500">{d}</div></div>
          </label>
        ))}
        {choice !== "own" && <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={choice === "ai" ? t("editor.paste.toolPlaceholder") : t("editor.paste.sourcePlaceholder")} className="input-field !py-2 text-sm" />}
      </div>
      <p className="mt-3 text-[12px] text-gray-500">{t("editor.paste.dismissHint", { quotedOrPasted: t("glossary.quotedOrPasted") })}</p>
    </Modal>
  );
}

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const rows = [["Ctrl+B / I / U", t("editor.shortcuts.formatting")], ["Ctrl+Shift+X", t("editor.shortcuts.strike")], ["Ctrl+Alt+0…4", t("editor.shortcuts.headings")], ["Ctrl+Shift+7 / 8 / 9", t("editor.shortcuts.lists")], ["Tab / Shift+Tab", t("editor.shortcuts.indent")], ["Ctrl+K", t("editor.shortcuts.link")], ["Ctrl+Alt+M", t("editor.shortcuts.comment")], ["Ctrl+Alt+E", t("editor.shortcuts.cite")], ["Ctrl+H", t("editor.shortcuts.find")], ["Ctrl+S", t("editor.shortcuts.save")], ["Ctrl+P", t("editor.shortcuts.print")], ["Ctrl+Enter", t("editor.shortcuts.pageBreak")], ["Ctrl+Shift+C", t("editor.shortcuts.wordCount")], ["Ctrl+/", t("editor.shortcuts.thisDialog")], ["Ctrl+Z / Y", t("editor.shortcuts.undoRedo")]];
  return (
    <Modal open={open} onClose={onClose} title={t("editor.shortcuts.title")} size="sm" footer={<button onClick={onClose} className="btn-primary !py-2 !px-4 text-sm">{t("common.close")}</button>}>
      <table className="w-full text-sm"><tbody>{rows.map(([k, v]) => <tr key={k} className="border-b border-gray-50"><td className="py-1.5"><kbd className="text-xs bg-gray-100 rounded px-1.5 py-0.5">{k}</kbd></td><td className="py-1.5 text-gray-600 text-right">{v}</td></tr>)}</tbody></table>
    </Modal>
  );
}

export function VersionPreviewDialog({ open, onClose, html, label, onRestore, canRestore }: { open: boolean; onClose: () => void; html: string; label: string; onRestore: () => void; canRestore: boolean }) {
  const t = useT();
  return (
    <Modal open={open} onClose={onClose} title={t("editor.preview.title", { label })} size="xl" footer={<><button onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">{t("common.close")}</button>{canRestore && <button onClick={() => { onRestore(); onClose(); }} className="btn-primary !py-2 !px-4 text-sm">{t("editor.preview.restore")}</button>}</>}>
      <div className="docs-page !min-h-0 !shadow-none !p-6 border border-gray-100"><div className="ProseMirror !min-h-0" dangerouslySetInnerHTML={{ __html: html }} /></div>
    </Modal>
  );
}
