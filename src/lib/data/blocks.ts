/**
 * Artifact blocks in copilot answers (docs/papers.md §3.5): the model asks Thesisfic to compute a table or a chart
 * with one fenced block per artifact,
 *
 *   ```thesisfic-artifact
 *   {"op":"groupSummary","value":"annual_rainfall_mm","by":"region"}
 *   ```
 *
 * The server takes them out of the text (at most 4 blocks of at most 4 KB, JSON parsed defensively), validates
 * and runs them; the panel hides them while the answer streams. Pure and client-safe: no imports.
 */

export const MAX_ARTIFACT_BLOCKS = 4;
export const MAX_ARTIFACT_BLOCK_BYTES = 4096;

/** A complete block: opening fence with the marker, body, closing fence. */
const BLOCK_RE = /(^|\n)[ \t]*```[ \t]*thesisfic-artifact[ \t]*\r?\n([\s\S]*?)\r?\n?[ \t]*```[ \t]*(?=\r?\n|$)/gi;
/** An opening fence with the marker and no closing fence yet (end of a streamed text). */
const OPEN_RE = /(^|\n)[ \t]*```[ \t]*thesisfic-artifact\b[\s\S]*$/i;

export interface ExtractedBlocks {
  /** Parsed JSON values, at most 4 (an array inside one block counts as several). Validate each with `validateSpec`. */
  specs: unknown[];
  /** The answer without its blocks. */
  text: string;
  /** Blocks dropped: unreadable JSON, larger than 4 KB, or beyond the 4th. Each one is an `artifact_error` (`invalid_spec`). */
  invalid: number;
}

function tidy(text: string): string {
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function byteLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c <= 0xdbff ? (i++, 4) : 3;
  }
  return n;
}

/** Takes every complete ```thesisfic-artifact block out of `text`; keeps the first 4 specs that parse. */
export function extractArtifactBlocks(text: string): ExtractedBlocks {
  const specs: unknown[] = [];
  let invalid = 0;
  const src = String(text || "");
  const stripped = src.replace(BLOCK_RE, (_m, lead: string, body: string) => {
    const raw = body.trim();
    if (!raw || byteLength(raw) > MAX_ARTIFACT_BLOCK_BYTES) {
      invalid++;
      return lead;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      invalid++;
      return lead;
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      if (specs.length < MAX_ARTIFACT_BLOCKS && item && typeof item === "object" && !Array.isArray(item)) specs.push(item);
      else invalid++;
    }
    return lead;
  });
  // A block the model never closed is not shown either (nothing is computed from it).
  const open = OPEN_RE.exec(stripped);
  let out = stripped;
  if (open) {
    out = stripped.slice(0, open.index) + open[1];
    invalid++;
  }
  return { specs, text: tidy(out), invalid };
}

/**
 * The text to show while an answer streams: complete blocks removed, an unclosed trailing block hidden, and a
 * trailing partial fence ("``", "```thesis…") held back until it is clearly something else.
 */
export function stripPartialArtifactBlocks(text: string): string {
  let out = String(text || "").replace(BLOCK_RE, (_m, lead: string) => lead);
  const open = OPEN_RE.exec(out);
  if (open) out = out.slice(0, open.index) + open[1];
  // A fence still being typed at the very end: "`", "``", "```", "```thes"…
  const tail = /(^|\n)[ \t]*(`{1,3}[ \t]*[a-z-]*)$/i.exec(out);
  if (tail) {
    const after = tail[2].replace(/^`{1,3}[ \t]*/, "").toLowerCase();
    const fence = /^`{1,3}/.exec(tail[2])?.[0] ?? "";
    if ((fence.length < 3 && !after) || (fence.length === 3 && "thesisfic-artifact".startsWith(after))) out = out.slice(0, tail.index) + tail[1];
  }
  return out.replace(/\n{3,}/g, "\n\n");
}

/** How many complete blocks a (streaming) text holds and whether one is still open: drives the "Computing…" skeletons. */
export function artifactBlockState(text: string): { complete: number; pending: boolean } {
  const src = String(text || "");
  const complete = (src.match(BLOCK_RE) || []).length;
  const rest = src.replace(BLOCK_RE, (_m, lead: string) => lead);
  return { complete: Math.min(complete, MAX_ARTIFACT_BLOCKS), pending: OPEN_RE.test(rest) };
}
