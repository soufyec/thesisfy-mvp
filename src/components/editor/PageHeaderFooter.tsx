"use client";

import { useEffect } from "react";
import { fillHf, hfLayout, printCss, type HfSetup } from "./headerFooter";

/** The header of page 1 (later pages get theirs from the pagination widgets). Decorative: not part of the document. */
export function FirstPageHeader({ setup, pages }: { setup: HfSetup; pages: number }) {
  const layout = hfLayout(setup);
  if (!layout) return null;
  const s = layout.header;
  if (!s.l && !s.c && !s.r) return null;
  return (
    <div className="page-hf page-hf-header page-hf-first" aria-hidden="true">
      {(["l", "c", "r"] as const).map((k) => (
        <span key={k} className={`hf-${k}`}>{fillHf(s[k], 1, Math.max(1, pages))}</span>
      ))}
    </div>
  );
}

/** Injects the print stylesheet (page size, margins and @page margin boxes) while a header, footer or number is set. */
export function PrintHeaderFooter({ setup, page }: { setup: HfSetup; page: { size: "A4" | "Letter"; orientation: "portrait" | "landscape"; margin: number } }) {
  const { headerText, footerText, pageNumbers } = setup;
  const { size, orientation, margin } = page;
  useEffect(() => {
    const layout = hfLayout({ headerText, footerText, pageNumbers });
    if (!layout) return;
    const style = document.createElement("style");
    style.setAttribute("data-print-hf", "");
    style.textContent = printCss(layout, { size, orientation, margin });
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, [headerText, footerText, pageNumbers, size, orientation, margin]);
  return null;
}
