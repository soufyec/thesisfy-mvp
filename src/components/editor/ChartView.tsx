"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import { Accessibility, AlignCenter, AlignLeft, AlignRight, Captions, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { CHART_EDIT_EVENT, drawChartSpec, patchChart, readChartSpec, updateDiagram, type ChartAlign, type ChartAttrs } from "./chart";
import DiagramDialog from "./forms/DiagramDialog";

function Btn({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button type="button" className={`img-btn${active ? " active" : ""}`} aria-label={label} aria-pressed={active === undefined ? undefined : active} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

/**
 * `editor.isEditable`, kept current: `setEditable` re-renders no node view, so the root's `contenteditable` attribute
 * is watched (review mode, a paper that becomes read-only after a 409 locked).
 */
export function useEditorEditable(editor: NodeViewProps["editor"]): boolean {
  const [editable, setEditable] = useState(editor.isEditable);
  useEffect(() => {
    const dom = editor.view?.dom as HTMLElement | undefined;
    setEditable(editor.isEditable);
    if (!dom || typeof MutationObserver === "undefined") return;
    const mo = new MutationObserver(() => setEditable(editor.isEditable));
    mo.observe(dom, { attributes: true, attributeFilter: ["contenteditable"] });
    return () => mo.disconnect();
  }, [editor]);
  return editable;
}

/** The SVG string drawn inline: it never becomes a draggable image or an "image" on the clipboard. */
const inlineSvg = (svg: string) => svg.replace(/^<svg\b/, '<svg draggable="false" focusable="false" aria-hidden="true" style="display:block;width:100%;height:auto"');

/**
 * NodeView of the `chart` node (§4.6, D21–D22): the figure drawn inline from its spec (normalised; titles and
 * captions cut to 200 characters), an editable caption (like an image), width and alignment, delete. Diagrams open
 * their form on double-click or with "Edit diagram"; the origin stays as it was. Charts computed from data have no
 * data editing. In review (read-only) the same figure and caption are shown without tools.
 */
export default function ChartView({ node, editor, getPos, deleteNode }: NodeViewProps) {
  const t = useT();
  const a = node.attrs as ChartAttrs;
  const editable = useEditorEditable(editor);
  const wrapperRef = useRef<HTMLElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSelected, setIsSelected] = useState(false);
  const [panel, setPanel] = useState<null | "alt">(null);
  const [panelValue, setPanelValue] = useState("");
  const [captionOpen, setCaptionOpen] = useState(!!a.caption);
  const [draft, setDraft] = useState(a.caption || "");
  const [editing, setEditing] = useState(false);

  const spec = useMemo(() => readChartSpec(a.spec, a.figure), [a.spec, a.figure]);
  const drawn = useMemo(() => (spec ? drawChartSpec(spec, a.caption) : null), [spec, a.caption]);
  const isDiagram = !!spec && spec.figure !== "chart";
  const canEditDiagram = editable && isDiagram;

  // Tools only while this figure itself is selected (not when a text selection merely runs across it).
  useEffect(() => {
    const check = () => {
      const sel = editor.state.selection;
      const pos = getPos();
      setIsSelected(sel instanceof NodeSelection && typeof pos === "number" && sel.from === pos);
    };
    check();
    editor.on("selectionUpdate", check);
    editor.on("transaction", check);
    return () => {
      editor.off("selectionUpdate", check);
      editor.off("transaction", check);
    };
  }, [editor, getPos]);
  const showUi = editable && isSelected;

  useEffect(() => {
    if (!isSelected) setPanel(null);
  }, [isSelected]);
  useEffect(
    () => () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
    },
    []
  );

  // Caption: the field keeps its own text while it has focus and writes to the document after a short pause.
  // (A NodeView can be reused for another figure, e.g. when the tab changes: its state follows the new caption.)
  useEffect(() => {
    const focused = document.activeElement === taRef.current;
    if (!focused) setDraft(a.caption || "");
    if (a.caption) setCaptionOpen(true);
    else if (!focused) setCaptionOpen(false);
  }, [a.caption]);
  // The field grows with its text. A NodeView is first rendered before it is in the page (no layout yet), and the
  // column can change width, so the height is measured again on the next frame and whenever the figure resizes.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    const fit = () => {
      if (!el.isConnected || !el.offsetWidth) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    const raf = requestAnimationFrame(fit);
    const ro = typeof ResizeObserver !== "undefined" && el.parentElement ? new ResizeObserver(() => fit()) : null;
    if (ro && el.parentElement) ro.observe(el.parentElement);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [draft, captionOpen]);

  const patch = (p: Partial<ChartAttrs>) => {
    const pos = getPos();
    if (typeof pos === "number") patchChart(editor, pos, p);
  };
  const flushCaption = (value: string, close: boolean) => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = null;
    const next = value.replace(/\s+/g, " ").trim().slice(0, 200);
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
  const openAlt = () => {
    if (panel === "alt") return setPanel(null);
    setPanelValue(a.alt || "");
    setPanel("alt");
  };
  const applyAlt = () => {
    patch({ alt: panelValue.replace(/\s+/g, " ").trim().slice(0, 200) || null });
    setPanel(null);
  };
  const setAlign = (align: ChartAlign) => patch({ align });

  const openEdit = () => {
    if (canEditDiagram) setEditing(true);
  };
  // Enter on the selected diagram (chart.ts keyboard shortcut) opens the same form as a double-click.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || !canEditDiagram) return;
    const open = () => setEditing(true);
    el.addEventListener(CHART_EDIT_EVENT, open);
    return () => el.removeEventListener(CHART_EDIT_EVENT, open);
  }, [canEditDiagram]);
  const closeEdit = () => {
    setEditing(false);
    editor.commands.focus();
  };

  const figureBody = drawn ? (
    <div className="chart-svg" dangerouslySetInnerHTML={{ __html: inlineSvg(drawn.svg) }} />
  ) : (
    <div className="chart-missing" role="note">
      {t("figures.chart.unreadable")}
    </div>
  );
  const label = drawn && spec ? a.alt || a.caption || spec.title || t(`figures.kind.${spec.figure}`) : t("figures.chart.unreadable");

  return (
    <NodeViewWrapper ref={wrapperRef} className={`chart-view${showUi ? " is-selected" : ""}`}>
      <div
        className="chart-frame"
        data-drag-handle=""
        role="img"
        aria-label={label}
        title={canEditDiagram ? t("figures.chart.editHint") : undefined}
        onDoubleClick={(e) => {
          if (!canEditDiagram || !wrapperRef.current?.contains(e.target as Node)) return;
          e.preventDefault();
          openEdit();
        }}
      >
        {figureBody}
      </div>

      {(captionOpen || a.caption) && (
        <figcaption className="img-caption chart-caption">
          {editable ? (
            <textarea
              ref={taRef}
              data-fig-ui=""
              rows={1}
              maxLength={200}
              value={draft}
              placeholder={t("figures.chart.captionPlaceholder")}
              aria-label={t("figures.chart.captionLabel")}
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
          className={`img-bar${a.align === "right" ? " img-bar-end" : a.align === "center" ? " img-bar-mid" : ""}`}
          data-fig-ui=""
          role="toolbar"
          aria-label={t("figures.chart.tools")}
          contentEditable={false}
          onMouseDown={(e) => {
            if (!(e.target as HTMLElement).closest("input,textarea")) e.preventDefault();
          }}
        >
          <div className="img-bar-row">
            <span className="img-bar-tag">{a.origin === "human" ? t("glossary.written") : t("glossary.aiAssisted")}</span>
            <span className="img-sep" />
            <Btn label={t("editor.image.alignLeft")} active={a.align === "left"} onClick={() => setAlign("left")}><AlignLeft size={15} /></Btn>
            <Btn label={t("editor.image.alignCenter")} active={a.align === "center"} onClick={() => setAlign("center")}><AlignCenter size={15} /></Btn>
            <Btn label={t("editor.image.alignRight")} active={a.align === "right"} onClick={() => setAlign("right")}><AlignRight size={15} /></Btn>
            <span className="img-sep" />
            {[50, 75, 100].map((p) => (
              <Btn key={p} label={t("figures.chart.width", { pct: p })} active={a.width === `${p}%`} onClick={() => patch({ width: `${p}%` })}>
                <span className="img-btn-text">{p}%</span>
              </Btn>
            ))}
            <Btn label={t("figures.chart.widthReset")} onClick={() => patch({ width: null })}><RotateCcw size={15} /></Btn>
            <span className="img-sep" />
            <Btn label={captionOpen || a.caption ? t("figures.chart.captionRemove") : t("figures.chart.captionAdd")} active={captionOpen || !!a.caption} onClick={toggleCaption}><Captions size={15} /></Btn>
            <Btn label={t("figures.chart.altText")} active={panel === "alt" || !!a.alt} onClick={openAlt}><Accessibility size={15} /></Btn>
            {canEditDiagram && <Btn label={t("figures.chart.edit")} onClick={openEdit}><Pencil size={15} /></Btn>}
            <Btn label={t("figures.chart.delete")} onClick={() => deleteNode()}><Trash2 size={15} /></Btn>
          </div>
          {panel === "alt" && (
            <div className="img-bar-row img-bar-panel">
              <input
                autoFocus
                value={panelValue}
                maxLength={200}
                onChange={(e) => setPanelValue(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyAlt();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setPanel(null);
                  }
                }}
                placeholder={t("figures.chart.altField")}
                aria-label={t("figures.chart.altText")}
              />
              <button type="button" className="img-btn img-btn-wide" onClick={applyAlt}>{t("editor.apply")}</button>
            </div>
          )}
        </div>
      )}

      {editing &&
        spec?.diagram &&
        typeof document !== "undefined" &&
        createPortal(
          <div data-fig-ui="">
            <DiagramDialog
              open
              onClose={closeEdit}
              kind={spec.diagram.figure}
              lang={spec.lang}
              initial={{ spec: spec.diagram, caption: a.caption, origin: a.origin }}
              onSubmit={(value) => {
                const pos = getPos();
                if (typeof pos === "number") updateDiagram(editor, pos, { spec: value.spec, caption: value.caption || null });
                closeEdit();
              }}
            />
          </div>,
          document.body
        )}
    </NodeViewWrapper>
  );
}
