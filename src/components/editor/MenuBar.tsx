"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Check, ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/dictionary";

export type MenuAction =
  | "new" | "open" | "rename" | "save" | "saveVersion" | "versions" | "share" | "submit" | "dl-docx" | "dl-html" | "dl-md" | "dl-txt" | "print" | "pageSetup" | "wordCount"
  | "undo" | "redo" | "cut" | "copy" | "paste" | "pastePlain" | "selectAll" | "find"
  | "outline" | "comments" | "ai" | "provenance" | "zoom-50" | "zoom-75" | "zoom-100" | "zoom-125" | "zoom-150" | "fullscreen" | "focus"
  | "image" | "table" | "link" | "comment" | "pageBreak" | "hr" | "date" | "citation" | "toc" | "footnote"
  | "bold" | "italic" | "underline" | "strike" | "superscript" | "subscript" | "h1" | "h2" | "h3" | "h4" | "p" | "alignLeft" | "alignCenter" | "alignRight" | "alignJustify" | "ls-1" | "ls-1.15" | "ls-1.5" | "ls-2" | "bullets" | "numbers" | "checklist" | "indent" | "outdent" | "clearFormat" | "blockquote" | "codeBlock"
  | "spellcheck" | "references" | "integrity" | "privacy" | "shortcuts" | "about" | "copilot"
  | "reviewer" | "language" | "cite" | "process" | "sources" | "evidence";

interface Item {
  label: string;
  action?: MenuAction;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  children?: Item[];
  sep?: boolean;
}

interface Props {
  editor: Editor;
  onAction: (a: MenuAction) => void;
  state: { showProvenance: boolean; sidebar: string; spellcheck: boolean; zoom: number; focus: boolean; canEdit: boolean };
}

function Menu({ title, items, onAction, open, setOpen }: { title: string; items: Item[]; onAction: (a: MenuAction) => void; open: boolean; setOpen: (v: boolean) => void }) {
  const [sub, setSub] = useState<number | null>(null);
  return (
    <div className="relative">
      <button className={`docs-menu-item ${open ? "bg-gray-100" : ""}`} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(!open)} onMouseEnter={() => open && setOpen(true)}>
        {title}
      </button>
      {open && (
        <div className="docs-menu" onMouseLeave={() => setSub(null)}>
          {items.map((it, i) =>
            it.sep ? (
              <div key={i} className="sep" />
            ) : it.children ? (
              <div key={i} className="relative" onMouseEnter={() => setSub(i)}>
                <button disabled={it.disabled}>
                  <span>{it.label}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                </button>
                {sub === i && (
                  <div className="docs-menu !left-full !top-0 !mt-0 -ml-1">
                    {it.children.map((c, j) =>
                      c.sep ? (
                        <div key={j} className="sep" />
                      ) : (
                        <button key={j} disabled={c.disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => { if (c.action) onAction(c.action); setOpen(false); }}>
                          <span className="flex items-center gap-2">{c.checked !== undefined && <Check className={`w-3.5 h-3.5 ${c.checked ? "" : "invisible"}`} />}{c.label}</span>
                          {c.shortcut && <kbd>{c.shortcut}</kbd>}
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button key={i} disabled={it.disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => { if (it.action) onAction(it.action); setOpen(false); }}>
                <span className="flex items-center gap-2">{it.checked !== undefined && <Check className={`w-3.5 h-3.5 ${it.checked ? "" : "invisible"}`} />}{it.label}</span>
                {it.shortcut && <kbd>{it.shortcut}</kbd>}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

export interface MenuGroup {
  title: string;
  items: Item[];
}

/** The File / Edit / View / Insert / Format / Tools / Help definitions, shared by the menu bar and the `⋯` overflow. */
export function buildMenus(editor: Editor, state: Props["state"], t: Translate): MenuGroup[] {
  const mod = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform) ? "⌘" : "Ctrl+";
  const ro = !state.canEdit;
  const menus: MenuGroup[] = [
    {
      title: t("editor.menu.file"),
      items: [
        { label: t("editor.menu.newThesis"), action: "new" },
        { label: t("editor.menu.openTheses"), action: "open" },
        { label: t("editor.rename"), action: "rename", disabled: ro },
        { sep: true, label: "" },
        { label: t("editor.menu.saveNow"), action: "save", shortcut: `${mod}S`, disabled: ro },
        { label: t("editor.menu.saveVersion"), action: "saveVersion", disabled: ro },
        { label: t("editor.menu.versionHistory"), action: "versions", shortcut: `${mod}⌥⇧H` },
        { sep: true, label: "" },
        { label: t("editor.menu.shareAdvisor"), action: "share" },
        { label: t("editor.menu.submit"), action: "submit", disabled: ro },
        { sep: true, label: "" },
        {
          label: t("editor.menu.download"),
          children: [
            { label: t("editor.menu.dlDocx"), action: "dl-docx" },
            { label: t("editor.menu.dlHtml"), action: "dl-html" },
            { label: t("editor.menu.dlMd"), action: "dl-md" },
            { label: t("editor.menu.dlTxt"), action: "dl-txt" },
            { sep: true, label: "" },
            { label: t("editor.menu.dlPdf"), action: "print" },
          ],
        },
        { label: t("editor.fmt.print"), action: "print", shortcut: `${mod}P` },
        { sep: true, label: "" },
        { label: t("editor.menu.pageSetup"), action: "pageSetup" },
        { label: t("editor.menu.documentDetails"), action: "wordCount" },
      ],
    },
    {
      title: t("editor.menu.edit"),
      items: [
        { label: t("editor.fmt.undo"), action: "undo", shortcut: `${mod}Z`, disabled: !editor.can().undo() },
        { label: t("editor.fmt.redo"), action: "redo", shortcut: `${mod}Y`, disabled: !editor.can().redo() },
        { sep: true, label: "" },
        { label: t("editor.menu.cut"), action: "cut", shortcut: `${mod}X` },
        { label: t("editor.menu.copy"), action: "copy", shortcut: `${mod}C` },
        { label: t("editor.menu.paste"), action: "paste", shortcut: `${mod}V`, disabled: ro },
        { label: t("editor.menu.pastePlain"), action: "pastePlain", shortcut: `${mod}⇧V`, disabled: ro },
        { sep: true, label: "" },
        { label: t("editor.menu.selectAll"), action: "selectAll", shortcut: `${mod}A` },
        { sep: true, label: "" },
        { label: t("editor.menu.findReplace"), action: "find", shortcut: `${mod}H` },
      ],
    },
    {
      title: t("editor.menu.view"),
      items: [
        { label: t("editor.menu.outline"), action: "outline", checked: state.sidebar === "outline" },
        { label: t("editor.panel.comments"), action: "comments", checked: state.sidebar === "comments" },
        { label: t("glossary.aiAssistant"), action: "ai", checked: state.sidebar === "ai" },
        { label: t("glossary.integrityLedger"), action: "integrity", checked: state.sidebar === "integrity" },
        { sep: true, label: "" },
        { label: t("editor.menu.provenanceGutter"), action: "provenance", checked: state.showProvenance },
        { sep: true, label: "" },
        {
          label: t("editor.menu.zoom"),
          children: [50, 75, 100, 125, 150].map((z) => ({ label: `${z}%`, action: `zoom-${z}` as MenuAction, checked: state.zoom === z })),
        },
        { label: t("editor.menu.focusMode"), action: "focus", checked: state.focus },
        { label: t("editor.menu.fullScreen"), action: "fullscreen" },
      ],
    },
    {
      title: t("editor.menu.insert"),
      items: [
        { label: t("editor.menu.image"), action: "image", disabled: ro },
        { label: t("editor.menu.table"), action: "table", disabled: ro },
        { label: t("editor.menu.link"), action: "link", shortcut: `${mod}K`, disabled: ro },
        { label: t("editor.comment"), action: "comment", shortcut: `${mod}⌥M` },
        { sep: true, label: "" },
        { label: t("editor.menu.pageBreak"), action: "pageBreak", shortcut: `${mod}⏎`, disabled: ro },
        { label: t("editor.menu.horizontalLine"), action: "hr", disabled: ro },
        { label: t("editor.menu.date"), action: "date", disabled: ro },
        { label: t("editor.menu.footnote"), action: "footnote", disabled: ro },
        { sep: true, label: "" },
        { label: t("editor.menu.citation"), action: "citation", shortcut: `${mod}⌥E`, disabled: ro },
        { label: t("editor.menu.toc"), action: "toc", disabled: ro },
      ],
    },
    {
      title: t("editor.menu.format"),
      items: [
        {
          label: t("editor.menu.text"),
          children: [
            { label: t("editor.fmt.bold"), action: "bold", shortcut: `${mod}B`, checked: editor.isActive("bold") },
            { label: t("editor.fmt.italic"), action: "italic", shortcut: `${mod}I`, checked: editor.isActive("italic") },
            { label: t("editor.fmt.underline"), action: "underline", shortcut: `${mod}U`, checked: editor.isActive("underline") },
            { label: t("editor.fmt.strike"), action: "strike", checked: editor.isActive("strike") },
            { label: t("editor.fmt.superscript"), action: "superscript", checked: editor.isActive("superscript") },
            { label: t("editor.fmt.subscript"), action: "subscript", checked: editor.isActive("subscript") },
          ],
        },
        {
          label: t("editor.menu.paragraphStyles"),
          children: [
            { label: t("editor.fmt.normalText"), action: "p", shortcut: `${mod}⌥0`, checked: editor.isActive("paragraph") },
            { label: t("editor.fmt.title"), action: "h1", shortcut: `${mod}⌥1`, checked: editor.isActive("heading", { level: 1 }) },
            { label: t("editor.fmt.heading2"), action: "h2", shortcut: `${mod}⌥2`, checked: editor.isActive("heading", { level: 2 }) },
            { label: t("editor.fmt.heading3"), action: "h3", shortcut: `${mod}⌥3`, checked: editor.isActive("heading", { level: 3 }) },
            { label: t("editor.fmt.heading4"), action: "h4", shortcut: `${mod}⌥4`, checked: editor.isActive("heading", { level: 4 }) },
            { sep: true, label: "" },
            { label: t("editor.menu.blockQuote"), action: "blockquote", checked: editor.isActive("blockquote") },
            { label: t("editor.menu.codeBlock"), action: "codeBlock", checked: editor.isActive("codeBlock") },
          ],
        },
        {
          label: t("editor.menu.align"),
          children: [
            { label: t("editor.menu.left"), action: "alignLeft", shortcut: `${mod}⇧L` },
            { label: t("editor.fmt.alignCenter"), action: "alignCenter", shortcut: `${mod}⇧E` },
            { label: t("editor.menu.right"), action: "alignRight", shortcut: `${mod}⇧R` },
            { label: t("editor.fmt.justify"), action: "alignJustify", shortcut: `${mod}⇧J` },
          ],
        },
        {
          label: t("editor.fmt.lineSpacing"),
          children: [
            { label: t("editor.menu.single"), action: "ls-1" },
            { label: "1.15", action: "ls-1.15" },
            { label: "1.5", action: "ls-1.5" },
            { label: t("editor.menu.double"), action: "ls-2" },
          ],
        },
        {
          label: t("editor.menu.lists"),
          children: [
            { label: t("editor.fmt.bulleted"), action: "bullets", shortcut: `${mod}⇧8`, checked: editor.isActive("bulletList") },
            { label: t("editor.fmt.numbered"), action: "numbers", shortcut: `${mod}⇧7`, checked: editor.isActive("orderedList") },
            { label: t("editor.fmt.checklist"), action: "checklist", shortcut: `${mod}⇧9`, checked: editor.isActive("taskList") },
          ],
        },
        { label: t("editor.fmt.increaseIndent"), action: "indent", shortcut: "Tab" },
        { label: t("editor.fmt.decreaseIndent"), action: "outdent", shortcut: "⇧Tab" },
        { sep: true, label: "" },
        { label: t("editor.fmt.clear"), action: "clearFormat", shortcut: `${mod}\\` },
      ],
    },
    {
      title: t("editor.menu.tools"),
      items: [
        { label: t("editor.fmt.spelling"), action: "spellcheck", checked: state.spellcheck },
        { label: t("editor.menu.wordCount"), action: "wordCount", shortcut: `${mod}⇧C` },
        { sep: true, label: "" },
        { label: t("glossary.aiAssistant"), action: "ai" },
        { label: t("glossary.copilot"), action: "copilot" },
        { label: t("editor.menu.aiReviewer"), action: "reviewer" },
        { label: t("editor.menu.languageReview"), action: "language" },
        { sep: true, label: "" },
        { label: t("editor.menu.citationsRefs"), action: "references" },
        { label: t("editor.menu.findSupport"), action: "cite" },
        { label: t("editor.menu.evidenceCheck"), action: "evidence" },
        { label: t("editor.menu.sourceLibrary"), action: "sources" },
        { sep: true, label: "" },
        { label: t("glossary.integrityLedger"), action: "integrity" },
        { label: t("editor.menu.writingProcess"), action: "process" },
        { label: t("editor.menu.privacy"), action: "privacy" },
      ],
    },
    {
      title: t("editor.menu.help"),
      items: [
        { label: t("editor.menu.shortcuts"), action: "shortcuts", shortcut: `${mod}/` },
        { label: t("editor.menu.about"), action: "about" },
      ],
    },
  ];

  return menus;
}

export default function MenuBar({ editor, onAction, state }: Props) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const menus = buildMenus(editor, state, t);
  return (
    <div ref={ref} className="flex items-center gap-0.5 px-1 -ml-1 overflow-x-auto no-scrollbar">
      {menus.map((m) => (
        <Menu key={m.title} title={m.title} items={m.items} onAction={onAction} open={open === m.title} setOpen={(v) => setOpen(v ? m.title : null)} />
      ))}
    </div>
  );
}

function OverflowItems({ items, onAction, depth = 0 }: { items: Item[]; onAction: (a: MenuAction) => void; depth?: number }) {
  return (
    <>
      {items.map((it, i) =>
        it.sep ? (
          <div key={i} className="sep" />
        ) : it.children ? (
          <div key={i}>
            <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{it.label}</div>
            <OverflowItems items={it.children} onAction={onAction} depth={depth + 1} />
          </div>
        ) : (
          <button key={i} disabled={it.disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => it.action && onAction(it.action)}>
            <span className="flex items-center gap-2">{it.checked !== undefined && <Check className={`w-3.5 h-3.5 ${it.checked ? "" : "invisible"}`} />}{it.label}</span>
            {it.shortcut && <kbd>{it.shortcut}</kbd>}
          </button>
        )
      )}
    </>
  );
}

/**
 * The `⋯` button of the editor header: the same File / Edit / View / Insert / Format / Tools / Help menus as a
 * vertical list. Every `MenuAction` and shortcut hint is preserved; submenus are flattened under a small heading.
 */
export function MenuOverflow({ editor, onAction, state }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setGroup(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setGroup(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const menus = buildMenus(editor, state, t);
  const current = menus.find((m) => m.title === group) || null;
  const act = (a: MenuAction) => {
    onAction(a);
    setOpen(false);
    setGroup(null);
  };
  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button type="button" onClick={() => { setOpen((o) => !o); setGroup(null); }} className={`w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 ${open ? "bg-gray-100" : ""}`} aria-label={t("editor.menu.moreOptions")} aria-haspopup="menu" aria-expanded={open}>
        <MoreHorizontal className="w-[18px] h-[18px]" />
      </button>
      {open && (
        <div className="docs-menu !left-auto right-0 !mt-1 !min-w-[260px] max-h-[70vh] overflow-y-auto" role="menu">
          {current ? (
            <>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => setGroup(null)} className="!justify-start !gap-2 text-gray-500">
                <ChevronLeft className="w-3.5 h-3.5" />
                <span className="font-semibold text-gray-800">{current.title}</span>
              </button>
              <div className="sep" />
              <OverflowItems items={current.items} onAction={act} />
            </>
          ) : (
            menus.map((m) => (
              <button key={m.title} onMouseDown={(e) => e.preventDefault()} onClick={() => setGroup(m.title)} role="menuitem">
                <span>{m.title}</span>
                <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
