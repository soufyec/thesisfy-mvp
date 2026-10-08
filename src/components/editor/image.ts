import { mergeAttributes, type Editor } from "@tiptap/core";
import Image, { type ImageOptions } from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { NodeSelection, Selection } from "@tiptap/pm/state";
import ImageView from "./ImageView";

/**
 * Editable image: resize, align, wrap, caption, alt text and link. It extends the stock image node (same name,
 * so documents saved with `<img>` keep loading) and carries no provenance: an image is neither written nor
 * AI-assisted text, and its caption/alt live in attributes, so they never reach the word or provenance counters.
 */
export type ImageAlign = "left" | "center" | "right";
export type ImageWrap = "none" | "left" | "right";

export interface ImageAttrs {
  src: string | null;
  alt: string | null;
  title: string | null;
  /** `320px` or `50%`; null = natural size, never wider than the page. */
  width: string | null;
  align: ImageAlign;
  wrap: ImageWrap;
  caption: string | null;
  href: string | null;
  borderRadius: string | null;
  /** Any truthy value draws a thin border. */
  border: string | null;
}

export interface ResizableImageOptions extends ImageOptions {
  /** Called with the node position when the user asks to replace the image (the editor opens its image dialog). */
  onReplace?: (pos: number) => void;
}

/** Transactions carrying this meta are image edits, not typing: DocsEditor leaves them out of the typing counters. */
export const IMAGE_EDIT_META = "image-edit";

export const MIN_IMAGE_WIDTH = 40;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 1600;

const ALIGNS: ImageAlign[] = ["left", "center", "right"];
const WRAPS: ImageWrap[] = ["none", "left", "right"];

const imgOf = (el: HTMLElement): HTMLElement | null => (el.tagName === "IMG" ? el : el.querySelector("img"));
const oneOf = <T extends string>(v: string | null | undefined, list: T[], fallback: T): T => (v && (list as string[]).indexOf(v) >= 0 ? (v as T) : fallback);
const normWidth = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(px|%)?\s*$/.exec(v);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return n > 0 ? `${Math.round(n * 10) / 10}${m[2] || "px"}` : null;
};

/** Inline style of the outer element (the `<figure>` in the editor and in saved HTML). Inline so print and exports keep it. */
export function outerStyle(a: Pick<ImageAttrs, "width" | "align" | "wrap">, withDefaultWidth = true): string {
  const s: string[] = ["display:block", "max-width:100%"];
  if (a.width) s.push(`width:${a.width}`);
  else if (withDefaultWidth) s.push("width:fit-content");
  if (a.wrap === "left") s.push("float:left", "margin:0.25em 1em 0.5em 0");
  else if (a.wrap === "right") s.push("float:right", "margin:0.25em 0 0.5em 1em");
  else s.push(a.align === "left" ? "margin:0.5em auto 0.5em 0" : a.align === "right" ? "margin:0.5em 0 0.5em auto" : "margin:0.5em auto");
  return s.join(";");
}

/** Inline style of the `<img>` itself. */
export function imageStyle(a: Pick<ImageAttrs, "width" | "borderRadius" | "border">, fillsFigure: boolean): string {
  const s: string[] = ["display:block", "height:auto", "max-width:100%"];
  if (fillsFigure && a.width) s.push("width:100%");
  if (a.borderRadius) s.push(`border-radius:${a.borderRadius}`);
  if (a.border) s.push("border:1px solid rgba(0,0,0,0.2)");
  return s.join(";");
}

const dataAttrs = (a: ImageAttrs): Record<string, string> => {
  const d: Record<string, string> = { "data-image": "" };
  if (a.align !== "center") d["data-align"] = a.align;
  if (a.wrap !== "none") d["data-wrap"] = a.wrap;
  if (a.width) d["data-width"] = a.width;
  if (a.borderRadius) d["data-radius"] = a.borderRadius;
  if (a.border) d["data-border"] = "1";
  return d;
};

export const ResizableImage = Image.extend<ResizableImageOptions>({
  addOptions() {
    return { ...(this.parent?.() as ImageOptions), onReplace: undefined };
  },

  addAttributes() {
    return {
      src: { default: null, parseHTML: (el) => imgOf(el)?.getAttribute("src") ?? null, rendered: false },
      alt: { default: null, parseHTML: (el) => imgOf(el)?.getAttribute("alt") || null, rendered: false },
      title: { default: null, parseHTML: (el) => imgOf(el)?.getAttribute("title") || null, rendered: false },
      width: {
        default: null,
        parseHTML: (el) => {
          const img = imgOf(el);
          const legacy = img?.getAttribute("width");
          return normWidth(el.getAttribute("data-width")) || normWidth(el.style?.width) || normWidth(legacy && /^\d+$/.test(legacy) ? `${legacy}px` : legacy) || null;
        },
        rendered: false,
      },
      align: { default: "center", parseHTML: (el) => oneOf(el.getAttribute("data-align"), ALIGNS, "center"), rendered: false },
      wrap: { default: "none", parseHTML: (el) => oneOf(el.getAttribute("data-wrap"), WRAPS, "none"), rendered: false },
      caption: { default: null, parseHTML: (el) => el.querySelector("figcaption")?.textContent?.trim() || null, rendered: false },
      href: { default: null, parseHTML: (el) => el.querySelector("a[href]")?.getAttribute("href") || null, rendered: false },
      borderRadius: { default: null, parseHTML: (el) => el.getAttribute("data-radius") || null, rendered: false },
      border: { default: null, parseHTML: (el) => el.getAttribute("data-border") || null, rendered: false },
    };
  },

  parseHTML() {
    return [
      { tag: "figure[data-image]", priority: 60 },
      { tag: this.options.allowBase64 ? "img[src]" : 'img[src]:not([src^="data:"])' },
    ];
  },

  renderHTML({ node }) {
    const a = node.attrs as ImageAttrs;
    const base = mergeAttributes(this.options.HTMLAttributes, { src: a.src || "" });
    if (a.alt) base.alt = a.alt;
    else base.alt = "";
    if (a.title) base.title = a.title;
    const caption = (a.caption || "").trim();
    // Without caption or link the image is saved as a bare <img>, exactly like documents written before this extension.
    if (!caption && !a.href) {
      return ["img", { ...base, ...dataAttrs(a), style: `${outerStyle(a, false)};${imageStyle(a, false)}` }];
    }
    const img: [string, Record<string, string>] = ["img", { ...base, style: imageStyle(a, true) }];
    const body = a.href ? ["a", { href: a.href, target: "_blank", rel: "noopener noreferrer" }, img] : img;
    const fig: unknown[] = ["figure", { ...dataAttrs(a), style: outerStyle(a) }, body];
    if (caption) fig.push(["figcaption", {}, caption]);
    return fig as never;
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView, {
      as: "figure",
      className: "img-node",
      attrs: ({ node }) => {
        const a = node.attrs as ImageAttrs;
        const out: Record<string, string> = { ...dataAttrs(a), style: outerStyle(a) };
        return out;
      },
      // Events from the floating toolbar, the resize handles and the caption field belong to React, not to ProseMirror.
      stopEvent: ({ event }) => {
        const el = event.target as HTMLElement | null;
        if (event.type.startsWith("drag") || event.type === "drop") return false;
        return !!el && typeof el.closest === "function" && !!el.closest("[data-img-ui]");
      },
    });
  },

  addKeyboardShortcuts() {
    return {
      // Escape deselects the image and puts the cursor next to it.
      Escape: ({ editor }) => {
        const sel = editor.state.selection;
        if (!(sel instanceof NodeSelection) || sel.node.type.name !== this.name) return false;
        return editor
          .chain()
          .command(({ tr }) => {
            const $to = tr.doc.resolve(sel.to);
            const next = Selection.findFrom($to, 1, true) || Selection.findFrom($to, -1, true);
            if (!next) return false;
            tr.setSelection(next);
            return true;
          })
          .run();
      },
    };
  },
});

/** Merges `patch` into the image at `pos`. Leaves history intact and is not counted as typing. */
export function patchImage(editor: Editor, pos: number, patch: Partial<ImageAttrs>): boolean {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "image") return false;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch }).setMeta(IMAGE_EDIT_META, true));
  return true;
}

/** Inserts an image block at the cursor (or at `pos`). */
export function insertImage(editor: Editor, attrs: Partial<ImageAttrs> & { src: string }, pos?: number): boolean {
  const chain = editor.chain().command(({ tr }) => {
    tr.setMeta(IMAGE_EDIT_META, true);
    return true;
  });
  return (pos === undefined ? chain.focus().insertContent({ type: "image", attrs }) : chain.focus().insertContentAt(pos, { type: "image", attrs })).run();
}

// ---------------------------------------------------------------------------------------------
// Files: read, shrink on the client, insert
// ---------------------------------------------------------------------------------------------

export type ImageFileResult = { ok: true; src: string } | { ok: false; reason: "type" | "size" | "read" };

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode"));
    img.src = url;
  });

function hasAlpha(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  try {
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
    return false;
  } catch {
    return true;
  }
}

/**
 * Reads an image file and returns a data URL, at most MAX_IMAGE_SIDE px on its longer side. Opaque images are
 * re-encoded as JPEG 0.85 when that is smaller; images with transparency stay PNG. GIF and SVG are kept as they are.
 */
export async function prepareImageFile(file: File): Promise<ImageFileResult> {
  if (!file.type.startsWith("image/")) return { ok: false, reason: "type" };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, reason: "size" };
  try {
    const original = await readAsDataUrl(file);
    if (file.type === "image/gif" || file.type === "image/svg+xml") return { ok: true, src: original };
    const img = await loadImage(original);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return { ok: true, src: original };
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: true, src: original };
    ctx.drawImage(img, 0, 0, cw, ch);
    const maybeAlpha = file.type !== "image/jpeg";
    if (maybeAlpha && hasAlpha(ctx, cw, ch)) {
      if (scale === 1) return { ok: true, src: original };
      return { ok: true, src: canvas.toDataURL("image/png") };
    }
    const jpeg = canvas.toDataURL("image/jpeg", 0.85);
    // Same size and smaller than the file: keep the re-encoded one; otherwise keep the original bytes.
    return { ok: true, src: scale < 1 || jpeg.length < original.length ? jpeg : original };
  } catch {
    return { ok: false, reason: "read" };
  }
}

export const imageFilesOf = (list: FileList | File[] | null | undefined): File[] => Array.from(list || []).filter((f) => f.type.startsWith("image/"));

/** Inserts the image files one after the other. `onError` is called once per file that cannot be used. */
export async function insertImageFiles(editor: Editor, files: File[], opts: { pos?: number; onError?: (reason: "type" | "size" | "read", name: string) => void } = {}): Promise<number> {
  let inserted = 0;
  let pos = opts.pos;
  for (const file of files) {
    const res = await prepareImageFile(file);
    if (!res.ok) {
      opts.onError?.(res.reason, file.name);
      continue;
    }
    if (editor.isDestroyed) break;
    if (insertImage(editor, { src: res.src }, inserted === 0 ? pos : undefined)) inserted += 1;
    pos = undefined;
  }
  return inserted;
}
