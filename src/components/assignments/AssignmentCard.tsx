"use client";

import Link from "next/link";
import { CalendarClock, ChevronRight, Users } from "lucide-react";
import { DeadlineChip, KindTile } from "@/components/ui";
import { daysUntil } from "@/lib/deadline";
import { useFormat, useT } from "@/lib/i18n/client";
import { AssignmentStatusBar } from "./AssignmentStatusBar";
import { handedIn, rosterTotal, type StaffAssignment } from "./types";

const CHIP = "inline-flex items-center gap-1 rounded-[10px] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap";

/**
 * Due date of an assignment for its staff: the countdown chip while it is ahead; once past (or closed) a neutral
 * "Due {date}", like `AssignmentBrief`, because whether a student is late is a property of each paper, not of the
 * assignment.
 */
export function AssignmentDue({ deadline, closed = false, withDate = true }: { deadline?: string; closed?: boolean; withDate?: boolean }) {
  const t = useT();
  const fmt = useFormat();
  const days = daysUntil(deadline);
  if (!deadline || days === null) return <span className={`${CHIP} bg-gray-100 text-gray-700`}>{t("assignments.brief.noDue")}</span>;
  if (!closed && days >= 0) return <DeadlineChip deadline={deadline} withDate={withDate} />;
  return (
    <span className={`${CHIP} bg-gray-100 text-gray-700`}>
      <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
      {t("deadline.due", { date: fmt.date(deadline) })}
    </span>
  );
}

/** One assignment in the list (§4.3): kind tile, title, due date, number of students and the stacked status bar. */
export function AssignmentCard({ assignment: a }: { assignment: StaffAssignment }) {
  const t = useT();
  const fmt = useFormat();
  const total = rosterTotal(a.counts);
  const closed = a.status === "closed";
  return (
    <article className={`card relative flex min-w-0 flex-col p-5 ${closed ? "bg-gray-50/60" : ""}`}>
      <div className="flex items-start gap-3">
        <KindTile kind={a.kind} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-gray-500">{t(`papers.kind.${a.kind}`)}</div>
          <h3 className="mt-0.5 text-base font-semibold leading-snug text-gray-900">
            <Link href={`/admin/assignments/${a.id}`} className="line-clamp-2 break-words rounded-sm after:absolute after:inset-0 after:rounded-2xl hover:text-brand-700 focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand-500">
              {a.title}
            </Link>
          </h3>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-gray-300" aria-hidden="true" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-600">
        <AssignmentDue deadline={a.deadline} closed={closed} />
        <span className="inline-flex items-center gap-1">
          <Users className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
          {total === 1 ? t("assignments.card.students_one") : t("assignments.card.students", { n: fmt.number(total) })}
        </span>
        <span className="font-medium text-gray-700">{t("assignments.card.submitted", { n: fmt.number(handedIn(a.counts)), total: fmt.number(total) })}</span>
      </div>

      <AssignmentStatusBar counts={a.counts} className="mt-4" />
    </article>
  );
}

export default AssignmentCard;
