import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "crypto";
import type { Artifact } from "./db";
import { artifactGridHtml, artifactTableHtml, artifactText } from "./data/artifactHtml";
import type { Translate } from "./data/labels";

// Symmetric encryption for stored provider secrets (BYOK keys, OAuth tokens).
// Key material comes from ENCRYPTION_KEY (preferred) or JWT_SECRET.
const SECRET = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || "thesisfy-mvp-dev-secret-key-2024";
let cachedKey: Buffer | null = null;
function key() {
  if (!cachedKey) cachedKey = scryptSync(SECRET, "thesisfic-connections", 32);
  return cachedKey;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** Normalised SHA-256 of a text snippet, used to match copied/pasted text across sources without storing the text. */
export function textFingerprint(text: string): string {
  const norm = text.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(norm).digest("hex").slice(0, 32);
}

// ---------- Passages (KEEP IN SYNC with the mirror in src/lib/client.ts: same code, same output) ----------

/** Rows of a Markdown table in AI text are short: they are kept from this many words (docs/papers.md §3.5). */
export const TABLE_ROW_MIN_WORDS = 3;

/** A Markdown table delimiter row: `|---|:---:|`, `--- | ---`. It needs a pipe, so a `---` rule is not one. */
function isTableSeparator(line: string): boolean {
  return line.indexOf("|") !== -1 && /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/.test(line);
}

/**
 * The Markdown tables of a text, by line index: "sep" for delimiter rows, a table number for header and body rows.
 * A table is a header line with a pipe, a delimiter row, then the following non-empty lines with a pipe.
 */
function markdownTableLines(lines: string[]): Map<number, number | "sep"> {
  const map = new Map<number, number | "sep">();
  let table = 0;
  for (let i = 1; i < lines.length; i++) {
    if (map.has(i) || !isTableSeparator(lines[i]) || map.has(i - 1) || lines[i - 1].indexOf("|") === -1 || !lines[i - 1].trim()) continue;
    map.set(i - 1, table);
    map.set(i, "sep");
    let j = i + 1;
    for (; j < lines.length && lines[j].trim() && lines[j].indexOf("|") !== -1; j++) map.set(j, isTableSeparator(lines[j]) ? "sep" : table);
    table++;
    i = j - 1;
  }
  return map;
}

/**
 * Split text into the units a student is likely to copy: the whole text, paragraphs and sentences of at least
 * `minWords` words. Markdown tables in AI text are read as tables: delimiter rows are dropped, each row is its cells
 * joined with spaces (kept from 3 words, or `minWords` if lower), and the whole table is one more unit. Text without
 * a Markdown table gives exactly the units it gave before tables were handled.
 */
export function passages(text: string, minWords = 8, max = 80): string[] {
  const out = new Set<string>();
  // Strip Markdown so a sentence copied from the rendered answer matches the raw one: emphasis, headings, quotes,
  // list markers, links and inline code.
  const clean = (t: string) =>
    t
      .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_`#>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const words = (t: string) => (t ? t.split(" ").length : 0);
  const lines = text.split("\n");
  const tables = markdownTableLines(lines);
  const rowMin = Math.min(minWords, TABLE_ROW_MIN_WORDS);
  const whole = clean(tables.size ? lines.filter((_, i) => tables.get(i) !== "sep").join("\n") : text);
  if (words(whole) >= minWords) out.add(whole);
  let rows: string[] = [];
  const closeTable = () => {
    const all = clean(rows.join(" "));
    if (rows.length && words(all) >= rowMin) out.add(all);
    rows = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const para = lines[i];
    const t = tables.get(i);
    if (rows.length && t === undefined) closeTable();
    // Empty lines add nothing (the split on /\n+/ this replaces never produced them between paragraphs).
    if (!para) continue;
    if (t === "sep") continue;
    const cp = clean(para);
    if (t !== undefined) {
      if (words(cp) >= rowMin) out.add(cp);
      rows.push(cp);
    }
    if (words(cp) >= minWords) out.add(cp);
    for (const sentence of cp.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÀÈÙÂÊÎÔÛÇ0-9"'(])/)) {
      const cs = sentence.trim();
      if (words(cs) >= minWords) out.add(cs);
    }
    if (out.size >= max) break;
  }
  if (rows.length && out.size < max) closeTable();
  return Array.from(out).slice(0, max);
}

/** Fingerprints of every paragraph and sentence of a text, for later matching without storing the text. */
export function passageFingerprints(text: string): string[] {
  return passages(text).map(textFingerprint);
}

/**
 * ONE fingerprint of a computed table as it is inserted in the paper: caption, translated header row, cells and note
 * (the text of `artifactTableHtml`). Never one per row: a pivot table the student builds from the same file must not
 * match (docs/papers.md §3.5). `tr` translates into the artifact's writing language (`translator(artifact.lang)`).
 */
export function artifactFingerprint(a: Pick<Artifact, "title" | "n" | "fileName" | "lang" | "table">, tr: Translate): string {
  return textFingerprint(artifactText(artifactTableHtml(a, tr)));
}

/**
 * The table grid alone (translated header row and cells, no caption, no note): what copying just the table from the
 * editor, Word or Docs gives. Still one fingerprint per table, never per row, so a pivot table the student builds
 * from the same file does not match.
 */
export function artifactGridFingerprint(a: Pick<Artifact, "lang" | "table">): string {
  return textFingerprint(artifactText(artifactGridHtml(a)));
}
