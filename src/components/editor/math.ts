import { Node, type Editor } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import MathView from "./MathView";
import { IMAGE_EDIT_META } from "./image";
import { blockInsertTarget } from "./chart";
import { latexToPlain, MAX_LATEX_LENGTH, parseLatex, supportedEnvironments } from "@/lib/math/latex";
import { latexToMathML } from "@/lib/math/mathml";
import type { LatexError } from "@/lib/math/types";
import type { Translate } from "@/lib/i18n/dictionary";

/**
 * Equations (docs/papers.md §9 D23): `math` (inline atom) and `mathBlock` (block atom, numbered "(n)" in document
 * order when `numbered`). LaTeX subset → MathML through src/lib/math (pure, no dependencies).
 *
 * Saved HTML (src/lib/countable.ts reads `data-math` / `data-math-block` and `data-origin`):
 *   <span data-math data-origin="human|ai" [data-provider data-model data-interaction] data-latex="…">MathML</span>
 *   <div data-math-block data-origin="…" data-numbered="true|false" [data-provider …] data-latex="…">MathML</div>
 * The origin comes first in the tag, before the LaTeX. Default origin "human" (Insert › Equation, Written); the Research
 * copilot's equations are "ai" and stay so after an edit (D22). Equations are never words: no `renderText`, and the
 * server drops these elements before counting.
 */

export type MathOrigin = "human" | "ai";

export interface MathAttrs {
  latex: string;
  origin: MathOrigin;
  provider: string | null;
  model: string | null;
  interaction: string | null;
}
export interface MathBlockAttrs extends MathAttrs {
  numbered: boolean;
}

/** Event a selected equation's DOM receives when the student presses Enter: its NodeView opens the edit form. */
export const MATH_EDIT_EVENT = "thesisfic:edit-equation";
export const MATH_NODE_NAMES = ["math", "mathBlock"] as const;

const cleanAttr = (v: string | null | undefined, max: number) => (v || "").replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, max) || null;
/** LaTeX as stored: control characters removed, capped a little above the parser's limit so an error stays visible. */
export const cleanLatex = (v: string | null | undefined) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, MAX_LATEX_LENGTH + 200);

const mathData = (a: MathAttrs): Record<string, string> => {
  const d: Record<string, string> = { "data-origin": a.origin };
  if (a.provider) d["data-provider"] = a.provider;
  if (a.model) d["data-model"] = a.model;
  if (a.interaction) d["data-interaction"] = a.interaction;
  return d;
};

const sharedAttributes = () => ({
  // Absent or anything but "ai" reads as Written, as on the server (EQUATION_DEFAULT_ORIGIN).
  origin: { default: "human", rendered: false, parseHTML: (el: HTMLElement) => (el.getAttribute("data-origin") === "ai" ? "ai" : "human") },
  provider: { default: null, rendered: false, parseHTML: (el: HTMLElement) => cleanAttr(el.getAttribute("data-provider"), 80) },
  model: { default: null, rendered: false, parseHTML: (el: HTMLElement) => cleanAttr(el.getAttribute("data-model"), 120) },
  interaction: { default: null, rendered: false, parseHTML: (el: HTMLElement) => cleanAttr(el.getAttribute("data-interaction"), 80) },
  latex: { default: "", rendered: false, parseHTML: (el: HTMLElement) => cleanLatex(el.getAttribute("data-latex")) },
});

/** The MathML of an equation as written into the saved HTML (escaped by src/lib/math), or null when it cannot be drawn. */
export function equationMathML(latex: string, display: boolean): string | null {
  const r = latexToMathML(latex, { display });
  return r.ok ? r.mathml : null;
}

/** `<span>`/`<div>` holding the MathML (or the bare LaTeX as text when it cannot be drawn). Browser only. */
function equationElement(tag: "span" | "div", attrs: Record<string, string>, latex: string, display: boolean): HTMLElement {
  const el = document.createElement(tag);
  for (const k of Object.keys(attrs)) el.setAttribute(k, attrs[k]);
  const mathml = equationMathML(latex, display);
  if (mathml) el.innerHTML = mathml;
  else el.textContent = latex;
  return el;
}

/** Plain text of an equation (alt text, TXT export): "x̄ = (1/n) ∑_(i=1)^n x_i"; the LaTeX itself when it cannot be read. */
export function equationPlainText(latex: string): string {
  const r = parseLatex(latex);
  return r.ok ? latexToPlain(r.ast) : latex;
}

export const MathInline = Node.create({
  name: "math",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return sharedAttributes();
  },

  parseHTML() {
    return [{ tag: "span[data-math]", priority: 70 }];
  },

  renderHTML({ node }) {
    const a = node.attrs as MathAttrs;
    return equationElement("span", { "data-math": "", ...mathData(a), "data-latex": a.latex }, a.latex, false) as never;
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathView, {
      as: "span",
      className: "math-node",
      attrs: ({ node }) => ({ "data-origin": (node.attrs as MathAttrs).origin }),
      stopEvent: ({ event }) => {
        const el = event.target as HTMLElement | null;
        return !!el && typeof el.closest === "function" && !!el.closest("[data-math-ui]");
      },
    });
  },

  addKeyboardShortcuts() {
    return { Enter: ({ editor }) => openSelectedEquation(editor, this.name) };
  },
});

export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      ...sharedAttributes(),
      numbered: { default: false, rendered: false, parseHTML: (el: HTMLElement) => el.getAttribute("data-numbered") === "true" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-math-block]", priority: 70 }];
  },

  renderHTML({ node }) {
    const a = node.attrs as MathBlockAttrs;
    return equationElement("div", { "data-math-block": "", ...mathData(a), "data-numbered": a.numbered ? "true" : "false", "data-latex": a.latex }, a.latex, true) as never;
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathView, {
      as: "div",
      className: "math-block-node",
      attrs: ({ node }) => ({ "data-origin": (node.attrs as MathBlockAttrs).origin, "data-numbered": (node.attrs as MathBlockAttrs).numbered ? "true" : "false" }),
      stopEvent: ({ event }) => {
        const el = event.target as HTMLElement | null;
        if (event.type.startsWith("drag") || event.type === "drop") return false;
        return !!el && typeof el.closest === "function" && !!el.closest("[data-math-ui]");
      },
    });
  },

  addKeyboardShortcuts() {
    return { Enter: ({ editor }) => openSelectedEquation(editor, this.name) };
  },
});

/** Enter on a selected equation opens its form (instead of replacing it with a line break). */
function openSelectedEquation(editor: Editor, name: string): boolean {
  const sel = editor.state.selection;
  if (!(sel instanceof NodeSelection) || sel.node.type.name !== name || !editor.isEditable) return false;
  const dom = editor.view.nodeDOM(sel.from) as HTMLElement | null;
  const target = (dom?.querySelector?.("[data-node-view-wrapper]") as HTMLElement | null) || dom;
  target?.dispatchEvent(new CustomEvent(MATH_EDIT_EVENT));
  return true;
}

export interface EquationValue {
  latex: string;
  /** true: `mathBlock` (own line); false: inline `math`. */
  display: boolean;
  numbered?: boolean;
  /**
   * The same LaTeX as an AI-assisted equation of this paper (see `equationKey`): the copy keeps that equation's
   * origin and AI log entry instead of becoming Written (D22).
   */
  ai?: { provider: string | null; model: string | null; interaction: string | null };
}

/** LaTeX compared for sameness: stored form without any whitespace ("\\hat{y} = 1" ≡ "\\hat{y}=1"). */
export const equationKey = (latex: string | null | undefined) => cleanLatex(latex).replace(/\s+/g, "");

/** Inserts an equation the student wrote (Insert › Equation): origin "human", Written. Not counted as typing. */
export function insertEquation(editor: Editor, value: EquationValue): boolean {
  if (!editor.isEditable) return false;
  const latex = cleanLatex(value.latex).trim();
  if (!parseLatex(latex).ok) return false;
  const origin = value.ai ? { origin: "ai", provider: value.ai.provider, model: value.ai.model, interaction: value.ai.interaction } : { origin: "human" };
  const content = value.display ? { type: "mathBlock", attrs: { latex, ...origin, numbered: !!value.numbered } } : { type: "math", attrs: { latex, ...origin } };
  const sel = editor.state.selection;
  // A block equation goes next to the paragraph when the cursor is at its start or end; any equation goes after a
  // selected figure or equation instead of replacing it.
  const target = value.display ? blockInsertTarget(editor.state) : { at: sel instanceof NodeSelection ? sel.to : null, trailing: false };
  const at = target.at;
  const chain = editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.setMeta(IMAGE_EDIT_META, true);
      return true;
    });
  // A block equation at the very end of the document gets an empty paragraph after it, to keep writing below.
  const all = target.trailing ? [content, { type: "paragraph" }] : content;
  return (at !== null ? chain.insertContentAt(at, all) : chain.insertContent(all)).run();
}

/** Changes the equation at `pos` (the edit form). Its origin is kept: an AI equation stays AI-assisted (D22). */
export function updateEquation(editor: Editor, pos: number, value: { latex: string; numbered?: boolean }): boolean {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || (MATH_NODE_NAMES as readonly string[]).indexOf(node.type.name) === -1) return false;
  const latex = cleanLatex(value.latex).trim();
  if (!parseLatex(latex).ok) return false;
  const attrs: Record<string, unknown> = { ...node.attrs, latex };
  if (node.type.name === "mathBlock" && value.numbered !== undefined) attrs.numbered = !!value.numbered;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, attrs).setMeta(IMAGE_EDIT_META, true));
  return true;
}

/**
 * Translated message of a LaTeX error, naming the culprit command (`figures.eq.error.*`): a bare `%`, an alignment
 * `&` or `\\` outside an environment and HTML-looking input get their own explanation.
 */
export function latexErrorMessage(error: LatexError, t: Translate): string {
  const cmd = error.command || "";
  switch (error.code) {
    case "unknown_command":
      if (cmd === "%") return t("figures.eq.error.percent");
      if (cmd === "&" || cmd === "\\\\") return t("figures.eq.error.alignment", { command: cmd });
      if (cmd.startsWith("<")) return t("figures.eq.error.tag", { command: cmd });
      return t("figures.eq.error.unknown_command", { command: cmd });
    case "unbalanced":
      return cmd ? t("figures.eq.error.unbalanced", { command: cmd }) : t("figures.eq.error.unbalancedPlain");
    case "too_long":
      return t("figures.eq.error.too_long", { max: MAX_LATEX_LENGTH });
    case "empty":
      return t("figures.eq.error.empty");
    case "unsupported_env":
      return t("figures.eq.error.unsupported_env", { command: cmd, list: supportedEnvironments().join(", ") });
    default:
      return t("figures.eq.error.unknown_command", { command: cmd });
  }
}
