"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Check, ChevronDown, File, FileCheck, Plus } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { TabOutline } from "./TabOutline";
import type { ThesisTab } from "./types";

interface Props {
  tabs: ThesisTab[];
  activeTab: string;
  canEdit: boolean;
  editor: Editor;
  mobile: boolean;
  getHtml: (id: string) => string;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, title: string) => void;
  onDuplicate: (id: string) => void;
  onPromote: (id: string) => void;
  onDelete: (id: string) => void;
}

/** One compact document selector; the toolbar and tabs stay above the paper, clear of the assistant. */
export default function DocumentTabs({ tabs, activeTab, canEdit, editor, mobile, getHtml, onSwitch, onAdd, onRename, onDuplicate, onPromote, onDelete }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const active = tabs.find((tab) => tab.id === activeTab);
  const title = active?.title || t("glossary.finalSubmission");
  const items = [{ id: "submission", title: t("glossary.finalSubmission") }, ...tabs];
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const choose = (id: string) => {
    onSwitch(id);
    setOpen(false);
    setOutlineOpen(false);
    setRenaming(false);
    trigger.current?.focus();
  };
  const act = (action: () => void) => { setOpen(false); action(); };
  return (
    <div data-tab-anchor={activeTab} className="h-[34px] px-2 md:px-4 flex items-center gap-1 bg-workspace border-b border-gray-200 flex-shrink-0 print:hidden" data-tour="tabs">
      <div ref={root} className="relative min-w-0" onKeyDown={(event) => {
        if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
      }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
        <button ref={trigger} onClick={() => { setOpen((value) => !value); setOutlineOpen(false); }} aria-expanded={open} aria-label={t("editor.tabs.label")} className="h-7 flex items-center gap-1.5 px-2 rounded-md text-xs font-medium text-gray-700 hover:bg-white max-w-[240px]">
          {active ? <File className="w-3.5 h-3.5 flex-shrink-0" /> : <FileCheck className="w-3.5 h-3.5 flex-shrink-0 text-brand-600" />}
          <span className="truncate">{title}</span><ChevronDown className="w-3 h-3 flex-shrink-0" />
        </button>
        {open && (
          <div className="absolute top-full left-0 mt-1 w-72 max-w-[calc(100vw-24px)] max-h-[60vh] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl p-1 z-40" aria-label={t("editor.tabs.label")}>
            {items.map((tab) => (
              <button key={tab.id} onClick={() => choose(tab.id)} aria-current={tab.id === activeTab ? "page" : undefined} className={`w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-lg text-xs hover:bg-gray-50 ${tab.id === activeTab ? "bg-brand-50 text-brand-800 font-semibold" : "text-gray-700"}`}>
                {tab.id === "submission" ? <FileCheck className="w-4 h-4 flex-shrink-0" /> : <File className="w-4 h-4 flex-shrink-0" />}
                <span className="flex-1 truncate">{tab.title}</span>{tab.id === activeTab && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
              </button>
            ))}
            {canEdit && (
              <div className="border-t border-gray-100 mt-1 pt-1">
                {active && <>
                  {renaming ? <input autoFocus defaultValue={active.title} aria-label={t("editor.tabs.name")} className="input-field !text-xs !py-1.5" onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") { event.stopPropagation(); setRenaming(false); }
                  }} onBlur={(event) => { const value = event.target.value.trim().slice(0, 80); if (value) onRename(active.id, value); setRenaming(false); }} />
                    : <button className="w-full text-left px-2.5 py-2 text-xs rounded-lg hover:bg-gray-50" onClick={() => setRenaming(true)}>{t("editor.rename")}</button>}
                  <button className="w-full text-left px-2.5 py-2 text-xs rounded-lg hover:bg-gray-50" onClick={() => act(() => onDuplicate(active.id))}>{t("editor.tabs.duplicate")}</button>
                  <button className="w-full text-left px-2.5 py-2 text-xs rounded-lg hover:bg-gray-50" onClick={() => act(() => onPromote(active.id))}>{t("editor.tabs.useAsSubmission", { finalSubmission: t("glossary.finalSubmission") })}</button>
                  <button className="w-full text-left px-2.5 py-2 text-xs text-red-600 rounded-lg hover:bg-red-50" onClick={() => act(() => onDelete(active.id))}>{t("editor.tabs.delete")}</button>
                </>}
                {tabs.length < 20 && <button onClick={() => act(onAdd)} className="w-full flex items-center gap-2 px-2.5 py-2 text-xs text-brand-700 rounded-lg hover:bg-gray-50"><Plus className="w-4 h-4" />{t("editor.tabs.new")}</button>}
              </div>
            )}
          </div>
        )}
      </div>
      <TabOutline tabId={activeTab} title={title} active open={outlineOpen} onOpenChange={setOutlineOpen} editor={editor} getHtml={getHtml} switchTab={choose} mobile={mobile} />
    </div>
  );
}
