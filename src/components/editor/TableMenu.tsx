"use client";

import { useEffect, useState } from "react";
import { BubbleMenu, type Editor } from "@tiptap/react";
import { CellSelection } from "@tiptap/pm/tables";
import { AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, BetweenHorizontalEnd, BetweenHorizontalStart, BetweenVerticalEnd, BetweenVerticalStart, Merge, PaintBucket, Split, Table2, Trash2, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/dictionary";
import type { Item } from "./MenuBar";
import { HIGHLIGHTS } from "./types";

/** Names of the `HIGHLIGHTS` colours, in order (`editor.table.bg.<name>`). */
const BG_NAMES = ["yellow", "amber", "green", "blue", "purple", "orange", "gray"];

/** Runs a table action (`rowBefore`, `delCol`, `bg-2`, `valign-middle`…) at the cursor. Returns false when it does not apply. */
export function runTableAction(editor: Editor, action: string): boolean {
  const c = editor.chain().focus();
  switch (action) {
    case "rowBefore": return c.addRowBefore().run();
    case "rowAfter": return c.addRowAfter().run();
    case "colBefore": return c.addColumnBefore().run();
    case "colAfter": return c.addColumnAfter().run();
    case "delRow": return c.deleteRow().run();
    case "delCol": return c.deleteColumn().run();
    case "delTable": return c.deleteTable().run();
    case "merge": return c.mergeCells().run();
    case "split": return c.splitCell().run();
    case "header": return c.toggleHeaderRow().run();
    case "headerCol": return c.toggleHeaderColumn().run();
    case "valign-top": return c.setCellAttribute("verticalAlign", "top").run();
    case "valign-middle": return c.setCellAttribute("verticalAlign", "middle").run();
    case "valign-bottom": return c.setCellAttribute("verticalAlign", "bottom").run();
    case "bg-none": return c.setCellAttribute("backgroundColor", null).run();
    default: {
      const m = /^bg-(\d+)$/.exec(action);
      if (m && HIGHLIGHTS[Number(m[1])]) return c.setCellAttribute("backgroundColor", HIGHLIGHTS[Number(m[1])]).run();
      return false;
    }
  }
}

/** The table commands as menu items (Format › Table and the right-click menu). Disabled outside a table or when read-only. */
export function tableMenuItems(editor: Editor, t: Translate, enabled: boolean): Item[] {
  const inTable = enabled && editor.isActive("table");
  const a = (label: string, action: string, extra: Partial<Item> = {}): Item => ({ label, action: `table:${action}`, disabled: !inTable, ...extra });
  return [
    a(t("editor.table.menu.rowBefore"), "rowBefore"),
    a(t("editor.table.menu.rowAfter"), "rowAfter"),
    a(t("editor.table.menu.colBefore"), "colBefore"),
    a(t("editor.table.menu.colAfter"), "colAfter"),
    { sep: true, label: "" },
    a(t("editor.table.menu.delRow"), "delRow"),
    a(t("editor.table.menu.delCol"), "delCol"),
    a(t("editor.table.menu.delTable"), "delTable"),
    { sep: true, label: "" },
    a(t("editor.table.menu.merge"), "merge", { disabled: !inTable || !editor.can().mergeCells() }),
    a(t("editor.table.menu.split"), "split", { disabled: !inTable || !editor.can().splitCell() }),
    { sep: true, label: "" },
    a(t("editor.table.menu.headerRow"), "header", { checked: inTable && editor.isActive("tableHeader") }),
    a(t("editor.table.menu.headerCol"), "headerCol"),
    {
      label: t("editor.table.menu.valign"),
      disabled: !inTable,
      children: [
        a(t("editor.table.menu.valignTop"), "valign-top"),
        a(t("editor.table.menu.valignMiddle"), "valign-middle"),
        a(t("editor.table.menu.valignBottom"), "valign-bottom"),
      ],
    },
    {
      label: t("editor.table.menu.bg"),
      disabled: !inTable,
      children: [
        a(t("editor.table.bg.none"), "bg-none", { swatch: "" }),
        ...HIGHLIGHTS.map((color, i) => a(t(`editor.table.bg.${BG_NAMES[i]}`), `bg-${i}`, { swatch: color })),
      ],
    },
  ];
}

const bm = "bm-btn";

/**
 * Floating table toolbar: shown above the table while the cursor is inside it (or cells are selected). Insert row/column,
 * merge/split, header row, and a second row for cell format (background, vertical alignment) or deletion.
 */
export function TableBubble({ editor, canEdit }: { editor: Editor; canEdit: boolean }) {
  const t = useT();
  const [panel, setPanel] = useState<null | "cell" | "delete">(null);
  const act = (a: string) => runTableAction(editor, a);
  const btn = (action: string, label: string, icon: React.ReactNode, opts: { disabled?: boolean; active?: boolean } = {}) => (
    <button type="button" key={action} onMouseDown={(e) => e.preventDefault()} onClick={() => act(action)} disabled={opts.disabled} className={`${bm} ${opts.active ? "active" : ""} disabled:opacity-40`} aria-label={label} title={label}>
      {icon}
    </button>
  );
  const toggle = (p: "cell" | "delete", label: string, icon: React.ReactNode) => (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setPanel((cur) => (cur === p ? null : p))} className={`${bm} ${panel === p ? "active" : ""}`} aria-label={label} aria-expanded={panel === p} title={label}>
      {icon}
    </button>
  );
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableMenu"
      shouldShow={({ state }) => canEdit && editor.isActive("table") && (state.selection.empty || state.selection instanceof CellSelection)}
      tippyOptions={{
        duration: 120,
        placement: "top-start",
        offset: [0, 6],
        getReferenceClientRect: () => {
          const node = editor.view.domAtPos(editor.state.selection.from).node;
          const el = (node.nodeType === 1 ? (node as HTMLElement) : node.parentElement)?.closest("table");
          return el ? el.getBoundingClientRect() : new DOMRect(0, 0, 0, 0);
        },
      }}
    >
      <div className="bubble-menu !flex-col !items-stretch !gap-1" role="toolbar" aria-label={t("editor.table.menu.title")}>
        <div className="flex items-center gap-0.5">
          <Table2 className="w-[13px] h-[13px] mx-1.5 text-white/60" aria-hidden="true" />
          {btn("rowBefore", t("editor.table.menu.rowBefore"), <BetweenHorizontalStart className="w-[15px] h-[15px]" />)}
          {btn("rowAfter", t("editor.table.menu.rowAfter"), <BetweenHorizontalEnd className="w-[15px] h-[15px]" />)}
          {btn("colBefore", t("editor.table.menu.colBefore"), <BetweenVerticalStart className="w-[15px] h-[15px]" />)}
          {btn("colAfter", t("editor.table.menu.colAfter"), <BetweenVerticalEnd className="w-[15px] h-[15px]" />)}
          <span className="bm-sep" />
          {btn("merge", t("editor.table.menu.merge"), <Merge className="w-[15px] h-[15px]" />, { disabled: !editor.can().mergeCells() })}
          {btn("split", t("editor.table.menu.split"), <Split className="w-[15px] h-[15px]" />, { disabled: !editor.can().splitCell() })}
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => act("header")} className={`${bm} !px-2 ${editor.isActive("tableHeader") ? "active" : ""}`} aria-pressed={editor.isActive("tableHeader")} title={t("editor.table.menu.headerRow")}>
            {t("editor.table.menu.headerShort")}
          </button>
          <span className="bm-sep" />
          {toggle("cell", t("editor.table.menu.cellFormat"), <PaintBucket className="w-[15px] h-[15px]" />)}
          {toggle("delete", t("editor.table.menu.delete"), <Trash2 className="w-[15px] h-[15px]" />)}
        </div>
        {panel === "cell" && (
          <div className="flex items-center gap-1 px-1 pb-0.5 pt-1 border-t border-white/15">
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => act("bg-none")} className="w-5 h-5 rounded border border-white/50 inline-flex items-center justify-center" aria-label={t("editor.table.bg.none")} title={t("editor.table.bg.none")}>
              <X className="w-3 h-3 mx-auto text-white" aria-hidden="true" />
            </button>
            {HIGHLIGHTS.map((color, i) => (
              <button key={color} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => act(`bg-${i}`)} className="w-5 h-5 rounded border border-white/30" style={{ background: color }} aria-label={t(`editor.table.bg.${BG_NAMES[i]}`)} title={t(`editor.table.bg.${BG_NAMES[i]}`)} />
            ))}
            <span className="bm-sep" />
            {btn("valign-top", t("editor.table.menu.valignTop"), <AlignVerticalJustifyStart className="w-[15px] h-[15px]" />)}
            {btn("valign-middle", t("editor.table.menu.valignMiddle"), <AlignVerticalJustifyCenter className="w-[15px] h-[15px]" />)}
            {btn("valign-bottom", t("editor.table.menu.valignBottom"), <AlignVerticalJustifyEnd className="w-[15px] h-[15px]" />)}
          </div>
        )}
        {panel === "delete" && (
          <div className="flex items-center gap-0.5 pt-1 border-t border-white/15">
            {(["delRow", "delCol", "delTable"] as const).map((k) => (
              <button key={k} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { act(k); setPanel(null); }} className={`${bm} !px-2 ${k === "delTable" ? "!text-red-300" : ""}`}>
                {t(`editor.table.menu.${k}`)}
              </button>
            ))}
          </div>
        )}
      </div>
    </BubbleMenu>
  );
}

/** Right-click menu inside a table: the same items as Format › Table. */
export function TableContextMenu({ editor, at, onAction, onClose }: { editor: Editor; at: { x: number; y: number } | null; onAction: (a: string) => void; onClose: () => void }) {
  const t = useT();
  useEffect(() => {
    if (!at) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent && (e.target as HTMLElement).closest?.("[data-table-ctx]")) return;
      onClose();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [at, onClose]);
  if (!at) return null;
  const items = tableMenuItems(editor, t, true);
  const flat: Item[] = [];
  items.forEach((it) => {
    if (it.children) {
      flat.push({ sep: true, label: "" });
      flat.push({ label: it.label, disabled: true });
      it.children.forEach((c) => flat.push(c));
    } else flat.push(it);
  });
  const left = Math.max(8, Math.min(at.x, window.innerWidth - 250));
  const top = Math.max(8, Math.min(at.y, window.innerHeight - 440));
  return (
    <div data-table-ctx className="docs-menu !fixed !min-w-[230px] max-h-[430px] overflow-y-auto" style={{ left, top, zIndex: 80 }} role="menu" aria-label={t("editor.table.menu.title")}>
      {flat.map((it, i) =>
        it.sep ? (
          <div key={i} className="sep" />
        ) : it.action ? (
          <button key={i} role="menuitem" disabled={it.disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => { onAction(it.action!.replace(/^table:/, "")); onClose(); }}>
            <span className="flex items-center gap-2">
              {it.swatch !== undefined && <span className="inline-block w-3.5 h-3.5 rounded border border-gray-300" style={it.swatch ? { background: it.swatch } : undefined} aria-hidden="true" />}
              {it.label}
            </span>
          </button>
        ) : (
          <div key={i} className="px-3 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{it.label}</div>
        )
      )}
    </div>
  );
}
