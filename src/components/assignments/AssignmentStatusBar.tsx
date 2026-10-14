"use client";

import { useFormat, useT } from "@/lib/i18n/client";
import type { RosterCounts } from "@/lib/papers/views";

/**
 * Where the students of an assignment are (docs/papers.md §4.3): one stacked bar, not started → done, always with a
 * text legend so the state never depends on colour alone. The four statuses are an ordered progression, so they use
 * one sequential ramp (neutral, then light to dark brand green) with a 2px gap between segments.
 */
const STEPS = [
  { key: "notStarted", label: "assignments.progress.notStarted", fill: "bg-gray-200" },
  { key: "inProgress", label: "assignments.progress.inProgress", fill: "bg-brand-200" },
  { key: "inReview", label: "assignments.progress.inReview", fill: "bg-brand-400" },
  { key: "done", label: "assignments.progress.done", fill: "bg-brand-600" },
] as const;

export function AssignmentStatusBar({ counts, legend = true, className = "" }: { counts: RosterCounts; legend?: boolean; className?: string }) {
  const t = useT();
  const fmt = useFormat();
  const total = counts.notStarted + counts.inProgress + counts.inReview + counts.done;
  const summary = t("assignments.progress.aria", {
    notStarted: fmt.number(counts.notStarted),
    inProgress: fmt.number(counts.inProgress),
    inReview: fmt.number(counts.inReview),
    done: fmt.number(counts.done),
  });

  return (
    <div className={`min-w-0 ${className}`}>
      <div
        className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-gray-100"
        {...(legend ? { "aria-hidden": true } : { role: "img", "aria-label": summary })}
        title={summary}
      >
        {total > 0 &&
          STEPS.filter((s) => counts[s.key] > 0).map((s) => (
            <span key={s.key} className={`${s.fill} h-full min-w-[4px]`} style={{ flexGrow: counts[s.key], flexBasis: 0 }} />
          ))}
      </div>
      {legend && (
        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-600" aria-label={t("assignments.progress.legendAria")}>
          {STEPS.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-[3px] ${s.fill}`} />
              <span>{t(s.label)}</span>
              <span className="font-semibold tabular-nums text-gray-900">{fmt.number(counts[s.key])}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default AssignmentStatusBar;
