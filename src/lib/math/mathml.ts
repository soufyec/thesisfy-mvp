/**
 * Math AST → MathML Core (SPEC docs/papers.md D23). Only MathML Core elements and attributes:
 * math, semantics, annotation, mrow, mi, mn, mo, mtext, mfrac, msqrt, mroot, msup, msub, msubsup,
 * munder, mover, munderover, mtable, mtr, mtd, mspace. Every text and attribute value is escaped.
 *
 * Notes on Core limits:
 * - `mathvariant` is only used as "normal" (upright single letters, \mathrm, function names).
 *   Bold (\mathbf) has no Core mathvariant: it is written as `mathvariant="normal"` plus
 *   `style="font-weight:bold"`, which every MathML engine honours through CSS.
 * - Core has no `columnalign`: aligned and cases columns are aligned with `style="text-align:…"`
 *   on `mtd` (CSS, honoured by Chromium, WebKit and Gecko).
 * - Spacing follows TeX: operators are unspaced in script style (limits, scripts, inline fraction
 *   parts), with thin spaces before and after function names and around fractions.
 * Rendering quality depends on an OpenType MATH font (Cambria Math, STIX Two Math, Latin Modern
 * Math): without one, browsers cannot place accents or stretch delimiters well. The page should
 * list one in `math { font-family: … }`.
 * Pure module: safe in client components and on the server.
 */

import { parseLatex } from "./latex";
import type { LatexError, MathAccentKind, MathMLOptions, MathNode, MathVariant } from "./types";

const MATHML_NS = "http://www.w3.org/1998/Math/MathML";

/** Thin space (TeX \,): after function names, before them, around fractions. */
const THIN = '<mspace width="0.1667em"></mspace>';

/**
 * Accent glyphs, checked in Chromium with STIX Two Math at 16px and 1x/1.5x/2x: U+02C6 and U+02DC
 * sit right (U+005E is a tall ASCII caret); the macron U+00AF vanishes at some sub-pixel offsets
 * at 16px while U+203E stays visible, so \bar uses U+203E (non-stretchy) and \overline stretches it.
 */
const ACCENT_CHARS: Record<MathAccentKind, string> = {
  hat: "ˆ",
  bar: "‾",
  tilde: "˜",
  vec: "→",
  dot: "˙",
  ddot: "¨",
  overline: "‾",
};

/** TeX style: display, text, script (script and scriptscript behave the same for spacing). */
type Level = "D" | "T" | "S";

interface Ctx {
  variant?: MathVariant;
  level: Level;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Number of code points (𝔼 is one letter, two UTF-16 units). */
function codePoints(s: string): number {
  return s.replace(/[\ud800-\udbff][\udc00-\udfff]/g, "_").length;
}

function attrs(list: string[]): string {
  return list.length > 0 ? " " + list.join(" ") : "";
}

function isFunctionName(node: MathNode): boolean {
  if (node.type === "identifier") return node.fn === true;
  if (node.type === "sup" || node.type === "sub" || node.type === "subsup") return isFunctionName(node.base);
  return false;
}

function isWordOperator(node: MathNode): boolean {
  return node.type === "underover" && /^[A-Za-z]/.test(node.symbol);
}

function isOperatorLike(node: MathNode): boolean {
  return node.type === "operator" || node.type === "space";
}

function isPrimes(node: MathNode): boolean {
  return node.type === "operator" && /^[′″‴]+$/.test(node.value);
}

function scriptCtx(ctx: Ctx): Ctx {
  return { variant: ctx.variant, level: "S" };
}

/** Thin space between two adjacent atoms, after TeX's spacing table (Ord–Op, Op–Ord, Inner). */
function gap(prev: MathNode, node: MathNode, level: Level): string {
  if (isOperatorLike(prev) || isOperatorLike(node)) return "";
  const prevOp = isFunctionName(prev) || isWordOperator(prev);
  if (prevOp) return node.type === "fenced" ? "" : THIN;
  if (isFunctionName(node) || isWordOperator(node)) return THIN;
  if (level !== "S" && (node.type === "frac" || prev.type === "frac") && prev.type !== "underover" && node.type !== "underover") {
    return THIN;
  }
  return "";
}

/** Renders a list of nodes as siblings, with function application and TeX's thin spaces. */
function seq(children: MathNode[], ctx: Ctx): string {
  let out = "";
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    const prev = children[i - 1];
    if (prev) {
      if (isFunctionName(prev) && !isOperatorLike(node)) out += "<mo>&#x2061;</mo>";
      out += gap(prev, node, ctx.level);
    }
    out += el(node, ctx);
  }
  return out;
}

/** Exactly one element (for mfrac, msup, mroot… children). */
function one(node: MathNode, ctx: Ctx): string {
  if (node.type === "row") {
    if (node.children.length === 1) return one(node.children[0], ctx);
    return "<mrow>" + seq(node.children, ctx) + "</mrow>";
  }
  return el(node, ctx);
}

function children(node: MathNode): MathNode[] {
  return node.type === "row" ? node.children : [node];
}

function variantAttrs(variant: MathVariant | undefined, multi: boolean, forceNormal: boolean): string[] {
  const list: string[] = [];
  if (forceNormal || variant === "normal" || variant === "bold" || (variant === undefined && multi)) {
    list.push('mathvariant="normal"');
  }
  if (variant === "bold") list.push('style="font-weight:bold"');
  if (variant === "italic" && multi) list.push('style="font-style:italic"');
  return list;
}

function textValue(s: string): string {
  // Leading and trailing spaces would be collapsed by CSS: keep them as no-break spaces.
  return esc(s.replace(/^ +| +$/g, (m) => new Array(m.length + 1).join(" ")));
}

function fence(ch: string, stretchy: boolean, form: "prefix" | "postfix"): string {
  if (ch === "") return "";
  const zero = ch === "|" || ch === "‖" ? ' lspace="0" rspace="0"' : "";
  return `<mo stretchy="${stretchy ? "true" : "false"}" form="${form}"${zero}>${esc(ch)}</mo>`;
}

function table(rows: MathNode[][], ctx: Ctx, cellStyle: (col: number) => string, tableAttrs: string): string {
  let out = `<mtable${tableAttrs}>`;
  for (const cells of rows) {
    out += "<mtr>";
    cells.forEach((cell, col) => {
      const style = cellStyle(col);
      out += `<mtd${style ? ` style="${style}"` : ""}>` + seq(children(cell), ctx) + "</mtd>";
    });
    out += "</mtr>";
  }
  return out + "</mtable>";
}

function operator(node: Extract<MathNode, { type: "operator" }>, ctx: Ctx): string {
  const list: string[] = [];
  switch (node.role) {
    case "prefix":
      list.push('form="prefix"');
      break;
    case "open":
    case "close":
      list.push('stretchy="false"');
      break;
    case "fence":
      list.push('stretchy="false"', 'lspace="0"', 'rspace="0"');
      break;
    case "ordinary":
      list.push('lspace="0"', 'rspace="0"');
      if (node.value === "/") list.push('stretchy="false"');
      break;
    default:
      // binary, relation, punct: dictionary spacing, none in script style (TeX).
      if (ctx.level === "S") list.push('lspace="0"', 'rspace="0"');
      break;
  }
  if (ctx.variant === "bold") list.push('style="font-weight:bold"');
  return `<mo${attrs(list)}>${esc(node.value)}</mo>`;
}

function el(node: MathNode, ctx: Ctx): string {
  switch (node.type) {
    case "row":
      return node.children.length === 1 ? el(node.children[0], ctx) : "<mrow>" + seq(node.children, ctx) + "</mrow>";

    case "identifier": {
      const variant = ctx.variant !== undefined ? ctx.variant : node.variant;
      const list = variantAttrs(variant, codePoints(node.value) > 1, node.fn === true);
      return `<mi${attrs(list)}>${esc(node.value)}</mi>`;
    }

    case "number": {
      const list: string[] = [];
      if (ctx.variant === "bold") list.push('style="font-weight:bold"');
      if (ctx.variant === "italic") list.push('style="font-style:italic"');
      return `<mn${attrs(list)}>${esc(node.value)}</mn>`;
    }

    case "operator":
      return operator(node, ctx);

    case "text":
      return `<mtext>${textValue(node.value)}</mtext>`;

    case "space":
      return `<mspace width="${Math.max(0, Math.round(node.width * 10000) / 10000)}em"></mspace>`;

    case "frac": {
      const outer: Level = node.display === true ? "D" : node.display === false ? "T" : ctx.level;
      const inner: Ctx = { variant: ctx.variant, level: outer === "D" ? "T" : "S" };
      const f = `<mfrac${node.noBar ? ' linethickness="0"' : ""}>${one(node.num, inner)}${one(node.den, inner)}</mfrac>`;
      if (node.display === true) return `<mrow displaystyle="true" scriptlevel="0">${f}</mrow>`;
      if (node.display === false) return `<mrow displaystyle="false">${f}</mrow>`;
      return f;
    }

    case "sqrt":
      if (node.index) return `<mroot>${one(node.body, ctx)}${one(node.index, scriptCtx(ctx))}</mroot>`;
      return `<msqrt>${seq(children(node.body), ctx)}</msqrt>`;

    case "sup":
      if (isPrimes(node.sup)) {
        // A prime glyph is already raised: drawn after its base, not as a superscript.
        return `<mrow>${one(node.base, ctx)}<mo lspace="0" rspace="0">${esc((node.sup as { value: string }).value)}</mo></mrow>`;
      }
      return `<msup>${one(node.base, ctx)}${one(node.sup, scriptCtx(ctx))}</msup>`;

    case "sub":
      return `<msub>${one(node.base, ctx)}${one(node.sub, scriptCtx(ctx))}</msub>`;

    case "subsup":
      return `<msubsup>${one(node.base, ctx)}${one(node.sub, scriptCtx(ctx))}${one(node.sup, scriptCtx(ctx))}</msubsup>`;

    case "underover": {
      const word = /^[A-Za-z]/.test(node.symbol);
      const mo = word
        ? `<mo movablelimits="true" form="prefix" lspace="0" rspace="0">${esc(node.symbol)}</mo>`
        : node.limits === "under"
          ? `<mo largeop="true" movablelimits="true" form="prefix">${esc(node.symbol)}</mo>`
          : `<mo largeop="true" movablelimits="false" form="prefix">${esc(node.symbol)}</mo>`;
      const limitCtx = scriptCtx(ctx);
      const under = node.under ? one(node.under, limitCtx) : "";
      const over = node.over ? one(node.over, limitCtx) : "";
      if (node.limits === "side") {
        if (under && over) return `<msubsup>${mo}${under}${over}</msubsup>`;
        if (under) return `<msub>${mo}${under}</msub>`;
        if (over) return `<msup>${mo}${over}</msup>`;
        return mo;
      }
      if (under && over) return `<munderover>${mo}${under}${over}</munderover>`;
      if (under) return `<munder>${mo}${under}</munder>`;
      if (over) return `<mover>${mo}${over}</mover>`;
      return mo;
    }

    case "fenced":
      return (
        "<mrow>" +
        fence(node.open, node.stretchy, "prefix") +
        seq(children(node.body), ctx) +
        fence(node.close, node.stretchy, "postfix") +
        "</mrow>"
      );

    case "accent": {
      // No accent="true": in display math inside a bordered block (an editor page, a table cell),
      // Chromium 141 drops the overscript of <mover accent="true"> entirely (bars, hats, dots and
      // even a drawn rule vanish); a plain <mover> paints every accent, placed just above the base.
      const stretchy = node.accent === "overline" ? "true" : "false";
      return `<mover>${one(node.body, ctx)}<mo stretchy="${stretchy}">${esc(ACCENT_CHARS[node.accent])}</mo></mover>`;
    }

    case "style": {
      const variant: MathVariant = node.style === "mathbf" ? "bold" : node.style === "mathit" ? "italic" : "normal";
      return one(node.body, { variant, level: ctx.level });
    }

    case "matrix": {
      const cellCtx: Ctx = { variant: ctx.variant, level: "T" };
      if (node.kind === "cases") {
        const t = table(
          node.rows,
          cellCtx,
          (col) => (col === 0 ? "text-align:left;padding-left:0.2em;padding-right:1em" : "text-align:left;padding-left:0;padding-right:0"),
          "",
        );
        return `<mrow>${fence("{", true, "prefix")}${t}</mrow>`;
      }
      const t = table(node.rows, cellCtx, () => "", "");
      const pair: Record<string, [string, string]> = { pmatrix: ["(", ")"], bmatrix: ["[", "]"], vmatrix: ["|", "|"] };
      const p = pair[node.kind];
      if (!p) return t;
      return `<mrow>${fence(p[0], true, "prefix")}${t}${fence(p[1], true, "postfix")}</mrow>`;
    }

    case "aligned":
      return table(
        node.rows,
        { variant: ctx.variant, level: "D" },
        (col) =>
          col % 2 === 0
            ? `text-align:right;padding-left:${col === 0 ? 0 : 2}em;padding-right:0`
            : "text-align:left;padding-left:0;padding-right:0",
        ' displaystyle="true"',
      );
  }
}

/** Renders a math AST as a MathML Core `<math>` element (display: true → `display="block"`). */
export function toMathML(ast: MathNode, options: MathMLOptions): string {
  const body = seq(children(ast), { level: options.display ? "D" : "T" });
  const inner =
    options.annotation !== undefined
      ? `<semantics><mrow>${body}</mrow><annotation encoding="application/x-tex">${esc(options.annotation)}</annotation></semantics>`
      : body;
  return `<math xmlns="${MATHML_NS}"${options.display ? ' display="block"' : ""}>${inner}</math>`;
}

/** Parses LaTeX and renders MathML in one step; the LaTeX is kept as an annotation. */
export function latexToMathML(
  latex: string,
  options: { display: boolean },
): { ok: true; mathml: string } | { ok: false; error: LatexError } {
  const parsed = parseLatex(latex);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  return { ok: true, mathml: toMathML(parsed.ast, { display: options.display, annotation: latex.trim() }) };
}
