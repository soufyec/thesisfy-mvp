"use client";

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Highlighter, Minus, Plus } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { COLORS, FONT_SIZES, FONTS, HIGHLIGHTS } from "./types";

/** "Aa" button of the selection bubble: shows / hides the typography row below it. */
export function TypographyToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const t = useT();
  return (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onToggle} className={`bm-btn !px-2 font-semibold ${open ? "active" : ""}`} aria-expanded={open} aria-label={t("editor.bubble.typography")} title={t("editor.bubble.typography")}>
      <span className="text-[13px] leading-none tracking-tight">Aa</span>
    </button>
  );
}

function Swatches({ colors, value, title, icon, onPick, onClear }: { colors: string[]; value?: string; title: string; icon: React.ReactNode; onPick: (c: string) => void; onClear: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)} className={`bm-btn flex-col !gap-0 !px-1.5 ${open ? "active" : ""}`} aria-label={title} title={title} aria-expanded={open}>
        {icon}
        <span className="block h-[3px] w-4 rounded-sm mt-px" style={{ background: value || "currentColor" }} />
      </button>
      {open && (
        <div className="absolute left-0 top-full pt-1 z-50">
          <div className="bg-white text-gray-800 rounded-lg shadow-xl border border-gray-200 p-2 w-[188px]">
            <div className="grid grid-cols-8 gap-1">
              {colors.map((c) => (
                <button key={c} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(c); setOpen(false); }} className="w-5 h-5 rounded border border-gray-200" style={{ background: c }} title={c} aria-label={c} />
              ))}
            </div>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onClear(); setOpen(false); }} className="mt-2 text-[12px] text-gray-500 hover:text-gray-800 w-full text-left">
              {t("editor.toolbar.colorNone")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Second row of the selection bubble: font, size, text colour, highlight and alignment (same commands as `Toolbar`). */
export function TypographyRow({ editor }: { editor: Editor }) {
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

  const font = (editor.getAttributes("textStyle").fontFamily as string) || "";
  const size = ((editor.getAttributes("textStyle").fontSize as string) || "12pt").replace("pt", "");
  const color = editor.getAttributes("textStyle").color as string | undefined;
  const highlight = editor.getAttributes("highlight").color as string | undefined;
  const stepSize = (d: number) => {
    const idx = FONT_SIZES.indexOf(String(size));
    const next = FONT_SIZES[Math.max(0, Math.min(FONT_SIZES.length - 1, (idx === -1 ? 4 : idx) + d))];
    editor.chain().focus().setFontSize(`${next}pt`).run();
  };
  const align = (a: "left" | "center" | "right" | "justify") => editor.chain().focus().setTextAlign(a).run();
  const alignBtn = (a: "left" | "center" | "right" | "justify", label: string, icon: React.ReactNode) => (
    <button key={a} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => align(a)} className={`bm-btn !px-1.5 ${editor.isActive({ textAlign: a }) ? "active" : ""}`} aria-label={label} aria-pressed={editor.isActive({ textAlign: a })} title={label}>
      {icon}
    </button>
  );

  return (
    <div className="bm-row" role="group" aria-label={t("editor.bubble.typography")}>
      <select value={font} onChange={(e) => (e.target.value ? editor.chain().focus().setFontFamily(e.target.value).run() : editor.chain().focus().unsetFontFamily().run())} className="bm-select w-[108px]" title={t("editor.toolbar.font")} aria-label={t("editor.toolbar.font")}>
        <option value="">{t("editor.toolbar.fontDefault")}</option>
        {FONTS.map((f) => (
          <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
        ))}
      </select>
      <span className="bm-sep" />
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => stepSize(-1)} className="bm-btn !px-1.5" aria-label={t("editor.toolbar.decreaseFontSize")} title={t("editor.toolbar.decreaseFontSize")}><Minus className="w-3.5 h-3.5" /></button>
      <select value={size} onChange={(e) => editor.chain().focus().setFontSize(`${e.target.value}pt`).run()} className="bm-select w-[38px] text-center !px-0" title={t("editor.toolbar.fontSize")} aria-label={t("editor.toolbar.fontSize")}>
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => stepSize(1)} className="bm-btn !px-1.5" aria-label={t("editor.toolbar.increaseFontSize")} title={t("editor.toolbar.increaseFontSize")}><Plus className="w-3.5 h-3.5" /></button>
      <span className="bm-sep" />
      <Swatches colors={COLORS} value={color} title={t("editor.toolbar.textColor")} icon={<span className="text-[13px] font-bold leading-none">A</span>} onPick={(c) => editor.chain().focus().setColor(c).run()} onClear={() => editor.chain().focus().unsetColor().run()} />
      <Swatches colors={HIGHLIGHTS} value={highlight} title={t("editor.toolbar.highlightColor")} icon={<Highlighter className="w-3.5 h-3.5" />} onPick={(c) => editor.chain().focus().setHighlight({ color: c }).run()} onClear={() => editor.chain().focus().unsetHighlight().run()} />
      <span className="bm-sep" />
      {alignBtn("left", t("editor.fmt.alignLeft"), <AlignLeft className="w-3.5 h-3.5" />)}
      {alignBtn("center", t("editor.fmt.alignCenter"), <AlignCenter className="w-3.5 h-3.5" />)}
      {alignBtn("right", t("editor.fmt.alignRight"), <AlignRight className="w-3.5 h-3.5" />)}
      {alignBtn("justify", t("editor.fmt.justify"), <AlignJustify className="w-3.5 h-3.5" />)}
    </div>
  );
}
