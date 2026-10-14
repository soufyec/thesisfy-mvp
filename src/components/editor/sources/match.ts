/**
 * Links between the sources (full text) and the references (bibliographic entries) of a thesis, as the editor shows
 * them. A reference points to its source through `sourceId`; older references are matched by DOI. Pure helpers, no
 * React and no network.
 */
import type { Reference } from "../types";

/** The fields of a source these helpers read (both the thesis view and the library view have them). */
export interface SourceLike {
  id: string;
  title: string;
  doi?: string;
}

export const normDoi = (doi?: string) =>
  (doi || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:\s*/, "");

/** Title without case, accents, punctuation or repeated spaces: "The Model, revisited." = "the model revisited". */
export const normTitle = (title?: string) =>
  (title || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // ES5 target: no `u` flag, so Latin, Greek and Cyrillic ranges stand in for \p{L}.
    .replace(/[^0-9a-zÀ-ɏͰ-ϿЀ-ӿ]+/g, " ")
    .trim();

/** The linked source a reference has its full text in: same `sourceId`, else same DOI. */
export function sourceForReference<S extends SourceLike>(ref: Reference, sources: S[]): S | undefined {
  if (ref.sourceId) {
    const byId = sources.find((s) => s.id === ref.sourceId);
    if (byId) return byId;
  }
  const doi = normDoi(ref.doi);
  return doi ? sources.find((s) => normDoi(s.doi) === doi) : undefined;
}

/**
 * The reference of the thesis that stands for a source: the one created from it (`sourceId`), else the same DOI, else
 * (with `byTitle`, used when citing so that a second click never duplicates the entry) the same normalised title.
 */
export function referenceForSource(source: SourceLike, refs: Reference[], byTitle = false): Reference | undefined {
  const bySource = refs.find((r) => r.sourceId === source.id);
  if (bySource) return bySource;
  const doi = normDoi(source.doi);
  if (doi) {
    const byDoi = refs.find((r) => normDoi(r.doi) === doi);
    if (byDoi) return byDoi;
  }
  if (!byTitle) return undefined;
  const title = normTitle(source.title);
  return title ? refs.find((r) => normTitle(r.title) === title) : undefined;
}

/** A new reference id, unique across the student's library (`ref_` + 12 hex, the style of the library routes). */
export function newReferenceId(): string {
  const bytes = new Uint8Array(6);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return `ref_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
