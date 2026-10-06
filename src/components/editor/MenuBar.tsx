"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Check, ChevronRight } from "lucide-react";

export type MenuAction =
  | "new" | "open" | "rename" | "save" | "saveVersion" | "versions" | "share" | "submit" | "dl-docx" | "dl-html" | "dl-md" | "dl-txt" | "print" | "pageSetup" | "wordCount"
  | "undo" | "redo" | "cut" | "copy" | "paste" | "pastePlain" | "selectAll" | "find"
  | "outline" | "comments" | "ai" | "provenance" | "zoom-50" | "zoom-75" | "zoom-100" | "zoom-125" | "zoom-150" | "fullscreen" | "focus"
  | "image" | "table" | "link" | "comment" | "pageBreak" | "hr" | "date" | "citation" | "toc" | "footnote"
  | "bold" | "italic" | "underline" | "strike" | "superscript" | "subscript" | "h1" | "h2" | "h3" | "h4" | "p" | "alignLeft" | "alignCenter" | "alignRight" | "alignJustify" | "ls-1" | "ls-1.15" | "ls-1.5" | "ls-2" | "bullets" | "numbers" | "checklist" | "indent" | "outdent" | "clearFormat" | "blockquote" | "codeBlock"
  | "spellcheck" | "references" | "integrity" | "privacy" | "shortcuts" | "about" | "extension";

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

export default function MenuBar({ editor, onAction, state }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const mod = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform) ? "⌘" : "Ctrl+";
  const ro = !state.canEdit;

  const menus: { title: string; items: Item[] }[] = [
    {
      title: "File",
      items: [
        { label: "New thesis", action: "new" },
        { label: "Open (My theses)", action: "open" },
        { label: "Rename", action: "rename", disabled: ro },
        { sep: true, label: "" },
        { label: "Save now", action: "save", shortcut: `${mod}S`, disabled: ro },
        { label: "Save named version", action: "saveVersion", disabled: ro },
        { label: "Version history", action: "versions", shortcut: `${mod}⌥⇧H` },
        { sep: true, label: "" },
        { label: "Share with advisor…", action: "share" },
        { label: "Submit for review", action: "submit", disabled: ro },
        { sep: true, label: "" },
        {
          label: "Download",
          children: [
            { label: "Microsoft Word (.docx)", action: "dl-docx" },
            { label: "Web page (.html)", action: "dl-html" },
            { label: "Markdown (.md)", action: "dl-md" },
            { label: "Plain text (.txt)", action: "dl-txt" },
            { sep: true, label: "" },
            { label: "PDF (via Print)", action: "print" },
          ],
        },
        { label: "Print", action: "print", shortcut: `${mod}P` },
        { sep: true, label: "" },
        { label: "Page setup", action: "pageSetup" },
        { label: "Document details", action: "wordCount" },
      ],
    },
    {
      title: "Edit",
      items: [
        { label: "Undo", action: "undo", shortcut: `${mod}Z`, disabled: !editor.can().undo() },
        { label: "Redo", action: "redo", shortcut: `${mod}Y`, disabled: !editor.can().redo() },
        { sep: true, label: "" },
        { label: "Cut", action: "cut", shortcut: `${mod}X` },
        { label: "Copy", action: "copy", shortcut: `${mod}C` },
        { label: "Paste", action: "paste", shortcut: `${mod}V`, disabled: ro },
        { label: "Paste without formatting", action: "pastePlain", shortcut: `${mod}⇧V`, disabled: ro },
        { sep: true, label: "" },
        { label: "Select all", action: "selectAll", shortcut: `${mod}A` },
        { sep: true, label: "" },
        { label: "Find and replace", action: "find", shortcut: `${mod}H` },
      ],
    },
    {
      title: "View",
      items: [
        { label: "Document outline", action: "outline", checked: state.sidebar === "outline" },
        { label: "Comments", action: "comments", checked: state.sidebar === "comments" },
        { label: "AI assistant", action: "ai", checked: state.sidebar === "ai" },
        { label: "Integrity & provenance", action: "integrity", checked: state.sidebar === "integrity" },
        { sep: true, label: "" },
        { label: "Show provenance highlights", action: "provenance", checked: state.showProvenance },
        { sep: true, label: "" },
        {
          label: "Zoom",
          children: [50, 75, 100, 125, 150].map((z) => ({ label: `${z}%`, action: `zoom-${z}` as MenuAction, checked: state.zoom === z })),
        },
        { label: "Focus mode (hide panels)", action: "focus", checked: state.focus },
        { label: "Full screen", action: "fullscreen" },
      ],
    },
    {
      title: "Insert",
      items: [
        { label: "Image…", action: "image", disabled: ro },
        { label: "Table…", action: "table", disabled: ro },
        { label: "Link…", action: "link", shortcut: `${mod}K`, disabled: ro },
        { label: "Comment", action: "comment", shortcut: `${mod}⌥M` },
        { sep: true, label: "" },
        { label: "Page break", action: "pageBreak", shortcut: `${mod}⏎`, disabled: ro },
        { label: "Horizontal line", action: "hr", disabled: ro },
        { label: "Date", action: "date", disabled: ro },
        { label: "Footnote", action: "footnote", disabled: ro },
        { sep: true, label: "" },
        { label: "Citation (find source with AI)…", action: "citation", shortcut: `${mod}⌥E`, disabled: ro },
        { label: "Table of contents", action: "toc", disabled: ro },
      ],
    },
    {
      title: "Format",
      items: [
        {
          label: "Text",
          children: [
            { label: "Bold", action: "bold", shortcut: `${mod}B`, checked: editor.isActive("bold") },
            { label: "Italic", action: "italic", shortcut: `${mod}I`, checked: editor.isActive("italic") },
            { label: "Underline", action: "underline", shortcut: `${mod}U`, checked: editor.isActive("underline") },
            { label: "Strikethrough", action: "strike", checked: editor.isActive("strike") },
            { label: "Superscript", action: "superscript", checked: editor.isActive("superscript") },
            { label: "Subscript", action: "subscript", checked: editor.isActive("subscript") },
          ],
        },
        {
          label: "Paragraph styles",
          children: [
            { label: "Normal text", action: "p", shortcut: `${mod}⌥0`, checked: editor.isActive("paragraph") },
            { label: "Title (H1)", action: "h1", shortcut: `${mod}⌥1`, checked: editor.isActive("heading", { level: 1 }) },
            { label: "Heading 2", action: "h2", shortcut: `${mod}⌥2`, checked: editor.isActive("heading", { level: 2 }) },
            { label: "Heading 3", action: "h3", shortcut: `${mod}⌥3`, checked: editor.isActive("heading", { level: 3 }) },
            { label: "Heading 4", action: "h4", shortcut: `${mod}⌥4`, checked: editor.isActive("heading", { level: 4 }) },
            { sep: true, label: "" },
            { label: "Block quote", action: "blockquote", checked: editor.isActive("blockquote") },
            { label: "Code block", action: "codeBlock", checked: editor.isActive("codeBlock") },
          ],
        },
        {
          label: "Align",
          children: [
            { label: "Left", action: "alignLeft", shortcut: `${mod}⇧L` },
            { label: "Center", action: "alignCenter", shortcut: `${mod}⇧E` },
            { label: "Right", action: "alignRight", shortcut: `${mod}⇧R` },
            { label: "Justify", action: "alignJustify", shortcut: `${mod}⇧J` },
          ],
        },
        {
          label: "Line spacing",
          children: [
            { label: "Single", action: "ls-1" },
            { label: "1.15", action: "ls-1.15" },
            { label: "1.5", action: "ls-1.5" },
            { label: "Double", action: "ls-2" },
          ],
        },
        {
          label: "Lists",
          children: [
            { label: "Bulleted list", action: "bullets", shortcut: `${mod}⇧8`, checked: editor.isActive("bulletList") },
            { label: "Numbered list", action: "numbers", shortcut: `${mod}⇧7`, checked: editor.isActive("orderedList") },
            { label: "Checklist", action: "checklist", shortcut: `${mod}⇧9`, checked: editor.isActive("taskList") },
          ],
        },
        { label: "Increase indent", action: "indent", shortcut: "Tab" },
        { label: "Decrease indent", action: "outdent", shortcut: "⇧Tab" },
        { sep: true, label: "" },
        { label: "Clear formatting", action: "clearFormat", shortcut: `${mod}\\` },
      ],
    },
    {
      title: "Tools",
      items: [
        { label: "Spelling & grammar", action: "spellcheck", checked: state.spellcheck },
        { label: "Word count", action: "wordCount", shortcut: `${mod}⇧C` },
        { sep: true, label: "" },
        { label: "AI assistant", action: "ai" },
        { label: "Citations & references", action: "references" },
        { label: "Integrity & provenance report", action: "integrity" },
        { sep: true, label: "" },
        { label: "Privacy & monitoring choices", action: "privacy" },
        { label: "Browser extension (transparent AI use)", action: "extension" },
      ],
    },
    {
      title: "Help",
      items: [
        { label: "Keyboard shortcuts", action: "shortcuts", shortcut: `${mod}/` },
        { label: "About Thesisfic", action: "about" },
      ],
    },
  ];

  return (
    <div ref={ref} className="flex items-center gap-0.5 px-1 -ml-1 overflow-x-auto no-scrollbar">
      {menus.map((m) => (
        <Menu key={m.title} title={m.title} items={m.items} onAction={onAction} open={open === m.title} setOpen={(v) => setOpen(v ? m.title : null)} />
      ))}
    </div>
  );
}
