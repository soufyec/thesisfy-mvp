"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { FOCUS_RING } from "./paperList";

export interface PaperMenuItem {
  key: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  onSelect?: () => void;
  danger?: boolean;
}

/**
 * The ⋯ menu of a paper card. Keyboard: Enter/Space or ArrowDown opens it on the first item, arrows move, Home/End
 * jump, Escape and Tab close it and give focus back to the button. A click outside closes it.
 */
export function PaperMenu({ label, items }: { label: string; items: PaperMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    itemRefs.current[0]?.focus();
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!items.length) return null;

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };
  const move = (delta: number | "first" | "last") => {
    const els = itemRefs.current.filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const i = els.indexOf(document.activeElement as HTMLElement);
    const next = delta === "first" ? 0 : delta === "last" ? els.length - 1 : (i + delta + els.length) % els.length;
    els[next].focus();
  };
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      move("first");
    } else if (e.key === "End") {
      e.preventDefault();
      move("last");
    } else if (e.key === "Tab") {
      close(false);
    }
  };
  const itemCls = (danger?: boolean) =>
    `flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] focus:outline-none focus-visible:bg-gray-100 ${danger ? "text-red-600 hover:bg-red-50 focus-visible:bg-red-50" : "text-gray-700 hover:bg-gray-50"}`;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 ${FOCUS_RING}`}
      >
        <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={label} onKeyDown={onMenuKey} className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
          {items.map((item, i) => {
            const Icon = item.icon;
            const content = (
              <>
                <Icon className={`h-4 w-4 flex-shrink-0 ${item.danger ? "text-red-500" : "text-gray-400"}`} strokeWidth={2} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </>
            );
            return item.href ? (
              <Link key={item.key} ref={(el) => { itemRefs.current[i] = el; }} href={item.href} role="menuitem" tabIndex={-1} className={itemCls(item.danger)} onClick={() => setOpen(false)}>
                {content}
              </Link>
            ) : (
              <button
                key={item.key}
                ref={(el) => { itemRefs.current[i] = el; }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={itemCls(item.danger)}
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PaperMenu;
