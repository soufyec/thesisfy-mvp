"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { AlignCenter, AlignLeft, AlignRight, Accessibility, Captions, Download, Link as LinkIcon, PanelLeft, PanelRight, Replace, RotateCcw, Text, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { imageStyle, MIN_IMAGE_WIDTH, patchImage, type ImageAlign, type ImageAttrs, type ImageWrap, type ResizableImageOptions } from "./image";

/** x/y: which sides the handle drags (-1 left/top, 1 right/bottom). The height always follows the width, so the ratio never changes. */
const HANDLES = [
  { id: "nw", x: -1, y: -1 },
  { id: "n", x: 0, y: -1 },
  { id: "ne", x: 1, y: -1 },
  { id: "e", x: 1, y: 0 },
  { id: "se", x: 1, y: 1 },
  { id: "s", x: 0, y: 1 },
  { id: "sw", x: -1, y: 1 },
  { id: "w", x: -1, y: 0 },
];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Only web and mail links; a missing scheme means https. */
function safeHref(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return /^(https?|mailto):/i.test(v) ? v : null;
  return `https://${v.replace(/^\/+/, "")}`;
}

function Btn({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button type="button" className={`img-btn${active ? " active" : ""}`} aria-label={label} aria-pressed={active === undefined ? undefined : active} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

export default function ImageView({ node, selected, editor, getPos, deleteNode, extension }: NodeViewProps) {
  const t = useT();
  const a = node.attrs as ImageAttrs;
  const editable = editor.isEditable;
  const showUi = editable && selected;
  const imgRef = useRef<HTMLImageElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [panel, setPanel] = useState<null | "alt" | "link">(null);
  const [panelValue, setPanelValue] = useState("");
  const [captionOpen, setCaptionOpen] = useState(!!a.caption);
  const [draft, setDraft] = useState(a.caption || "");

  const patch = useCallback(
    (p: Partial<ImageAttrs>) => {
      const pos = getPos();
      if (typeof pos === "number") patchImage(editor, pos, p);
    },
    [editor, getPos]
  );

  // Leaving the selection closes any open field; dragging listeners never outlive the view.
  useEffect(() => {
    if (!selected) setPanel(null);
  }, [selected]);
  useEffect(
    () => () => {
      cleanup.current?.();
      if (commitTimer.current) clearTimeout(commitTimer.current);
    },
    []
  );

  // Caption: the field keeps its own text while it has focus and writes to the document after a short pause.
  useEffect(() => {
    if (document.activeElement !== taRef.current) setDraft(a.caption || "");
    if (a.caption) setCaptionOpen(true);
  }, [a.caption]);
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, captionOpen]);

  const flushCaption = (value: string, close: boolean) => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = null;
    const next = value.trim();
    if ((a.caption || "") !== next) patch({ caption: next || null });
    if (close && !next) setCaptionOpen(false);
  };
  const onCaptionChange = (value: string) => {
    setDraft(value);
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => flushCaption(value, false), 350);
  };
  const toggleCaption = () => {
    if (captionOpen || a.caption) {
      if (commitTimer.current) clearTimeout(commitTimer.current);
      setDraft("");
      setCaptionOpen(false);
      patch({ caption: null });
      return;
    }
    setCaptionOpen(true);
    setTimeout(() => taRef.current?.focus(), 0);
  };

  // ---------- resize ----------
  const outerOf = () => imgRef.current?.closest("figure.img-node") as HTMLElement | null;
  const limitsOf = (outer: HTMLElement) => {
    const parent = outer.parentElement;
    if (!parent) return { max: 4000 };
    const cs = getComputedStyle(parent);
    const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    return { max: Math.max(MIN_IMAGE_WIDTH, parent.clientWidth - pad) };
  };

  const startResize = (e: ReactPointerEvent<HTMLElement>, h: (typeof HANDLES)[number]) => {
    const img = imgRef.current;
    const outer = outerOf();
    if (!img || !outer) return;
    e.preventDefault();
    e.stopPropagation();
    cleanup.current?.();
    const rect = img.getBoundingClientRect();
    const scale = img.offsetWidth ? rect.width / img.offsetWidth : 1; // the sheet can be zoomed
    const startW = img.offsetWidth;
    const ratio = img.offsetHeight ? img.offsetWidth / img.offsetHeight : 1;
    const { max } = limitsOf(outer);
    // A centred image grows on both sides, so the dragged edge moves half as far as the width changes.
    const factor = a.align === "center" && a.wrap === "none" ? 2 : 1;
    const sx = e.clientX;
    const sy = e.clientY;
    let current = startW;
    img.style.width = "100%"; // follow the frame while dragging, even before a width is saved
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / scale;
      const dy = (ev.clientY - sy) / scale;
      const delta = (h.x !== 0 ? dx * h.x : dy * h.y * ratio) * factor;
      current = clamp(startW + delta, MIN_IMAGE_WIDTH, max);
      outer.style.width = `${Math.round(current)}px`;
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      cleanup.current = null;
    };
    const up = () => {
      stop();
      if (Math.abs(current - startW) >= 1) patch({ width: `${Math.round(current)}px` });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    cleanup.current = stop;
  };

  const onHandleKey = (e: ReactKeyboardEvent<HTMLElement>) => {
    const img = imgRef.current;
    const outer = outerOf();
    if (!img || !outer || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    e.stopPropagation();
    const step = e.shiftKey ? 50 : 10;
    const w = clamp(img.offsetWidth + (e.key === "ArrowRight" ? step : -step), MIN_IMAGE_WIDTH, limitsOf(outer).max);
    patch({ width: `${Math.round(w)}px` });
  };

  // ---------- actions ----------
  const openPanel = (kind: "alt" | "link") => {
    if (panel === kind) return setPanel(null);
    setPanelValue(kind === "alt" ? a.alt || "" : a.href || "");
    setPanel(kind);
  };
  const applyPanel = () => {
    if (panel === "alt") patch({ alt: panelValue.trim() || null });
    if (panel === "link") patch({ href: safeHref(panelValue) });
    setPanel(null);
  };
  const removeLink = () => {
    patch({ href: null });
    setPanel(null);
  };
  const download = () => {
    if (!a.src) return;
    const m = /^data:image\/([\w+.-]+)/.exec(a.src);
    const ext = m ? (m[1] === "jpeg" ? "jpg" : m[1] === "svg+xml" ? "svg" : m[1]) : (a.src.split(/[?#]/)[0].split(".").pop() || "png").slice(0, 4);
    const base = (a.alt || "").replace(/[^A-Za-z0-9\u00C0-\u024F]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || t("editor.image.fileName");
    const link = document.createElement("a");
    link.href = a.src;
    link.download = `${base}.${ext}`;
    link.target = "_blank";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };
  const replace = () => {
    const pos = getPos();
    if (typeof pos === "number") (extension.options as ResizableImageOptions).onReplace?.(pos);
  };

  const setAlign = (align: ImageAlign) => patch({ align, wrap: "none" });
  const setWrap = (wrap: ImageWrap) => patch({ wrap });
  const sizes = [25, 50, 100];

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={imgRef} src={a.src || ""} alt={a.alt || ""} title={a.title || undefined} style={cssObject(imageStyle(a, true))} draggable={false} />
  );

  return (
    <NodeViewWrapper className={`img-view${showUi ? " is-selected" : ""}`}>
      <div className="img-frame">
        {!editable && a.href ? (
          <a href={a.href} target="_blank" rel="noopener noreferrer">
            {img}
          </a>
        ) : (
          img
        )}
        {showUi &&
          HANDLES.map((h) => (
            <span
              key={h.id}
              data-img-ui=""
              className={`img-handle img-handle-${h.id}`}
              role="separator"
              tabIndex={0}
              aria-label={t("editor.image.resize")}
              title={t("editor.image.resize")}
              draggable={false}
              onPointerDown={(e) => startResize(e, h)}
              onMouseDown={(e) => e.preventDefault()}
              onKeyDown={onHandleKey}
            />
          ))}
      </div>

      {(captionOpen || a.caption) && (
        <figcaption className="img-caption">
          {editable ? (
            <textarea
              ref={taRef}
              data-img-ui=""
              rows={1}
              value={draft}
              placeholder={t("editor.image.captionPlaceholder")}
              aria-label={t("editor.image.captionLabel")}
              onChange={(e) => onCaptionChange(e.target.value.replace(/\n/g, " "))}
              onBlur={() => flushCaption(draft, true)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" || e.key === "Escape") {
                  e.preventDefault();
                  e.currentTarget.blur();
                  editor.commands.focus();
                }
              }}
            />
          ) : (
            a.caption
          )}
        </figcaption>
      )}

      {showUi && (
        <div
          className={`img-bar${a.wrap === "right" || (a.wrap === "none" && a.align === "right") ? " img-bar-end" : a.wrap === "none" && a.align === "center" ? " img-bar-mid" : ""}`}
          data-img-ui=""
          role="toolbar"
          aria-label={t("editor.image.tools")}
          contentEditable={false}
          onMouseDown={(e) => {
            if (!(e.target as HTMLElement).closest("input,textarea")) e.preventDefault();
          }}
        >
          <div className="img-bar-row">
            <Btn label={t("editor.image.alignLeft")} active={a.wrap === "none" && a.align === "left"} onClick={() => setAlign("left")}><AlignLeft size={15} /></Btn>
            <Btn label={t("editor.image.alignCenter")} active={a.wrap === "none" && a.align === "center"} onClick={() => setAlign("center")}><AlignCenter size={15} /></Btn>
            <Btn label={t("editor.image.alignRight")} active={a.wrap === "none" && a.align === "right"} onClick={() => setAlign("right")}><AlignRight size={15} /></Btn>
            <span className="img-sep" />
            <Btn label={t("editor.image.wrapNone")} active={a.wrap === "none"} onClick={() => setWrap("none")}><Text size={15} /></Btn>
            <Btn label={t("editor.image.wrapLeft")} active={a.wrap === "left"} onClick={() => setWrap("left")}><PanelLeft size={15} /></Btn>
            <Btn label={t("editor.image.wrapRight")} active={a.wrap === "right"} onClick={() => setWrap("right")}><PanelRight size={15} /></Btn>
            <span className="img-sep" />
            {sizes.map((p) => (
              <Btn key={p} label={t("editor.image.size", { pct: p })} active={a.width === `${p}%`} onClick={() => patch({ width: `${p}%` })}>
                <span className="img-btn-text">{p}%</span>
              </Btn>
            ))}
            <Btn label={t("editor.image.sizeReset")} onClick={() => patch({ width: null })}><RotateCcw size={15} /></Btn>
            <span className="img-sep" />
            <Btn label={captionOpen || a.caption ? t("editor.image.captionRemove") : t("editor.image.captionAdd")} active={captionOpen || !!a.caption} onClick={toggleCaption}><Captions size={15} /></Btn>
            <Btn label={t("editor.image.altText")} active={panel === "alt" || !!a.alt} onClick={() => openPanel("alt")}><Accessibility size={15} /></Btn>
            <Btn label={t("editor.image.replace")} onClick={replace}><Replace size={15} /></Btn>
            <Btn label={t("editor.image.link")} active={panel === "link" || !!a.href} onClick={() => openPanel("link")}><LinkIcon size={15} /></Btn>
            <Btn label={t("editor.image.download")} onClick={download}><Download size={15} /></Btn>
            <Btn label={t("editor.image.delete")} onClick={() => deleteNode()}><Trash2 size={15} /></Btn>
          </div>
          {panel && (
            <div className="img-bar-row img-bar-panel">
              <input
                autoFocus
                value={panelValue}
                onChange={(e) => setPanelValue(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyPanel();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setPanel(null);
                  }
                }}
                placeholder={panel === "alt" ? t("editor.image.altField") : t("editor.image.linkPlaceholder")}
                aria-label={panel === "alt" ? t("editor.image.altText") : t("editor.image.link")}
                inputMode={panel === "link" ? "url" : undefined}
              />
              <button type="button" className="img-btn img-btn-wide" onClick={applyPanel}>{t("editor.apply")}</button>
              {panel === "link" && a.href && <button type="button" className="img-btn img-btn-wide" onClick={removeLink}>{t("common.remove")}</button>}
            </div>
          )}
        </div>
      )}
    </NodeViewWrapper>
  );
}

/** "a:b;c:d" -> React style object. */
function cssObject(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  css.split(";").forEach((decl) => {
    const i = decl.indexOf(":");
    if (i < 0) return;
    const prop = decl.slice(0, i).trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[prop] = decl.slice(i + 1).trim();
  });
  return out;
}
