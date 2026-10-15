"use client";

import type { Artifact } from "@/lib/db";
import type { ArtifactErrorEvent } from "@/lib/client";
import { translate } from "@/lib/i18n/dictionary";
import type { Translate } from "@/lib/i18n/dictionary";
import { artifactCells, artifactTableHtml, artifactWords } from "@/lib/data/artifactHtml";

/**
 * Words and labels of the copilot's artifacts on the client (docs/papers.md §4.5, §9.4). The numbers the cost card
 * shows come from the same functions the editor inserts with (`artifactTableHtml` + `artifactWords`), so "adds N
 * AI-assisted words" equals the AI words the server counts after the save.
 */

/** Tables wider than this do not fit the page: "Insert" is disabled with a sentence (§4.5). */
export const MAX_INSERT_COLUMNS = 8;

/** Translator into the artifact's writing language (captions, headers and notes are written in it, D19). */
export function writingTr(lang: Artifact["lang"]): Translate {
  return (key, vars) => translate(lang, key, vars);
}

/** What an insertion adds, for the cost card: AI-assisted words (tables and tests), a figure, or an equation. */
export type CostClass = "table" | "figure" | "equation";

export function costClassOf(a: Pick<Artifact, "kind">, asEquation = false): CostClass {
  if (asEquation || a.kind === "equation") return "equation";
  if (a.kind === "chart" || a.kind === "diagram") return "figure";
  return "table";
}

/** The exact HTML a table or a test result becomes in the paper (null for figures and equations). */
export function artifactInsertHtml(a: Artifact): string | null {
  if (a.kind !== "table" && a.kind !== "test") return null;
  return artifactTableHtml(a, writingTr(a.lang));
}

/** AI-assisted words the insertion adds: those of the exact inserted HTML for tables and tests, 0 for figures and equations. */
export function artifactInsertWords(a: Artifact, asEquation = false): number {
  if (asEquation) return 0;
  const html = artifactInsertHtml(a);
  return html ? artifactWords(html) : 0;
}

export function artifactInsertCells(a: Artifact): number {
  return a.kind === "table" || a.kind === "test" ? artifactCells(a) : 0;
}

/** A table, chart, test or timeline computed from a file (it has a source), as opposed to a diagram or equation the model proposed. */
export function isComputed(a: Pick<Artifact, "sourceId" | "fileName">): boolean {
  return !!a.sourceId && !!a.fileName;
}

/** Tables (and the data view of tests) that the insert button refuses: wider than the page. */
export function tooWide(a: Artifact): boolean {
  return (a.kind === "table" || a.kind === "test") && a.table.columns.length > MAX_INSERT_COLUMNS;
}

/**
 * An `artifact_error` event as the server sends it: the codes of `data.error.*`, plus the §9 fields
 * (src/app/api/ai/chat/artifacts.ts `ArtifactError`), all typed by src/lib/client.ts `ArtifactErrorEvent`.
 */
export type ArtifactErrorInfo = ArtifactErrorEvent;

/** "Thesisfic could not compute this: …" — the reason, in the interface language. */
export function artifactErrorReason(e: ArtifactErrorInfo, t: Translate): string {
  if (e.code === "prisma_numbers") return t("assistant.artifactError.prisma_numbers", { list: (e.missing || []).join(", ") || "…" });
  if (e.code === "equation_numbers") return t("assistant.artifactError.equation_numbers", { list: (e.missing || []).join(", ") || "…" });
  if (e.code === "latex_invalid") return e.command ? t("assistant.artifactError.latex_invalid", { command: e.command }) : t("assistant.artifactError.latex_invalidGeneric");
  if (e.code === "diagram_invalid") {
    const key = e.detail ? `data.diagram.error.${e.detail}` : "";
    const detail = key ? t(key) : "";
    return detail && detail !== key ? `${t("assistant.artifactError.diagram_invalid")} ${detail}` : t("assistant.artifactError.diagram_invalid");
  }
  const key = `data.error.${e.code}`;
  const text = t(key, { column: e.column });
  // `{column}` left in place means the server sent no column for a message that names one.
  if (text === key) return t("assistant.artifactError.generic");
  return text.replace(/[“«„]\{column\}[”»“]\s?/g, "").replace("{column}", "");
}

/** "Columns you can use: …" when the server listed them (not for diagrams and equations). */
export function artifactErrorAvailable(e: ArtifactErrorInfo, t: Translate): string | null {
  if (!e.available || !e.available.length || e.kind) return null;
  return t("data.error.available", { list: e.available.slice(0, 24).join(", ") });
}
