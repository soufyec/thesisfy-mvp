/**
 * Caps of the personal library and of primary data (docs/papers.md §1.3, D10). Pure, so parsers and the demo data
 * can use them; `library.ts` re-exports them for the routes.
 */

/** Secondary sources (literature): per paper and per library. Primary sources have their own caps below. */
export const MAX_SOURCES_PER_THESIS = 40;
export const MAX_SOURCES_PER_LIBRARY = 150;

/** Primary sources (the student's own data, transcripts, field notes). */
export const MAX_PRIMARY_PER_THESIS = 20;
export const MAX_PRIMARY_PER_LIBRARY = 60;

/** Cells kept per dataset (all sheets) and per library (all datasets of the owner). */
export const MAX_DATASET_CELLS = 20_000;
export const MAX_LIBRARY_CELLS = 80_000;
export const MAX_SHEETS = 5;
export const MAX_COLUMNS = 60;
export const MAX_CELL_CHARS = 200;

/** Every uploaded file, PDFs included (Vercel refuses request bodies above 4.5 MB anyway). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Extracted text kept per source (whole pages up to this many characters). */
export const MAX_TEXT_CHARS = 250_000;
