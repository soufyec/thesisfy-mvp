/**
 * Math AST for equations (SPEC docs/papers.md D23, §9.3). Produced by `latex.ts` from the supported
 * LaTeX subset and consumed by `mathml.ts` (MathML Core), `docx.ts` (Word equations) and
 * `latexToPlain` (alt text). Pure types: safe to import from client components and from the server.
 */

/** How letters are drawn. `normal` is upright (\mathrm, function names, capital Greek). */
export type MathVariant = "normal" | "bold" | "italic";

/**
 * Operator classes, after TeX's atom classes. They decide spacing in MathML and the operand
 * heuristics in Word.
 * - `binary`: + − ± × · ÷ ∪ ∩ (spaced on both sides);
 * - `prefix`: a binary sign used as a unary sign (−x, = −1), unspaced;
 * - `relation`: = < > ≤ ≥ ≠ ≈ ∈ → … (thick space on both sides);
 * - `punct`: , ; (space after);
 * - `open` / `close`: plain brackets that did not find their pair;
 * - `fence`: | and ‖ used as plain (non-stretchy) delimiters;
 * - `ordinary`: unspaced symbols such as / ! ′ … ⋯.
 */
export type OperatorRole = "binary" | "prefix" | "relation" | "punct" | "open" | "close" | "fence" | "ordinary";

/** A sequence of nodes laid out left to right (LaTeX braces, cell contents, the whole formula). */
export interface MathRow {
  type: "row";
  children: MathNode[];
}

/** A letter, a Greek letter, a symbol drawn as a letter (∞, ∂, ℝ) or a multi-letter name (sin, \operatorname). */
export interface MathIdentifier {
  type: "identifier";
  value: string;
  /** Absent: italic for one letter, upright for several. */
  variant?: MathVariant;
  /** Function name (\sin, \log, \operatorname{…}): upright, with function-application spacing. */
  fn?: boolean;
}

/** Digits with an optional decimal point or decimal comma ("3.14", "0,05"). */
export interface MathNumber {
  type: "number";
  value: string;
}

/** A symbol with operator spacing (see `OperatorRole`). `value` is the Unicode character(s) drawn. */
export interface MathOperator {
  type: "operator";
  value: string;
  role: OperatorRole;
}

/** Upright prose inside a formula (\text{…}). */
export interface MathText {
  type: "text";
  value: string;
}

/** \frac, \dfrac (display: forced display style), \tfrac (display: false) and the inside of \binom (noBar). */
export interface MathFrac {
  type: "frac";
  num: MathNode;
  den: MathNode;
  /** true for \dfrac, false for \tfrac, absent for \frac (follows the surrounding style). */
  display?: boolean;
  /** No fraction bar: \binom{n}{k} is a fenced bar-less fraction. */
  noBar?: boolean;
}

/** \sqrt{x} or \sqrt[n]{x}. */
export interface MathSqrt {
  type: "sqrt";
  body: MathNode;
  index?: MathNode;
}

/** x^{…} (also x' and x'', with the primes in `sup`). */
export interface MathSup {
  type: "sup";
  base: MathNode;
  sup: MathNode;
}

/** x_{…}. */
export interface MathSub {
  type: "sub";
  base: MathNode;
  sub: MathNode;
}

/** x_{…}^{…}. */
export interface MathSubSup {
  type: "subsup";
  base: MathNode;
  sub: MathNode;
  sup: MathNode;
}

/** Large operators and limit-taking names. */
export type LargeOperator =
  | "sum"
  | "prod"
  | "int"
  | "iint"
  | "iiint"
  | "oint"
  | "bigcup"
  | "bigcap"
  | "lim"
  | "max"
  | "min"
  | "sup"
  | "inf"
  | "det"
  | "Pr"
  | "gcd"
  | "operatorname";

/**
 * A large operator with optional limits. The operand is not part of the node: it is whatever
 * follows in the row (as in LaTeX). `limits` says where the limits go in display style: `under`
 * (∑, ∏, lim) or `side` (∫, as scripts); inline formulas always draw them as scripts.
 */
export interface MathUnderOver {
  type: "underover";
  op: LargeOperator;
  /** What is drawn: "∑", "∫", "lim", "max"… (for `operatorname`, the name given to \operatorname*{…}). */
  symbol: string;
  limits: "under" | "side";
  under?: MathNode;
  over?: MathNode;
}

/**
 * Brackets around a body: `\left( … \right)` (stretchy: true) or a matched pair of plain brackets
 * in the source (stretchy: false). `open` or `close` may be "" (\left. or \right.).
 */
export interface MathFenced {
  type: "fenced";
  open: string;
  close: string;
  body: MathNode;
  stretchy: boolean;
}

/** Accents over a body (`overline` stretches over its whole body; \widehat and \widetilde map to hat and tilde). */
export type MathAccentKind = "hat" | "bar" | "tilde" | "vec" | "dot" | "ddot" | "overline";

/** \hat{x}, \bar{x}, \tilde{x}, \vec{v}, \dot{x}, \ddot{x}, \overline{AB}. */
export interface MathAccent {
  type: "accent";
  accent: MathAccentKind;
  body: MathNode;
}

/** Font commands; they restyle letters and digits in `body`. \text{…} is a `MathText`, \mathbb{R} a Unicode letter (ℝ). */
export type MathStyleKind = "mathrm" | "mathbf" | "mathit";

/** \mathrm{…} (upright), \mathbf{…} (upright bold), \mathit{…} (italic). */
export interface MathStyle {
  type: "style";
  style: MathStyleKind;
  body: MathNode;
}

/** Matrix environments; `cases` is a two-column table with a left brace. */
export type MathMatrixKind = "matrix" | "pmatrix" | "bmatrix" | "vmatrix" | "cases";

/** \begin{pmatrix} … \end{pmatrix} and friends. `rows[r][c]` is a cell. */
export interface MathMatrix {
  type: "matrix";
  kind: MathMatrixKind;
  rows: MathNode[][];
}

/**
 * \begin{aligned} … \end{aligned}: rows of cells split at `&`. Cells alternate right- and
 * left-aligned (as LaTeX's `rlrl…`), so "a &= b" lines up at the "=".
 */
export interface MathAligned {
  type: "aligned";
  rows: MathNode[][];
}

/** Explicit horizontal space, in em: \, 0.1667 · \: 0.2222 · \; 0.2778 · \quad 1 · \qquad 2 · "\ " and ~ 0.3333. */
export interface MathSpace {
  type: "space";
  width: number;
}

/** Any node of the math AST. */
export type MathNode =
  | MathRow
  | MathIdentifier
  | MathNumber
  | MathOperator
  | MathText
  | MathFrac
  | MathSqrt
  | MathSup
  | MathSub
  | MathSubSup
  | MathUnderOver
  | MathFenced
  | MathAccent
  | MathStyle
  | MathMatrix
  | MathAligned
  | MathSpace;

/** Error codes of `parseLatex`; the form translates them (`command` names the culprit). */
export type LatexErrorCode = "unknown_command" | "unbalanced" | "too_long" | "empty" | "unsupported_env";

/** A parse error: `at` is the offset in the source string where the problem starts. */
export interface LatexError {
  code: LatexErrorCode;
  command?: string;
  at: number;
}

/** Result of `parseLatex`. */
export type LatexParseResult = { ok: true; ast: MathNode } | { ok: false; error: LatexError };

/** Options of `toMathML`. */
export interface MathMLOptions {
  /** true: `<math display="block">` (display style, limits under ∑). */
  display: boolean;
  /** Optional LaTeX source kept as `<annotation encoding="application/x-tex">` (copy and paste, export). */
  annotation?: string;
}
