"use client";

import Link from "next/link";
import { AlertCircle, ArrowRight } from "lucide-react";
import { DeadlineChip } from "@/components/ui";
import { statusColors } from "@/lib/client";
import { useFormat, useT } from "@/lib/i18n/client";
import { statusLabel } from "@/lib/i18n/messages/admin";
import type { RosterRow } from "@/lib/papers/views";
import { initials, rosterOrder } from "./types";

const HANDED_IN = ["under_review", "approved", "submitted"];

const scoreTone = (n: number) => (n >= 90 ? "text-green-700" : n >= 70 ? "text-amber-700" : "text-red-700");

/**
 * The students of an assignment as a list of cards (docs/papers.md §4.3; never a horizontal table): name, status,
 * words against the target, AI-assisted share, integrity, submitted on time or late (or "Overdue"), and "Open paper".
 * A student who has not started has no paper, so their words, AI share and integrity are not shown.
 */
export function RosterList({ rows, deadline }: { rows: RosterRow[]; deadline?: string }) {
  const t = useT();
  const fmt = useFormat();
  const sorted = [...rows].sort((a, b) => rosterOrder(a) - rosterOrder(b) || a.name.localeCompare(b.name));

  return (
    <ul className="space-y-2.5" aria-label={t("assignments.roster.aria")}>
      {sorted.map((r) => {
        const started = r.status !== "not_started";
        const handedIn = HANDED_IN.indexOf(r.status) !== -1;
        const pct = r.targetWords > 0 ? Math.min(100, Math.round((r.words / r.targetWords) * 100)) : 0;
        return (
          <li key={r.studentId} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.6fr)_auto] lg:items-center lg:gap-5">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                  {initials(r.name)}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-gray-900">{r.name}</div>
                  <div className="truncate text-xs text-gray-500">{r.email}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`${started ? statusColors[r.status] : "badge bg-gray-100 text-gray-700"} !text-[11px]`}>{started ? statusLabel(t, r.status) : t("assignments.progress.notStarted")}</span>
                    {handedIn && <DeadlineChip deadline={deadline} status={r.status} submittedAt={r.submittedAt} late={r.late} />}
                    {r.overdue && (
                      <span className="inline-flex items-center gap-1 rounded-[10px] bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        {t("assignments.roster.overdue")}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {started ? (
                <dl className="flex flex-wrap gap-x-6 gap-y-2 sm:pl-12 lg:pl-0">
                  <div className="min-w-0">
                    <dt className="whitespace-nowrap text-[11px] font-medium text-gray-500">{t("assignments.roster.words")}</dt>
                    <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums text-gray-900">
                      {fmt.number(r.words)}
                      <span className="font-normal text-gray-500"> / {fmt.number(r.targetWords)}</span>
                    </dd>
                    <dd aria-hidden="true" className="mt-1 h-1 w-full max-w-[7rem] overflow-hidden rounded-full bg-gray-100">
                      <span className="block h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="whitespace-nowrap text-[11px] font-medium text-gray-500">{t("glossary.aiAssisted")}</dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">{fmt.number(r.aiUsagePercent)}%</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="whitespace-nowrap text-[11px] font-medium text-gray-500">{t("glossary.integrity")}</dt>
                    <dd className={`mt-0.5 text-sm font-semibold tabular-nums ${scoreTone(r.integrityScore)}`}>{fmt.number(r.integrityScore)}%</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-xs text-gray-500 sm:pl-12 lg:pl-0">{t("assignments.roster.notStartedNote")}</p>
              )}

              <div className="flex lg:justify-end">
                {r.paperId ? (
                  <Link
                    href={`/admin/theses/${r.paperId}`}
                    aria-label={t("assignments.roster.openPaperAria", { name: r.name })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-brand-300 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:ml-12 lg:ml-0"
                  >
                    {t("assignments.roster.openPaper")}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                ) : (
                  <span className="hidden lg:block lg:w-[7.5rem]" aria-hidden="true" />
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default RosterList;
