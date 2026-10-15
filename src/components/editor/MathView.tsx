"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useT } from "@/lib/i18n/client";
import { latexToMathML } from "@/lib/math/mathml";
import { equationPlainText, latexErrorMessage, MATH_EDIT_EVENT, updateEquation, type MathBlockAttrs } from "./math";
import EquationDialog from "./forms/EquationDialog";
import { useEditorEditable } from "./ChartView";

/**
 * NodeView of the `math` (inline) and `mathBlock` nodes: the MathML drawn from the LaTeX attribute (escaped by
 * src/lib/math). Double-click, or Enter on the selected equation, opens the equation form; the origin never changes
 * there (an AI equation stays AI-assisted). Numbered blocks get "(n)" from a CSS counter (globals.css), so the number
 * always follows document order. Read-only (review) shows the same equation without the form.
 */
export default function MathView({ node, editor, getPos }: NodeViewProps) {
  const t = useT();
  const isBlock = node.type.name === "mathBlock";
  const a = node.attrs as MathBlockAttrs;
  const wrapperRef = useRef<HTMLElement>(null);
  const [editing, setEditing] = useState(false);
  const rendered = useMemo(() => latexToMathML(a.latex || "", { display: isBlock }), [a.latex, isBlock]);
  const plain = useMemo(() => equationPlainText(a.latex || ""), [a.latex]);
  const editable = useEditorEditable(editor);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const open = () => {
      if (editor.isEditable) setEditing(true);
    };
    el.addEventListener(MATH_EDIT_EVENT, open);
    return () => el.removeEventListener(MATH_EDIT_EVENT, open);
  }, [editor]);

  const submit = (value: { latex: string; numbered: boolean }) => {
    const pos = getPos();
    if (typeof pos === "number") updateEquation(editor, pos, { latex: value.latex, numbered: isBlock ? value.numbered : undefined });
    setEditing(false);
    editor.commands.focus();
  };

  const title = editable ? t("figures.eq.editHint") : undefined;
  const body = rendered.ok ? (
    <span className={isBlock ? "math-render math-render-block" : "math-render"} aria-label={t("figures.eq.aria", { text: plain })} role="img" dangerouslySetInnerHTML={{ __html: rendered.mathml }} />
  ) : (
    <code className="math-error" title={t("figures.eq.invalid", { reason: latexErrorMessage(rendered.error, t) })}>
      {a.latex || "?"}
    </code>
  );

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      as={isBlock ? "div" : "span"}
      className={isBlock ? "math-view math-view-block" : "math-view"}
      title={title}
      onDoubleClick={(e: React.MouseEvent) => {
        // Double-clicks inside the form (a portal, but a React child) are not on the equation.
        if (!editable || !wrapperRef.current?.contains(e.target as Node)) return;
        e.preventDefault();
        setEditing(true);
      }}
    >
      {body}
      {editing &&
        typeof document !== "undefined" &&
        createPortal(
          <div data-math-ui="">
            <EquationDialog
              open
              onClose={() => {
                setEditing(false);
                editor.commands.focus();
              }}
              initial={{ latex: a.latex || "", display: isBlock, numbered: !!a.numbered, origin: a.origin }}
              onSubmit={submit}
            />
          </div>,
          document.body
        )}
    </NodeViewWrapper>
  );
}
