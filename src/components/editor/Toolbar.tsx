"use client";

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, BookMarked, CheckSquare, ChevronDown, Highlighter, Image as ImageIcon, Indent, Italic, Link2, List, ListOrdered, MessageSquarePlus, Minus, Outdent, Plus, Printer, Redo2, RemoveFormatting, SpellCheck, Strikethrough, Subscript, Superscript, Table as TableIcon, Underline, Undo2, ZoomIn,
} from "lucide-react";
import { COLORS, FONT_SIZES, FONTS, HIGHLIGHTS } from "./types";

interface Props {
  editor: Editor;
  zoom: number;
  onZoom: (z: number) => void;
  onLink: () => void;
  onImage: () => void;
  onTable: () => void;
  onComment: () => void;
  onCite: () => void;
  onPrint: () => void;
  spellcheck: boolean;
  onSpellcheck: (v: boolean) => void;
  compact?: boolean;
  /** Provenance gutter + highlights switch, shown at the far right. `locked` keeps it on (review mode). */
  provenance?: { on: boolean; onToggle: (v: boolean) => void; locked?: boolean };
}

function ProvenanceToggle({ on, onToggle, locked }: { on: boolean; onToggle: (v: boolean) => void; locked?: boolean }) {
  return (
    <label className={`ml-auto pl-3 flex items-center gap-2 text-[12px] text-gray-500 flex-shrink-0 select-none ${locked ? "cursor-default" : "cursor-pointer"}`} title={locked ? "Provenance is always shown in review mode" : "Show the provenance gutter and highlights"}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Provenance gutter"
        disabled={locked}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onToggle(!on)}
        className={`relative inline-block w-7 h-4 rounded-full transition-colors ${on ? "bg-brand-600" : "bg-gray-300"} ${locked ? "opacity-70" : ""}`}
      >
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-[left] ${on ? "left-[14px]" : "left-0.5"}`} />
      </button>
      Provenance
    </label>
  );
}

function Btn({ onClick, active, disabled, title, children }: { onClick: () => void; active?: boolean; disabled?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} disabled={disabled} title={title} aria-label={title} className={`tb-btn ${active ? "active" : ""}`}>
      {children}
    </button>
  );
}

function ColorPicker({ colors, value, onPick, title, icon, onClear }: { colors: string[]; value?: string; onPick: (c: string) => void; title: string; icon: React.ReactNode; onClear: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)} title={title} className="tb-btn flex-col !gap-0 !px-1">
        {icon}
        <span className="block h-[3px] w-4 rounded-sm mt-px" style={{ background: value || "currentColor" }} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-gray-100 p-2 z-50 w-[188px]" onMouseLeave={() => setOpen(false)}>
          <div className="grid grid-cols-8 gap-1">
            {colors.map((c) => (
              <button key={c} onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(c); setOpen(false); }} className="w-5 h-5 rounded border border-gray-200" style={{ background: c }} title={c} />
            ))}
          </div>
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => { onClear(); setOpen(false); }} className="mt-2 text-xs text-gray-500 hover:text-gray-800 w-full text-left">
            None
          </button>
        </div>
      )}
    </div>
  );
}

export default function Toolbar({ editor, zoom, onZoom, onLink, onImage, onTable, onComment, onCite, onPrint, spellcheck, onSpellcheck, compact, provenance }: Props) {
  const [, force] = useState(0);
  useEffect(() => {
    const h = () => force((n) => n + 1);
    editor.on("transaction", h);
    editor.on("selectionUpdate", h);
    return () => {
      editor.off("transaction", h);
      editor.off("selectionUpdate", h);
    };
  }, [editor]);

  const style = editor.isActive("heading", { level: 1 }) ? "h1" : editor.isActive("heading", { level: 2 }) ? "h2" : editor.isActive("heading", { level: 3 }) ? "h3" : editor.isActive("heading", { level: 4 }) ? "h4" : "p";
  const font = (editor.getAttributes("textStyle").fontFamily as string) || "";
  const size = ((editor.getAttributes("textStyle").fontSize as string) || "12pt").replace("pt", "");
  const color = editor.getAttributes("textStyle").color as string | undefined;
  const highlight = editor.getAttributes("highlight").color as string | undefined;
  const lineHeight = (editor.getAttributes("paragraph").lineHeight as string) || (editor.getAttributes("heading").lineHeight as string) || "";

  const setStyle = (v: string) => {
    const c = editor.chain().focus();
    if (v === "p") c.setParagraph().run();
    else c.toggleHeading({ level: Number(v[1]) as 1 | 2 | 3 | 4 }).run();
  };

  const stepSize = (d: number) => {
    const idx = FONT_SIZES.indexOf(String(size));
    const next = FONT_SIZES[Math.max(0, Math.min(FONT_SIZES.length - 1, (idx === -1 ? 4 : idx) + d))];
    editor.chain().focus().setFontSize(`${next}pt`).run();
  };

  return (
    <div className={`flex items-center gap-px px-2.5 h-10 bg-white border-b border-gray-200 whitespace-nowrap flex-shrink-0 ${compact ? "overflow-x-auto no-scrollbar" : "overflow-hidden"}`} role="toolbar" aria-label="Formatting">
      <Btn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo (Ctrl+Z)"><Undo2 className="w-4 h-4" /></Btn>
      <Btn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo (Ctrl+Y)"><Redo2 className="w-4 h-4" /></Btn>
      {!compact && <Btn onClick={onPrint} title="Print (Ctrl+P)"><Printer className="w-4 h-4" /></Btn>}
      {!compact && <Btn onClick={() => onSpellcheck(!spellcheck)} active={spellcheck} title="Spelling & grammar"><SpellCheck className="w-4 h-4" /></Btn>}
      {!compact && (
        <div className="flex items-center gap-0.5 ml-1">
          <ZoomIn className="w-4 h-4 text-gray-500" />
          <select value={zoom} onChange={(e) => onZoom(Number(e.target.value))} className="tb-select !px-0.5 w-[62px]" title="Zoom" aria-label="Zoom">
            {[50, 75, 90, 100, 125, 150, 200].map((z) => (
              <option key={z} value={z}>{z}%</option>
            ))}
          </select>
        </div>
      )}
      <span className="tb-sep" />
      <select value={style} onChange={(e) => setStyle(e.target.value)} className="tb-select w-[112px]" title="Styles" aria-label="Paragraph style">
        <option value="p">Normal text</option>
        <option value="h1">Title (H1)</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
        <option value="h4">Heading 4</option>
      </select>
      <span className="tb-sep" />
      <select value={font} onChange={(e) => (e.target.value ? editor.chain().focus().setFontFamily(e.target.value).run() : editor.chain().focus().unsetFontFamily().run())} className="tb-select w-[104px]" title="Font" aria-label="Font">
        <option value="">Default</option>
        {FONTS.map((f) => (
          <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
        ))}
      </select>
      <span className="tb-sep" />
      <Btn onClick={() => stepSize(-1)} title="Decrease font size"><Minus className="w-3.5 h-3.5" /></Btn>
      <select value={size} onChange={(e) => editor.chain().focus().setFontSize(`${e.target.value}pt`).run()} className="tb-select w-[44px] text-center !px-0" title="Font size" aria-label="Font size">
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <Btn onClick={() => stepSize(1)} title="Increase font size"><Plus className="w-3.5 h-3.5" /></Btn>
      <span className="tb-sep" />
      <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold (Ctrl+B)"><Bold className="w-4 h-4" /></Btn>
      <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic (Ctrl+I)"><Italic className="w-4 h-4" /></Btn>
      <Btn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline (Ctrl+U)"><Underline className="w-4 h-4" /></Btn>
      <Btn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Strikethrough"><Strikethrough className="w-4 h-4" /></Btn>
      <ColorPicker colors={COLORS} value={color} title="Text color" icon={<span className="text-sm font-bold leading-none">A</span>} onPick={(c) => editor.chain().focus().setColor(c).run()} onClear={() => editor.chain().focus().unsetColor().run()} />
      <ColorPicker colors={HIGHLIGHTS} value={highlight} title="Highlight color" icon={<Highlighter className="w-4 h-4" />} onPick={(c) => editor.chain().focus().setHighlight({ color: c }).run()} onClear={() => editor.chain().focus().unsetHighlight().run()} />
      <span className="tb-sep" />
      <Btn onClick={onLink} active={editor.isActive("link")} title="Insert link (Ctrl+K)"><Link2 className="w-4 h-4" /></Btn>
      <Btn onClick={onComment} title="Add comment (Ctrl+Alt+M)"><MessageSquarePlus className="w-4 h-4" /></Btn>
      <Btn onClick={onCite} title="Cite a source (Ctrl+Alt+E): select the passage, find the source with AI, review and insert"><BookMarked className="w-4 h-4" /></Btn>
      <Btn onClick={onImage} title="Insert image"><ImageIcon className="w-4 h-4" /></Btn>
      <Btn onClick={onTable} title="Insert table"><TableIcon className="w-4 h-4" /></Btn>
      <span className="tb-sep" />
      <div className="relative group">
        <Btn onClick={() => {}} title="Align">
          {editor.isActive({ textAlign: "center" }) ? <AlignCenter className="w-4 h-4" /> : editor.isActive({ textAlign: "right" }) ? <AlignRight className="w-4 h-4" /> : editor.isActive({ textAlign: "justify" }) ? <AlignJustify className="w-4 h-4" /> : <AlignLeft className="w-4 h-4" />}
          <ChevronDown className="w-3 h-3 ml-0.5" />
        </Btn>
        <div className="absolute left-0 top-full hidden group-hover:flex bg-white rounded-lg shadow-xl border border-gray-100 p-1 z-50">
          <Btn onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Align left"><AlignLeft className="w-4 h-4" /></Btn>
          <Btn onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Center"><AlignCenter className="w-4 h-4" /></Btn>
          <Btn onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Align right"><AlignRight className="w-4 h-4" /></Btn>
          <Btn onClick={() => editor.chain().focus().setTextAlign("justify").run()} active={editor.isActive({ textAlign: "justify" })} title="Justify"><AlignJustify className="w-4 h-4" /></Btn>
        </div>
      </div>
      <select value={lineHeight} onChange={(e) => editor.chain().focus().setLineHeight(e.target.value).run()} className="tb-select w-[84px]" title="Line spacing" aria-label="Line spacing">
        <option value="">Spacing</option>
        {["1", "1.15", "1.5", "2", "2.5"].map((v) => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>
      <Btn onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive("taskList")} title="Checklist"><CheckSquare className="w-4 h-4" /></Btn>
      <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bulleted list (Ctrl+Shift+8)"><List className="w-4 h-4" /></Btn>
      <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered list (Ctrl+Shift+7)"><ListOrdered className="w-4 h-4" /></Btn>
      <Btn onClick={() => editor.chain().focus().outdent().run()} title="Decrease indent"><Outdent className="w-4 h-4" /></Btn>
      <Btn onClick={() => editor.chain().focus().indent().run()} title="Increase indent"><Indent className="w-4 h-4" /></Btn>
      <span className="tb-sep" />
      <Btn onClick={() => editor.chain().focus().toggleSuperscript().run()} active={editor.isActive("superscript")} title="Superscript"><Superscript className="w-4 h-4" /></Btn>
      <Btn onClick={() => editor.chain().focus().toggleSubscript().run()} active={editor.isActive("subscript")} title="Subscript"><Subscript className="w-4 h-4" /></Btn>
      <Btn onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} title="Clear formatting (Ctrl+\)"><RemoveFormatting className="w-4 h-4" /></Btn>
      {provenance && <ProvenanceToggle on={provenance.on} onToggle={provenance.onToggle} locked={provenance.locked} />}
    </div>
  );
}
