/**
 * What the server counts in a paper's HTML (docs/papers.md §1.1, §4.6, §9 D21/D23): one forward-only scan shared by
 * every server counter (`countWords`, `computeProvenance`, `computeFigures`, `computeEquations` in db.ts,
 * `countUnattributedPaste` in integrity.ts, `scanHtml` and `htmlToParagraphs` in process.ts, `paperSections`).
 *
 * Left out of every word and provenance count, before counting:
 * - chart figures, `<figure … data-chart …>…</figure>`: the copilot's charts and the diagrams (Gantt, PRISMA, concept
 *   map) share that node; each one is a figure, never words (D21);
 * - `<figcaption>` (image and chart captions), `<style>` and bare `<math>` elements;
 * - equation nodes, `<span … data-math …>…</span>` (inline) and `<div … data-math-block …>…</div>` (block), MathML
 *   inside included: equations are counted apart, never as words (D23);
 * - the AI-use declaration appendix, `<span … data-declaration="true" …>…</span>`: a record of the process, not text
 *   of the paper (ProcessPanel, extensions.ts). `htmlToParagraphs` keeps it (`keepDeclarations`), since the replay
 *   shows the document as it was.
 *
 * Linear on any input, including hostile HTML a student saves: the scan never goes back, an element that is never
 * closed cuts the rest of the text, and a `<` that no `>` closes is dropped. No lazy cross-element regex runs on the
 * raw text.
 *
 * Origins (D21, D23), as the editor's node schemas default them:
 * - a figure (`chart` node) without `data-origin` is AI-assisted: the chart node defaults to origin "ai" (only the
 *   copilot inserted charts before student-made diagrams existed), so only `data-origin="human"` reads as Written;
 * - an equation (`math` / `mathBlock` node) without `data-origin` is Written: the math nodes default to origin
 *   "human" (Insert › Equation), so only `data-origin="ai"` reads as AI-assisted.
 *
 * Pure: no imports, no I/O. Word counting is the same as `htmlToWordText` + split (and `artifactWords` in
 * src/lib/data/artifactHtml.ts): block tags separate words, inline tags never do, `&nbsp;` is a space.
 */

/** Figures or equations of a document: all of them and the AI-assisted ones (same shape as `PaperFigures`). */
export interface OriginCounts {
  total: number;
  ai: number;
}

/** The classes of figure the `chart` node draws (`data-figure-kind`; absent = "chart"). */
export type FigureKind = "chart" | "gantt" | "prisma" | "conceptMap";
export const FIGURE_KINDS: FigureKind[] = ["chart", "gantt", "prisma", "conceptMap"];

export interface FigureBreakdown extends OriginCounts {
  byKind: Record<FigureKind, OriginCounts>;
}

/** Origin a figure without `data-origin` has (the chart node's default). */
export const FIGURE_DEFAULT_ORIGIN = "ai";
/** Origin an equation without `data-origin` has (the math nodes' default). */
export const EQUATION_DEFAULT_ORIGIN = "human";

export interface CountableOptions {
  /** Keep the AI-use declaration appendix (only the replay text does). */
  keepDeclarations?: boolean;
}

const emptyFigures = (): FigureBreakdown => ({
  total: 0,
  ai: 0,
  byKind: { chart: { total: 0, ai: 0 }, gantt: { total: 0, ai: 0 }, prisma: { total: 0, ai: 0 }, conceptMap: { total: 0, ai: 0 } },
});

/** Elements whose opening tag decides whether the element is left out (tried only where a `<` is followed by d, f, m or s). */
const CANDIDATE_RE = /<(figure|figcaption|style|span|div|math)(?=[\s/>])/gi;
const CLOSE_RES: Record<string, RegExp> = {};
function nestedTagRe(name: string): RegExp {
  let re = CLOSE_RES[name];
  if (!re) re = CLOSE_RES[name] = new RegExp(`<(/?)${name}(?=[\\s/>])`, "gi");
  return re;
}

const attrRes: Record<string, RegExp> = {};
/** Whether an opening tag carries attribute `name` (not a longer attribute that starts with it). */
function hasAttr(tag: string, name: string): boolean {
  let re = attrRes[name];
  if (!re) re = attrRes[name] = new RegExp(`\\s${name}(?=[\\s=/>])`, "i");
  return re.test(tag);
}
const valueRes: Record<string, RegExp> = {};
/** Value of attribute `name` in an opening tag (double or single quotes), or null. */
function attrValue(tag: string, name: string): string | null {
  let re = valueRes[name];
  if (!re) re = valueRes[name] = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
  const m = re.exec(tag);
  return m ? (m[1] ?? m[2] ?? "") : null;
}

/**
 * Index just after the `</name>` that closes the element whose opening tag ends at `from` (nested elements of the
 * same name counted), or -1 when it is never closed. Scans forward only.
 */
function closingEnd(html: string, name: string, from: number): number {
  const re = nestedTagRe(name);
  re.lastIndex = from;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1]) {
      if (--depth === 0) {
        const gt = html.indexOf(">", re.lastIndex);
        return gt === -1 ? -1 : gt + 1;
      }
    } else {
      const gt = html.indexOf(">", re.lastIndex);
      if (gt === -1) return -1;
      // `<span … />` opens nothing.
      if (html.charCodeAt(gt - 1) !== 47 /* / */) depth++;
      re.lastIndex = gt + 1;
    }
  }
  return -1;
}

/** `<` after the last `>` cannot open a tag: replaced by a space, so tag patterns never scan to the end from each one. */
export function closedTagsOnly(html: string): string {
  const last = html.lastIndexOf(">");
  return html.indexOf("<", last + 1) === -1 ? html : html.slice(0, last + 1) + html.slice(last + 1).split("<").join(" ");
}

interface Removal {
  html: string;
  figures: FigureBreakdown;
  equations: OriginCounts;
}

/**
 * The single forward scan: copies `html` without the elements no counter counts (see the module comment) and counts
 * the figures and equations it leaves out on the way. `only` restricts the removal to some element names (used by
 * `htmlToWordText` and `stripHtml`, which only drop `<style>`).
 */
function removeUncounted(html: string, opts: CountableOptions & { only?: string[] } = {}): Removal {
  const figures = emptyFigures();
  const equations: OriginCounts = { total: 0, ai: 0 };
  if (!html) return { html: "", figures, equations };
  const re = new RegExp(CANDIDATE_RE.source, "gi");
  let out = "";
  let pos = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const name = m[1].toLowerCase();
    if (opts.only && opts.only.indexOf(name) === -1) continue;
    const tagEnd = html.indexOf(">", re.lastIndex);
    if (tagEnd === -1) {
      // An opening tag that never ends: nothing after it can be a tag; the rest is cut.
      out += html.slice(pos, m.index);
      pos = html.length;
      break;
    }
    const tag = html.slice(m.index, tagEnd + 1);
    let drop = false;
    if (name === "figure") {
      if (hasAttr(tag, "data-chart")) {
        drop = true;
        const kindAttr = attrValue(tag, "data-figure-kind");
        const kind: FigureKind = kindAttr && (FIGURE_KINDS as string[]).indexOf(kindAttr) !== -1 ? (kindAttr as FigureKind) : "chart";
        const ai = (attrValue(tag, "data-origin") ?? FIGURE_DEFAULT_ORIGIN) !== "human";
        figures.total++;
        figures.byKind[kind].total++;
        if (ai) {
          figures.ai++;
          figures.byKind[kind].ai++;
        }
      }
    } else if (name === "figcaption" || name === "style" || name === "math") {
      drop = true;
    } else if (hasAttr(tag, "data-math") || hasAttr(tag, "data-math-block")) {
      drop = true;
      equations.total++;
      if ((attrValue(tag, "data-origin") ?? EQUATION_DEFAULT_ORIGIN) === "ai") equations.ai++;
    } else if (name === "span" && !opts.keepDeclarations && attrValue(tag, "data-declaration") === "true") {
      drop = true;
    }
    if (!drop) {
      re.lastIndex = tagEnd + 1;
      continue;
    }
    out += html.slice(pos, m.index) + " ";
    if (html.charCodeAt(tagEnd - 1) === 47 /* "/>": nothing inside */) {
      pos = re.lastIndex = tagEnd + 1;
      continue;
    }
    const end = closingEnd(html, name, tagEnd + 1);
    if (end === -1) {
      // Never closed: like an unclosed tag, the rest is cut (never retried from the next opening tag).
      pos = html.length;
      break;
    }
    pos = re.lastIndex = end;
  }
  out += html.slice(pos);
  return { html: out, figures, equations };
}

/**
 * `html` without chart figures, captions, styles, equations and (unless kept) the AI-use declaration, and with every
 * `<` that no `>` closes turned into a space, so regex consumers stay linear. Linear.
 */
export function countableHtml(html: string, opts: CountableOptions = {}): string {
  return closedTagsOnly(removeUncounted(html || "", opts).html);
}

/** Figures of a document by origin (absent = AI) and by class (`data-figure-kind`, absent = chart). */
export function figureBreakdown(html: string): FigureBreakdown {
  if (!html || html.indexOf("data-chart") === -1) return emptyFigures();
  return removeUncounted(html).figures;
}

/** Figures of a document (`figure[data-chart]`): total and AI-assisted (`data-origin` other than "human"). */
export function computeFigures(html: string): OriginCounts {
  const f = figureBreakdown(html);
  return { total: f.total, ai: f.ai };
}

/** Equations of a document (`[data-math]`, `[data-math-block]`): total and AI-assisted (`data-origin="ai"`). */
export function computeEquations(html: string): OriginCounts {
  if (!html || html.indexOf("data-math") === -1) return { total: 0, ai: 0 };
  return removeUncounted(html).equations;
}

// ---------- Words ----------

/** Block boundaries separate words; inline tags (marks, comment and provenance spans) never do. Same list as `BLOCK_TAG_RE`. */
const BLOCK_TAGS = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "ul", "ol", "br", "hr", "tr", "td", "th", "thead", "tbody", "table", "blockquote", "pre", "figure", "figcaption", "section", "header", "footer", "details", "summary"]);
const BLOCK_TAG_RE = /<\/?(?:p|div|h[1-6]|li|ul|ol|br|hr|tr|td|th|thead|tbody|table|blockquote|pre|figure|figcaption|section|header|footer|details|summary)\b[^>]*>/gi;

const isAlpha = (c: number) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
const isAlnum = (c: number) => isAlpha(c) || (c >= 48 && c <= 57);

/** JavaScript's `\s` (what `split(/\s+/)` splits on). */
function isSpace(c: number): boolean {
  return (
    c === 32 || (c >= 9 && c <= 13) || c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff
  );
}

/**
 * Every run of whitespace as one space (`replace(/\s+/g, " ")`), without a replacement for each single space: on long
 * text that keeps the cost proportional to the runs that actually change.
 */
export function collapseSpaces(s: string): string {
  return s.replace(/\s{2,}|[^\S ]/g, " ");
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

/**
 * Plain text for word counting: block tags become spaces, inline tags disappear, a few entities are decoded. Styles
 * are dropped first and a `<` that is never closed becomes a space, so it stays linear on any input.
 */
export function htmlToWordText(html: string): string {
  const text = closedTagsOnly(removeUncounted(html || "", { only: ["style"] }).html)
    .replace(BLOCK_TAG_RE, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return collapseSpaces(text).trim();
}

/** `html` as plain text (every tag a space, styles dropped). Linear. */
export function stripHtml(html: string): string {
  const text = closedTagsOnly(removeUncounted(html || "", { only: ["style"] }).html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  return collapseSpaces(text).trim();
}

export type ProvenanceKind = "human" | "ai" | "paste";

/** Words of one H1/H2 section (`heading` "" before the first heading and for a heading with no text). */
export interface ChapterCount {
  heading: string;
  level: number;
  words: number;
  ai: number;
  paste: number;
}

export interface CountScan {
  /** Words of the document: runs of non-space characters across inline tags (`countWords`). */
  words: number;
  /** Words inside `data-provenance="ai"` marks, counted mark by mark (a word cut by a mark counts in it). */
  ai: number;
  /** Words inside `data-provenance="paste"` marks. */
  paste: number;
  /** Pasted words whose mark names a source (`data-source`). */
  pasteAttributed: number;
  /** Pasted words whose mark names no source. */
  pasteUnattributed: number;
  /** AI-assisted words per interaction id (`data-interaction`). */
  aiByInteraction: Record<string, number>;
  /** H1/H2 sections in document order. */
  chapters: ChapterCount[];
}

interface Mark {
  kind: ProvenanceKind;
  attributed: boolean;
  interactionId?: string;
}

/**
 * Counts the words of HTML that is already countable (`countableHtml`), once, with their provenance and their H1/H2
 * section. A word is a run of non-space characters; block tags end it, inline tags do not. Provenance follows the
 * innermost `data-provenance` mark; words are counted mark by mark, so a word that a mark cuts counts once in the
 * total and once in the mark (as the editor counts marked text nodes, and as the cost card counts an insertion).
 */
function walk(html: string): CountScan {
  const scan: CountScan = { words: 0, ai: 0, paste: 0, pasteAttributed: 0, pasteUnattributed: 0, aiByInteraction: {}, chapters: [] };
  /** One entry per open <span>: the mark it carries, or null for a span without provenance. */
  const spans: (Mark | null)[] = [];
  const st = { mark: null as Mark | null, inWord: false, inMarkWord: false, chapter: null as ChapterCount | null, headingLevel: 0, headingText: "" };

  const innermost = (): Mark | null => {
    for (let k = spans.length - 1; k >= 0; k--) if (spans[k]) return spans[k];
    return null;
  };
  const section = (): ChapterCount => {
    if (!st.chapter) {
      st.chapter = { heading: "", level: 0, words: 0, ai: 0, paste: 0 };
      scan.chapters.push(st.chapter);
    }
    return st.chapter;
  };
  const closeHeading = () => {
    if (st.chapter) st.chapter.heading = decodeEntities(st.headingText).replace(/\s+/g, " ").trim();
    st.headingLevel = 0;
  };

  /** Counts the text html[from, to) (`&nbsp;` is a space; with `ltIsSpace`, so is a `<` that opens no tag). */
  const text = (from: number, to: number, ltIsSpace = false) => {
    if (st.headingLevel) st.headingText += html.slice(from, to);
    for (let k = from; k < to; k++) {
      let c = html.charCodeAt(k);
      if (c === 38 /* & */ && html.startsWith("&nbsp;", k)) {
        c = 32;
        k += 5;
      } else if (ltIsSpace && c === 60) c = 32;
      if (isSpace(c)) {
        st.inWord = false;
        st.inMarkWord = false;
        continue;
      }
      if (!st.inWord) {
        st.inWord = true;
        scan.words++;
        section().words++;
      }
      if (st.inMarkWord) continue;
      st.inMarkWord = true;
      const mark = st.mark;
      if (!mark || mark.kind === "human") continue;
      const sec = section();
      if (mark.kind === "ai") {
        scan.ai++;
        sec.ai++;
        if (mark.interactionId) scan.aiByInteraction[mark.interactionId] = (scan.aiByInteraction[mark.interactionId] || 0) + 1;
      } else {
        scan.paste++;
        sec.paste++;
        if (mark.attributed) scan.pasteAttributed++;
        else scan.pasteUnattributed++;
      }
    }
  };

  /** The tag html[lt, gt]: only its name is read, and a span's attributes. */
  const tag = (lt: number, gt: number) => {
    const closing = html.charCodeAt(lt + 1) === 47; /* / */
    const from = closing ? lt + 2 : lt + 1;
    let to = from;
    while (to < gt && isAlnum(html.charCodeAt(to))) to++;
    if (to === from || !isAlpha(html.charCodeAt(from))) return; // comments, doctype, a stray "<…>": nothing to count
    const name = html.slice(from, to).toLowerCase();
    if (BLOCK_TAGS.has(name)) {
      st.inWord = false;
      st.inMarkWord = false;
    }
    if (name === "span") {
      if (closing) {
        if (spans.length && spans.pop()) {
          st.mark = innermost();
          st.inMarkWord = false;
        }
      } else if (html.charCodeAt(gt - 1) !== 47 /* <span … /> opens nothing */) {
        const t = html.slice(lt, gt + 1);
        const kind = attrValue(t, "data-provenance");
        if (kind === "ai" || kind === "paste" || kind === "human") {
          const interaction = attrValue(t, "data-interaction");
          const entry: Mark = { kind, attributed: !!attrValue(t, "data-source"), ...(interaction ? { interactionId: interaction } : {}) };
          spans.push(entry);
          st.mark = entry;
          st.inMarkWord = false;
        } else spans.push(null);
      }
    } else if (name === "h1" || name === "h2") {
      if (!closing) {
        st.headingLevel = name === "h1" ? 1 : 2;
        st.headingText = "";
        st.chapter = { heading: "", level: st.headingLevel, words: 0, ai: 0, paste: 0 };
        scan.chapters.push(st.chapter);
      } else if (st.headingLevel) closeHeading();
    }
  };

  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      text(i, n);
      break;
    }
    if (lt > i) text(i, lt);
    const gt = html.indexOf(">", lt + 1);
    if (gt === -1) {
      // No tag can start after the last ">": the rest is text, and every "<" in it a space (as `closedTagsOnly`).
      text(lt, n, true);
      break;
    }
    tag(lt, gt);
    i = gt + 1;
  }
  // A heading that never closed keeps its text.
  if (st.headingLevel) closeHeading();
  // A heading left with no text and no words (the declaration's title once the declaration is left out) is noise.
  scan.chapters = scan.chapters.filter((c) => c.level === 0 || c.heading || c.words > 0);
  return scan;
}

/** HTML without what no counter counts, as `walk` reads it (it handles a `<` that is never closed itself). */
const uncounted = (html: string) => removeUncounted(html || "").html;

/** Counts a paper's HTML in one pass: words, provenance, sections (see `walk`). */
export function scanCountable(html: string): CountScan {
  return walk(uncounted(html));
}

export function countWords(html: string): number {
  return walk(uncounted(html)).words;
}

export interface ProvenanceCounts {
  human: number;
  paste: number;
  ai: number;
}

/** Words by provenance. Unmarked text is the student's (`human` = total − AI − pasted, never below 0). */
export function computeProvenance(html: string): ProvenanceCounts {
  const s = walk(uncounted(html));
  return { human: Math.max(0, s.words - s.ai - s.paste), paste: s.paste, ai: s.ai };
}

/** Pasted words that carry no attribution: `data-provenance="paste"` marks without a `data-source` label. */
export function countUnattributedPaste(html: string): number {
  return walk(uncounted(html)).pasteUnattributed;
}

/** Everything `db.theses` stores about a saved Final submission, from one removal pass and one word walk. */
export function measureContent(html: string): { wordCount: number; provenance: ProvenanceCounts; figures: OriginCounts; equations: OriginCounts } {
  const removed = removeUncounted(html || "");
  const s = walk(removed.html);
  return {
    wordCount: s.words,
    provenance: { human: Math.max(0, s.words - s.ai - s.paste), paste: s.paste, ai: s.ai },
    figures: { total: removed.figures.total, ai: removed.figures.ai },
    equations: removed.equations,
  };
}
