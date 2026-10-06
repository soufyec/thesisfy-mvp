/**
 * Section- and page-aware chunking for source text (F5).
 *
 * Input is either a plain string or the page array from `extract.ts`. Output chunks of about `targetWords` words
 * (default 300, the lower end of the 300–500 token range the chat-with-PDF tools converge on), cut on sentence
 * boundaries, with `overlap` words carried into the next chunk so a sentence that straddles a cut can still be
 * matched as a quote. Each chunk remembers the page it starts on and the section heading in force.
 *
 * Headings are detected from line shape (numbered headings, short ALL-CAPS lines) and from the usual academic
 * section names in English, Spanish and French. Chunking stops at the References / Bibliography heading once the
 * body has been read, so citation lists never become "passages".
 */

export interface Chunk {
  index: number;
  page?: number;
  section?: string;
  text: string;
  wordCount: number;
}

export interface ChunkOptions {
  targetWords?: number;
  overlap?: number;
  /** Chunks shorter than this merge into the next one. */
  minWords?: number;
}

const SECTION_WORDS =
  "abstract|summary|keywords|introduction|background|literature review|related work|theoretical framework|methods?|methodology|materials and methods|data|results?|findings|analysis|discussion|conclusions?|limitations|implications|future work|acknowledge?ments|appendix|" +
  "resumen|palabras clave|introducci[oó]n|antecedentes|marco te[oó]rico|estado del arte|revisi[oó]n de la literatura|m[eé]todos?|metodolog[ií]a|materiales y m[eé]todos|resultados?|hallazgos|an[aá]lisis|discusi[oó]n|conclusi[oó]n(?:es)?|limitaciones|agradecimientos|anexos?|ap[eé]ndice|" +
  "r[eé]sum[eé]|mots[- ]cl[eé]s|contexte|cadre th[eé]orique|[eé]tat de l'art|revue de (?:la )?litt[eé]rature|m[eé]thodes?|m[eé]thodologie|mat[eé]riel et m[eé]thodes|r[eé]sultats?|discussion|conclusions?|limites|remerciements|annexes?";

const REFERENCE_WORDS = "references?|reference list|bibliography|works cited|literature cited|referencias?|bibliograf[ií]a|obras citadas|r[eé]f[eé]rences?|bibliographie";

const NUMBER_PREFIX = "(?:(?:\\d{1,2}(?:\\.\\d{1,2}){0,3}\\.?|[IVXLC]{1,6}\\.|[A-Z]\\.)\\s+)?";
const KNOWN_HEADING = new RegExp(`^${NUMBER_PREFIX}(?:${SECTION_WORDS})\\s*:?$`, "i");
const REFERENCES_HEADING = new RegExp(`^${NUMBER_PREFIX}(?:${REFERENCE_WORDS})\\s*:?$`, "i");
// Target is ES5: no `u` flag, so Latin letter ranges stand in for \p{L} / \p{Lu}.
const UPPER = "A-ZÀ-ÖØ-Þ";
const LETTER = "A-Za-zÀ-ÖØ-öø-ÿ";
const NUMBERED_HEADING = new RegExp(`^(?:\\d{1,2}(?:\\.\\d{1,2}){0,3}\\.?|[IVXLC]{1,6}\\.)\\s+[${UPPER}][^.!?]{2,90}$`);
const NON_LETTER = new RegExp(`[^${LETTER}]`, "g");
const SENTENCE_SPLIT = new RegExp(`(?<=[.!?…]["”')\\]]?)\\s+(?=["“'(\\[]?[${UPPER}0-9])`);

const countWords = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/** Short line in capitals with at least three letters and no sentence punctuation, e.g. "RESULTS AND DISCUSSION". */
function isAllCapsHeading(line: string) {
  const letters = line.replace(NON_LETTER, "");
  if (letters.length < 3 || letters.length > 80) return false;
  if (countWords(line) > 8) return false;
  if (/[.!?;:,]$/.test(line)) return false; // a sentence or an abbreviation, not a heading
  return letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

export type HeadingKind = "section" | "references" | null;

/** Classifies a line: a section heading, the references heading, or body text. Exported for tests. */
export function headingKind(rawLine: string): HeadingKind {
  const line = rawLine.trim().replace(/\s+/g, " ");
  if (!line || line.length > 120) return null;
  if (REFERENCES_HEADING.test(line)) return "references";
  if (KNOWN_HEADING.test(line)) return "section";
  if (countWords(line) <= 12 && (NUMBERED_HEADING.test(line) || isAllCapsHeading(line))) return "section";
  return null;
}

function normalizeHeading(line: string) {
  const t = line.trim().replace(/\s+/g, " ").replace(/\s*:$/, "");
  if (t === t.toUpperCase()) return t.charAt(0) + t.slice(1).toLowerCase();
  return t;
}

/** Sentence split that tolerates abbreviations poorly but never loses text; good enough for retrieval units. */
export function splitSentences(paragraph: string): string[] {
  const parts = paragraph
    .replace(/\s+/g, " ")
    .trim()
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts;
}

interface Unit {
  text: string;
  words: number;
  page?: number;
  section?: string;
}

export function chunkText(input: string | string[], opts: ChunkOptions = {}): Chunk[] {
  const target = Math.max(60, opts.targetWords ?? 300);
  const overlap = Math.max(0, Math.min(opts.overlap ?? 40, Math.floor(target / 3)));
  const minWords = Math.max(10, opts.minWords ?? Math.floor(target / 6));
  const pages: { page?: number; text: string }[] = Array.isArray(input) ? input.map((text, i) => ({ page: i + 1, text })) : [{ page: undefined, text: input }];

  // Pass 1: lines → sentence units with page and section, stopping at the references list.
  const units: Unit[] = [];
  let section: string | undefined;
  let bodyWords = 0;
  let stopped = false;
  for (const { page, text } of pages) {
    if (stopped) break;
    const paragraphs = text.replace(/\r/g, "").split(/\n{2,}/);
    for (const para of paragraphs) {
      if (stopped) break;
      const lines = para.split("\n").map((l) => l.trim()).filter(Boolean);
      let buf: string[] = [];
      const flushBuf = () => {
        if (!buf.length) return;
        for (const s of splitSentences(buf.join(" "))) {
          const w = countWords(s);
          units.push({ text: s, words: w, page, section });
          bodyWords += w;
        }
        buf = [];
      };
      for (const line of lines) {
        const kind = headingKind(line);
        if (kind === "references" && bodyWords >= 300) {
          flushBuf();
          stopped = true;
          break;
        }
        if (kind) {
          flushBuf();
          section = normalizeHeading(line);
          continue;
        }
        buf.push(line);
      }
      flushBuf();
    }
  }

  // Pass 2: pack units into chunks on section boundaries, with overlap.
  const chunks: Chunk[] = [];
  let cur: Unit[] = [];
  let curWords = 0;
  let carried: Unit[] = []; // overlap units already counted in `cur`
  const emit = (force = false) => {
    const fresh = cur.filter((u) => !carried.includes(u));
    if (!fresh.length) return;
    const words = cur.reduce((n, u) => n + u.words, 0);
    if (!force && words < minWords) return;
    // Title and author lines before the first heading have no section; fall back to the first heading inside the chunk.
    const section = fresh[0].section ?? fresh.find((u) => u.section)?.section;
    chunks.push({ index: chunks.length, page: fresh[0].page, section, text: cur.map((u) => u.text).join(" "), wordCount: words });
    // Carry the trailing sentences up to `overlap` words into the next chunk.
    const tail: Unit[] = [];
    let tw = 0;
    for (let i = cur.length - 1; i >= 0 && tw + cur[i].words <= overlap; i--) {
      tail.unshift(cur[i]);
      tw += cur[i].words;
    }
    cur = [...tail];
    carried = [...tail];
    curWords = tw;
  };

  for (const u of units) {
    const sectionChanged = cur.length && cur[cur.length - 1].section !== u.section;
    if (sectionChanged && curWords >= minWords) {
      emit(true);
      cur = [];
      carried = [];
      curWords = 0; // no overlap across sections: the heading is the better anchor
    }
    if (u.words > target * 2) {
      // A run-on "sentence" (tables, lists without punctuation): hard-split by words.
      const ws = u.text.split(/\s+/);
      for (let i = 0; i < ws.length; i += target) {
        const part = ws.slice(i, i + target);
        cur.push({ ...u, text: part.join(" "), words: part.length });
        curWords += part.length;
        if (curWords >= target) emit();
      }
      continue;
    }
    cur.push(u);
    curWords += u.words;
    if (curWords >= target) emit();
  }
  // Final chunk: merge a short tail into the previous chunk instead of leaving a fragment.
  const fresh = cur.filter((u) => !carried.includes(u));
  if (fresh.length) {
    const words = fresh.reduce((n, u) => n + u.words, 0);
    const prev = chunks[chunks.length - 1];
    if (prev && words < minWords && prev.section === fresh[0].section) {
      prev.text = `${prev.text} ${fresh.map((u) => u.text).join(" ")}`;
      prev.wordCount += words;
    } else emit(true);
  }
  return chunks;
}

/** Total words of a text, for `ThesisSource.wordCount`. */
export function wordCount(text: string) {
  return countWords(text);
}
