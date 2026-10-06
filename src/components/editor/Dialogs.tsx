"use client";

import { useEffect, useState } from "react";
import { Modal } from "../ui";
import type { ThesisDoc } from "./types";

export function LinkDialog({ open, onClose, initial, onSubmit, onRemove }: { open: boolean; onClose: () => void; initial: string; onSubmit: (url: string) => void; onRemove: () => void }) {
  const [url, setUrl] = useState(initial);
  useEffect(() => setUrl(initial), [initial, open]);
  return (
    <Modal open={open} onClose={onClose} title="Link" size="sm" footer={<><button onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">Cancel</button>{initial && <button onClick={() => { onRemove(); onClose(); }} className="btn-outline !py-2 !px-4 text-sm text-red-600">Remove</button>}<button onClick={() => { onSubmit(url.trim()); onClose(); }} disabled={!url.trim()} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40">Apply</button></>}>
      <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && url.trim()) { onSubmit(url.trim()); onClose(); } }} placeholder="https://…" className="input-field" />
    </Modal>
  );
}

export function ImageDialog({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (src: string, alt: string) => void }) {
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [preview, setPreview] = useState("");
  const file = (f: File) => {
    if (f.size > 2 * 1024 * 1024) return alert("Please choose an image under 2 MB.");
    const r = new FileReader();
    r.onload = () => { setPreview(String(r.result)); setUrl(String(r.result)); };
    r.readAsDataURL(f);
  };
  return (
    <Modal open={open} onClose={onClose} title="Insert image" size="md" footer={<><button onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">Cancel</button><button disabled={!url} onClick={() => { onSubmit(url, alt); setUrl(""); setAlt(""); setPreview(""); onClose(); }} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40">Insert</button></>}>
      <div className="space-y-3">
        <label className="block border-2 border-dashed border-gray-200 rounded-xl p-6 text-center text-sm text-gray-500 hover:border-brand-300 cursor-pointer" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) file(f); }}>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && file(e.target.files[0])} />
          {preview ? <img src={preview} alt="" className="max-h-40 mx-auto rounded" /> : "Drop an image here or click to upload (PNG, JPG, GIF)"}
        </label>
        <div className="text-xs text-gray-400 text-center">or</div>
        <input value={url.startsWith("data:") ? "" : url} onChange={(e) => { setUrl(e.target.value); setPreview(""); }} placeholder="Image URL (https://…)" className="input-field" />
        <input value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Caption / alt text (Figure 1. …)" className="input-field" />
      </div>
    </Modal>
  );
}

export function TableDialog({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (rows: number, cols: number, header: boolean) => void }) {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [header, setHeader] = useState(true);
  const [hover, setHover] = useState<[number, number]>([0, 0]);
  return (
    <Modal open={open} onClose={onClose} title="Insert table" size="sm" footer={<><button onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">Cancel</button><button onClick={() => { onSubmit(rows, cols, header); onClose(); }} className="btn-primary !py-2 !px-4 text-sm">Insert {rows}×{cols}</button></>}>
      <div className="grid gap-1 mb-3" style={{ gridTemplateColumns: "repeat(8, 1fr)" }} onMouseLeave={() => setHover([0, 0])}>
        {Array.from({ length: 48 }).map((_, i) => {
          const r = Math.floor(i / 8) + 1, c = (i % 8) + 1;
          const on = r <= (hover[0] || rows) && c <= (hover[1] || cols);
          return <button key={i} onMouseEnter={() => setHover([r, c])} onClick={() => { setRows(r); setCols(c); }} className={`h-6 rounded border ${on ? "bg-brand-200 border-brand-400" : "bg-gray-50 border-gray-200"}`} />;
        })}
      </div>
      <div className="flex items-center gap-3 text-sm">
        <label className="flex items-center gap-1">Rows <input type="number" min={1} max={30} value={rows} onChange={(e) => setRows(Number(e.target.value))} className="input-field !py-1 !w-16" /></label>
        <label className="flex items-center gap-1">Columns <input type="number" min={1} max={12} value={cols} onChange={(e) => setCols(Number(e.target.value))} className="input-field !py-1 !w-16" /></label>
      </div>
      <label className="flex items-center gap-2 text-sm mt-3"><input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} />Header row</label>
    </Modal>
  );
}

export function PageSetupDialog({ open, onClose, value, onSubmit }: { open: boolean; onClose: () => void; value: ThesisDoc["pageSetup"]; onSubmit: (v: ThesisDoc["pageSetup"]) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value, open]);
  return (
    <Modal open={open} onClose={onClose} title="Page setup" size="sm" footer={<><button onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">Cancel</button><button onClick={() => { onSubmit(v); onClose(); }} className="btn-primary !py-2 !px-4 text-sm">OK</button></>}>
      <div className="space-y-4 text-sm">
        <div><div className="text-xs font-medium text-gray-500 mb-1">Orientation</div><div className="flex gap-2">{(["portrait", "landscape"] as const).map((o) => <button key={o} onClick={() => setV({ ...v, orientation: o })} className={`flex-1 py-2 rounded-xl border capitalize ${v.orientation === o ? "border-brand-500 bg-brand-50" : "border-gray-200"}`}>{o}</button>)}</div></div>
        <div><div className="text-xs font-medium text-gray-500 mb-1">Paper size</div><div className="flex gap-2">{(["A4", "Letter"] as const).map((o) => <button key={o} onClick={() => setV({ ...v, size: o })} className={`flex-1 py-2 rounded-xl border ${v.size === o ? "border-brand-500 bg-brand-50" : "border-gray-200"}`}>{o}</button>)}</div></div>
        <label className="block"><div className="text-xs font-medium text-gray-500 mb-1">Margins (cm)</div><input type="number" step={0.1} min={1} max={5} value={v.margin} onChange={(e) => setV({ ...v, margin: Number(e.target.value) })} className="input-field !py-1.5" /></label>
        <label className="block"><div className="text-xs font-medium text-gray-500 mb-1">Default line spacing</div><select value={v.lineSpacing} onChange={(e) => setV({ ...v, lineSpacing: Number(e.target.value) })} className="input-field !py-1.5">{[1, 1.15, 1.5, 2].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      </div>
    </Modal>
  );
}

export function WordCountDialog({ open, onClose, stats, thesis }: { open: boolean; onClose: () => void; stats: { words: number; chars: number; charsNoSpaces: number; paragraphs: number; headings: number; pages: number; readingMin: number }; thesis: ThesisDoc }) {
  const total = Math.max(1, thesis.provenance.human + thesis.provenance.paste + thesis.provenance.ai);
  return (
    <Modal open={open} onClose={onClose} title="Document details" size="sm" footer={<button onClick={onClose} className="btn-primary !py-2 !px-4 text-sm">Done</button>}>
      <table className="w-full text-sm">
        <tbody>
          {[["Pages (approx.)", stats.pages], ["Words", stats.words.toLocaleString()], ["Characters", stats.chars.toLocaleString()], ["Characters excluding spaces", stats.charsNoSpaces.toLocaleString()], ["Paragraphs", stats.paragraphs], ["Headings", stats.headings], ["Reading time", `${stats.readingMin} min`], ["Target", `${thesis.targetWords.toLocaleString()} words (${Math.min(100, Math.round((stats.words / thesis.targetWords) * 100))}%)`], ["AI-assisted share", `${Math.round((thesis.provenance.ai / total) * 100)}%`], ["Pasted share", `${Math.round((thesis.provenance.paste / total) * 100)}%`]].map(([k, v]) => (
            <tr key={String(k)} className="border-b border-gray-50"><td className="py-1.5 text-gray-500">{k}</td><td className="py-1.5 text-right font-medium">{v}</td></tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

export function ShareDialog({ open, onClose, thesis }: { open: boolean; onClose: () => void; thesis: ThesisDoc }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}/admin/theses/${thesis.id}` : "";
  return (
    <Modal open={open} onClose={onClose} title="Share" size="sm" footer={<button onClick={onClose} className="btn-primary !py-2 !px-4 text-sm">Done</button>}>
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
          <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold">{thesis.professorName.split(" ").map((n) => n[0]).join("").slice(0, 2)}</div>
          <div className="flex-1"><div className="font-medium">{thesis.professorName}</div><div className="text-xs text-gray-500">Advisor · can comment and review</div></div>
          <span className="badge-success">Shared</span>
        </div>
        <p className="text-xs text-gray-500">Your advisor sees your document, your comments, the provenance report and your writing sessions, exactly as agreed in your monitoring choices. Reviewers cannot edit your text.</p>
        <div className="flex gap-2">
          <input readOnly value={link} className="input-field !py-2 text-xs" />
          <button onClick={() => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="btn-outline !py-2 !px-3 text-xs whitespace-nowrap">{copied ? "Copied" : "Copy link"}</button>
        </div>
      </div>
    </Modal>
  );
}

export function TextPromptDialog({ open, onClose, title, label, initial = "", onSubmit, submitLabel = "OK" }: { open: boolean; onClose: () => void; title: string; label?: string; initial?: string; onSubmit: (v: string) => void; submitLabel?: string }) {
  const [v, setV] = useState(initial);
  useEffect(() => setV(initial), [initial, open]);
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={<><button onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">Cancel</button><button disabled={!v.trim()} onClick={() => { onSubmit(v.trim()); onClose(); }} className="btn-primary !py-2 !px-4 text-sm disabled:opacity-40">{submitLabel}</button></>}>
      {label && <div className="text-xs text-gray-500 mb-1">{label}</div>}
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && v.trim()) { onSubmit(v.trim()); onClose(); } }} className="input-field" />
    </Modal>
  );
}

export function ConfirmDialog({ open, onClose, title, body, onConfirm, confirmLabel = "Confirm", danger }: { open: boolean; onClose: () => void; title: string; body: React.ReactNode; onConfirm: () => void; confirmLabel?: string; danger?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={<><button onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">Cancel</button><button onClick={() => { onConfirm(); onClose(); }} className={`${danger ? "bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold" : "btn-primary"} !py-2 !px-4 text-sm`}>{confirmLabel}</button></>}>
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

export function PasteAttributionDialog({ open, words, matched, onDecide }: { open: boolean; words: number; matched: PasteMatchInfo | null; onDecide: (d: PasteDecision, label?: string) => void }) {
  const [label, setLabel] = useState("");
  const [choice, setChoice] = useState<PasteDecision>(matched ? "ai" : "own");
  const assistant = matched?.kind === "assistant";
  const fromSource = matched?.kind === "source";
  const defaultLabel = assistant ? (matched?.mode === "copilot" ? "Research copilot" : "Thesisfic assistant") : fromSource ? `${matched?.authors || matched?.title || "Source"}${matched?.year ? ` (${matched.year})` : ""}${matched?.page ? `, p. ${matched.page}` : ""}` : "";
  useEffect(() => { setChoice(assistant ? "ai" : fromSource ? "source" : "own"); setLabel(defaultLabel); }, [matched, open, defaultLabel, assistant, fromSource]);
  return (
    <Modal open={open} onClose={() => onDecide(choice, label)} title="Where does this text come from?" size="sm" footer={<button onClick={() => onDecide(choice, label)} className="btn-primary !py-2 !px-4 text-sm">Continue</button>}>
      {assistant && (
        <div className="mb-3 p-3 rounded-xl bg-purple-50 border border-purple-100 text-xs text-purple-800">
          {matched?.share !== undefined && matched.share < 1 ? `About ${Math.round(matched.share * 100)}% of` : "All of"} this text matches an answer from the <strong>{defaultLabel}</strong>{matched?.model ? ` (${matched.model})` : ""}{matched?.at ? `, ${new Date(matched.at).toLocaleString()}` : ""}. It will be marked as AI-assisted and linked to that conversation.
        </div>
      )}
      {fromSource && (
        <div className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-800">
          {matched?.share !== undefined && matched.share < 1 ? `About ${Math.round(matched.share * 100)}% of` : "All of"} this text matches <strong>{matched?.title}</strong> in your source library. It will be marked as quoted from that source; remember to cite it.
        </div>
      )}
      <p className="text-sm text-gray-600 mb-3">You pasted <strong>{words} words</strong>. Attribution keeps your integrity profile honest and is visible to your advisor.</p>
      <div className="space-y-2">
        {([["own", "My own writing (from notes or another file)", "Counted as yours."], ["source", "Quoted or adapted from a source", "Marked as pasted; remember to cite it."], ["ai", "From an AI tool (ChatGPT, Claude, Gemini…)", "Marked as AI-assisted and counted toward your AI limit."]] as [PasteDecision, string, string][]).map(([k, t, d]) => (
          <label key={k} className={`flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer ${choice === k ? "border-brand-500 bg-brand-50" : "border-gray-200"} ${assistant && k !== "ai" ? "opacity-50" : ""}`}>
            <input type="radio" name="paste" checked={choice === k} disabled={assistant && k !== "ai"} onChange={() => setChoice(k)} className="mt-1" />
            <div><div className="text-sm font-medium">{t}</div><div className="text-xs text-gray-500">{d}</div></div>
          </label>
        ))}
        {choice !== "own" && <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={choice === "ai" ? "Which tool? (e.g. ChatGPT)" : "Source (e.g. Smith 2021, p. 4)"} className="input-field !py-2 text-sm" />}
      </div>
    </Modal>
  );
}

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const rows = [["Ctrl+B / I / U", "Bold / Italic / Underline"], ["Ctrl+Shift+X", "Strikethrough"], ["Ctrl+Alt+0…4", "Normal text / Headings"], ["Ctrl+Shift+7 / 8 / 9", "Numbered / bulleted / checklist"], ["Tab / Shift+Tab", "Indent / outdent"], ["Ctrl+K", "Link"], ["Ctrl+Alt+M", "Comment"], ["Ctrl+Alt+E", "Cite a source"], ["Ctrl+H", "Find & replace"], ["Ctrl+S", "Save"], ["Ctrl+P", "Print"], ["Ctrl+Enter", "Page break"], ["Ctrl+Shift+C", "Word count"], ["Ctrl+/", "This dialog"], ["Ctrl+Z / Y", "Undo / redo"]];
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" size="sm" footer={<button onClick={onClose} className="btn-primary !py-2 !px-4 text-sm">Close</button>}>
      <table className="w-full text-sm"><tbody>{rows.map(([k, v]) => <tr key={k} className="border-b border-gray-50"><td className="py-1.5"><kbd className="text-xs bg-gray-100 rounded px-1.5 py-0.5">{k}</kbd></td><td className="py-1.5 text-gray-600 text-right">{v}</td></tr>)}</tbody></table>
    </Modal>
  );
}

export function VersionPreviewDialog({ open, onClose, html, label, onRestore, canRestore }: { open: boolean; onClose: () => void; html: string; label: string; onRestore: () => void; canRestore: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={`Preview: ${label}`} size="xl" footer={<><button onClick={onClose} className="btn-outline !py-2 !px-4 text-sm">Close</button>{canRestore && <button onClick={() => { onRestore(); onClose(); }} className="btn-primary !py-2 !px-4 text-sm">Restore this version</button>}</>}>
      <div className="docs-page !min-h-0 !shadow-none !p-6 border border-gray-100"><div className="ProseMirror !min-h-0" dangerouslySetInnerHTML={{ __html: html }} /></div>
    </Modal>
  );
}
