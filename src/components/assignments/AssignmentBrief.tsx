"use client";

import { useId } from "react";
import { CalendarClock, Lock } from "lucide-react";
import Markdown from "@/components/Markdown";
import { DeadlineChip, KindChip } from "@/components/ui";
import { daysUntil } from "@/lib/deadline";
import { useFormat, useT } from "@/lib/i18n/client";
import type { AssignmentView } from "@/lib/papers/views";

/**
 * An assignment as its student, its teacher and the university admin see it (identical for all: CLAUDE.md principle 2).
 * Used in the "Read brief" modal, the editor's Brief panel, the assignment page and the staff paper page.
 * `compact` keeps the chips, title and teacher, one line of target and style, and clamps the brief to three lines.
 * The view carries no submission state, so a past due date is shown as a plain date, never as "overdue": the page that
 * knows the paper renders its own `DeadlineChip` with `status`/`submittedAt`.
 */
export function AssignmentBrief({ view, compact = false }: { view: AssignmentView; compact?: boolean }) {
  const t = useT();
  const fmt = useFormat();
  const headingId = useId();
  const closed = view.status === "closed";
  const brief = view.brief.trim();
  const days = daysUntil(view.deadline);
  const target = view.targetWords ? t("common.words", { n: fmt.number(view.targetWords) }) : "";
  const chip = "inline-flex items-center gap-1 rounded-[10px] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap";

  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <KindChip kind={view.kind} />
        {view.deadline && !closed && days !== null && days >= 0 && <DeadlineChip deadline={view.deadline} withDate={!compact} />}
        {view.deadline && (closed || (days !== null && days < 0)) && (
          <span className={`${chip} bg-gray-100 text-gray-700`}>
            <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />
            {t("deadline.due", { date: fmt.date(view.deadline) })}
          </span>
        )}
        {closed && (
          <span className={`${chip} bg-gray-100 text-gray-700`}>
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            {t("assignments.status.closed")}
          </span>
        )}
      </div>

      <h3 id={headingId} className={`${compact ? "text-sm" : "text-base"} font-semibold text-gray-900 mt-2 break-words`}>
        {view.title}
      </h3>
      <p className="text-xs text-gray-500 mt-0.5 break-words">{t("assignments.brief.assignedBy", { name: view.createdByName })}</p>

      {compact ? (
        (target || view.citationStyle) && <p className="text-xs text-gray-500 mt-1">{[target, view.citationStyle].filter(Boolean).join(" · ")}</p>
      ) : (
        <dl aria-label={t("assignments.brief.detailsAria")} className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
          <Fact label={t("assignments.brief.due")} value={view.deadline ? fmt.date(view.deadline) : t("assignments.brief.noDue")} />
          <Fact label={t("assignments.brief.target")} value={target || t("assignments.brief.notSet")} />
          <Fact label={t("assignments.brief.citationStyle")} value={view.citationStyle || t("assignments.brief.notSet")} />
        </dl>
      )}

      <div className={compact ? "mt-2" : "mt-4"}>
        {!compact && <h4 className="text-xs font-semibold text-gray-500 mb-1">{t("glossary.brief")}</h4>}
        {brief ? (
          <Markdown text={brief} className={compact ? "text-sm text-gray-700 line-clamp-3 break-words [&_*]:!my-0" : "text-sm text-gray-800 break-words"} />
        ) : (
          <p className="text-sm text-gray-500">{t("assignments.brief.empty")}</p>
        )}
      </div>

      {view.briefUpdatedAt && <p className="text-xs text-gray-500 mt-2">{t("assignments.brief.updated", { date: fmt.date(view.briefUpdatedAt) })}</p>}
      {closed && !compact && <p className="text-xs text-gray-600 mt-2">{t("assignments.brief.closedNote")}</p>}
    </section>
  );
}

export default AssignmentBrief;

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-gray-50 px-3 py-2">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm font-medium text-gray-900 truncate" title={value}>
        {value}
      </dd>
    </div>
  );
}
