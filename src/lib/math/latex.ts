/**
 * LaTeX subset → math AST (SPEC docs/papers.md D23, §9.3). Hand-written recursive-descent parser
 * over the source string, no dependencies, deterministic. Anything outside the subset is an error:
 * the raw input is never passed through (the writers only ever see AST nodes and escape every text).
 *
 * Supported: letters, numbers (decimal point or comma), operators, `^ _ { } '`, \frac \dfrac \tfrac
 * \binom \sqrt[n]{} \sum \prod \int \iint \iiint \oint \bigcup \bigcap \lim \max \min \sup \inf \det
 * \Pr \gcd, function names (\sin … \log \ln \exp …), \operatorname{…} and \operatorname*{…}, Greek
 * letters (\alpha … \omega, \Gamma … \Omega), \left \right, relations and binary operators (\leq,
 * \times, \pm, \in, \to …), \hat \bar \tilde \vec \dot \ddot \overline, \mathrm \mathbf \mathit
 * \mathbb \text, spacing (\, \: \; \quad \qquad "\ " ~), dots, \% \{ \} \|, environments matrix,
 * pmatrix, bmatrix, vmatrix, cases and aligned. One pair of outer delimiters ($…$, $$…$$, \(…\),
 * \[…\]) is accepted and ignored. Pure module: safe in client components and on the server.
 */

import type {
  LargeOperator,
  LatexErrorCode,
  LatexParseResult,
  MathAccentKind,
  MathFenced,
  MathMatrixKind,
  MathNode,
  MathOperator,
  MathRow,
  MathStyleKind,
  MathVariant,
  OperatorRole,
} from "./types";

/** Longest accepted source, in characters (D23). */
export const MAX_LATEX_LENGTH = 2000;
/** Deepest accepted nesting of groups, commands, \left…\right and environments. */
export const MAX_LATEX_DEPTH = 40;
/** Most rows (\\) in one environment. */
export const MAX_ENV_ROWS = 64;
/** Most cells (&) in one environment row. */
export const MAX_ENV_COLS = 20;

// ---------------------------------------------------------------------------------------------
// Symbol tables (looked up with `own()` so that "\constructor" or "\__proto__" never hit Object).

type Table<T> = { [key: string]: T };

const GREEK_LOWER: Table<string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ϵ", varepsilon: "ε", zeta: "ζ", eta: "η",
  theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", omicron: "ο",
  pi: "π", varpi: "ϖ", rho: "ρ", varrho: "ϱ", sigma: "σ", varsigma: "ς", tau: "τ", upsilon: "υ",
  phi: "ϕ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
};

const GREEK_UPPER: Table<string> = {
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Upsilon: "Υ",
  Phi: "Φ", Psi: "Ψ", Omega: "Ω",
};

const RELATIONS: Table<string> = {
  leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠", approx: "≈", equiv: "≡", sim: "∼",
  simeq: "≃", cong: "≅", propto: "∝", in: "∈", notin: "∉", ni: "∋", subset: "⊂", subseteq: "⊆",
  supset: "⊃", supseteq: "⊇", mid: "∣", parallel: "∥", perp: "⊥", to: "→", rightarrow: "→",
  leftarrow: "←", gets: "←", Rightarrow: "⇒", Leftarrow: "⇐", Leftrightarrow: "⇔", leftrightarrow: "↔",
  implies: "⇒", iff: "⇔", mapsto: "↦", ll: "≪", gg: "≫",
};

const BINARIES: Table<string> = {
  pm: "±", mp: "∓", times: "×", cdot: "⋅", div: "÷", cup: "∪", cap: "∩", setminus: "∖", circ: "∘",
  ast: "∗", oplus: "⊕", otimes: "⊗", wedge: "∧", land: "∧", vee: "∨", lor: "∨",
};

/** Symbols drawn as letters: [character, variant]. */
const SYMBOL_IDS: Table<[string, MathVariant | undefined]> = {
  infty: ["∞", "normal"], partial: ["∂", undefined], nabla: ["∇", "normal"], forall: ["∀", "normal"],
  exists: ["∃", "normal"], emptyset: ["∅", "normal"], varnothing: ["∅", "normal"], ell: ["ℓ", undefined],
  hbar: ["ℏ", undefined], top: ["⊤", "normal"],
};

const ORDINARY_OPS: Table<string> = {
  ldots: "…", dots: "…", cdots: "⋯", vdots: "⋮", ddots: "⋱", prime: "′",
};

const PREFIX_OPS: Table<string> = { neg: "¬", lnot: "¬" };

const FUNCTIONS: Table<true> = {
  sin: true, cos: true, tan: true, cot: true, sec: true, csc: true, arcsin: true, arccos: true,
  arctan: true, sinh: true, cosh: true, tanh: true, coth: true, log: true, ln: true, lg: true, exp: true,
  arg: true, dim: true, ker: true, deg: true,
};

/** Names that take limits underneath in display style. */
const LIMIT_OPS: Table<LargeOperator> = {
  lim: "lim", max: "max", min: "min", sup: "sup", inf: "inf", det: "det", Pr: "Pr", gcd: "gcd",
};

const LARGE_OPS: Table<[LargeOperator, string, "under" | "side"]> = {
  sum: ["sum", "∑", "under"], prod: ["prod", "∏", "under"], bigcup: ["bigcup", "⋃", "under"],
  bigcap: ["bigcap", "⋂", "under"], int: ["int", "∫", "side"], iint: ["iint", "∬", "side"],
  iiint: ["iiint", "∭", "side"], oint: ["oint", "∮", "side"],
};

const ACCENTS: Table<MathAccentKind> = {
  hat: "hat", widehat: "hat", bar: "bar", tilde: "tilde", widetilde: "tilde", vec: "vec", dot: "dot",
  ddot: "ddot", overline: "overline",
};

const STYLES: Table<MathStyleKind> = { mathrm: "mathrm", mathbf: "mathbf", mathit: "mathit" };

/** Explicit spaces, in em. */
const SPACES: Table<number> = { ",": 0.1667, ":": 0.2222, ">": 0.2222, ";": 0.2778, " ": 0.3333, quad: 1, qquad: 2 };

/** Escaped characters in math: \% \{ \} \| \& \_ \# \$. */
const ESCAPES: Table<MathNode> = {
  "%": { type: "identifier", value: "%", variant: "normal" },
  "&": { type: "identifier", value: "&", variant: "normal" },
  "_": { type: "identifier", value: "_", variant: "normal" },
  "#": { type: "identifier", value: "#", variant: "normal" },
  $: { type: "identifier", value: "$", variant: "normal" },
  "{": { type: "operator", value: "{", role: "open" },
  "}": { type: "operator", value: "}", role: "close" },
  "|": { type: "operator", value: "‖", role: "fence" },
};

/** Bracket commands usable outside \left…\right: [character, role]. */
const BRACKET_CMDS: Table<[string, OperatorRole]> = {
  langle: ["⟨", "open"], rangle: ["⟩", "close"], lfloor: ["⌊", "open"], rfloor: ["⌋", "close"],
  lceil: ["⌈", "open"], rceil: ["⌉", "close"], lvert: ["|", "fence"], rvert: ["|", "fence"],
  lVert: ["‖", "fence"], rVert: ["‖", "fence"],
};

/** Delimiters after \left and \right (by command name). */
const DELIM_CMDS: Table<string> = {
  "{": "{", "}": "}", "|": "‖", langle: "⟨", rangle: "⟩", lvert: "|", rvert: "|", lVert: "‖", rVert: "‖",
  lfloor: "⌊", rfloor: "⌋", lceil: "⌈", rceil: "⌉",
};
const DELIM_CHARS: Table<string> = { "(": "(", ")": ")", "[": "[", "]": "]", "|": "|", ".": "", "/": "/" };

const ENVIRONMENTS: Table<MathMatrixKind | "aligned"> = {
  matrix: "matrix", pmatrix: "pmatrix", bmatrix: "bmatrix", vmatrix: "vmatrix", cases: "cases", aligned: "aligned",
};

/** ASCII characters with a meaning in math mode: [drawn character, role]. */
const ASCII_OPS: Table<[string, OperatorRole]> = {
  "+": ["+", "binary"], "-": ["−", "binary"], "*": ["∗", "binary"], "/": ["/", "ordinary"],
  "=": ["=", "relation"], "<": ["<", "relation"], ">": [">", "relation"], ":": [":", "relation"],
  "!": ["!", "ordinary"], "?": ["?", "ordinary"], ",": [",", "punct"], ";": [";", "punct"],
  ".": [".", "ordinary"], "(": ["(", "open"], ")": [")", "close"], "[": ["[", "open"], "]": ["]", "close"],
  "|": ["|", "fence"],
};

/** Unicode operators typed directly. */
const UNICODE_OPS: Table<[string, OperatorRole]> = {
  "−": ["−", "binary"], "–": ["−", "binary"], "±": ["±", "binary"], "∓": ["∓", "binary"], "×": ["×", "binary"],
  "·": ["⋅", "binary"], "⋅": ["⋅", "binary"], "÷": ["÷", "binary"], "∗": ["∗", "binary"], "∪": ["∪", "binary"],
  "∩": ["∩", "binary"], "∖": ["∖", "binary"], "∘": ["∘", "binary"], "⊕": ["⊕", "binary"], "⊗": ["⊗", "binary"],
  "∧": ["∧", "binary"], "∨": ["∨", "binary"],
  "≤": ["≤", "relation"], "≥": ["≥", "relation"], "≠": ["≠", "relation"], "≈": ["≈", "relation"],
  "≡": ["≡", "relation"], "∼": ["∼", "relation"], "≃": ["≃", "relation"], "≅": ["≅", "relation"],
  "∝": ["∝", "relation"], "∈": ["∈", "relation"], "∉": ["∉", "relation"], "∋": ["∋", "relation"],
  "⊂": ["⊂", "relation"], "⊆": ["⊆", "relation"], "⊃": ["⊃", "relation"], "⊇": ["⊇", "relation"],
  "∣": ["∣", "relation"], "→": ["→", "relation"], "←": ["←", "relation"], "⇒": ["⇒", "relation"],
  "⇐": ["⇐", "relation"], "⇔": ["⇔", "relation"], "↔": ["↔", "relation"], "↦": ["↦", "relation"],
  "≪": ["≪", "relation"], "≫": ["≫", "relation"],
  "…": ["…", "ordinary"], "⋯": ["⋯", "ordinary"], "⋮": ["⋮", "ordinary"], "⋱": ["⋱", "ordinary"],
  "′": ["′", "ordinary"], "″": ["″", "ordinary"], "¬": ["¬", "prefix"],
  "⟨": ["⟨", "open"], "⟩": ["⟩", "close"], "‖": ["‖", "fence"],
};

/** Unicode symbols typed directly and drawn as letters. */
const UNICODE_IDS: Table<MathVariant | "default"> = {
  "∞": "normal", "∂": "default", "∇": "normal", "∀": "normal", "∃": "normal", "∅": "normal", "°": "normal",
  "ℓ": "default", "ℏ": "default", "ℂ": "normal", "ℍ": "normal", "ℕ": "normal", "ℙ": "normal", "ℚ": "normal",
  "ℝ": "normal", "ℤ": "normal",
};

/** Unicode large operators typed directly → the command they stand for. */
const UNICODE_LARGE: Table<string> = { "∑": "sum", "∏": "prod", "∫": "int", "∬": "iint", "∭": "iiint", "∮": "oint", "⋃": "bigcup", "⋂": "bigcap" };

/** Matching pairs of plain brackets (paired into `fenced` nodes after a row is read). */
const PAIRS: Table<string> = { "(": ")", "[": "]", "{": "}", "⟨": "⟩", "⌊": "⌋", "⌈": "⌉" };

/** Double-struck capitals with their own BMP code points. */
const DOUBLE_STRUCK: Table<string> = { C: "ℂ", H: "ℍ", N: "ℕ", P: "ℙ", Q: "ℚ", R: "ℝ", Z: "ℤ" };

/** Escapes accepted inside \text{…}. */
const TEXT_ESCAPES: Table<string> = {
  "%": "%", "{": "{", "}": "}", "_": "_", "&": "&", "#": "#", $: "$", " ": " ", ",": " ",
};

/** An HTML-looking tag anywhere in the source is refused outright (never valid math). */
const HTML_TAG = /<\/?[A-Za-z][A-Za-z0-9-]*(\s[^<>]*)?\/?>/;

function own<T>(table: Table<T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

// ---------------------------------------------------------------------------------------------
// Parser state and errors.

interface State {
  src: string;
  pos: number;
  end: number;
  depth: number;
}

interface Stops {
  brace?: boolean;
  bracket?: boolean;
  right?: boolean;
  cell?: boolean;
  env?: boolean;
}

interface Fail {
  latexFail: true;
  code: LatexErrorCode;
  at: number;
  command?: string;
}

function fail(code: LatexErrorCode, at: number, command?: string): never {
  const f: Fail = { latexFail: true, code, at };
  if (command !== undefined) f.command = command;
  throw f;
}

function isFail(e: unknown): e is Fail {
  return typeof e === "object" && e !== null && (e as Fail).latexFail === true;
}

function isLetter(c: string | undefined): boolean {
  return c !== undefined && ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z"));
}

function isDigit(c: string | undefined): boolean {
  return c !== undefined && c >= "0" && c <= "9";
}

function isSpace(c: string | undefined): boolean {
  return c === " " || c === "\t" || c === "\n" || c === "\r" || c === " ";
}

function skipWs(st: State): void {
  while (st.pos < st.end && isSpace(st.src[st.pos])) st.pos++;
}

function enter(st: State, at: number): void {
  st.depth++;
  if (st.depth > MAX_LATEX_DEPTH) fail("too_long", at);
}

function leave(st: State): void {
  st.depth--;
}

function row(children: MathNode[]): MathRow {
  return { type: "row", children };
}

/** One node for a list: the node itself when alone, else a row. */
function rowOrSingle(items: MathNode[]): MathNode {
  return items.length === 1 ? items[0] : row(items);
}

/** Name of the command at `st.pos` (which is a backslash): letters, or one symbol; "" at the end. */
function peekCommand(st: State): string {
  const next = st.src[st.pos + 1];
  if (st.pos + 1 >= st.end || next === undefined) return "";
  if (!isLetter(next)) return next;
  let e = st.pos + 1;
  while (e < st.end && isLetter(st.src[e])) e++;
  return st.src.slice(st.pos + 1, e);
}

// ---------------------------------------------------------------------------------------------
// Rows.

function parseRow(st: State, stops: Stops): MathNode[] {
  const items: MathNode[] = [];
  for (;;) {
    skipWs(st);
    if (st.pos >= st.end) break;
    const ch = st.src[st.pos];
    if (ch === "}") {
      if (stops.brace) break;
      fail("unbalanced", st.pos, "}");
    }
    if (ch === "]" && stops.bracket) break;
    if (ch === "&") {
      if (stops.cell) break;
      fail("unknown_command", st.pos, "&");
    }
    if (ch === "\\") {
      const name = peekCommand(st);
      if (name === "\\") {
        if (stops.cell) break;
        fail("unknown_command", st.pos, "\\\\");
      }
      if (name === "right") {
        if (stops.right) break;
        fail("unbalanced", st.pos, "\\right");
      }
      if (name === "end") {
        if (stops.env) break;
        fail("unbalanced", st.pos, "\\end");
      }
    }
    items.push(parseAtom(st));
  }
  return markUnary(pairBrackets(items));
}

/** Wraps matched plain brackets "( … )" of a row into non-stretchy `fenced` nodes (scripts on the closer move to the group). */
function pairBrackets(items: MathNode[]): MathNode[] {
  const out: MathNode[] = [];
  const stack: number[] = [];
  for (const item of items) {
    if (item.type === "operator" && item.role === "open") {
      stack.push(out.length);
      out.push(item);
      continue;
    }
    const closer = closerOf(item);
    if (closer && stack.length > 0) {
      const oi = stack[stack.length - 1];
      const open = out[oi] as MathOperator;
      if (own(PAIRS, open.value) === closer.char) {
        stack.pop();
        const body = out.splice(oi + 1);
        out.pop();
        const fenced: MathFenced = {
          type: "fenced",
          open: open.value,
          close: closer.char,
          body: rowOrSingle(markUnary(body)),
          stretchy: false,
        };
        out.push(closer.wrap(fenced));
        continue;
      }
    }
    out.push(item);
  }
  return out;
}

function closerOf(item: MathNode): { char: string; wrap: (f: MathFenced) => MathNode } | null {
  if (item.type === "operator" && item.role === "close") return { char: item.value, wrap: (f) => f };
  if ((item.type === "sup" || item.type === "sub" || item.type === "subsup") && item.base.type === "operator" && item.base.role === "close") {
    const value = item.base.value;
    return { char: value, wrap: (f) => ({ ...item, base: f }) };
  }
  return null;
}

const UNARY_CAPABLE: Table<true> = { "+": true, "−": true, "±": true, "∓": true };
const UNARY_AFTER: Table<true> = { binary: true, prefix: true, relation: true, punct: true, open: true };

/** A binary sign at the start of a row or after an operator is a unary sign (−x, = −1, (−b …). */
function markUnary(items: MathNode[]): MathNode[] {
  return items.map((node, i) => {
    if (node.type !== "operator" || node.role !== "binary" || !own(UNARY_CAPABLE, node.value)) return node;
    const prev = i > 0 ? items[i - 1] : undefined;
    const unary = !prev || (prev.type === "operator" && own(UNARY_AFTER, prev.role) === true) || prev.type === "underover";
    return unary ? { ...node, role: "prefix" as OperatorRole } : node;
  });
}

// ---------------------------------------------------------------------------------------------
// Atoms and scripts.

function primeOperator(count: number): MathOperator {
  const value = count === 1 ? "′" : count === 2 ? "″" : count === 3 ? "‴" : new Array(count + 1).join("′");
  return { type: "operator", value, role: "ordinary" };
}

function parseAtom(st: State): MathNode {
  skipWs(st);
  const c0 = st.src[st.pos];
  let base: MathNode = c0 === "^" || c0 === "_" || c0 === "'" ? row([]) : parsePrimary(st);
  let sub: MathNode | undefined;
  let sup: MathNode | undefined;
  let primes = 0;
  for (;;) {
    skipWs(st);
    if (st.pos >= st.end) break;
    const c = st.src[st.pos];
    if (c === "'") {
      if (sup) fail("unbalanced", st.pos, "'");
      while (st.pos < st.end && st.src[st.pos] === "'") {
        primes++;
        st.pos++;
      }
      continue;
    }
    if (c === "^") {
      if (sup) fail("unbalanced", st.pos, "^");
      const at = st.pos++;
      sup = parseScriptArg(st, at);
      continue;
    }
    if (c === "_") {
      if (sub) fail("unbalanced", st.pos, "_");
      const at = st.pos++;
      sub = parseScriptArg(st, at);
      continue;
    }
    break;
  }
  const supNode: MathNode | undefined =
    primes > 0 ? (sup ? row([primeOperator(primes), sup]) : primeOperator(primes)) : sup;
  if (base.type === "underover" && !base.under && !base.over && primes === 0) {
    if (sub) base = { ...base, under: sub };
    if (supNode) base = { ...base, over: supNode };
    return base;
  }
  if (sub && supNode) return { type: "subsup", base, sub, sup: supNode };
  if (sub) return { type: "sub", base, sub };
  if (supNode) return { type: "sup", base, sup: supNode };
  return base;
}

/** The argument of ^ or _: a group, one digit, one letter, one command or one symbol. */
function parseScriptArg(st: State, at: number): MathNode {
  skipWs(st);
  if (st.pos >= st.end) fail("unbalanced", at, st.src[at]);
  const c = st.src[st.pos];
  if (c === "^" || c === "_" || c === "'" || c === "}" || c === "&") fail("unbalanced", at, st.src[at]);
  if (isDigit(c)) {
    st.pos++;
    return { type: "number", value: c };
  }
  return parsePrimary(st);
}

/** A mandatory argument of a command: a group, one digit, one letter or one command. */
function parseArg(st: State, at: number, cmd: string): MathNode {
  skipWs(st);
  if (st.pos >= st.end) fail("unbalanced", at, cmd);
  const c = st.src[st.pos];
  if (c === "^" || c === "_" || c === "'" || c === "}" || c === "&" || c === "]") fail("unbalanced", at, cmd);
  if (isDigit(c)) {
    st.pos++;
    return { type: "number", value: c };
  }
  return parsePrimary(st);
}

function parseGroup(st: State): MathNode {
  const open = st.pos;
  st.pos++;
  enter(st, open);
  const items = parseRow(st, { brace: true });
  if (st.pos >= st.end || st.src[st.pos] !== "}") fail("unbalanced", open, "{");
  st.pos++;
  leave(st);
  return rowOrSingle(items);
}

function parseNumber(st: State): MathNode {
  const start = st.pos;
  while (st.pos < st.end && isDigit(st.src[st.pos])) st.pos++;
  const sep = st.src[st.pos];
  if (st.pos < st.end - 1 && (sep === "." || sep === ",") && isDigit(st.src[st.pos + 1])) {
    st.pos++;
    while (st.pos < st.end && isDigit(st.src[st.pos])) st.pos++;
  }
  return { type: "number", value: st.src.slice(start, st.pos) };
}

function isGreekCode(code: number): boolean {
  return (code >= 0x391 && code <= 0x3a9) || (code >= 0x3b1 && code <= 0x3c9) || code === 0x3d1 || code === 0x3d5 || code === 0x3d6 || code === 0x3f1 || code === 0x3f5;
}

function isLatinAccented(code: number): boolean {
  return (code >= 0xc0 && code <= 0x24f) && code !== 0xd7 && code !== 0xf7;
}

function parsePrimary(st: State): MathNode {
  skipWs(st);
  const at = st.pos;
  if (at >= st.end) fail("unbalanced", at);
  const c = st.src[at];
  if (c === "{") return parseGroup(st);
  if (isLetter(c)) {
    st.pos++;
    return { type: "identifier", value: c };
  }
  if (isDigit(c) || (c === "." && isDigit(st.src[at + 1]) && at + 1 < st.end)) return parseNumber(st);
  if (c === "\\") return parseCommand(st);
  if (c === "~") {
    st.pos++;
    return { type: "space", width: 0.3333 };
  }
  const ascii = own(ASCII_OPS, c);
  if (ascii) {
    st.pos++;
    return { type: "operator", value: ascii[0], role: ascii[1] };
  }
  const code = c.charCodeAt(0);
  if (isGreekCode(code)) {
    st.pos++;
    return code <= 0x3a9 ? { type: "identifier", value: c, variant: "normal" } : { type: "identifier", value: c };
  }
  if (isLatinAccented(code)) {
    st.pos++;
    return { type: "identifier", value: c };
  }
  const uop = own(UNICODE_OPS, c);
  if (uop) {
    st.pos++;
    return { type: "operator", value: uop[0], role: uop[1] };
  }
  const uid = own(UNICODE_IDS, c);
  if (uid) {
    st.pos++;
    return uid === "default" ? { type: "identifier", value: c } : { type: "identifier", value: c, variant: uid };
  }
  const ularge = own(UNICODE_LARGE, c);
  if (ularge) {
    st.pos++;
    const spec = own(LARGE_OPS, ularge) as [LargeOperator, string, "under" | "side"];
    return { type: "underover", op: spec[0], symbol: spec[1], limits: spec[2] };
  }
  if (code >= 0xd800 && code <= 0xdbff && at + 1 < st.end) {
    // Characters outside the BMP: Mathematical Alphanumeric Symbols (𝔼, 𝐱, 𝒜) are letters; the rest is refused whole.
    const pair = st.src.slice(at, at + 2);
    const low = st.src.charCodeAt(at + 1);
    const cp = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
    if (low >= 0xdc00 && low <= 0xdfff && cp >= 0x1d400 && cp <= 0x1d7ff) {
      st.pos += 2;
      return { type: "identifier", value: pair, variant: "normal" };
    }
    fail("unknown_command", at, pair);
  }
  fail("unknown_command", at, c);
}

// ---------------------------------------------------------------------------------------------
// Commands.

function parseCommand(st: State): MathNode {
  const at = st.pos;
  st.pos++;
  if (st.pos >= st.end) fail("unknown_command", at, "\\");
  const c = st.src[st.pos];
  let name: string;
  if (isLetter(c)) {
    let e = st.pos;
    while (e < st.end && isLetter(st.src[e])) e++;
    name = st.src.slice(st.pos, e);
    st.pos = e;
  } else {
    name = c;
    st.pos++;
  }
  const cmd = "\\" + name;

  const lower = own(GREEK_LOWER, name);
  if (lower) return { type: "identifier", value: lower };
  const upper = own(GREEK_UPPER, name);
  if (upper) return { type: "identifier", value: upper, variant: "normal" };
  const rel = own(RELATIONS, name);
  if (rel) return { type: "operator", value: rel, role: "relation" };
  const bin = own(BINARIES, name);
  if (bin) return { type: "operator", value: bin, role: "binary" };
  const sym = own(SYMBOL_IDS, name);
  if (sym) return sym[1] ? { type: "identifier", value: sym[0], variant: sym[1] } : { type: "identifier", value: sym[0] };
  const ord = own(ORDINARY_OPS, name);
  if (ord) return { type: "operator", value: ord, role: "ordinary" };
  const pre = own(PREFIX_OPS, name);
  if (pre) return { type: "operator", value: pre, role: "prefix" };
  const esc = own(ESCAPES, name);
  if (esc) return esc;
  const br = own(BRACKET_CMDS, name);
  if (br) return { type: "operator", value: br[0], role: br[1] };
  const space = own(SPACES, name);
  if (space !== undefined) return { type: "space", width: space };
  if (own(FUNCTIONS, name)) return { type: "identifier", value: name, fn: true };
  const limitOp = own(LIMIT_OPS, name);
  if (limitOp) return { type: "underover", op: limitOp, symbol: name, limits: "under" };
  const large = own(LARGE_OPS, name);
  if (large) return { type: "underover", op: large[0], symbol: large[1], limits: large[2] };

  if (name === "frac" || name === "dfrac" || name === "tfrac") {
    enter(st, at);
    const num = parseArg(st, at, cmd);
    const den = parseArg(st, at, cmd);
    leave(st);
    if (name === "dfrac") return { type: "frac", num, den, display: true };
    if (name === "tfrac") return { type: "frac", num, den, display: false };
    return { type: "frac", num, den };
  }
  if (name === "binom") {
    enter(st, at);
    const num = parseArg(st, at, cmd);
    const den = parseArg(st, at, cmd);
    leave(st);
    return { type: "fenced", open: "(", close: ")", stretchy: true, body: { type: "frac", num, den, noBar: true } };
  }
  if (name === "sqrt") {
    enter(st, at);
    skipWs(st);
    let index: MathNode | undefined;
    if (st.src[st.pos] === "[" && st.pos < st.end) {
      const ob = st.pos;
      st.pos++;
      enter(st, ob);
      const items = parseRow(st, { bracket: true });
      if (st.pos >= st.end || st.src[st.pos] !== "]") fail("unbalanced", ob, "[");
      st.pos++;
      leave(st);
      index = rowOrSingle(items);
    }
    const body = parseArg(st, at, cmd);
    leave(st);
    return index ? { type: "sqrt", body, index } : { type: "sqrt", body };
  }
  const accent = own(ACCENTS, name);
  if (accent) {
    enter(st, at);
    const body = parseArg(st, at, cmd);
    leave(st);
    return { type: "accent", accent, body };
  }
  const style = own(STYLES, name);
  if (style) {
    enter(st, at);
    const body = parseArg(st, at, cmd);
    leave(st);
    return { type: "style", style, body };
  }
  if (name === "text") return { type: "text", value: parseRawText(st, at, cmd) };
  if (name === "mathbb") return parseMathbb(st, at, cmd);
  if (name === "operatorname") return parseOperatorName(st, at, cmd);
  if (name === "left") return parseLeftRight(st, at);
  if (name === "begin") return parseEnvironment(st, at);
  if (name === "right" || name === "end") fail("unbalanced", at, cmd);
  fail("unknown_command", at, cmd);
}

/** Reads a brace group as raw text (\text, \mathbb, \operatorname): only a few escapes, no commands, no math. */
function parseRawText(st: State, at: number, cmd: string): string {
  skipWs(st);
  if (st.pos >= st.end || st.src[st.pos] !== "{") fail("unbalanced", at, cmd);
  const open = st.pos;
  st.pos++;
  let depth = 1;
  let out = "";
  while (st.pos < st.end) {
    const c = st.src[st.pos];
    if (c === "{") {
      depth++;
      st.pos++;
      continue;
    }
    if (c === "}") {
      depth--;
      st.pos++;
      if (depth === 0) return out.replace(/[ \t\n\r]+/g, " ");
      continue;
    }
    if (c === "\\") {
      const n = st.src[st.pos + 1];
      const escaped = n !== undefined && st.pos + 1 < st.end ? own(TEXT_ESCAPES, n) : undefined;
      if (escaped !== undefined) {
        out += escaped;
        st.pos += 2;
        continue;
      }
      fail("unknown_command", st.pos, "\\" + peekCommand(st));
    }
    if (c === "$" || c === "%" || c === "&" || c === "^" || c === "_" || c === "#") fail("unknown_command", st.pos, c);
    if (c === "~") {
      out += " ";
      st.pos++;
      continue;
    }
    const code = c.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) {
      if (c === "\t" || c === "\n" || c === "\r") {
        out += " ";
        st.pos++;
        continue;
      }
      fail("unknown_command", st.pos, c);
    }
    out += c;
    st.pos++;
  }
  fail("unbalanced", open, "{");
}

/** \mathbb{R} → ℝ (Unicode double-struck letters and digits; MathML Core has no mathvariant for them). */
function parseMathbb(st: State, at: number, cmd: string): MathNode {
  skipWs(st);
  let text: string;
  if (isLetter(st.src[st.pos]) && st.pos < st.end) {
    text = st.src[st.pos];
    st.pos++;
  } else {
    text = parseRawText(st, at, cmd).replace(/ /g, "");
  }
  if (!/^[A-Za-z0-9]+$/.test(text)) fail("unknown_command", at, cmd);
  const items: MathNode[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = ch.charCodeAt(0);
    let value = own(DOUBLE_STRUCK, ch);
    if (!value) {
      const cp = ch >= "a" ? 0x1d552 + (code - 97) : ch >= "A" ? 0x1d538 + (code - 65) : 0x1d7d8 + (code - 48);
      value = String.fromCharCode(0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff));
    }
    items.push({ type: "identifier", value, variant: "normal" });
  }
  return rowOrSingle(items);
}

/** \operatorname{name} (a function name) and \operatorname*{name} (an operator with limits, such as arg max). */
function parseOperatorName(st: State, at: number, cmd: string): MathNode {
  const star = st.src[st.pos] === "*" && st.pos < st.end;
  if (star) st.pos++;
  const raw = parseRawText(st, at, cmd).trim();
  if (!/^[A-Za-z][A-Za-z0-9  -]*$/.test(raw) || raw.length > 40) fail("unknown_command", at, star ? cmd + "*" : cmd);
  return star
    ? { type: "underover", op: "operatorname", symbol: raw, limits: "under" }
    : { type: "identifier", value: raw, fn: true };
}

/** The delimiter after \left or \right. */
function parseDelimiter(st: State, at: number, cmd: string): string {
  skipWs(st);
  if (st.pos >= st.end) fail("unbalanced", at, cmd);
  const c = st.src[st.pos];
  if (c === "\\") {
    const name = peekCommand(st);
    const d = own(DELIM_CMDS, name);
    if (d === undefined) fail("unbalanced", at, cmd);
    st.pos += 1 + name.length;
    return d;
  }
  const d = own(DELIM_CHARS, c);
  if (d === undefined) fail("unbalanced", at, cmd);
  st.pos++;
  return d;
}

function parseLeftRight(st: State, at: number): MathNode {
  enter(st, at);
  const open = parseDelimiter(st, at, "\\left");
  const items = parseRow(st, { right: true });
  if (st.pos >= st.end || peekCommand(st) !== "right" || st.src[st.pos] !== "\\") fail("unbalanced", at, "\\left");
  const rightAt = st.pos;
  st.pos += "\\right".length;
  const close = parseDelimiter(st, rightAt, "\\right");
  leave(st);
  return { type: "fenced", open, close, body: rowOrSingle(items), stretchy: true };
}

function readBraceName(st: State, at: number, cmd: string): string {
  skipWs(st);
  if (st.pos >= st.end || st.src[st.pos] !== "{") fail("unbalanced", at, cmd);
  let e = st.pos + 1;
  while (e < st.end && (isLetter(st.src[e]) || st.src[e] === "*")) e++;
  if (e >= st.end || st.src[e] !== "}") fail("unbalanced", at, cmd);
  const name = st.src.slice(st.pos + 1, e);
  st.pos = e + 1;
  return name;
}

function isEmptyNode(node: MathNode): boolean {
  return node.type === "row" && node.children.length === 0;
}

function parseEnvironment(st: State, at: number): MathNode {
  const name = readBraceName(st, at, "\\begin");
  const kind = own(ENVIRONMENTS, name);
  if (!kind) fail("unsupported_env", at, name);
  enter(st, at);
  const rows: MathNode[][] = [];
  let cells: MathNode[] = [];
  for (;;) {
    const items = parseRow(st, { cell: true, env: true });
    cells.push(rowOrSingle(items));
    if (st.pos >= st.end) fail("unbalanced", at, "\\begin{" + name + "}");
    const c = st.src[st.pos];
    if (c === "&") {
      st.pos++;
      if (cells.length >= MAX_ENV_COLS) fail("too_long", st.pos - 1, "&");
      continue;
    }
    const next = peekCommand(st);
    if (next === "\\") {
      st.pos += 2;
      rows.push(cells);
      cells = [];
      if (rows.length >= MAX_ENV_ROWS) fail("too_long", st.pos - 2, "\\\\");
      continue;
    }
    if (next === "end") {
      const endAt = st.pos;
      st.pos += "\\end".length;
      const endName = readBraceName(st, endAt, "\\end");
      if (endName !== name) fail("unbalanced", endAt, "\\end{" + endName + "}");
      rows.push(cells);
      break;
    }
    fail("unbalanced", st.pos, c);
  }
  const last = rows[rows.length - 1];
  if (rows.length > 1 && last.length === 1 && isEmptyNode(last[0])) rows.pop();
  leave(st);
  if (kind === "aligned") return { type: "aligned", rows };
  return { type: "matrix", kind, rows };
}

// ---------------------------------------------------------------------------------------------
// Entry points.

/** Bounds of the formula inside one optional pair of outer delimiters ($…$, $$…$$, \(…\), \[…\]). */
function innerBounds(src: string): [number, number] {
  let s = 0;
  let e = src.length;
  while (s < e && isSpace(src[s])) s++;
  while (e > s && isSpace(src[e - 1])) e--;
  const inner = src.slice(s, e);
  if (inner.length >= 4 && inner.slice(0, 2) === "$$" && inner.slice(-2) === "$$") return [s + 2, e - 2];
  if (inner.length >= 2 && inner[0] === "$" && inner[inner.length - 1] === "$") return [s + 1, e - 1];
  if (inner.length >= 4 && (inner.slice(0, 2) === "\\(" && inner.slice(-2) === "\\)")) return [s + 2, e - 2];
  if (inner.length >= 4 && (inner.slice(0, 2) === "\\[" && inner.slice(-2) === "\\]")) return [s + 2, e - 2];
  return [s, e];
}

function hasContent(node: MathNode): boolean {
  if (node.type === "row") return node.children.some(hasContent);
  return node.type !== "space";
}

/** Parses the supported LaTeX subset into a math AST, or returns a translated-ready error code with its offset. */
export function parseLatex(src: string): LatexParseResult {
  if (typeof src !== "string") return { ok: false, error: { code: "empty", at: 0 } };
  if (src.length > MAX_LATEX_LENGTH) return { ok: false, error: { code: "too_long", at: MAX_LATEX_LENGTH } };
  const tag = HTML_TAG.exec(src);
  if (tag) return { ok: false, error: { code: "unknown_command", command: tag[0].slice(0, 40), at: tag.index } };
  const bounds = innerBounds(src);
  const st: State = { src, pos: bounds[0], end: bounds[1], depth: 0 };
  skipWs(st);
  if (st.pos >= st.end) return { ok: false, error: { code: "empty", at: bounds[0] } };
  try {
    const items = parseRow(st, {});
    const ast: MathRow = row(items);
    if (!hasContent(ast)) return { ok: false, error: { code: "empty", at: bounds[0] } };
    return { ok: true, ast };
  } catch (e) {
    if (isFail(e)) {
      const error: { code: LatexErrorCode; at: number; command?: string } = { code: e.code, at: e.at };
      if (e.command !== undefined) error.command = e.command;
      return { ok: false, error };
    }
    throw e;
  }
}

/** Every command name the parser accepts (without the backslash), sorted: for the form's help and tests. */
export function supportedCommands(): string[] {
  const names: string[] = [];
  const tables: Table<unknown>[] = [
    GREEK_LOWER, GREEK_UPPER, RELATIONS, BINARIES, SYMBOL_IDS, ORDINARY_OPS, PREFIX_OPS, ESCAPES, BRACKET_CMDS,
    SPACES, FUNCTIONS, LIMIT_OPS, LARGE_OPS, ACCENTS, STYLES,
  ];
  for (const t of tables) for (const k in t) if (Object.prototype.hasOwnProperty.call(t, k)) names.push(k);
  names.push("frac", "dfrac", "tfrac", "binom", "sqrt", "text", "mathbb", "operatorname", "left", "right", "begin", "end");
  return names.sort();
}

/** Environments accepted by \begin{…}. */
export function supportedEnvironments(): string[] {
  return Object.keys(ENVIRONMENTS).sort();
}

// ---------------------------------------------------------------------------------------------
// Plain linear text (alt text, previews): "(a + b)/2", "x̄ = (1/n) ∑_(i=1)^n x_i".

const COMBINING: Table<string> = {
  hat: "\u0302", bar: "\u0304", tilde: "\u0303", vec: "\u20d7", dot: "\u0307", ddot: "\u0308", overline: "\u0305",
};

function isAtomic(node: MathNode): boolean {
  switch (node.type) {
    case "identifier":
    case "number":
    case "fenced":
    case "accent":
    case "text":
    case "operator":
      return true;
    case "sqrt":
      return !node.index;
    case "sup":
    case "sub":
    case "subsup":
      // Scripts are already wrapped, and bind tighter than "/": (O_i − E_i)^2/E_i.
      return isAtomic(node.base);
    case "style":
      return isAtomic(node.body);
    case "row": {
      const c = node.children;
      if (c.length === 1) return isAtomic(c[0]);
      // A function call such as P(B) or f_1(x) reads as one term.
      return c.length === 2 && (c[0].type === "identifier" || c[0].type === "sub") && c[1].type === "fenced";
    }
    default:
      return false;
  }
}

/** Fraction parts and roots: in parentheses unless atomic. */
function wrapPlain(node: MathNode, compact: boolean): string {
  const s = plain(node, compact);
  return isAtomic(node) ? s : "(" + s + ")";
}

/** Scripts and limits: compact (no spaces around operators), in parentheses unless atomic and unscripted (σ_(Y_i)). */
function wrapScript(node: MathNode): string {
  const s = plain(node, true);
  const scripted = node.type === "sup" || node.type === "sub" || node.type === "subsup";
  return isAtomic(node) && !scripted ? s : "(" + s + ")";
}

function isPrimes(node: MathNode): boolean {
  return node.type === "operator" && /^[′″‴]+$/.test(node.value);
}

function scriptPlain(base: MathNode, mark: "^" | "_", script: MathNode, compact: boolean): string {
  const b = isAtomic(base) || base.type === "sup" || base.type === "sub" ? plain(base, compact) : "(" + plain(base, compact) + ")";
  if (mark === "^" && isPrimes(script)) return b + plain(script, true);
  return b + mark + wrapScript(script);
}

function isOperatorLike(node: MathNode): boolean {
  return node.type === "operator" || node.type === "space";
}

function isFunctionLike(node: MathNode): boolean {
  if (node.type === "identifier") return node.fn === true;
  if (node.type === "sup" || node.type === "sub" || node.type === "subsup") return isFunctionLike(node.base);
  return node.type === "underover";
}

/** Items that read better with a space after them when a term follows (x_i y_i, ∑_i x_i, sin x, 1/2 x). */
function spaceAfter(node: MathNode): boolean {
  return (
    isFunctionLike(node) ||
    node.type === "sub" ||
    node.type === "sup" ||
    node.type === "subsup" ||
    node.type === "frac" ||
    node.type === "text" ||
    node.type === "matrix" ||
    node.type === "aligned"
  );
}

/** Items that read better with a space before them when a term precedes (a ∑…, 2 sin x, α (∂u)/(∂t)). */
function spaceBefore(node: MathNode): boolean {
  return isFunctionLike(node) || node.type === "frac" || node.type === "text" || node.type === "matrix";
}

function plainRow(children: MathNode[], compact: boolean): string {
  let out = "";
  children.forEach((node, i) => {
    const prev = children[i - 1];
    const next = children[i + 1];
    let s = plain(node, compact);
    if (node.type === "frac" && ((prev && !isOperatorLike(prev)) || (next && !isOperatorLike(next)))) s = "(" + s + ")";
    if (prev && !isOperatorLike(prev) && !isOperatorLike(node) && (spaceAfter(prev) || spaceBefore(node))) {
      // Calls and primes stay attached: sin(x), det(A), f′(x).
      const call = node.type === "fenced" && ((isFunctionLike(prev) && !(prev.type === "underover" && (prev.under || prev.over))) || (prev.type === "sup" && isPrimes(prev.sup)));
      if (!call) out += " ";
    }
    if (node.type === "operator" && (node.role === "binary" || node.role === "relation")) out += compact ? s : " " + s + " ";
    else if (node.type === "operator" && node.role === "punct") out += compact ? s : s + " ";
    else if (node.type === "space") out += " ";
    else out += s;
  });
  return out;
}

/** A row with no inserted spaces at all (chemical formulas, units). */
function plainTight(node: MathNode): string {
  if (node.type !== "row") return plain(node, true);
  return node.children.map((c) => plain(c, true)).join("");
}

function plain(node: MathNode, compact: boolean): string {
  switch (node.type) {
    case "row":
      return plainRow(node.children, compact);
    case "identifier":
    case "number":
    case "operator":
    case "text":
      return node.value;
    case "space":
      return " ";
    case "frac": {
      if (node.noBar) return plain(node.num, compact) + " choose " + plain(node.den, compact);
      return wrapPlain(node.num, compact) + "/" + wrapPlain(node.den, compact);
    }
    case "sqrt": {
      if (!node.index) return "√" + wrapPlain(node.body, compact);
      const idx = plain(node.index, true);
      if (idx === "3") return "∛" + wrapPlain(node.body, compact);
      if (idx === "4") return "∜" + wrapPlain(node.body, compact);
      return wrapPlain(node.body, compact) + "^(1/" + idx + ")";
    }
    case "sup":
      return scriptPlain(node.base, "^", node.sup, compact);
    case "sub":
      return scriptPlain(node.base, "_", node.sub, compact);
    case "subsup": {
      const withSub = scriptPlain(node.base, "_", node.sub, compact);
      return isPrimes(node.sup) ? withSub + plain(node.sup, true) : withSub + "^" + wrapScript(node.sup);
    }
    case "underover": {
      let s = node.symbol;
      if (node.under) s += "_" + wrapScript(node.under);
      if (node.over) s += "^" + wrapScript(node.over);
      return s;
    }
    case "fenced":
      return node.open + plain(node.body, compact) + node.close;
    case "accent": {
      const body = plain(node.body, true);
      const mark = COMBINING[node.accent];
      if (node.accent === "overline") return body.split("").map((ch) => ch + mark).join("");
      if (body.length === 1) return body + mark;
      return node.accent + "(" + body + ")";
    }
    case "style":
      // Upright groups are mostly units and formulas (H_2O, m/s): no inserted spaces.
      return node.style === "mathrm" ? plainTight(node.body) : plain(node.body, compact);
    case "matrix": {
      const inner = node.rows.map((cells) => cells.map((c) => plain(c, compact)).join(", ")).join("; ");
      if (node.kind === "pmatrix") return "(" + inner + ")";
      if (node.kind === "bmatrix") return "[" + inner + "]";
      if (node.kind === "vmatrix") return "|" + inner + "|";
      if (node.kind === "cases") return "{ " + inner + " }";
      return inner;
    }
    case "aligned":
      return node.rows
        .map((cells) => plainRow(cells.reduce<MathNode[]>((acc, c) => acc.concat(c.type === "row" ? c.children : [c]), []), compact))
        .join("; ");
  }
}

/** Linear, readable plain text of a formula for alt text and previews ("(a + b)/2", "x_i^2", "√(b^2 − 4ac)"). */
export function latexToPlain(ast: MathNode): string {
  return plain(ast, false).replace(/ {2,}/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim();
}
