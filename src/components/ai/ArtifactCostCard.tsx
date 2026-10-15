"use client";

import type { Artifact } from "@/lib/db";
import { useFormat, useT } from "@/lib/i18n/client";
import { artifactInsertCells, artifactInsertWords, costClassOf } from "./artifactText";

/** The numbers the cost card needs from the editor: Final submission words, AI words and the institution's limit. */
export interface ArtifactCostContext {
  wordCount: number;
  aiWords: number;
  limitPct: number;
  /** The active tab is the Final submission (default). Other tabs get the notes wording: they do not count toward the share. */
  onFinalSubmission?: boolean;
  /** Title of the paper's existing Research notes tab, when there is one (else the tab is created as `editor.notesTab`). */
  notesTitle?: string;
}

/** Renders `**bold**` segments of a translated string. */
function rich(text: string) {
  return text.split("**").map((part, i) => (i % 2 === 1 ? <b key={i}>{part}</b> : part));
}

/**
 * Cost card shown before a copilot artifact is inserted (principle 5, docs/papers.md §4.5 and D27). Tables and test
 * results add AI-assisted words (`artifactWords` of the exact inserted HTML) and move the AI share; a chart or a diagram
 * adds 1 AI-assisted figure and no words; an equation adds 1 AI-assisted equation and no words. It never says who pays
 * for the model. Insertion above the limit is refused here, before anything reaches the paper.
 */
export default function ArtifactCostCard({ artifact, action, ctx, onConfirm, onCancel }: { artifact: Artifact; action: "insert" | "notes" | "equation"; ctx?: ArtifactCostContext; onConfirm: () => void; onCancel: () => void }) {
  const t = useT();
  const fmt = useFormat();
  const cls = costClassOf(artifact, action === "equation");
  const words = cls === "table" ? artifactInsertWords(artifact) : 0;
  const cells = cls === "table" ? artifactInsertCells(artifact) : 0;
  const wordsText = words === 1 ? t("assistant.cost.aiWords_one") : t("assistant.cost.aiWords", { n: fmt.number(words) });
  const vars = { words: wordsText, cells: fmt.number(cells), notes: ctx?.notesTitle || t("editor.notesTab") };
  const notes = action === "notes";
  const otherTab = !notes && ctx?.onFinalSubmission === false;
  const cur = ctx && ctx.wordCount > 0 ? Math.round((ctx.aiWords / ctx.wordCount) * 100) : 0;
  const nextExact = ctx ? ((ctx.aiWords + words) / (ctx.wordCount + words || 1)) * 100 : 0;
  const next = Math.round(nextExact);
  const over = !!ctx && !notes && !otherTab && cls === "table" && nextExact > ctx.limitPct;

  let body: string;
  if (notes) body = t(`assistant.artifact.cost.notes.${cls}`, vars);
  else if (otherTab) body = t(`assistant.artifact.cost.tab.${cls}`, vars);
  else if (ctx) body = t(`assistant.artifact.cost.${cls}`, { ...vars, cur, next, limit: ctx.limitPct });
  else body = t(`assistant.artifact.cost.noLimit.${cls}`, vars);

  const confirm = notes ? t("assistant.action.notes") : action === "equation" ? t("assistant.artifact.insertEquation") : t("assistant.action.insert");
  return (
    <div className="border border-prov-ai-line bg-prov-ai-soft rounded-xl p-3" role="group" aria-labelledby={`cost-title-${artifact.id}-${action}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full bg-prov-ai" aria-hidden="true" />
        <span id={`cost-title-${artifact.id}-${action}`} className="text-xs font-semibold text-prov-ai-deep">{t(`assistant.artifact.cost.title.${cls}`)}</span>
      </div>
      <div className="text-[13px] leading-normal text-gray-700">
        {rich(body)}
        {over && ctx && <div className="mt-1.5 text-prov-ai-deep font-medium">{t("assistant.cost.over", { next, limit: ctx.limitPct })}</div>}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2.5 text-xs">
        <button type="button" onClick={onConfirm} disabled={over} className="px-[11px] py-1.5 rounded-lg bg-prov-ai text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-prov-ai/40">
          {confirm}
        </button>
        <button type="button" onClick={onCancel} className="px-[11px] py-1.5 rounded-lg border border-prov-ai-line text-prov-ai-deep font-medium hover:bg-white">
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
