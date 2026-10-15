"use client";

import Link from "next/link";
import { BookMarked, CalendarClock, History, Trash2 } from "lucide-react";
import { useTimeAgo } from "@/components/DashboardLayout";
import { DeadlineChip, KindChip, ScoreRing } from "@/components/ui";
import { statusColors } from "@/lib/client";
import { useFormat, useT } from "@/lib/i18n/client";
import { paperKind } from "@/lib/papers/kinds";
import { teacherRoleKey } from "@/lib/papers/templates";
import { PaperMenu, type PaperMenuItem } from "./PaperMenu";
import { FOCUS_RING, lastWorked, progressPct, type PaperListItem } from "./paperList";

/**
 * Slim card of "Your work" (docs/papers.md §4.1 item 5). Assigned papers show who assigned them and keep the teacher's
 * due date: no due-date dialog and no delete for them (the server refuses both).
 */
export function PaperCard({ paper: p, onDelete, onEditDeadline }: { paper: PaperListItem; onDelete?(p: PaperListItem): void; onEditDeadline?(p: PaperListItem): void }) {
  const t = useT();
  const fmt = useFormat();
  const timeAgo = useTimeAgo();
  const kind = paperKind(p);
  const assigned = !!p.assignmentId;
  const pct = progressPct(p.wordCount, p.targetWords);
  const editDeadline = !assigned && onEditDeadline ? () => onEditDeadline(p) : undefined;

  const teacherLine = assigned
    ? t("papers.work.assignmentFrom", { name: p.assignment?.createdByName || p.professorName })
    : p.professorId
      ? t("papers.work.teacherLine", { role: t(teacherRoleKey(p)), name: p.professorName })
      : t("papers.teacher.none");

  const items: PaperMenuItem[] = [
    { key: "sources", label: t("dashboard.theses.chooseSources"), icon: BookMarked, href: `/dashboard/sources?thesis=${encodeURIComponent(p.id)}` },
    { key: "sessions", label: p.sessionCount === 1 ? t("papers.work.sessions_one") : t("papers.work.sessions", { n: fmt.number(p.sessionCount || 0) }), icon: History, href: "/dashboard/analytics" },
  ];
  if (editDeadline) items.push({ key: "due", label: t(p.deadline ? "papers.work.changeDue" : "papers.work.addDue"), icon: CalendarClock, onSelect: editDeadline });
  if (!assigned && onDelete) items.push({ key: "delete", label: t("papers.work.delete"), icon: Trash2, danger: true, onSelect: () => onDelete(p) });

  return (
    <article aria-labelledby={`paper-${p.id}`} className="card flex min-w-0 flex-col p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <KindChip kind={kind} />
          <span className={statusColors[p.status]}>{t(`dashboard.status.${p.status}`)}</span>
          {p.openFlags > 0 && <span className="badge-warning">{p.openFlags === 1 ? t("dashboard.notices_one") : t("dashboard.notices", { n: p.openFlags })}</span>}
        </div>
        <div className="-mr-1.5 -mt-1 flex-shrink-0">
          <PaperMenu label={t("papers.work.menuAria", { title: p.title })} items={items} />
        </div>
      </div>

      <div className="mt-2.5 flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h3 id={`paper-${p.id}`} className="line-clamp-2 break-words text-base font-semibold leading-snug text-gray-900 sm:line-clamp-none sm:truncate">
            <Link href={`/dashboard/editor/${p.id}`} title={p.title} className={`rounded hover:text-brand-700 ${FOCUS_RING}`}>
              {p.title}
            </Link>
          </h3>
          {/* Each item stays whole: a narrow card wraps between them, never inside "Updated 12 Mar 2026". */}
          <p className="mt-1 text-xs text-gray-500">
            <span className="whitespace-nowrap tabular-nums">{t("dashboard.progressWords", { n: fmt.number(p.wordCount), target: fmt.number(p.targetWords) })}</span>
            <span aria-hidden="true"> · </span>
            <span className="whitespace-nowrap tabular-nums">{t("dashboard.theses.aiPct", { n: p.aiUsagePercent })}</span>
            <span aria-hidden="true"> · </span>
            <span className="whitespace-nowrap">{t("dashboard.theses.updated", { time: timeAgo(lastWorked(p)) })}</span>
          </p>
          <p className="mt-0.5 truncate text-xs text-gray-500">{teacherLine}</p>
        </div>
        <div className="flex-shrink-0" title={t("papers.work.integrityTitle", { n: p.integrityScore })}>
          <span className="sr-only">{t("papers.work.integrityTitle", { n: p.integrityScore })}</span>
          <div aria-hidden="true">
            <ScoreRing value={p.integrityScore} size={52} stroke={4} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <DeadlineChip deadline={p.deadline} wordCount={p.wordCount} targetWords={p.targetWords} status={p.status} submittedAt={p.submittedAt} late={p.late} onClick={editDeadline} />
        <div className="flex min-w-0 flex-1 items-center gap-2" role="img" aria-label={t("papers.work.progressAria", { pct })}>
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
          </div>
          <span className="w-8 text-right text-[11px] font-medium tabular-nums text-gray-500" aria-hidden="true">
            {pct}%
          </span>
        </div>
        <Link href={`/dashboard/editor/${p.id}`} aria-label={t("papers.work.openAria", { title: p.title })} className={`btn-outline !border !py-1.5 !px-3 text-[13px] ${FOCUS_RING}`}>
          {t("papers.work.open")}
        </Link>
      </div>
    </article>
  );
}

export default PaperCard;
