"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ChevronDown, Search, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";

type Item = { level: number; text: string; index: number };

const MAX_LEVEL = 4;
const FILTER_THRESHOLD = 40;
const FLASH_CLASS = "bg-brand-100 rounded";
const FLASH_MS = 1200;

// Transient highlight as a ProseMirror decoration (never touches the document, and survives re-renders).
const flashKey = new PluginKey<number | null>("tabOutlineFlash");
const flashPlugin = () =>
  new Plugin<number | null>({
    key: flashKey,
    state: {
      init: () => null,
      apply(tr, value) {
        const meta = tr.getMeta(flashKey) as { pos: number | null } | undefined;
        if (meta) return meta.pos;
        return value !== null && tr.docChanged ? tr.mapping.map(value) : value;
      },
    },
    props: {
      decorations(state) {
        const pos = flashKey.getState(state);
        const node = pos === null || pos === undefined ? null : state.doc.nodeAt(pos);
        return node && pos !== null && pos !== undefined ? DecorationSet.create(state.doc, [Decoration.node(pos, pos + node.nodeSize, { class: FLASH_CLASS })]) : DecorationSet.empty;
      },
    },
  });

function flashHeading(editor: Editor, pos: number) {
  if (flashKey.getState(editor.state) === undefined) editor.registerPlugin(flashPlugin());
  editor.view.dispatch(editor.state.tr.setMeta(flashKey, { pos }));
  window.setTimeout(() => {
    if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(flashKey, { pos: null }));
  }, FLASH_MS);
}

/** Headings (H1-H4) of the live editor document. `index` counts every heading node in document order. */
function itemsFromEditor(editor: Editor, untitled: string): Item[] {
  const out: Item[] = [];
  let index = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "heading") {
      const level = Number(node.attrs.level) || 1;
      if (level <= MAX_LEVEL) out.push({ level, text: node.textContent.trim() || untitled, index });
      index += 1;
    }
    return true;
  });
  return out;
}

/** Headings of a stored tab (HTML). Same ordering and indexing as `itemsFromEditor`. */
function itemsFromHtml(html: string, untitled: string): Item[] {
  if (!html || typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: Item[] = [];
  const nodes = doc.body.querySelectorAll("h1,h2,h3,h4,h5,h6");
  for (let i = 0; i < nodes.length; i++) {
    const level = Number(nodes[i].tagName.charAt(1));
    if (level <= MAX_LEVEL) out.push({ level, text: (nodes[i].textContent || "").trim() || untitled, index: i });
  }
  return out;
}

/** Scrolls to the n-th heading of the editor, places the caret at its start and flashes it. Returns false if it is not there (yet). */
function revealHeading(editor: Editor, index: number): boolean {
  let found = -1;
  let n = 0;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.type.name === "heading") {
      if (n === index) found = pos;
      n += 1;
    }
    return true;
  });
  if (found < 0) return false;
  const dom = editor.view.nodeDOM(found) as HTMLElement | null;
  if (!dom) return false;
  editor.chain().focus(null, { scrollIntoView: false }).setTextSelection(found + 1).run();
  dom.scrollIntoView({ behavior: "smooth", block: "start" });
  flashHeading(editor, found);
  return true;
}

export function TabOutline({
  tabId,
  title,
  active,
  open,
  onOpenChange,
  editor,
  getHtml,
  switchTab,
  mobile,
  triggerClassName,
}: {
  tabId: string;
  title: string;
  active: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editor: Editor;
  getHtml: (tabId: string) => string;
  switchTab: (tabId: string) => void;
  mobile: boolean;
  triggerClassName?: string;
}) {
  const t = useT();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const untitled = t("editor.outline.untitled");

  // Collect headings when opened; follow live edits while the active tab's outline is open.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    if (!active) {
      setItems(itemsFromHtml(getHtml(tabId), untitled));
      return;
    }
    const compute = () => setItems(itemsFromEditor(editor, untitled));
    compute();
    editor.on("update", compute);
    return () => {
      editor.off("update", compute);
    };
  }, [open, active, tabId, editor, getHtml, untitled]);

  // Anchor under the tab (fixed, so the scrolling tab row cannot clip it).
  useLayoutEffect(() => {
    if (!open || mobile) return;
    const anchor = triggerRef.current?.closest("[data-tab-anchor]") as HTMLElement | null;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const width = 320;
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: r.bottom + 4 });
  }, [open, mobile, tabId]);

  const close = useCallback(
    (restoreFocus: boolean) => {
      onOpenChange(false);
      if (restoreFocus) triggerRef.current?.focus();
    },
    [onOpenChange]
  );

  // Escape, click outside, resize / tab-row scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
      }
    };
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      const anchor = triggerRef.current?.closest("[data-tab-anchor]");
      if (anchor?.contains(target)) return; // the tab itself toggles
      close(false);
    };
    const onScroll = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (el && el.closest && el.closest("[role=tablist]")) close(false);
    };
    const onResize = () => close(false);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  // Move focus into the menu when it opens.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      const first = filterRef.current || panelRef.current?.querySelector<HTMLElement>("[role=menuitem]");
      first?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open, mobile, pos]);

  const goTo = (item: Item) => {
    onOpenChange(false);
    if (active) {
      revealHeading(editor, item.index);
      return;
    }
    switchTab(tabId);
    // The editor loads the tab's content synchronously, but layout settles a frame later: retry briefly.
    let tries = 0;
    const attempt = () => {
      if (revealHeading(editor, item.index) || ++tries > 10) return;
      window.setTimeout(attempt, 60);
    };
    window.setTimeout(attempt, 30);
  };

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => (q ? items.filter((i) => i.text.toLowerCase().includes(q)) : items), [items, q]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") || []);
    if (!nodes.length) return;
    const i = nodes.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === "ArrowDown") next = i < 0 ? 0 : Math.min(nodes.length - 1, i + 1);
    else if (e.key === "ArrowUp") next = i <= 0 ? (document.activeElement === filterRef.current ? -2 : 0) : i - 1;
    else if (e.key === "Home" && document.activeElement !== filterRef.current) next = 0;
    else if (e.key === "End" && document.activeElement !== filterRef.current) next = nodes.length - 1;
    else if (e.key === "Tab") {
      close(false);
      return;
    }
    if (next === -2) {
      e.preventDefault();
      filterRef.current?.focus();
      return;
    }
    if (next >= 0) {
      e.preventDefault();
      nodes[next].focus();
    }
  };

  const heading = t("editor.tabs.outlineTitle", { title });

  const body = (
    <div ref={panelRef} role="menu" aria-label={heading} onKeyDown={onMenuKey} className="flex flex-col min-h-0">
      {mobile && (
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
          <div className="text-[13px] font-semibold text-gray-900 truncate">{heading}</div>
          <button type="button" onClick={() => close(true)} className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100" aria-label={t("common.close")}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {items.length > FILTER_THRESHOLD && (
        <div className="px-2 pt-2 pb-1">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={filterRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("editor.tabs.outlineFilter")}
              aria-label={t("editor.tabs.outlineFilter")}
              className="w-full text-[13px] bg-white/70 border border-gray-200 rounded-lg pl-8 pr-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
      )}
      <div className="overflow-y-auto py-1.5 min-h-0">
        {items.length === 0 ? (
          <div className="px-4 py-5 text-center">
            <div className="text-[13px] font-medium text-gray-700">{t("editor.tabs.outlineEmpty")}</div>
            <div className="text-xs text-gray-500 mt-1">{t("editor.tabs.outlineEmptyHint")}</div>
          </div>
        ) : visible.length === 0 ? (
          <div className="px-4 py-4 text-xs text-gray-500">{t("editor.tabs.outlineNoMatches")}</div>
        ) : (
          visible.map((it) => (
            <button
              key={it.index}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => goTo(it)}
              className={`block w-full text-left text-[13px] py-1.5 pr-3 truncate text-gray-700 hover:bg-brand-50 hover:text-brand-700 focus-visible:bg-brand-50 focus-visible:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 ${it.level === 1 ? "font-semibold text-gray-900" : it.level === 2 ? "font-medium" : "font-normal"}`}
              style={{ paddingLeft: `${12 + (it.level - 1) * 14}px` }}
              title={it.text}
            >
              {it.text}
            </button>
          ))
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("editor.tabs.outlineOpen", { title })}
        title={t("editor.tabs.outlineOpen", { title })}
        className={`p-1 rounded hover:bg-gray-100 text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${triggerClassName || ""}`}
      >
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          mobile ? (
            <div className="fixed inset-0 z-[80] md:hidden">
              <div className="absolute inset-0 bg-black/30" onClick={() => close(false)} aria-hidden="true" />
              <div className="absolute inset-x-0 bottom-0 max-h-[70vh] flex flex-col bg-white/90 backdrop-blur-md border-t border-gray-200/70 rounded-t-2xl shadow-xl pb-[env(safe-area-inset-bottom)]">{body}</div>
            </div>
          ) : (
            pos && (
              <div
                className="fixed z-[80] w-[320px] max-h-[60vh] flex flex-col bg-white/85 backdrop-blur-md border border-gray-200/70 shadow-xl rounded-xl overflow-hidden"
                style={{ left: pos.left, top: pos.top }}
              >
                {body}
              </div>
            )
          ),
          document.body
        )}
    </>
  );
}
