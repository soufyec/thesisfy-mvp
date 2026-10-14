/**
 * In-text citation counts per reference id, read from thesis HTML. Pure (no db, no DOM): the library routes and the
 * editor count the same way. A citation is a `CitationMark` (`data-citation="<id>"`) or a `CitedPassage`
 * (`data-cite-ref="<id>"`), see `src/components/editor/extensions.ts`.
 */

const ATTR_RE = /data-(?:citation|cite-ref)="([^"]*)"/g;

function decodeAttr(v: string) {
  return v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/** Adds the citations found in `html` to `into` (id → count) and returns it. */
export function addCitationCounts(html: string | undefined | null, into: Record<string, number> = {}): Record<string, number> {
  if (!html) return into;
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(html))) {
    const id = decodeAttr(m[1]);
    if (id) into[id] = (into[id] || 0) + 1;
  }
  return into;
}

/** Citations per reference id across several HTML documents (the submission and every working tab). */
export function citationCounts(htmls: (string | undefined | null)[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const h of htmls) addCitationCounts(h, out);
  return out;
}

/** Citations per reference id in a thesis: `content` plus every `tabs[].content`. */
export function thesisCitationCounts(thesis: { content?: string; tabs?: { content?: string }[] }): Record<string, number> {
  return citationCounts([thesis.content, ...(thesis.tabs || []).map((t) => t && t.content)]);
}
