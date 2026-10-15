"use client";

import { useFormat, useT } from "@/lib/i18n/client";
import type { PaperSection } from "@/components/editor/types";

/**
 * Section strip of a paper (docs/papers.md §4.1 item 3): one segment per top-level heading of the Final submission,
 * as wide as its words. Sections without words stay visible as short gray-100 segments. Each segment carries its name
 * and words as a tooltip; a compact legend names the three longest sections and how many have been started. Screen
 * readers get the full list instead of the drawing.
 */
export function SectionStrip({ sections, title, showCount = true, className = "" }: { sections: PaperSection[]; title: string; showCount?: boolean; className?: string }) {
  const t = useT();
  const fmt = useFormat();
  const words = (n: number) => (n === 1 ? t("common.word_one") : t("common.words", { n: fmt.number(n) }));

  if (!sections.length) return <p className={`text-xs text-gray-500 ${className}`}>{t("papers.strip.empty")}</p>;

  const total = sections.reduce((sum, s) => sum + Math.max(0, s.words), 0);
  // Empty sections keep a small share so every heading shows; with no words at all, every segment is equal.
  const floor = total > 0 ? total * 0.035 : 1;
  const started = sections.filter((s) => s.words > 0).length;
  const longest = sections
    .map((s, i) => ({ ...s, i }))
    .filter((s) => s.words > 0)
    .sort((a, b) => b.words - a.words || a.i - b.i)
    .slice(0, 3);

  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex h-2.5 w-full gap-[3px]" aria-hidden="true">
        {sections.map((s, i) => (
          <span
            key={i}
            title={`${s.title} · ${words(s.words)}`}
            className={`h-full min-w-[6px] rounded-full ${s.words > 0 ? "bg-brand-600" : "bg-gray-100"}`}
            style={{ flexGrow: Math.max(s.words, floor), flexBasis: 0 }}
          />
        ))}
      </div>
      <ul className="sr-only" aria-label={t("papers.strip.aria", { title })}>
        {sections.map((s, i) => (
          <li key={i}>{`${s.title}: ${words(s.words)}`}</li>
        ))}
      </ul>
      {(longest.length > 0 || showCount) && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs text-gray-500">
          {/* The three longest sections. Every segment shares one colour, so no colour keys: each name carries its
              count in a small pill, which never reads as part of the name (in French "Thème 1 410" would). */}
          {longest.length > 0 && (
            <ul className="flex min-w-0 flex-wrap gap-x-3 gap-y-1" aria-hidden="true">
              {longest.map((s) => (
                <li key={s.i} className="inline-flex min-w-0 items-center gap-1.5">
                  <span className="max-w-[11rem] truncate text-gray-700">{s.title}</span>
                  <span className="rounded-md bg-gray-100 px-1.5 text-[11px] font-medium tabular-nums text-gray-600">{fmt.number(s.words)}</span>
                </li>
              ))}
            </ul>
          )}
          {showCount && <span className="tabular-nums">{t("papers.strip.started", { n: started, total: sections.length })}</span>}
        </div>
      )}
    </div>
  );
}

export default SectionStrip;
