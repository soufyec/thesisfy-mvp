"use client";

import { useEffect, useId, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, BookMarked, CheckSquare, ChevronDown, Eye, EyeOff, Highlighter, Image as ImageIcon, Indent, Italic, Link2, List, ListOrdered, MessageSquarePlus, Minus, Outdent, Plus, Printer, Redo2, RemoveFormatting, SpellCheck, Strikethrough, Subscript, Superscript, Table as TableIcon, Underline, Undo2, ZoomIn,
} from "lucide-react";
import { useT } from "@/lib/i18n/client";
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
  /**
   * Provenance gutter + highlights switch, shown at the far right. `locked` keeps it on (review mode). Always a pill with
   * icon + name; the small switch graphic is drawn from 1180px up and the name is hidden below 640px (it stays in the aria-label and tooltip).
   */
  provenance?: { on: boolean; onToggle: (v: boolean) => void; locked?: boolean };
}

function ProvenanceToggle({ on, onToggle, locked }: { on: boolean; onToggle: (v: boolean) => void; locked?: boolean }) {
  const t = useT();
  const tipId = useId();
  // The toolbar clips its overflow, so the one-line tooltip is positioned `fixed` from the button's rectangle.
  const [tip, setTip] = useState<{ top: number; right: number } | null>(null);
  const showTip = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setTip({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
  };
  const Icon = on ? Eye : EyeOff;
  const stateLabel = on ? t("editor.toolbar.provenanceVisible") : t("editor.toolbar.provenanceHidden");
  return (
    <div className="ml-auto pl-3 flex items-center flex-shrink-0">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-disabled={locked || undefined}
        aria-label={`${t("glossary.provenance")}: ${stateLabel}`}
        aria-describedby={tip ? tipId : undefined}
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={(e) => showTip(e.currentTarget)}
        onMouseLeave={() => setTip(null)}
        onFocus={(e) => showTip(e.currentTarget)}
        onBlur={() => setTip(null)}
        onKeyDown={(e) => { if (e.key === "Escape") setTip(null); }}
        onClick={() => { if (!locked) onToggle(!on); }}
        className={`inline-flex items-center gap-1.5 h-7 pl-2 pr-2.5 rounded-full border text-[12px] font-medium select-none transition-colors ${on ? "bg-brand-50 border-brand-100 text-brand-700 hover:bg-brand-100" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-100"} ${locked ? "cursor-default opacity-80" : "cursor-pointer"}`}
      >
        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="hidden min-[640px]:inline">{t("glossary.provenance")}</span>
        <span aria-hidden="true" className={`hidden min-[1180px]:inline-block relative w-6 h-3.5 rounded-full transition-colors ${on ? "bg-brand-600" : "bg-gray-300"}`}>
          <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow-sm transition-[left] ${on ? "left-[12px]" : "left-0.5"}`} />
        </span>
      </button>
      {tip && (
        <span id={tipId} role="tooltip" className="fixed z-50 px-2.5 py-1.5 rounded-lg bg-gray-900 text-white text-[12px] leading-none whitespace-nowrap shadow-lg pointer-events-none" style={{ top: tip.top, right: tip.right }}>
          {locked ? t("editor.toolbar.provenanceAlways") : t("editor.toolbar.provenanceTip")}
        </span>
      )}
    </div>
  );
}

function Btn({ onClick, active, disabled, title, children }: { onClick: () => void; active?: boolean; disabled?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} disabled={disabled} title={title} aria-label={title} className={`tb-btn ${active ? "active" : ""}`}>
      {children}
    </button>
  );
}

/**
 * Popover anchored under a toolbar button. The toolbar clips its overflow, so the panel is `position: fixed` from the
 * button's rectangle; it closes on outside click, scroll and resize.
 */
function useToolbarPopover() {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-tb-pop]")) close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);
  const toggle = (el: HTMLElement, width: number) => {
    if (pos) return setPos(null);
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 2, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) });
  };
  return { pos, toggle, close: () => setPos(null) };
}

function ColorPicker({ colors, value, onPick, title, icon, onClear }: { colors: string[]; value?: string; onPick: (c: string) => void; title: string; icon: React.ReactNode; onClear: () => void }) {
  const t = useT();
  const { pos, toggle, close } = useToolbarPopover();
  return (
    <div data-tb-pop>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={(e) => toggle(e.currentTarget, 188)} title={title} aria-label={title} aria-expanded={!!pos} className="tb-btn flex-col !gap-0 !px-1">
        {icon}
        <span className="block h-[3px] w-4 rounded-sm mt-px" style={{ background: value || "currentColor" }} />
      </button>
      {pos && (
        <div data-tb-pop className="fixed bg-white rounded-lg shadow-xl border border-gray-200 p-2 z-50 w-[188px]" style={{ top: pos.top, left: pos.left }}>
          <div className="grid grid-cols-8 gap-1">
            {colors.map((c) => (
              <button key={c} onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(c); close(); }} className="w-5 h-5 rounded border border-gray-200" style={{ background: c }} title={c} aria-label={c} />
            ))}
          </div>
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => { onClear(); close(); }} className="mt-2 text-xs text-gray-500 hover:text-gray-800 w-full text-left">
            {t("editor.toolbar.colorNone")}
          </button>
        </div>
      )}
    </div>
  );
}

const ALIGNS = [
  { a: "left", Icon: AlignLeft, label: "editor.fmt.alignLeft", keys: "Ctrl+Shift+L" },
  { a: "center", Icon: AlignCenter, label: "editor.fmt.alignCenter", keys: "Ctrl+Shift+E" },
  { a: "right", Icon: AlignRight, label: "editor.fmt.alignRight", keys: "Ctrl+Shift+R" },
  { a: "justify", Icon: AlignJustify, label: "editor.fmt.justify", keys: "Ctrl+Shift+J" },
] as const;

function AlignMenu({ editor }: { editor: Editor }) {
  const t = useT();
  const { pos, toggle, close } = useToolbarPopover();
  const current = ALIGNS.find((x) => x.a !== "left" && editor.isActive({ textAlign: x.a })) || ALIGNS[0];
  return (
    <div data-tb-pop>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={(e) => toggle(e.currentTarget, 148)} title={t("editor.toolbar.align")} aria-label={t("editor.toolbar.align")} aria-expanded={!!pos} aria-haspopup="true" className={`tb-btn ${pos ? "active" : ""}`}>
        <current.Icon className="w-4 h-4" />
        <ChevronDown className="w-3 h-3 ml-0.5" />
      </button>
      {pos && (
        <div data-tb-pop className="fixed flex bg-white rounded-lg shadow-xl border border-gray-200 p-1 z-50" style={{ top: pos.top, left: pos.left }} role="group" aria-label={t("editor.toolbar.align")}>
          {ALIGNS.map(({ a, Icon, label, keys }) => (
            <Btn key={a} onClick={() => { editor.chain().focus().setTextAlign(a).run(); close(); }} active={editor.isActive({ textAlign: a })} title={`${t(label)} (${keys})`}><Icon className="w-4 h-4" /></Btn>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Toolbar({ editor, zoom, onZoom, onLink, onImage, onTable, onComment, onCite, onPrint, spellcheck, onSpellcheck, compact, provenance }: Props) {
  const t = useT();
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
    <div className="flex items-center px-2.5 h-10 bg-white border-b border-gray-200 whitespace-nowrap flex-shrink-0" role="toolbar" aria-label={t("editor.toolbar.label")}>
      {/* The tools scroll sideways when the window is narrow; the Provenance pill stays pinned at the right. */}
      <div className="relative flex-1 min-w-0 h-full">
      {compact && <div className="pointer-events-none absolute right-0 top-0 h-full w-10 bg-gradient-to-l from-white to-transparent z-[1]" aria-hidden="true" />}
      <div className="flex items-center gap-px h-full overflow-x-auto no-scrollbar">
      <Btn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title={`${t("editor.fmt.undo")} (Ctrl+Z)`}><Undo2 className="w-4 h-4" /></Btn>
      <Btn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title={`${t("editor.fmt.redo")} (Ctrl+Y)`}><Redo2 className="w-4 h-4" /></Btn>
      {!compact && <Btn onClick={onPrint} title={`${t("editor.fmt.print")} (Ctrl+P)`}><Printer className="w-4 h-4" /></Btn>}
      {!compact && <Btn onClick={() => onSpellcheck(!spellcheck)} active={spellcheck} title={t("editor.fmt.spelling")}><SpellCheck className="w-4 h-4" /></Btn>}
      {!compact && (
        <div className="flex items-center gap-0.5 ml-1">
          <ZoomIn className="w-4 h-4 text-gray-500" />
          <select value={zoom} onChange={(e) => onZoom(Number(e.target.value))} className="tb-select !px-0.5 w-[62px]" title={t("editor.toolbar.zoom")} aria-label={t("editor.toolbar.zoom")}>
            {[50, 75, 90, 100, 125, 150, 200].map((z) => (
              <option key={z} value={z}>{z}%</option>
            ))}
          </select>
        </div>
      )}
      <span className="tb-sep" />
      <select value={style} onChange={(e) => setStyle(e.target.value)} className="tb-select w-[112px]" title={t("editor.toolbar.styles")} aria-label={t("editor.toolbar.paragraphStyle")}>
        <option value="p">{t("editor.fmt.normalText")}</option>
        <option value="h1">{t("editor.fmt.title")}</option>
        <option value="h2">{t("editor.fmt.heading2")}</option>
        <option value="h3">{t("editor.fmt.heading3")}</option>
        <option value="h4">{t("editor.fmt.heading4")}</option>
      </select>
      <span className="tb-sep" />
      <select value={font} onChange={(e) => (e.target.value ? editor.chain().focus().setFontFamily(e.target.value).run() : editor.chain().focus().unsetFontFamily().run())} className="tb-select w-[104px]" title={t("editor.toolbar.font")} aria-label={t("editor.toolbar.font")}>
        <option value="">{t("editor.toolbar.fontDefault")}</option>
        {FONTS.map((f) => (
          <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
        ))}
      </select>
      <span className="tb-sep" />
      <Btn onClick={() => stepSize(-1)} title={t("editor.toolbar.decreaseFontSize")}><Minus className="w-3.5 h-3.5" /></Btn>
      <select value={size} onChange={(e) => editor.chain().focus().setFontSize(`${e.target.value}pt`).run()} className="tb-select w-[44px] text-center !px-0" title={t("editor.toolbar.fontSize")} aria-label={t("editor.toolbar.fontSize")}>
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <Btn onClick={() => stepSize(1)} title={t("editor.toolbar.increaseFontSize")}><Plus className="w-3.5 h-3.5" /></Btn>
      <span className="tb-sep" />
      <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title={`${t("editor.fmt.bold")} (Ctrl+B)`}><Bold className="w-4 h-4" /></Btn>
      <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title={`${t("editor.fmt.italic")} (Ctrl+I)`}><Italic className="w-4 h-4" /></Btn>
      <Btn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title={`${t("editor.fmt.underline")} (Ctrl+U)`}><Underline className="w-4 h-4" /></Btn>
      <Btn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title={t("editor.fmt.strike")}><Strikethrough className="w-4 h-4" /></Btn>
      <ColorPicker colors={COLORS} value={color} title={t("editor.toolbar.textColor")} icon={<span className="text-sm font-bold leading-none">A</span>} onPick={(c) => editor.chain().focus().setColor(c).run()} onClear={() => editor.chain().focus().unsetColor().run()} />
      <ColorPicker colors={HIGHLIGHTS} value={highlight} title={t("editor.toolbar.highlightColor")} icon={<Highlighter className="w-4 h-4" />} onPick={(c) => editor.chain().focus().setHighlight({ color: c }).run()} onClear={() => editor.chain().focus().unsetHighlight().run()} />
      <span className="tb-sep" />
      <Btn onClick={onLink} active={editor.isActive("link")} title={`${t("editor.toolbar.insertLink")} (Ctrl+K)`}><Link2 className="w-4 h-4" /></Btn>
      <Btn onClick={onComment} title={`${t("editor.toolbar.addComment")} (Ctrl+Alt+M)`}><MessageSquarePlus className="w-4 h-4" /></Btn>
      <Btn onClick={onCite} title={`${t("editor.cite")} (Ctrl+Alt+E): ${t("editor.toolbar.citeSource")}`}><BookMarked className="w-4 h-4" /></Btn>
      <Btn onClick={onImage} title={t("editor.toolbar.insertImage")}><ImageIcon className="w-4 h-4" /></Btn>
      <Btn onClick={onTable} title={t("editor.toolbar.insertTable")}><TableIcon className="w-4 h-4" /></Btn>
      <span className="tb-sep" />
      <AlignMenu editor={editor} />
      <select value={lineHeight} onChange={(e) => editor.chain().focus().setLineHeight(e.target.value).run()} className="tb-select w-[84px]" title={t("editor.fmt.lineSpacing")} aria-label={t("editor.fmt.lineSpacing")}>
        <option value="">{t("editor.toolbar.spacing")}</option>
        {["1", "1.15", "1.5", "2", "2.5"].map((v) => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>
      <Btn onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive("taskList")} title={t("editor.fmt.checklist")}><CheckSquare className="w-4 h-4" /></Btn>
      <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title={`${t("editor.fmt.bulleted")} (Ctrl+Shift+8)`}><List className="w-4 h-4" /></Btn>
      <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title={`${t("editor.fmt.numbered")} (Ctrl+Shift+7)`}><ListOrdered className="w-4 h-4" /></Btn>
      <Btn onClick={() => editor.chain().focus().outdent().run()} title={t("editor.fmt.decreaseIndent")}><Outdent className="w-4 h-4" /></Btn>
      <Btn onClick={() => editor.chain().focus().indent().run()} title={t("editor.fmt.increaseIndent")}><Indent className="w-4 h-4" /></Btn>
      <span className="tb-sep" />
      <Btn onClick={() => editor.chain().focus().toggleSuperscript().run()} active={editor.isActive("superscript")} title={t("editor.fmt.superscript")}><Superscript className="w-4 h-4" /></Btn>
      <Btn onClick={() => editor.chain().focus().toggleSubscript().run()} active={editor.isActive("subscript")} title={t("editor.fmt.subscript")}><Subscript className="w-4 h-4" /></Btn>
      <Btn onClick={() => editor.chain().focus().clearFormatting().clearNodes().run()} title={`${t("editor.fmt.clear")} (Ctrl+\\)`}><RemoveFormatting className="w-4 h-4" /></Btn>
      </div>
      </div>
      {provenance && <ProvenanceToggle on={provenance.on} onToggle={provenance.onToggle} locked={provenance.locked} />}
    </div>
  );
}
