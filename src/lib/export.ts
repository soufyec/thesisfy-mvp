"use client";

import { AlignmentType, Document, HeadingLevel, ImageRun, Packer, PageBreak, PageOrientation, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";

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

export function safeFileName(title: string) {
  return (title || "thesis").replace(/[^\w\d\-. ]+/g, "").trim().slice(0, 80) || "thesis";
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

async function imageRun(el: HTMLImageElement) {
  const src = el.getAttribute("src") || "";
  if (!src.startsWith("data:image/")) return null;
  try {
    const type = src.startsWith("data:image/png") ? "png" : src.startsWith("data:image/gif") ? "gif" : "jpg";
    const data = Uint8Array.from(atob(src.split(",")[1]), (c) => c.charCodeAt(0));
    const w = Math.min(500, el.naturalWidth || Number(el.getAttribute("width")) || 400);
    const ratio = el.naturalHeight && el.naturalWidth ? el.naturalHeight / el.naturalWidth : 0.66;
    return new ImageRun({ type, data, transformation: { width: w, height: Math.round(w * ratio) } });
  } catch {
    return null;
  }
}

export async function htmlToDocx(html: string, opts: { title: string; author?: string; orientation?: "portrait" | "landscape"; marginCm?: number; lineSpacing?: number }): Promise<Blob> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const children: (Paragraph | Table)[] = [];
  const spacing = { line: Math.round((opts.lineSpacing || 1.5) * 240), after: 120 };

  const block = async (el: HTMLElement, listCtx?: { kind: "bullet" | "number"; level: number }) => {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const level = ({ h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2, h3: HeadingLevel.HEADING_3, h4: HeadingLevel.HEADING_4, h5: HeadingLevel.HEADING_5, h6: HeadingLevel.HEADING_6 } as Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]>)[tag];
      children.push(new Paragraph({ heading: level, alignment: alignment(el), children: runsFrom(el) }));
      return;
    }
    if (tag === "p") {
      const img = el.querySelector("img");
      if (img) {
        const r = await imageRun(img as HTMLImageElement);
        if (r) children.push(new Paragraph({ children: [r], alignment: AlignmentType.CENTER }));
      }
      const runs = runsFrom(el);
      if (runs.length || !img) {
        children.push(
          new Paragraph({
            children: runs,
            alignment: alignment(el),
            spacing,
            indent: Number(el.getAttribute("data-indent")) ? { left: Number(el.getAttribute("data-indent")) * 720 } : undefined,
            bullet: listCtx?.kind === "bullet" ? { level: listCtx.level } : undefined,
            numbering: listCtx?.kind === "number" ? { reference: "numbers", level: listCtx.level } : undefined,
          })
        );
      }
      return;
    }
    if (tag === "img") {
      const r = await imageRun(el as HTMLImageElement);
      if (r) children.push(new Paragraph({ children: [r], alignment: AlignmentType.CENTER }));
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
  const document = new Document({
    creator: opts.author || "Thesisfy",
    title: opts.title,
    numbering: { config: [{ reference: "numbers", levels: [0, 1, 2].map((level) => ({ level, format: "decimal" as const, text: `%${level + 1}.`, alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } } })) }] },
    styles: { default: { document: { run: { font: "Times New Roman", size: 24 } } } },
    sections: [{ properties: { page: { margin: { top: marginTwips, bottom: marginTwips, left: marginTwips, right: marginTwips }, size: { orientation: opts.orientation === "landscape" ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT } } }, children }],
  });
  return Packer.toBlob(document);
}

/** Wraps document HTML in a printable standalone page (used for "Download as HTML" and print preview). */
export function standaloneHtml(html: string, title: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, "&lt;")}</title>
<style>body{font-family:Georgia,serif;max-width:17cm;margin:2.54cm auto;line-height:1.6;color:#111}h1{font-size:1.8em}h2{font-size:1.4em}h3{font-size:1.15em}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px 8px}img{max-width:100%}.page-break{page-break-after:always}[data-provenance]{border-bottom:1px dotted #999}</style></head><body>${html}</body></html>`;
}
