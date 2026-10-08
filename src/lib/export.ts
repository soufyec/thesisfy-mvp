"use client";

import { hfLayout } from "@/components/editor/headerFooter";
import { AlignmentType, Document, Footer, Header, HeadingLevel, ImageRun, Packer, PageBreak, PageNumber, PageOrientation, Paragraph, ShadingType, Tab, Table, TableCell, TableRow, TabStopType, TextRun, VerticalAlignTable, WidthType } from "docx";

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Keeps accented letters and ñ; removes only characters that are invalid in file names, and trailing dots. */
export function safeFileName(title: string) {
  const cleaned = (title || "thesis")
    .replace(/[\\/:*?"<>|\x00-\x1f]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "")
    .slice(0, 80)
    .trim();
  return cleaned || "thesis";
}

export function htmlToText(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("h1,h2,h3,h4,p,li,tr,div").forEach((el) => el.append("\n"));
  return (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

export function htmlToMarkdown(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as HTMLElement;
    const inner = () => Array.from(el.childNodes).map(walk).join("");
    switch (el.tagName.toLowerCase()) {
      case "h1":
        return `# ${inner()}\n\n`;
      case "h2":
        return `## ${inner()}\n\n`;
      case "h3":
        return `### ${inner()}\n\n`;
      case "h4":
        return `#### ${inner()}\n\n`;
      case "p":
        return `${inner()}\n\n`;
      case "strong":
      case "b":
        return `**${inner()}**`;
      case "em":
      case "i":
        return `*${inner()}*`;
      case "u":
        return inner();
      case "s":
      case "strike":
        return `~~${inner()}~~`;
      case "code":
        return `\`${inner()}\``;
      case "pre":
        return `\n\`\`\`\n${el.textContent}\n\`\`\`\n\n`;
      case "a":
        return `[${inner()}](${el.getAttribute("href") || ""})`;
      case "ul":
        return Array.from(el.children).map((li) => `- ${walk(li).trim()}`).join("\n") + "\n\n";
      case "ol":
        return Array.from(el.children).map((li, i) => `${i + 1}. ${walk(li).trim()}`).join("\n") + "\n\n";
      case "li":
        return inner();
      case "blockquote":
        return inner().split("\n").filter(Boolean).map((l) => `> ${l}`).join("\n") + "\n\n";
      case "hr":
        return "---\n\n";
      case "br":
        return "\n";
      case "img":
        return `![${el.getAttribute("alt") || ""}](${el.getAttribute("src") || ""})`;
      case "figure": {
        const img = el.querySelector("img");
        if (!img) return inner();
        const caption = (el.querySelector("figcaption")?.textContent || "").trim();
        return `![${img.getAttribute("alt") || caption}](${img.getAttribute("src") || ""})\n\n${caption ? `*${caption}*\n\n` : ""}`;
      }
      case "figcaption":
        return "";
      case "table": {
        const rows = Array.from(el.querySelectorAll("tr")).map((tr) => Array.from(tr.children).map((c) => walk(c).trim().replace(/\n+/g, " ")));
        if (!rows.length) return "";
        const head = rows[0];
        return `| ${head.join(" | ")} |\n| ${head.map(() => "---").join(" | ")} |\n${rows.slice(1).map((r) => `| ${r.join(" | ")} |`).join("\n")}\n\n`;
      }
      default:
        return inner();
    }
  };
  return walk(doc.body).replace(/\n{3,}/g, "\n\n").trim();
}

interface RunStyle {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  strike?: boolean;
  highlight?: boolean;
  superScript?: boolean;
  subScript?: boolean;
  color?: string;
}

function runsFrom(node: Node, style: RunStyle = {}): TextRun[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || "";
    if (!text) return [];
    return [new TextRun({ text, bold: style.bold, italics: style.italics, underline: style.underline ? {} : undefined, strike: style.strike, superScript: style.superScript, subScript: style.subScript, highlight: style.highlight ? "yellow" : undefined, color: style.color })];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const next: RunStyle = { ...style };
  if (tag === "strong" || tag === "b") next.bold = true;
  if (tag === "em" || tag === "i") next.italics = true;
  if (tag === "u") next.underline = true;
  if (tag === "s" || tag === "strike") next.strike = true;
  if (tag === "mark") next.highlight = true;
  if (tag === "sup") next.superScript = true;
  if (tag === "sub") next.subScript = true;
  if (el.style?.color) next.color = el.style.color.replace(/[^0-9a-f]/gi, "").slice(0, 6) || undefined;
  if (tag === "br") return [new TextRun({ break: 1 })];
  return Array.from(el.childNodes).flatMap((c) => runsFrom(c, next));
}

function alignment(el: HTMLElement) {
  const a = el.style?.textAlign;
  return a === "center" ? AlignmentType.CENTER : a === "right" ? AlignmentType.RIGHT : a === "justify" ? AlignmentType.JUSTIFIED : AlignmentType.LEFT;
}

/** Natural size of a data URL image; the parsed export document has no layout, so the browser loads it. */
function naturalSize(src: string): Promise<{ w: number; h: number } | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? { w: img.naturalWidth, h: img.naturalHeight } : null);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Text-column width of the exported page in px; the image width saved in the editor (`px` or `%`) is scaled to it. */
const DOCX_MAX_IMAGE_PX = 500;

async function imageRun(el: HTMLImageElement, holder: HTMLElement = el) {
  const src = el.getAttribute("src") || "";
  if (!src.startsWith("data:image/")) return null;
  try {
    const type = src.startsWith("data:image/png") ? "png" : src.startsWith("data:image/gif") ? "gif" : "jpg";
    const data = Uint8Array.from(atob(src.split(",")[1]), (c) => c.charCodeAt(0));
    const size = (el.naturalWidth && el.naturalHeight ? { w: el.naturalWidth, h: el.naturalHeight } : null) || (await naturalSize(src));
    const saved = /^(\d+(?:\.\d+)?)(px|%)$/.exec(holder.getAttribute("data-width") || el.getAttribute("data-width") || "");
    let w = size?.w || Number(el.getAttribute("width")) || 400;
    if (saved) w = saved[2] === "%" ? (DOCX_MAX_IMAGE_PX * parseFloat(saved[1])) / 100 : parseFloat(saved[1]);
    w = Math.max(20, Math.min(DOCX_MAX_IMAGE_PX, Math.round(w)));
    const ratio = size ? size.h / size.w : 0.66;
    return new ImageRun({ type, data, transformation: { width: w, height: Math.round(w * ratio) } });
  } catch {
    return null;
  }
}

function imageAlignment(holder: HTMLElement) {
  const a = holder.getAttribute("data-align");
  const wrap = holder.getAttribute("data-wrap");
  const side = wrap === "left" || wrap === "right" ? wrap : a;
  return side === "left" ? AlignmentType.LEFT : side === "right" ? AlignmentType.RIGHT : AlignmentType.CENTER;
}

/** `#rrggbb` (no hash) from a CSS colour such as `rgb(1, 2, 3)` or `#abc`; undefined when it cannot be read. */
function cssColorToHex(value: string): string | undefined {
  const v = (value || "").trim().toLowerCase();
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(v);
  if (rgb) return [rgb[1], rgb[2], rgb[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("");
  const hex = /^#([0-9a-f]{6})$/.exec(v);
  if (hex) return hex[1];
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  return short ? `${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : undefined;
}

/** One header or footer band: text with `{page}` / `{pages}` as real Word page fields, left / centre / right via tab stops. */
function hfBand(slots: { l: string; c: string; r: string }, widthTwips: number): Paragraph {
  const runs = (tpl: string) =>
    tpl
      .split(/(\{pages\}|\{page\})/i)
      .filter((p) => p !== "")
      .map((p) => (/^\{pages\}$/i.test(p) ? new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: "5F6368" }) : /^\{page\}$/i.test(p) ? new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "5F6368" }) : new TextRun({ text: p, size: 18, color: "5F6368" })));
  const used = [slots.l, slots.c, slots.r].filter(Boolean).length;
  if (used === 1) return new Paragraph({ alignment: slots.l ? AlignmentType.LEFT : slots.c ? AlignmentType.CENTER : AlignmentType.RIGHT, children: runs(slots.l || slots.c || slots.r) });
  const tab = () => new TextRun({ children: [new Tab()], size: 18 });
  return new Paragraph({
    tabStops: [{ type: TabStopType.CENTER, position: Math.round(widthTwips / 2) }, { type: TabStopType.RIGHT, position: widthTwips }],
    children: [...runs(slots.l), tab(), ...runs(slots.c), tab(), ...runs(slots.r)],
  });
}

export async function htmlToDocx(html: string, opts: { title: string; author?: string; orientation?: "portrait" | "landscape"; marginCm?: number; lineSpacing?: number; headerText?: string; footerText?: string; pageNumbers?: "none" | "footerCenter" | "footerRight" | "headerRight"; numberHeadings?: boolean }): Promise<Blob> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const children: (Paragraph | Table)[] = [];
  const spacing = { line: Math.round((opts.lineSpacing || 1.5) * 240), after: 120 };
  const headingCounters = [0, 0, 0];

  const block = async (el: HTMLElement, listCtx?: { kind: "bullet" | "number"; level: number }) => {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const level = ({ h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2, h3: HeadingLevel.HEADING_3, h4: HeadingLevel.HEADING_4, h5: HeadingLevel.HEADING_5, h6: HeadingLevel.HEADING_6 } as Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]>)[tag];
      // Heading numbering (Formato › Estilos de párrafo): written into the text, as 1 / 1.1 / 1.1.1 for Heading 2 / 3 / 4.
      let numberPrefix = "";
      const hl = Number(tag.slice(1));
      if (opts.numberHeadings && hl >= 2 && hl <= 4) {
        headingCounters[hl - 2] += 1;
        for (let i = hl - 1; i < headingCounters.length; i++) headingCounters[i] = 0;
        numberPrefix = `${headingCounters.slice(0, hl - 1).join(".")}${hl === 2 ? "." : ""}  `;
      }
      children.push(new Paragraph({ heading: level, alignment: alignment(el), children: [...(numberPrefix ? [new TextRun({ text: numberPrefix })] : []), ...runsFrom(el)] }));
      return;
    }
    if (tag === "p") {
      const img = el.querySelector("img");
      if (img) {
        const r = await imageRun(img as HTMLImageElement);
        if (r) children.push(new Paragraph({ children: [r], alignment: imageAlignment(img as HTMLElement) }));
      }
      const runs = runsFrom(el);
      if (runs.length || !img) {
        children.push(
          new Paragraph({
            children: runs,
            alignment: alignment(el),
            spacing,
            indent: el.getAttribute("data-indent-mode") === "first" ? { firstLine: 720 } : el.getAttribute("data-indent-mode") === "hanging" ? { left: 720, hanging: 720 } : Number(el.getAttribute("data-indent")) ? { left: Number(el.getAttribute("data-indent")) * 720 } : undefined,
            bullet: listCtx?.kind === "bullet" ? { level: listCtx.level } : undefined,
            numbering: listCtx?.kind === "number" ? { reference: "numbers", level: listCtx.level } : undefined,
          })
        );
      }
      return;
    }
    if (tag === "img") {
      const r = await imageRun(el as HTMLImageElement);
      if (r) children.push(new Paragraph({ children: [r], alignment: imageAlignment(el) }));
      return;
    }
    if (tag === "figure") {
      // Editor figure: the image (width and alignment from its data attributes) followed by its caption as a small italic paragraph.
      const img = el.querySelector("img");
      const r = img ? await imageRun(img as HTMLImageElement, el) : null;
      if (r) children.push(new Paragraph({ children: [r], alignment: imageAlignment(el), keepNext: true }));
      const caption = (el.querySelector("figcaption")?.textContent || "").trim();
      if (caption) children.push(new Paragraph({ children: [new TextRun({ text: caption, italics: true, size: 20 })], alignment: imageAlignment(el), spacing }));
      return;
    }
    if (tag === "ul" || tag === "ol") {
      const kind = tag === "ul" ? "bullet" : "number";
      const level = listCtx ? listCtx.level + 1 : 0;
      for (const li of Array.from(el.children)) {
        const nested = Array.from(li.children).filter((c) => /^(ul|ol)$/i.test(c.tagName));
        const own = Array.from(li.childNodes).filter((c) => !(c instanceof HTMLElement && /^(ul|ol)$/i.test(c.tagName)));
        const wrapper = doc.createElement("p");
        own.forEach((c) => wrapper.appendChild(c.cloneNode(true)));
        // unwrap nested p
        const inner = wrapper.querySelector("p") ? (wrapper.querySelector("p") as HTMLElement) : wrapper;
        children.push(new Paragraph({ children: runsFrom(inner), spacing, bullet: kind === "bullet" ? { level } : undefined, numbering: kind === "number" ? { reference: "numbers", level } : undefined }));
        for (const n of nested) await block(n as HTMLElement, { kind, level });
      }
      return;
    }
    if (tag === "blockquote") {
      for (const c of Array.from(el.children)) children.push(new Paragraph({ children: runsFrom(c), indent: { left: 720 }, spacing, style: "Quote" }));
      return;
    }
    if (tag === "pre") {
      children.push(new Paragraph({ children: [new TextRun({ text: el.textContent || "", font: "Courier New", size: 20 })], spacing }));
      return;
    }
    if (tag === "hr") {
      children.push(new Paragraph({ text: "", border: { bottom: { color: "999999", space: 1, style: "single", size: 6 } } }));
      return;
    }
    if (el.hasAttribute("data-page-break")) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
      return;
    }
    if (tag === "table") {
      const rows = Array.from(el.querySelectorAll("tr")).map(
        (tr) =>
          new TableRow({
            children: Array.from(tr.children).map(
              (cell) =>
                new TableCell({
                  shading: cssColorToHex((cell as HTMLElement).style?.backgroundColor || cell.getAttribute("data-bg") || "") ? { type: ShadingType.CLEAR, color: "auto", fill: cssColorToHex((cell as HTMLElement).style?.backgroundColor || cell.getAttribute("data-bg") || "") } : undefined,
                  verticalAlign: (cell as HTMLElement).style?.verticalAlign === "middle" ? VerticalAlignTable.CENTER : (cell as HTMLElement).style?.verticalAlign === "bottom" ? VerticalAlignTable.BOTTOM : undefined,
                  children: Array.from(cell.children).length ? Array.from(cell.children).map((c) => new Paragraph({ children: runsFrom(c, { bold: cell.tagName.toLowerCase() === "th" }) })) : [new Paragraph({ children: runsFrom(cell, { bold: cell.tagName.toLowerCase() === "th" }) })],
                })
            ),
          })
      );
      if (rows.length) children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
      return;
    }
    if (tag === "div" || tag === "section" || tag === "body") {
      for (const c of Array.from(el.children)) await block(c as HTMLElement, listCtx);
      return;
    }
    const runs = runsFrom(el);
    if (runs.length) children.push(new Paragraph({ children: runs, spacing }));
  };

  for (const c of Array.from(doc.body.children)) await block(c as HTMLElement);

  const marginTwips = Math.round((opts.marginCm || 2.54) * 567);
  // Header / footer / page numbers as native Word header and footer parts (page fields update in Word).
  const layout = hfLayout({ headerText: opts.headerText, footerText: opts.footerText, pageNumbers: opts.pageNumbers });
  const textWidth = (opts.orientation === "landscape" ? 16838 : 11906) - 2 * marginTwips;
  const hasBand = (s: { l: string; c: string; r: string }) => !!(s.l || s.c || s.r);
  const hf = {
    headers: layout && hasBand(layout.header) ? { default: new Header({ children: [hfBand(layout.header, textWidth)] }) } : undefined,
    footers: layout && hasBand(layout.footer) ? { default: new Footer({ children: [hfBand(layout.footer, textWidth)] }) } : undefined,
  };
  const document = new Document({
    creator: opts.author || "Thesisfic",
    title: opts.title,
    numbering: { config: [{ reference: "numbers", levels: [0, 1, 2].map((level) => ({ level, format: "decimal" as const, text: `%${level + 1}.`, alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } } })) }] },
    styles: { default: { document: { run: { font: "Times New Roman", size: 24 } } } },
    sections: [{ ...hf, properties: { page: { margin: { top: marginTwips, bottom: marginTwips, left: marginTwips, right: marginTwips }, size: { orientation: opts.orientation === "landscape" ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT } } }, children }],
  });
  return Packer.toBlob(document);
}

/** Wraps document HTML in a printable standalone page (used for "Download as HTML" and print preview). */
export function standaloneHtml(html: string, title: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, "&lt;")}</title>
<style>body{font-family:Georgia,serif;max-width:17cm;margin:2.54cm auto;line-height:1.6;color:#111}h1{font-size:1.8em}h2{font-size:1.4em}h3{font-size:1.15em}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px 8px}img{max-width:100%;height:auto}figcaption{font-size:.85em;color:#555;text-align:center;margin-top:.3em}.page-break{page-break-after:always}[data-provenance]{border-bottom:1px dotted #999}</style></head><body>${html}</body></html>`;
}

export type CsvCell = string | number | boolean | null | undefined;

/** Serialises rows to RFC 4180 CSV (comma separated, quoted when needed, CRLF line ends). The first row is the header. */
export function toCsv(rows: CsvCell[][]): string {
  const cell = (v: CsvCell) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
