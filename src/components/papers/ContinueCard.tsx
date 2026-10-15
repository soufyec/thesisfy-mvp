"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useTimeAgo } from "@/components/DashboardLayout";
import { DeadlineChip, KindChip } from "@/components/ui";
import { statusColors } from "@/lib/client";
import { useFormat, useT } from "@/lib/i18n/client";
import { paperKind } from "@/lib/papers/kinds";
import { FOCUS_RING, lastWorked, type PaperListItem } from "./paperList";
import { SectionStrip } from "./SectionStrip";

/** Wide card of the Continue row (docs/papers.md §4.1 item 3): where the paper stands, section by section. */
export function ContinueCard({ paper: p }: { paper: PaperListItem }) {
  const t = useT();
  const fmt = useFormat();
  const timeAgo = useTimeAgo();
  const kind = paperKind(p);
  const showStatus = p.status === "revision_requested" || p.status === "under_review";
  const sections = p.sections || [];
  const started = sections.filter((s) => s.words > 0).length;

  return (
    <article aria-labelledby={`continue-${p.id}`} className="card flex min-w-0 flex-col p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-1.5">
        <KindChip kind={kind} />
        {showStatus && <span className={statusColors[p.status]}>{t(`dashboard.status.${p.status}`)}</span>}
        <DeadlineChip deadline={p.deadline} wordCount={p.wordCount} targetWords={p.targetWords} status={p.status} submittedAt={p.submittedAt} late={p.late} />
      </div>
      <h3 id={`continue-${p.id}`} className="mt-3 text-base font-semibold leading-snug text-gray-900 line-clamp-2 break-words sm:line-clamp-none sm:truncate" title={p.title}>
        {p.title}
      </h3>
      <p className="mt-1 text-[13px] text-gray-500">
        {t("papers.continue.lastWorked", { time: timeAgo(lastWorked(p)) })}
        <span aria-hidden="true"> · </span>
        <span className="tabular-nums">{t("dashboard.progressWords", { n: fmt.number(p.wordCount), target: fmt.number(p.targetWords) })}</span>
      </p>
      <SectionStrip sections={sections} title={p.title} showCount={false} className="mt-5" />
      {/* Footer: how many sections have words, and the action, on one line so both cards of the row end alike. */}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5">
        <span className="text-xs tabular-nums text-gray-500">{sections.length > 0 && t("papers.strip.started", { n: started, total: sections.length })}</span>
        <Link href={`/dashboard/editor/${p.id}`} aria-label={t("papers.continue.aria", { title: p.title })} className={`btn-primary !py-2 !px-4 gap-1.5 text-sm ${FOCUS_RING}`}>
          {t("papers.continue.button")}
          <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

export default ContinueCard;
