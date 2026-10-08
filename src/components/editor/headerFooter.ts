/**
 * Page header / footer / page numbering. The texts live in `ThesisDoc.pageSetup` (headerText, footerText, pageNumbers)
 * and accept the fields `{page}` and `{pages}`. This file is pure logic shared by the on-screen render (pagination.ts
 * widgets + the first-page header), the print stylesheet (@page margin boxes) and the DOCX export.
 */

export type PageNumberPos = "none" | "footerCenter" | "footerRight" | "headerRight";

export interface HfSetup {
  headerText?: string;
  footerText?: string;
  pageNumbers?: PageNumberPos;
}

/** Left / centre / right templates of one band; empty string = nothing in that slot. */
export interface HfSlots {
  l: string;
  c: string;
  r: string;
}

export interface HfLayout {
  header: HfSlots;
  footer: HfSlots;
}

export const PAGE_NUMBER_OPTIONS: PageNumberPos[] = ["none", "footerCenter", "footerRight", "headerRight"];

/** Slot layout for the three settings, or null when the page has no header, footer or number. */
export function hfLayout(s: HfSetup): HfLayout | null {
  const header = (s.headerText || "").trim();
  const footer = (s.footerText || "").trim();
  const pos: PageNumberPos = s.pageNumbers || "none";
  const h: HfSlots = { l: header, c: "", r: pos === "headerRight" ? "{page}" : "" };
  const f: HfSlots = { l: "", c: "", r: "" };
  if (pos === "footerCenter") {
    f.l = footer;
    f.c = "{page}";
  } else {
    f.c = footer;
    if (pos === "footerRight") f.r = "{page}";
  }
  const any = [h.l, h.c, h.r, f.l, f.c, f.r].some(Boolean);
  return any ? { header: h, footer: f } : null;
}

/** Substitutes `{page}` and `{pages}`. */
export function fillHf(template: string, page: number, pages: number): string {
  return template.replace(/\{pages\}/gi, String(pages)).replace(/\{page\}/gi, String(page));
}

/** Fills the three `<span>` slots of a header/footer band element. */
export function renderHfBand(el: HTMLElement, slots: HfSlots, page: number, pages: number) {
  el.textContent = "";
  (["l", "c", "r"] as const).forEach((k) => {
    const span = document.createElement("span");
    span.className = `hf-${k}`;
    span.textContent = fillHf(slots[k], page, pages);
    el.appendChild(span);
  });
}

const cssString = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/</g, "\\3c ").replace(/[\r\n]+/g, " ")}"`;

/** A template as a CSS `content` value using the paged-media counters (`counter(page)`, `counter(pages)`). */
export function cssContent(template: string): string {
  const parts = template
    .split(/(\{pages\}|\{page\})/i)
    .filter((p) => p !== "")
    .map((p) => (/^\{pages\}$/i.test(p) ? "counter(pages)" : /^\{page\}$/i.test(p) ? "counter(page)" : cssString(p)));
  return parts.length ? parts.join(" ") : '""';
}

/**
 * Print stylesheet: the page size and margins of the document plus @page margin boxes with the header and footer
 * (Chromium 131+ renders `counter(page)` / `counter(pages)` in them).
 */
export function printCss(layout: HfLayout, page: { size: "A4" | "Letter"; orientation: "portrait" | "landscape"; margin: number }): string {
  const box = (name: string, tpl: string, align: string) => (tpl ? `@${name} { content: ${cssContent(tpl)}; text-align: ${align}; font: 9pt Inter, Arial, sans-serif; color: rgb(95, 99, 104); }` : "");
  return `@media print { @page { size: ${page.size} ${page.orientation}; margin: ${page.margin}cm; ${box("top-left", layout.header.l, "left")} ${box("top-center", layout.header.c, "center")} ${box("top-right", layout.header.r, "right")} ${box("bottom-left", layout.footer.l, "left")} ${box("bottom-center", layout.footer.c, "center")} ${box("bottom-right", layout.footer.r, "right")} } }`;
}
