"use client";

import { useId } from "react";
import { KindTile } from "@/components/ui";
import { useFormat, useT } from "@/lib/i18n/client";
import { FEATURED_KINDS, type PaperGroup, type PaperKind } from "@/lib/papers/kinds";
import { PAPER_TEMPLATES, type PaperTemplate, type TemplateMotif } from "@/lib/papers/templates";

/**
 * Template gallery (docs/papers.md §4.1 item 4, §4.3). Closed props: later phases restyle it without changing them.
 * - `filter`: which group to show ("all" by default).
 * - `featuredOnly`: with `filter` "all", only the six `FEATURED_KINDS`; a group filter always shows its whole group.
 * - `selected`: selection mode (the professor's assignment modal): tiles become toggle buttons with `aria-pressed`.
 * - `compact`: smaller tiles without thumbnails.
 * Filter chips and the "All templates (12)" toggle live in the page; `TemplateFilterChips` below is the shared chip row.
 */
export interface TemplateGalleryProps {
  compact?: boolean;
  selected?: PaperKind;
  filter?: PaperGroup | "all";
  featuredOnly?: boolean;
  onPick(kind: PaperKind): void;
}

export function TemplateGallery({ compact = false, selected, filter = "all", featuredOnly = false, onPick }: TemplateGalleryProps) {
  const t = useT();
  const fmt = useFormat();
  const uid = useId();
  const list = PAPER_TEMPLATES.filter((tpl) => (filter === "all" ? !featuredOnly || FEATURED_KINDS.includes(tpl.kind) : tpl.group === filter));
  if (!list.length) return <p className="text-sm text-gray-500">{t("papers.gallery.none")}</p>;

  const meta = (tpl: PaperTemplate) => (tpl.sections.length ? t("papers.gallery.words", { words: fmt.number(tpl.targetWords), sections: tpl.sections.length }) : t("papers.gallery.empty"));
  const focus = "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2";

  return (
    <div role="group" aria-label={t("papers.gallery.aria")} className={compact ? "grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 gap-2" : "grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3"}>
      {list.map((tpl) => {
        const name = t(`papers.kind.${tpl.kind}`);
        const descId = `${uid}-${tpl.kind}`;
        const isSelected = selected === tpl.kind;
        const state = selected === undefined ? "border-gray-100 hover:border-gray-200" : isSelected ? "border-brand-600 ring-1 ring-brand-600" : "border-gray-100 hover:border-gray-200";
        const common = {
          type: "button" as const,
          onClick: () => onPick(tpl.kind),
          "aria-pressed": selected === undefined ? undefined : isSelected,
          "aria-label": `${t("papers.gallery.pickAria", { kind: name })}. ${meta(tpl)}`,
          "aria-describedby": descId,
        };
        if (compact) {
          return (
            <button key={tpl.kind} {...common} className={`group flex items-start gap-2.5 min-w-0 text-left rounded-xl border bg-white p-3 shadow-sm transition-colors ${state} ${focus}`}>
              <KindTile kind={tpl.kind} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-gray-900 leading-snug break-words hyphens-auto">{name}</span>
                <span id={descId} className="block text-xs text-gray-500 mt-0.5 line-clamp-2 break-words">{t(`papers.kindDesc.${tpl.kind}`)}</span>
                <span className="block text-[11px] font-medium text-gray-500 mt-1">{meta(tpl)}</span>
              </span>
            </button>
          );
        }
        return (
          <button key={tpl.kind} {...common} className={`group flex flex-col min-w-0 text-left rounded-2xl border bg-white p-2.5 shadow-sm transition-colors ${state} ${focus}`}>
            <TemplateThumbnail motif={tpl.motif} />
            <span className="flex items-start gap-2 mt-2.5 min-w-0">
              <KindTile kind={tpl.kind} />
              <span className="min-w-0 pt-1.5 text-sm font-semibold text-gray-900 leading-snug break-words hyphens-auto">{name}</span>
            </span>
            <span id={descId} className="block text-xs text-gray-500 mt-1.5 line-clamp-2 break-words">{t(`papers.kindDesc.${tpl.kind}`)}</span>
            <span className="mt-auto pt-2">
              <span className="inline-block max-w-full rounded-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 text-[11px] font-medium leading-snug break-words">{meta(tpl)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default TemplateGallery;

/** Chip row to filter the gallery by group (All · Theses · Essays · Reports · Research), styled like /dashboard/sources. */
export function TemplateFilterChips({ value, onChange }: { value: PaperGroup | "all"; onChange(value: PaperGroup | "all"): void }) {
  const t = useT();
  const chips: (PaperGroup | "all")[] = ["all", "theses", "essays", "reports", "research"];
  return (
    <div role="group" aria-label={t("papers.gallery.filterAria")} className="flex flex-wrap gap-1.5 min-w-0">
      {chips.map((c) => {
        const on = value === c;
        return (
          <button
            key={c}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(c)}
            className={`inline-flex items-center rounded-[10px] border px-3 py-1.5 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${on ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}
          >
            {c === "all" ? t("papers.gallery.filterAll") : t(`papers.group.${c}`)}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Thumbnail: a sheet drawn with divs only (no live text), in gray-200/300 with one brand-400 mark ---------- */

const Line = ({ w = "100%", tone = "bg-gray-200", h = "h-[3px]", className = "" }: { w?: string; tone?: string; h?: string; className?: string }) => (
  <span className={`block flex-shrink-0 rounded-full ${h} ${tone} ${className}`} style={{ width: w }} />
);

const TitleBar = ({ center = false }: { center?: boolean }) => <Line w="62%" h="h-[5px]" tone="bg-gray-300" className={`mb-[3px] ${center ? "self-center" : ""}`} />;

/** A paragraph: `widths` per line; `indent` shifts the first line (essays), `hang` shifts every line but the first. */
const Para = ({ widths = ["100%", "100%", "64%"], indent = false, hang = false }: { widths?: string[]; indent?: boolean; hang?: boolean }) => (
  <span className="flex flex-col gap-[3px]">
    {widths.map((w, i) => (
      <Line key={i} w={w} className={(indent && i === 0) || (hang && i > 0) ? "ml-[14%]" : ""} />
    ))}
  </span>
);

/** The provenance-style mark in the left margin; on the blank sheet it is the caret under the title. */
const Mark = () => <span className="absolute left-[5%] top-[38%] h-[16%] w-[2px] rounded-full bg-brand-400" />;

function Motif({ motif }: { motif: TemplateMotif }) {
  switch (motif) {
    case "titlePage":
      return (
        <span className="flex flex-col items-center gap-[3px] pt-[26%]">
          <Line w="72%" h="h-[5px]" tone="bg-gray-300" />
          <Line w="52%" h="h-[5px]" tone="bg-gray-300" />
          <span className="h-[8px]" />
          <Line w="34%" />
          <Line w="26%" />
          <span className="h-[14px]" />
          <Line w="40%" />
        </span>
      );
    case "paragraphs":
      return (
        <span className="flex flex-col gap-[6px]">
          <TitleBar />
          <Para indent widths={["86%", "100%", "100%", "58%"]} />
          <Para indent widths={["86%", "100%", "72%"]} />
          <Para indent widths={["86%", "100%", "100%", "40%"]} />
        </span>
      );
    case "summaryBox":
      return (
        <span className="flex flex-col gap-[6px]">
          <TitleBar />
          <span className="flex flex-col gap-[3px] rounded-[2px] bg-gray-100 p-[7%]">
            <Line tone="bg-gray-300" />
            <Line tone="bg-gray-300" />
            <Line w="66%" tone="bg-gray-300" />
          </span>
          <Para />
          <Para widths={["100%", "80%"]} />
        </span>
      );
    case "tableFigure":
      return (
        <span className="flex flex-col gap-[6px]">
          <TitleBar />
          <Para widths={["100%", "70%"]} />
          <span className="grid grid-cols-3 gap-px rounded-[1px] border border-gray-300 bg-gray-300">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className={`block h-[5px] ${i < 3 ? "bg-gray-200" : "bg-white"}`} />
            ))}
          </span>
          <span className="flex h-[24px] items-end gap-[3px] rounded-[1px] border border-gray-300 px-[8%] pb-[3px]">
            {["40%", "72%", "56%", "88%"].map((h, i) => (
              <span key={i} className="block flex-1 rounded-t-[1px] bg-gray-200" style={{ height: h }} />
            ))}
          </span>
        </span>
      );
    case "twoColumn":
      return (
        <span className="flex flex-col gap-[6px]">
          <TitleBar center />
          <span className="flex flex-col gap-[3px] rounded-[2px] bg-gray-100 p-[6%]">
            <Line tone="bg-gray-300" />
            <Line w="70%" tone="bg-gray-300" />
          </span>
          <span className="grid grid-cols-2 gap-[8%]">
            <Para widths={["100%", "100%", "100%", "100%", "100%", "60%"]} />
            <Para widths={["100%", "100%", "100%", "100%", "100%", "80%"]} />
          </span>
        </span>
      );
    case "hangingEntries":
      return (
        <span className="flex flex-col gap-[6px]">
          <TitleBar />
          <Para hang widths={["100%", "86%", "50%"]} />
          <Para hang widths={["100%", "86%"]} />
          <Para hang widths={["100%", "86%", "62%"]} />
          <Para hang widths={["100%", "70%"]} />
        </span>
      );
    case "timeline":
      return (
        <span className="flex flex-col gap-[6px]">
          <TitleBar />
          <Para />
          <span className="flex flex-col gap-[3px]">
            {[
              ["0%", "34%"],
              ["22%", "30%"],
              ["44%", "34%"],
              ["66%", "34%"],
            ].map(([ml, w], i) => (
              <span key={i} className="block h-[4px] rounded-full bg-gray-300" style={{ marginLeft: ml, width: w }} />
            ))}
          </span>
          <span className="relative block h-[5px]">
            <span className="absolute inset-x-0 top-[2px] h-px bg-gray-300" />
            {["0%", "33%", "66%", "calc(100% - 5px)"].map((left, i) => (
              <span key={i} className="absolute top-0 h-[5px] w-[5px] rounded-full bg-gray-300" style={{ left }} />
            ))}
          </span>
          <Para widths={["100%", "54%"]} />
        </span>
      );
    case "reflective":
      return (
        <span className="flex flex-col gap-[6px]">
          <TitleBar />
          <span className="flex items-center gap-[8%]">
            <span className="block aspect-square w-[34%] flex-shrink-0 rounded-full border-2 border-gray-300" />
            <span className="flex flex-1 flex-col gap-[3px]">
              <Line />
              <Line />
              <Line w="60%" />
            </span>
          </span>
          <Para />
          <Para widths={["100%", "76%"]} />
        </span>
      );
    case "caseBlocks":
      return (
        <span className="flex flex-col gap-[5px]">
          <TitleBar />
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex flex-col gap-[2px]">
              <Line w="30%" tone="bg-gray-300" />
              <span className="flex flex-col gap-[3px] rounded-[2px] border border-gray-200 p-[5%]">
                <Line />
                <Line w={i === 1 ? "56%" : "74%"} />
              </span>
            </span>
          ))}
        </span>
      );
    case "blank":
      return (
        <span className="flex flex-col">
          <TitleBar />
          <span className="mt-[4px] block h-[9px] w-[2px] rounded-full bg-brand-400" />
        </span>
      );
  }
}

/** Neutral well (`bg-paper-well`) with a white sheet (≈ 1:1.3) cut cleanly at the bottom; only the sheet lifts on hover. */
export function TemplateThumbnail({ motif }: { motif: TemplateMotif }) {
  return (
    <span aria-hidden="true" className="relative block aspect-[4/3] w-full overflow-hidden rounded-xl bg-paper-well">
      <span className="absolute left-1/2 top-[14%] block aspect-[1/1.3] w-[58%] -translate-x-1/2 overflow-hidden rounded-[4px] bg-white p-[6%] shadow-sm motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-focus-visible:-translate-y-0.5">
        <Motif motif={motif} />
        {motif !== "blank" && <Mark />}
      </span>
    </span>
  );
}
