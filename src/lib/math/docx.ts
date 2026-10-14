/**
 * Math AST → Word's native equations (OMML) through the `docx` package (SPEC docs/papers.md D23:
 * DOCX export with editable equations). The module is passed in by the caller, so this file only
 * has type imports of `docx` and stays importable anywhere; it is the only file of src/lib/math that
 * knows about `docx`. Client/export use only.
 *
 * Pass `docx/math` (it re-exports the core math classes and adds matrices, cases, accents, bars,
 * brackets with any characters and large operators). The core `docx` module alone also works, with
 * plainer fallbacks for those structures, but only `docx/math` gives files that LibreOffice opens
 * without formula errors (|x|, intervals, matrices): the exporter should pass `docx/math`.
 *
 * Usage:
 *   const docxMath = await import("docx/math");
 *   new Paragraph({ children: [new docxMath.Math({ children: toDocxMath(ast, docxMath) })] });
 * A paragraph that holds only the Math is shown by Word as a display equation.
 *
 * Encodings chosen so that the same file opens cleanly in Word and in LibreOffice (which converts
 * OMML to its own formula language and rejects some of what Word accepts), checked by converting
 * with LibreOffice 24.2:
 * - upright names and letters (sin, det, \mathrm, \operatorname) are normal-text runs (`m:nor`):
 *   LibreOffice ignores `m:sty="p"` and would draw them in italic;
 * - |x|, ‖v‖ and mismatched brackets such as [0, 1) become delimiters (`m:d`), and \mid inside
 *   brackets becomes their separator, P(A | B): bare "|" in a run breaks LibreOffice's import;
 * - a lone sign as a script (Na⁺, Cl⁻) is normal text, and a row that starts with a relation
 *   (aligned "&= …") starts with an empty normal-text run, as LibreOffice wants a left operand.
 */

import type * as Docx from "docx";
import type * as DocxMath from "docx/math";
import { parseLatex } from "./latex";
import type { MathAccentKind, MathMatrixKind, MathNode, MathVariant } from "./types";

type MathComponent = Docx.MathComponent;
type RunStyle = Docx.MathRunStyle;

/** The classes of `docx` / `docx/math` this module uses; the `docx/math` extras are optional. */
export interface DocxMathModule {
  MathRun: typeof Docx.MathRun;
  MathFraction: typeof Docx.MathFraction;
  MathRadical: typeof Docx.MathRadical;
  MathSuperScript: typeof Docx.MathSuperScript;
  MathSubScript: typeof Docx.MathSubScript;
  MathSubSuperScript: typeof Docx.MathSubSuperScript;
  MathSum: typeof Docx.MathSum;
  MathIntegral: typeof Docx.MathIntegral;
  MathFunction: typeof Docx.MathFunction;
  MathRoundBrackets: typeof Docx.MathRoundBrackets;
  MathSquareBrackets: typeof Docx.MathSquareBrackets;
  MathCurlyBrackets: typeof Docx.MathCurlyBrackets;
  MathAngledBrackets: typeof Docx.MathAngledBrackets;
  MathLimitLower: typeof Docx.MathLimitLower;
  MathLimitUpper: typeof Docx.MathLimitUpper;
  MathAccent?: typeof DocxMath.MathAccent;
  MathBar?: typeof DocxMath.MathBar;
  MathBrackets?: typeof DocxMath.MathBrackets;
  MathMatrix?: typeof DocxMath.MathMatrix;
  MathCases?: typeof DocxMath.MathCases;
  MathLargeOperator?: typeof DocxMath.MathLargeOperator;
}

interface Ctx {
  m: DocxMathModule;
  variant?: MathVariant;
}

const ACCENT_NAMES: Record<Exclude<MathAccentKind, "overline">, DocxMath.MathAccentName> = {
  hat: "hat",
  bar: "bar",
  tilde: "tilde",
  vec: "rightArrow",
  dot: "dot",
  ddot: "doubleDot",
};

const ACCENT_CHARS: Record<MathAccentKind, string> = {
  hat: "^",
  bar: "¯",
  tilde: "~",
  vec: "→",
  dot: "˙",
  ddot: "¨",
  overline: "¯",
};

const MATRIX_BRACKETS: Record<Exclude<MathMatrixKind, "cases">, DocxMath.MathMatrixBrackets> = {
  matrix: "none",
  pmatrix: "round",
  bmatrix: "square",
  vmatrix: "verticalBars",
};

const LARGE_NAMES: { [op: string]: DocxMath.MathLargeOperatorName } = {
  prod: "product",
  bigcup: "union",
  bigcap: "intersection",
  iint: "doubleIntegral",
  iiint: "tripleIntegral",
  oint: "contourIntegral",
};

/** Docx classes from `docx/math` are BuilderElements; they are valid math children. */
function asComponent(x: unknown): MathComponent {
  return x as MathComponent;
}

function isLatin(value: string): boolean {
  return /^[A-Za-zÀ-ɏ]+$/.test(value);
}

/** Word style of a token, or undefined for Word's default (italic letters, upright digits and symbols). */
function tokenStyle(node: MathNode, ctx: Ctx): RunStyle | undefined {
  if (node.type === "identifier") {
    const v = ctx.variant !== undefined ? ctx.variant : node.variant;
    if (v === "bold") return "bold";
    if (v === "italic") return "italic";
    if (node.fn) return "plain";
    if (v === "normal") return isLatin(node.value) ? "plain" : undefined;
    return node.value.length > 1 && isLatin(node.value) ? "plain" : undefined;
  }
  if (node.type === "number" || node.type === "operator") return ctx.variant === "bold" ? "bold" : undefined;
  return undefined;
}

function spaceText(width: number): string {
  if (width >= 2) return "  ";
  if (width >= 1) return " ";
  if (width >= 0.3) return " ";
  if (width >= 0.25) return " ";
  if (width >= 0.2) return " ";
  return " ";
}

function run(ctx: Ctx, text: string, style?: RunStyle): MathComponent {
  // Upright text is written as normal text: Word draws it upright, LibreOffice too (it ignores m:sty="p").
  if (style === "plain") return new ctx.m.MathRun({ text, normalText: true });
  return style ? new ctx.m.MathRun({ text, style }) : new ctx.m.MathRun(text);
}

/** An empty normal-text run: an invisible left operand for a row that starts with a relation. */
function emptyRun(ctx: Ctx): MathComponent {
  return new ctx.m.MathRun({ text: "", normalText: true });
}

/** A script or limit; a lone sign (Na⁺, Cl⁻) is written as normal text. */
function scriptArg(node: MathNode, ctx: Ctx): MathComponent[] {
  if (node.type === "operator" && (node.role === "binary" || node.role === "prefix")) {
    return [new ctx.m.MathRun({ text: node.value, normalText: true })];
  }
  return convert(node, ctx);
}

type Fenced = Extract<MathNode, { type: "fenced" }>;

/** The operator a node closes with: the operator itself, or the base of a script on it (|x|², (a + b)²). */
function edgeOperator(node: MathNode): Extract<MathNode, { type: "operator" }> | null {
  if (node.type === "operator") return node;
  if ((node.type === "sup" || node.type === "sub" || node.type === "subsup") && node.base.type === "operator") return node.base;
  return null;
}

function wrapEdge(node: MathNode, fenced: Fenced): MathNode {
  if (node.type === "sup" || node.type === "sub" || node.type === "subsup") return { ...node, base: fenced };
  return fenced;
}

function fencedOf(open: string, close: string, body: MathNode[]): Fenced {
  return { type: "fenced", open, close, stretchy: false, body: body.length === 1 ? body[0] : { type: "row", children: body } };
}

/**
 * Pairs what the parser leaves unpaired, for Word's delimiters: |x| and ‖v‖ (left to right), then
 * any opening bracket with the next closing one, matched or not ([0, 1), (0, 1]).
 */
function pairForWord(nodes: MathNode[]): MathNode[] {
  let out: MathNode[] = [];
  let pending = -1;
  for (const node of nodes) {
    const op = edgeOperator(node);
    if (op && op.role === "fence") {
      const opener = pending >= 0 ? (out[pending] as Extract<MathNode, { type: "operator" }>) : null;
      if (opener && opener.value === op.value) {
        const body = out.splice(pending + 1);
        out.pop();
        out.push(wrapEdge(node, fencedOf(op.value, op.value, body)));
        pending = -1;
        continue;
      }
      if (node.type === "operator" && pending < 0) pending = out.length;
    }
    out.push(node);
  }
  const second: MathNode[] = [];
  const stack: number[] = [];
  for (const node of out) {
    const op = edgeOperator(node);
    if (node.type === "operator" && node.role === "open") {
      stack.push(second.length);
      second.push(node);
      continue;
    }
    if (op && op.role === "close" && stack.length > 0) {
      const at = stack.pop() as number;
      const body = second.splice(at + 1);
      const opener = second.pop() as Extract<MathNode, { type: "operator" }>;
      second.push(wrapEdge(node, fencedOf(opener.value, op.value, body)));
      continue;
    }
    second.push(node);
  }
  out = second;
  return out;
}

function nodesOf(node: MathNode): MathNode[] {
  return node.type === "row" ? node.children : [node];
}

function isFunctionName(node: MathNode): boolean {
  if (node.type === "identifier") return node.fn === true;
  if (node.type === "sup" || node.type === "sub" || node.type === "subsup") return isFunctionName(node.base);
  return false;
}

/** Operand of a large operator or limit: what follows, up to the next top-level relation, binary sign or comma. */
function takeOperand(nodes: MathNode[], from: number): number {
  let i = from;
  while (i < nodes.length) {
    const n = nodes[i];
    if (n.type === "operator" && (n.role === "relation" || n.role === "binary" || n.role === "punct")) break;
    i++;
  }
  return i;
}

/** Converts a list of sibling nodes; simple tokens with the same style are merged into one run, as Word writes them. */
function convertRow(input: MathNode[], ctx: Ctx): MathComponent[] {
  const nodes = pairForWord(input);
  const out: MathComponent[] = [];
  const first = nodes[0];
  if (first && first.type === "operator" && first.role === "relation") out.push(emptyRun(ctx));
  let buf = "";
  let bufStyle: RunStyle | undefined;
  const flush = () => {
    if (buf) out.push(run(ctx, buf, bufStyle));
    buf = "";
    bufStyle = undefined;
  };
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if ((node.type === "identifier" && !node.fn) || node.type === "number" || node.type === "operator" || node.type === "space") {
      const style = node.type === "space" ? bufStyle : tokenStyle(node, ctx);
      if (buf && style !== bufStyle) flush();
      if (!buf) bufStyle = style;
      buf += node.type === "space" ? spaceText(node.width) : node.value;
      continue;
    }
    flush();
    if (isFunctionName(node)) {
      const next = nodes[i + 1];
      let operand: MathComponent[] = [];
      if (next && next.type !== "operator" && next.type !== "space") {
        operand = convert(next, ctx);
        i++;
      }
      out.push(new ctx.m.MathFunction({ name: convert(node, ctx), children: operand }));
      continue;
    }
    if (node.type === "underover") {
      const stop = takeOperand(nodes, i + 1);
      const operand = convertRow(nodes.slice(i + 1, stop), ctx);
      out.push(...largeOperator(node, operand, ctx));
      i = stop - 1;
      continue;
    }
    out.push(...convert(node, ctx));
  }
  flush();
  return out;
}

function largeOperator(node: Extract<MathNode, { type: "underover" }>, operand: MathComponent[], ctx: Ctx): MathComponent[] {
  const m = ctx.m;
  const sub = node.under ? scriptArg(node.under, ctx) : undefined;
  const sup = node.over ? scriptArg(node.over, ctx) : undefined;
  if (/^[A-Za-z]/.test(node.symbol)) {
    let name: MathComponent = run(ctx, node.symbol, "plain");
    if (sub) name = new m.MathLimitLower({ children: [name], limit: sub });
    if (sup) name = new m.MathLimitUpper({ children: [name], limit: sup });
    return [new m.MathFunction({ name: [name], children: operand })];
  }
  if (node.op === "sum") return [new m.MathSum({ children: operand, subScript: sub, superScript: sup })];
  if (node.op === "int") return [new m.MathIntegral({ children: operand, subScript: sub, superScript: sup })];
  const large = LARGE_NAMES[node.op];
  if (m.MathLargeOperator && large) {
    return [asComponent(new m.MathLargeOperator({ operator: large, children: operand, subScript: sub, superScript: sup }))];
  }
  // Core docx only: the symbol with its limits as scripts, then the operand.
  const symbol = run(ctx, node.symbol);
  let head: MathComponent = symbol;
  if (sub && sup) head = new m.MathSubSuperScript({ children: [symbol], subScript: sub, superScript: sup });
  else if (sub) head = new m.MathSubScript({ children: [symbol], subScript: sub });
  else if (sup) head = new m.MathSuperScript({ children: [symbol], superScript: sup });
  return [head, ...operand];
}

function isSeparator(node: MathNode): boolean {
  return node.type === "operator" && ((node.role === "relation" && node.value === "∣") || (node.role === "fence" && node.value === "|"));
}

/** Brackets around an AST body; \mid (or a lone |) at its top level becomes the brackets' separator: P(A | B), {x | x > 0}. */
function fencedBrackets(open: string, close: string, body: MathNode, ctx: Ctx): MathComponent[] {
  const m = ctx.m;
  const nodes = pairForWord(nodesOf(body));
  if (m.MathBrackets && nodes.some(isSeparator)) {
    const items: MathNode[][] = [[]];
    for (const n of nodes) {
      if (isSeparator(n)) items.push([]);
      else items[items.length - 1].push(n);
    }
    return [asComponent(new m.MathBrackets({ open, close, separator: "|", items: items.map((it) => convertRow(it, ctx)) }))];
  }
  return brackets(open, close, convertRow(nodes, ctx), ctx);
}

function brackets(open: string, close: string, body: MathComponent[], ctx: Ctx): MathComponent[] {
  const m = ctx.m;
  if (m.MathBrackets) return [asComponent(new m.MathBrackets({ open, close, children: body }))];
  const pair = open + close;
  if (pair === "()") return [new m.MathRoundBrackets({ children: body })];
  if (pair === "[]") return [new m.MathSquareBrackets({ children: body })];
  if (pair === "{}") return [new m.MathCurlyBrackets({ children: body })];
  if (pair === "⟨⟩") return [new m.MathAngledBrackets({ children: body })];
  const out: MathComponent[] = [];
  if (open) out.push(run(ctx, open));
  out.push(...body);
  if (close) out.push(run(ctx, close));
  return out;
}

function isPrimes(node: MathNode): boolean {
  return node.type === "operator" && /^[′″‴]+$/.test(node.value);
}

/** Linear fallback for tables without `docx/math`: rows separated by ";" and cells by ",". */
function linearTable(rows: MathNode[][], ctx: Ctx): MathComponent[] {
  const out: MathComponent[] = [];
  rows.forEach((cells, r) => {
    if (r > 0) out.push(run(ctx, "; "));
    cells.forEach((cell, c) => {
      if (c > 0) out.push(run(ctx, ", "));
      out.push(...convert(cell, ctx));
    });
  });
  return out;
}

function convert(node: MathNode, ctx: Ctx): MathComponent[] {
  const m = ctx.m;
  switch (node.type) {
    case "row":
      return convertRow(node.children, ctx);
    case "identifier":
      return [run(ctx, node.value, tokenStyle(node, ctx))];
    case "number":
    case "operator":
      return [run(ctx, node.value, tokenStyle(node, ctx))];
    case "space":
      return [run(ctx, spaceText(node.width))];
    case "text":
      return [new m.MathRun({ text: node.value, normalText: true })];
    case "frac":
      return [
        new m.MathFraction({
          numerator: convert(node.num, ctx),
          denominator: convert(node.den, ctx),
          type: node.noBar ? "noBar" : undefined,
        }),
      ];
    case "sqrt":
      return [new m.MathRadical({ children: convert(node.body, ctx), degree: node.index ? convert(node.index, ctx) : undefined })];
    case "sup":
      if (isPrimes(node.sup)) return [...convert(node.base, ctx), run(ctx, (node.sup as { value: string }).value)];
      return [new m.MathSuperScript({ children: convert(node.base, ctx), superScript: scriptArg(node.sup, ctx) })];
    case "sub":
      return [new m.MathSubScript({ children: convert(node.base, ctx), subScript: scriptArg(node.sub, ctx) })];
    case "subsup":
      return [
        new m.MathSubSuperScript({
          children: convert(node.base, ctx),
          subScript: scriptArg(node.sub, ctx),
          superScript: scriptArg(node.sup, ctx),
        }),
      ];
    case "underover":
      return largeOperator(node, [], ctx);
    case "fenced":
      return fencedBrackets(node.open, node.close, node.body, ctx);
    case "accent": {
      const body = convert(node.body, ctx);
      if (node.accent === "overline" && m.MathBar) return [asComponent(new m.MathBar({ children: body }))];
      if (m.MathAccent) {
        const accent = node.accent === "overline" ? "bar" : ACCENT_NAMES[node.accent];
        return [asComponent(new m.MathAccent({ accent, children: body }))];
      }
      return [new m.MathLimitUpper({ children: body, limit: [run(ctx, ACCENT_CHARS[node.accent])] })];
    }
    case "style": {
      const variant: MathVariant = node.style === "mathbf" ? "bold" : node.style === "mathit" ? "italic" : "normal";
      return convert(node.body, { m, variant });
    }
    case "matrix": {
      if (node.kind === "cases") {
        if (m.MathCases) {
          const cases = node.rows.map((cells) => {
            const value = convert(cells[0], ctx);
            const rest = cells.slice(1).reduce<MathComponent[]>((acc, c) => acc.concat(convert(c, ctx)), []);
            return rest.length > 0 ? { value, condition: rest } : { value };
          });
          return [asComponent(new m.MathCases({ cases }))];
        }
        return brackets("{", "", linearTable(node.rows, ctx), ctx);
      }
      if (m.MathMatrix) {
        const rows = node.rows.map((cells) => cells.map((c) => convert(c, ctx)));
        return [asComponent(new m.MathMatrix({ rows, brackets: MATRIX_BRACKETS[node.kind] }))];
      }
      const pair: Record<string, [string, string]> = { pmatrix: ["(", ")"], bmatrix: ["[", "]"], vmatrix: ["|", "|"], matrix: ["", ""] };
      const p = pair[node.kind];
      return brackets(p[0], p[1], linearTable(node.rows, ctx), ctx);
    }
    case "aligned": {
      if (m.MathMatrix) {
        const cols = node.rows.reduce((n, r) => Math.max(n, r.length), 0);
        const columnAlignment: DocxMath.MathColumnAlignment[] = [];
        for (let c = 0; c < cols; c++) columnAlignment.push(c % 2 === 0 ? "right" : "left");
        const rows = node.rows.map((cells) => cells.map((c) => convert(c, ctx)));
        return [asComponent(new m.MathMatrix({ rows, brackets: "none", columnAlignment }))];
      }
      return linearTable(node.rows, ctx);
    }
  }
}

/** Converts a math AST into the children of `new docx.Math({ children })` (Word's editable equations). */
export function toDocxMath(ast: MathNode, docx: DocxMathModule): MathComponent[] {
  return convertRow(nodesOf(ast), { m: docx });
}

/** Parses LaTeX and converts it for `docx`; null when the LaTeX is outside the supported subset. */
export function latexToDocxMath(latex: string, docx: DocxMathModule): MathComponent[] | null {
  const parsed = parseLatex(latex);
  return parsed.ok ? toDocxMath(parsed.ast, docx) : null;
}
