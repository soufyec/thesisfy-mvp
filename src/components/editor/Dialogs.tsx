"use client";

import { useEffect, useState } from "react";
import { Modal, useDeadlineLabel } from "../ui";
import { deadlineState } from "@/lib/deadline";
import { useFormat, useT } from "@/lib/i18n/client";
import { Bookmark, Heading } from "lucide-react";
import { richText, type ThesisDoc } from "./types";
import type { AnchorItem } from "./anchors";
import { PAGE_NUMBER_OPTIONS } from "./headerFooter";
import { prepareImageFile } from "./image";

export function LinkDialog({ open, onClose, initial, onSubmit, onRemove, anchors = [], onPickAnchor }: { open: boolean; onClose: () => void; initial: string; onSubmit: (url: string) => void; onRemove: () => void; anchors?: AnchorItem[]; onPickAnchor?: (a: AnchorItem) => void }) {
  const t = useT();
  const [url, setUrl] = useState(initial);
  const [tab, setTab] = useState<"web" | "doc">("web");
  useEffect(() => {
    setUrl(initial);
    setTab(initial.startsWith("#") ? "doc" : "web");
  }, [initial, open]);
  const canPick = !!onPickAnchor;
  return (
    <Modal open={open} onClose={onClose} title={t("editor.link.title")} size="sm" footer={<><button onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">{t("common.cancel")}</button>{initial && <button onClick={() => { onRemove(); onClose(); }} className="btn-outline !py-2 !px-4 text-sm text-red-600">{t("common.remove")}</button>}{tab === "web" && <button onClick={() => { onSubmit(url.trim()); onClose(); }} disabled={!url.trim()} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40">{t("editor.apply")}</button>}</>}>
      {canPick && (
        <div className="flex gap-1 mb-3 p-0.5 bg-gray-100 rounded-lg text-[13px]" role="tablist" aria-label={t("editor.link.title")}>
          {(["web", "doc"] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`flex-1 py-1.5 rounded-md ${tab === k ? "bg-white shadow-sm font-medium text-gray-900" : "text-gray-500"}`}>
              {t(k === "web" ? "editor.link.tabWeb" : "editor.link.tabDocument")}
            </button>
          ))}
        </div>
      )}
      {tab === "web" || !canPick ? (
        <>
          <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && url.trim()) { onSubmit(url.trim()); onClose(); } }} placeholder="https://…" aria-label={t("editor.link.title")} className="input-field" />
          <p className="mt-2 text-xs text-gray-500">{t("editor.link.openHint")}</p>
        </>
      ) : (
        <div className="max-h-[260px] overflow-y-auto -mx-1" role="listbox" aria-label={t("editor.link.tabDocument")}>
          {anchors.length === 0 && <p className="px-2 py-4 text-sm text-gray-500">{t("editor.link.noAnchors")}</p>}
          {anchors.map((a) => (
            <button key={`${a.kind}-${a.pos}`} role="option" aria-selected={false} onClick={() => { onPickAnchor?.(a); onClose(); }} className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-sm" style={a.kind === "heading" ? { paddingLeft: `${0.5 + Math.max(0, (a.level || 1) - 1) * 0.75}rem` } : undefined}>
              {a.kind === "heading" ? <Heading className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" aria-hidden="true" /> : <Bookmark className="w-3.5 h-3.5 text-brand-600 flex-shrink-0" aria-hidden="true" />}
              <span className="truncate">{a.label}</span>
              <span className="ml-auto text-[11px] text-gray-400 flex-shrink-0">{a.kind === "heading" ? t("editor.link.heading") : t("editor.link.bookmark")}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function ImageDialog({ open, onClose, onSubmit, replacing = false }: { open: boolean; onClose: () => void; onSubmit: (src: string, alt: string, caption: string) => void; replacing?: boolean }) {
  const t = useT();
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setUrl(""); setAlt(""); setCaption(""); setPreview(""); setError(""); } }, [open]);
  const file = async (f: File) => {
    setError("");
    const res = await prepareImageFile(f);
    if (!res.ok) return setError(res.reason === "size" ? t("editor.image.tooLarge") : res.reason === "type" ? t("editor.image.notAnImage", { name: f.name }) : t("editor.image.readError", { name: f.name }));
    setPreview(res.src);
    setUrl(res.src);
  };
  return (
    <Modal open={open} onClose={onClose} title={replacing ? t("editor.image.replaceTitle") : t("editor.image.title")} size="md" footer={<><button onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">{t("common.cancel")}</button><button disabled={!url} onClick={() => { onSubmit(url, alt.trim(), caption.trim()); setUrl(""); setAlt(""); setCaption(""); setPreview(""); onClose(); }} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40">{replacing ? t("editor.image.replaceConfirm") : t("editor.insert")}</button></>}>
      <div className="space-y-3">
        <label className="block border-2 border-dashed border-gray-200 rounded-xl p-6 text-center text-sm text-gray-500 hover:border-brand-300 cursor-pointer" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) file(f); }}>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && file(e.target.files[0])} />
          {preview ? <img src={preview} alt="" className="max-h-40 mx-auto rounded" /> : t("editor.image.drop")}
        </label>
        <div className="text-xs text-gray-400 text-center">{t("editor.image.or")}</div>
        <input value={url.startsWith("data:") ? "" : url} onChange={(e) => { setUrl(e.target.value); setPreview(""); }} placeholder={t("editor.image.urlPlaceholder")} className="input-field" />
        {error && <div className="text-xs text-red-600" role="alert">{error}</div>}
        <input value={alt} onChange={(e) => setAlt(e.target.value)} placeholder={t("editor.image.altPlaceholder")} aria-label={t("editor.image.altText")} className="input-field" />
        <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={t("editor.image.dialogCaption")} aria-label={t("editor.image.captionLabel")} className="input-field" />
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
  // Reset only when the dialog opens: an autosave that lands while it is open must not wipe what is being typed.
  useEffect(() => {
    if (open) setV(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title={t("editor.pageSetup.title")} size="sm" footer={<><button onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">{t("common.cancel")}</button><button onClick={() => { onSubmit(v); onClose(); }} className="btn-primary !py-2 !px-4 text-sm">{t("editor.ok")}</button></>}>
      <div className="space-y-4 text-sm">
        <div><div className="text-xs font-medium text-gray-500 mb-1">{t("editor.pageSetup.orientation")}</div><div className="flex gap-2">{(["portrait", "landscape"] as const).map((o) => <button key={o} onClick={() => setV({ ...v, orientation: o })} className={`flex-1 py-2 rounded-xl border ${v.orientation === o ? "border-brand-500 bg-brand-50" : "border-gray-200"}`}>{t(`editor.pageSetup.${o}`)}</button>)}</div></div>
        <div><div className="text-xs font-medium text-gray-500 mb-1">{t("editor.pageSetup.paperSize")}</div><div className="flex gap-2">{(["A4", "Letter"] as const).map((o) => <button key={o} onClick={() => setV({ ...v, size: o })} className={`flex-1 py-2 rounded-xl border ${v.size === o ? "border-brand-500 bg-brand-50" : "border-gray-200"}`}>{o}</button>)}</div></div>
        <label className="block"><div className="text-xs font-medium text-gray-500 mb-1">{t("editor.pageSetup.margins")}</div><input type="number" step={0.1} min={1} max={5} value={v.margin} onChange={(e) => setV({ ...v, margin: Number(e.target.value) })} className="input-field !py-1.5" /></label>
        <label className="block"><div className="text-xs font-medium text-gray-500 mb-1">{t("editor.pageSetup.lineSpacing")}</div><select value={v.lineSpacing} onChange={(e) => setV({ ...v, lineSpacing: Number(e.target.value) })} className="input-field !py-1.5">{[1, 1.15, 1.5, 2].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <fieldset className="border-t border-gray-100 pt-3 space-y-3">
          <legend className="sr-only">{t("editor.pageSetup.hfTitle")}</legend>
          <div className="text-xs font-semibold text-gray-700">{t("editor.pageSetup.hfTitle")}</div>
          <label className="block"><div className="text-xs font-medium text-gray-500 mb-1">{t("editor.pageSetup.headerText")}</div><input maxLength={200} value={v.headerText || ""} onChange={(e) => setV({ ...v, headerText: e.target.value })} className="input-field !py-1.5" /></label>
          <label className="block"><div className="text-xs font-medium text-gray-500 mb-1">{t("editor.pageSetup.footerText")}</div><input maxLength={200} value={v.footerText || ""} onChange={(e) => setV({ ...v, footerText: e.target.value })} placeholder={t("editor.pageSetup.footerPlaceholder")} className="input-field !py-1.5" /></label>
          <label className="block"><div className="text-xs font-medium text-gray-500 mb-1">{t("editor.pageSetup.pageNumbers")}</div><select value={v.pageNumbers || "none"} onChange={(e) => setV({ ...v, pageNumbers: e.target.value as NonNullable<ThesisDoc["pageSetup"]["pageNumbers"]> })} className="input-field !py-1.5">{PAGE_NUMBER_OPTIONS.map((o) => <option key={o} value={o}>{t(`editor.pageSetup.num.${o}`)}</option>)}</select></label>
          <p className="text-xs text-gray-500">{t("editor.pageSetup.hfHelp")}</p>
        </fieldset>
      </div>
    </Modal>
  );
}

export function WordCountDialog({ open, onClose, stats, thesis }: { open: boolean; onClose: () => void; stats: { words: number; chars: number; charsNoSpaces: number; paragraphs: number; headings: number; pages: number; readingMin: number }; thesis: ThesisDoc }) {
  const t = useT();
  const fmt = useFormat();
  const total = Math.max(1, thesis.provenance.human + thesis.provenance.paste + thesis.provenance.ai);
  const deadlineLabel = useDeadlineLabel();
  const dl = deadlineState(thesis.deadline, thesis.wordCount, thesis.targetWords);
  const deadlineRows: [string, React.ReactNode][] = dl
    ? [
        [t("deadline.title"), `${fmt.date(thesis.deadline as string)} · ${deadlineLabel(dl)}`],
        [t("deadline.paceLabel"), dl.wordsLeft === 0 ? t("deadline.paceDone") : t("deadline.paceValue", { n: fmt.number(dl.perDay) })],
      ]
    : [[t("deadline.title"), t("deadline.notSet")]];
  return (
    <Modal open={open} onClose={onClose} title={t("editor.details.title")} size="sm" footer={<button onClick={onClose} className="btn-primary !py-2 !px-4 text-sm">{t("common.done")}</button>}>
      <table className="w-full text-sm">
        <tbody>
          {[[t("editor.details.pages"), stats.pages], [t("editor.details.words"), fmt.number(stats.words)], [t("editor.details.characters"), fmt.number(stats.chars)], [t("editor.details.charactersNoSpaces"), fmt.number(stats.charsNoSpaces)], [t("editor.details.paragraphs"), stats.paragraphs], [t("editor.details.headings"), stats.headings], [t("editor.details.readingTime"), t("common.minutes", { n: stats.readingMin })], [t("editor.details.target"), t("editor.details.targetValue", { target: fmt.number(thesis.targetWords), pct: Math.min(100, Math.round((stats.words / thesis.targetWords) * 100)) })], [t("editor.details.aiShare"), `${Math.round((thesis.provenance.ai / total) * 100)}%`], [t("editor.details.pastedShare"), `${Math.round((thesis.provenance.paste / total) * 100)}%`], ...deadlineRows].map(([k, v]) => (
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
  const rows = [["Ctrl+B / I / U", t("editor.shortcuts.formatting")], ["Ctrl+Shift+X", t("editor.shortcuts.strike")], ["Ctrl+Alt+0…4", t("editor.shortcuts.headings")], ["Ctrl+Shift+7 / 8 / 9", t("editor.shortcuts.lists")], ["Tab / Shift+Tab", t("editor.shortcuts.indent")], ["Ctrl+K", t("editor.shortcuts.link")], ["Ctrl+Alt+M", t("editor.shortcuts.comment")], ["Ctrl+Alt+E", t("editor.shortcuts.cite")], ["Ctrl+H", t("editor.shortcuts.find")], ["Ctrl+S", t("editor.shortcuts.save")], ["Ctrl+P", t("editor.shortcuts.print")], ["Ctrl+Enter", t("editor.shortcuts.pageBreak")], ["Ctrl+Alt+B", t("editor.shortcuts.bookmark")], ["Shift+F3", t("editor.shortcuts.changeCase")], ["Tab (table)", t("editor.shortcuts.tableCells")], ["Ctrl+click", t("editor.shortcuts.openLink")], ["Ctrl+Shift+C", t("editor.shortcuts.wordCount")], ["Ctrl+/", t("editor.shortcuts.thisDialog")], ["Ctrl+Z / Y", t("editor.shortcuts.undoRedo")]];
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
