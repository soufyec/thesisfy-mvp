/**
 * The artifact pipeline of the Research copilot (docs/papers.md §3.5, D11, D12): blocks the model wrote (or specs
 * the demo planner chose) → validated against the attached datasets → computed by Thesisfic. Pure: no data-layer
 * access, so it runs the same in the route and in tests. The route sets `interactionId` on every artifact before it
 * stores or emits it; an artifact without one is never sent.
 */
import type { Artifact, ArtifactRef, ConversationMessage, Dataset, WritingLanguage } from "@/lib/db";
import { extractArtifactBlocks } from "@/lib/data/blocks";
import { artifactDigest, MAX_ARTIFACTS, planFromRequest, runAnalysis, validateSpec } from "@/lib/data/analysis";
import type { SpecErrorCode, ValidateResult } from "@/lib/data/analysis";
import type { Translate } from "@/lib/data/labels";
import { dataCard, sanitizeForPrompt } from "@/lib/data/summarize";

/** A spreadsheet attached to the message: the source it came from and its parsed dataset. */
export interface SheetAttachment {
  sourceId: string;
  /** File name as the student sees it (`source.file.name`, else the source title). */
  fileName: string;
  dataset: Dataset;
}

/** Body of `event: artifact_error`. `code` is a `SpecErrorCode` or "no_sheet" (UI key `data.error.<code>`). */
export interface ArtifactError {
  code: SpecErrorCode | "no_sheet";
  column?: string;
  available?: string[];
  file?: string;
}

export interface ArtifactRunOptions {
  /** The paper's writing language: titles, headers, notes and number formats. */
  lang: WritingLanguage;
  /** Translator of `lang`. */
  tr: Translate;
  /** New artifact id (`uid("art")` in the route). */
  newId: () => string;
  /** Set by the route once the interaction exists; "" until then. */
  interactionId?: string;
  now?: string;
}

export interface ArtifactRun {
  artifacts: Artifact[];
  errors: ArtifactError[];
}

/** Data cards sent to the model in one turn: at most this many attached sheets, and this many characters in all. */
export const MAX_SHEETS_IN_PROMPT = 4;
export const MAX_DATA_CARDS_CHARS = 60000;

const norm = (s: string) => sanitizeForPrompt(s, 160).toLowerCase();
const stem = (s: string) => norm(s).replace(/\.[a-z0-9]{1,5}$/, "");

/**
 * The attachment a block refers to: its "file" field (the name in the data card), then the sheet name when only one
 * attachment has that sheet, then the first attachment the spec validates against. Returns the validation against
 * the chosen attachment (or, if none fits, against the first candidate, for the error card).
 */
export function pickSheetFor(raw: unknown, sheets: SheetAttachment[]): { sheet: SheetAttachment; result: ValidateResult } | null {
  if (!sheets.length) return null;
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  let candidates = sheets;
  const fileRef = typeof r.file === "string" ? r.file : typeof r.source === "string" ? r.source : "";
  if (fileRef.trim()) {
    const byName = sheets.filter((s) => norm(s.fileName) === norm(fileRef) || stem(s.fileName) === stem(fileRef));
    if (byName.length) candidates = byName;
  }
  if (candidates.length > 1 && typeof r.sheet === "string" && r.sheet.trim()) {
    const want = norm(r.sheet);
    const bySheet = candidates.filter((s) => s.dataset.sheets.some((sh) => norm(sh.name) === want));
    if (bySheet.length) candidates = bySheet;
  }
  let first: { sheet: SheetAttachment; result: ValidateResult } | null = null;
  for (const sheet of candidates) {
    const result = validateSpec(raw, sheet.dataset, 0);
    if (result.ok) return { sheet, result };
    if (!first) first = { sheet, result };
  }
  return first;
}

/** Validates and computes up to 4 specs. Invalid ones become errors; nothing throws. */
export function computeArtifacts(specs: unknown[], sheets: SheetAttachment[], opts: ArtifactRunOptions): ArtifactRun {
  const artifacts: Artifact[] = [];
  const errors: ArtifactError[] = [];
  specs.forEach((raw, index) => {
    if (artifacts.length >= MAX_ARTIFACTS) {
      errors.push({ code: "invalid_spec" });
      return;
    }
    const pick = pickSheetFor(raw, sheets);
    if (!pick) {
      errors.push({ code: "no_sheet" });
      return;
    }
    const { sheet, result } = pick;
    if (!result.ok) {
      const e: ArtifactError = { code: result.code, available: result.available, file: sheet.fileName };
      if (result.column !== undefined) e.column = result.column;
      errors.push(e);
      return;
    }
    try {
      artifacts.push(
        runAnalysis(result.spec, sheet.dataset, { sourceId: sheet.sourceId, fileName: sheet.fileName, interactionId: opts.interactionId ?? "", lang: opts.lang, index, id: opts.newId(), now: opts.now }, opts.tr)
      );
    } catch (err) {
      const code = (err as Error)?.message as SpecErrorCode;
      errors.push({ code: KNOWN_CODES.has(code) ? code : "invalid_spec", file: sheet.fileName });
    }
  });
  return { artifacts, errors };
}

const KNOWN_CODES = new Set<string>(["invalid_spec", "unsupported_op", "unknown_sheet", "unknown_column", "missing_column", "not_numeric", "not_categorical", "no_numeric", "no_data"]);

/**
 * A finished model answer: its ```thesisfic-artifact blocks taken out (≤ 4 of ≤ 4 KB), validated and computed.
 * `text` is the answer without its blocks (what is stored, fingerprinted and previewed). Unreadable blocks become
 * `invalid_spec` errors; blocks with no sheet attached become `no_sheet` errors.
 */
export function artifactsFromAnswer(text: string, sheets: SheetAttachment[], opts: ArtifactRunOptions): ArtifactRun & { text: string } {
  const extracted = extractArtifactBlocks(text);
  const run = computeArtifacts(extracted.specs, sheets, opts);
  for (let i = 0; i < extracted.invalid; i++) run.errors.push({ code: "invalid_spec" });
  return { text: extracted.text, artifacts: run.artifacts, errors: run.errors };
}

/**
 * Demo mode (no model) with sheets attached: the planner reads the request in plain words (`planFromRequest`) and
 * Thesisfic computes what it chose, from the first attachment that yields a plan.
 */
export function demoArtifacts(request: string, sheets: SheetAttachment[], opts: ArtifactRunOptions & { planTr: Translate }): ArtifactRun & { sheet?: SheetAttachment } {
  for (const sheet of sheets) {
    const specs = planFromRequest(request, sheet.dataset, opts.planTr);
    if (specs.length) return { sheet, ...computeArtifacts(specs.slice(0, MAX_ARTIFACTS), [sheet], opts) };
  }
  return { sheet: sheets[0], artifacts: [], errors: [] };
}

/** Data cards (D11: no rows) of the attached sheets, within the prompt budget. */
export function dataCards(sheets: SheetAttachment[]): string[] {
  const out: string[] = [];
  let used = 0;
  for (const s of sheets.slice(0, MAX_SHEETS_IN_PROMPT)) {
    let card = dataCard(s.dataset, s.fileName);
    if (used + card.length > MAX_DATA_CARDS_CHARS) card = card.slice(0, Math.max(0, MAX_DATA_CARDS_CHARS - used)) + "\n… (data card cut at the prompt size limit)";
    out.push(card);
    used += card.length;
    if (used >= MAX_DATA_CARDS_CHARS) break;
  }
  return out;
}

/**
 * Model-facing digests (aggregates only) of the last `k` artifacts of a conversation, oldest first. Only artifacts
 * computed from a sheet attached to this turn count (a file removed or not attached is not sent again), and their
 * category labels follow D11 against that sheet's columns (`artifactDigest`). `trFor` gives the translator of an
 * artifact's language, so "Total", "Other", "Yes" and "No" stay readable.
 */
export function lastArtifactDigests(messages: Pick<ConversationMessage, "artifacts">[], sheets: SheetAttachment[], k = 3, trFor?: (lang: WritingLanguage) => Translate): string[] {
  const bySource = new Map(sheets.map((s) => [s.sourceId, s]));
  const all: Artifact[] = [];
  for (const m of messages) for (const a of m.artifacts || []) if (a && bySource.has(a.sourceId)) all.push(a);
  return all.slice(-k).map((a) => {
    const sheet = (bySource.get(a.sourceId) as SheetAttachment).dataset.sheets.find((s) => s.name === a.sheet);
    return artifactDigest(a, { columns: sheet ? sheet.columns : [], tr: trFor ? trFor(a.lang) : undefined });
  });
}

/** What an `AIInteraction` records of the artifacts of its answer. */
export function artifactRefs(artifacts: Artifact[]): ArtifactRef[] {
  return artifacts.map((a) => ({ id: a.id, kind: a.kind, title: a.title, sourceId: a.sourceId }));
}

/** `responsePreview` of an answer whose text may be empty once its blocks are taken out. */
export function previewOf(text: string, artifacts: Artifact[]): string {
  const t = text.trim();
  if (t) return t.slice(0, 200);
  return artifacts.map((a) => a.title).join(" · ").slice(0, 200);
}
