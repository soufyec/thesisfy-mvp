"use client";

import { CalendarClock, Flag } from "lucide-react";
import { useFormat, useLocale, useT } from "@/lib/i18n/client";
import { deadlineState } from "@/lib/deadline";
import { DEADLINE_TEXT, useDeadlineLabel } from "./ui";

interface Props {
  deadline?: string;
  wordCount: number;
  targetWords: number;
  createdAt?: string;
  /** Opens the deadline dialog (owner only). */
  onEdit?: () => void;
  className?: string;
}

const sameDay = (a: Date, y: number, m: number, day: number) => a.getFullYear() === y && a.getMonth() === m && a.getDate() === day;

/**
 * Tear-off calendar of the current month for the student's dashboard: past days crossed out, today ringed, the
 * days up to the deadline tinted and the deadline itself flagged. Under it, the days left and the words a day and
 * a week needed to reach the target on time. Same figures as the chips and the editor's session bar.
 */
export default function DeadlineCalendar({ deadline, wordCount, targetWords, createdAt, onEdit, className = "" }: Props) {
  const t = useT();
  const fmt = useFormat();
  const { tag } = useLocale();
  const label = useDeadlineLabel();
  const d = deadlineState(deadline, wordCount, targetWords, createdAt);
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const todayDay = today.getDate();
  const dl = deadline ? new Date(deadline) : null;
  const dlInMonth = !!dl && dl.getFullYear() === y && dl.getMonth() === m;
  const dlAfterMonth = !!dl && dl.getTime() > new Date(y, m + 1, 0, 23, 59, 59).getTime();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7; // Monday first
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(tag, { weekday: "narrow" }).format(new Date(2024, 0, 1 + i)));
  const cells: (number | null)[] = [...Array<null>(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const raw = fmt.date(today, { month: "long", year: "numeric" });
  const monthName = raw.charAt(0).toLocaleUpperCase(tag) + raw.slice(1);

  const cellClass = (day: number) => {
    const isToday = day === todayDay;
    const isDeadline = !!dl && sameDay(dl, y, m, day);
    const past = day < todayDay;
    const onRunway = !past && !isDeadline && ((dlInMonth && day < (dl as Date).getDate()) || dlAfterMonth);
    if (isDeadline) return "bg-brand-600 text-white font-semibold shadow-md shadow-brand-600/30";
    if (isToday) return "ring-2 ring-brand-600 text-brand-700 font-semibold";
    if (past) return "text-gray-400 day-crossed";
    if (onRunway) return "bg-brand-50 text-brand-700";
    return "text-gray-500";
  };

  return (
    <section className={`card overflow-hidden w-full lg:w-[280px] flex-shrink-0 ${className}`} aria-label={t("deadline.calendarAria", { month: monthName })}>
      <header className="flex items-center justify-between gap-2 px-4 py-2.5 bg-brand-600 text-white">
        <span className="text-sm font-semibold truncate">{monthName}</span>
        {dl && !dlInMonth ? (
          <span className="flex items-center gap-1 text-[11px] font-medium bg-white/15 rounded-[10px] px-2 py-0.5 whitespace-nowrap" title={t("deadline.due", { date: fmt.date(deadline as string) })}>
            <Flag className="w-3 h-3" />{fmt.date(deadline as string, { day: "numeric", month: "short" })}
          </span>
        ) : (
          <CalendarClock className="w-4 h-4 opacity-80" />
        )}
      </header>
      <div className="px-3 pt-3 pb-2">
        <div className="grid grid-cols-7 text-center text-[11px] uppercase text-gray-400 mb-1">
          {weekdays.map((w, i) => <span key={i}>{w}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center text-[12px]">
          {cells.map((day, i) =>
            day === null ? <span key={`e${i}`} /> : (
              <span key={day} className={`relative mx-auto flex h-7 w-7 items-center justify-center rounded-full ${cellClass(day)}`} aria-current={day === todayDay ? "date" : undefined}>
                {dl && sameDay(dl, y, m, day) ? <Flag className="w-3 h-3 absolute -top-1 -right-1" aria-hidden="true" /> : null}
                {day}
              </span>
            ),
          )}
        </div>
      </div>
      <div className="px-4 pt-3 pb-4 border-t border-gray-100">
        {d ? (
          <>
            <div className={`text-xl font-bold tracking-tight ${DEADLINE_TEXT[d.tone]}`}>{label(d)}</div>
            <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
              <span>{t("deadline.due", { date: fmt.date(deadline as string) })}</span>
              {onEdit && <button type="button" onClick={onEdit} className="text-brand-600 font-medium hover:underline">{t("deadline.change")}</button>}
            </div>
            {d.wordsLeft === 0 ? (
              <p className="text-xs text-green-600 font-medium mt-3">{t("deadline.paceDone")}</p>
            ) : d.daysLeft <= 0 ? (
              <p className="text-xs text-gray-500 mt-3">{t("deadline.wordsToGo", { n: fmt.number(d.wordsLeft) })}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="rounded-xl bg-gray-50 px-3 py-2">
                    <div className="text-base font-bold text-gray-900">{fmt.number(d.perDay)}</div>
                    <div className="text-[11px] text-gray-500">{t("deadline.perDayUnit")}</div>
                  </div>
                  <div className="rounded-xl bg-gray-50 px-3 py-2">
                    <div className="text-base font-bold text-gray-900">{fmt.number(d.perWeek)}</div>
                    <div className="text-[11px] text-gray-500">{t("deadline.perWeekUnit")}</div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">{t("deadline.wordsToGo", { n: fmt.number(d.wordsLeft) })}</p>
              </>
            )}
          </>
        ) : (
          <>
            <div className="text-sm font-semibold text-gray-900">{t("deadline.none")}</div>
            <p className="text-xs text-gray-500 mt-1">{t("deadline.calendarEmpty")}</p>
            {onEdit && <button type="button" onClick={onEdit} className="btn-primary !py-1.5 !px-3 text-xs mt-3">{t("deadline.add")}</button>}
          </>
        )}
      </div>
    </section>
  );
}
