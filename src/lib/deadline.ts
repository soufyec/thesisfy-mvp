/**
 * Thesis deadline arithmetic shared by the dashboard, the theses list and the editor.
 * Deadlines are stored as noon UTC of the chosen day, so the calendar day survives every time zone.
 */

export type DeadlineTone = "ok" | "soon" | "urgent" | "overdue";

export interface DeadlineState {
  /** Calendar days from today to the deadline; 0 today, negative when overdue. */
  daysLeft: number;
  tone: DeadlineTone;
  /** Words still missing to reach the target (never negative). */
  wordsLeft: number;
  /** Words a day needed to reach the target on time; equals `wordsLeft` once the deadline has passed. */
  perDay: number;
  perWeek: number;
  /** Share of the time between the thesis start and the deadline already spent (0–1). */
  elapsed: number;
}

const DAY = 86400000;

function localMidnight(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Days from today to `deadline` on the calendar; null when there is no valid deadline. */
export function daysUntil(deadline: string | undefined, now = new Date()): number | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((localMidnight(d) - localMidnight(now)) / DAY);
}

export function deadlineTone(daysLeft: number): DeadlineTone {
  if (daysLeft < 0) return "overdue";
  if (daysLeft <= 7) return "urgent";
  if (daysLeft <= 30) return "soon";
  return "ok";
}

export function deadlineState(deadline: string | undefined, wordCount: number, targetWords: number, createdAt?: string, now = new Date()): DeadlineState | null {
  const daysLeft = daysUntil(deadline, now);
  if (daysLeft === null) return null;
  const wordsLeft = Math.max(0, Math.round(targetWords - wordCount));
  const perDay = daysLeft > 0 ? Math.ceil(wordsLeft / daysLeft) : wordsLeft;
  const start = createdAt ? Date.parse(createdAt) : NaN;
  const end = Date.parse(deadline as string);
  const span = Number.isNaN(start) ? NaN : end - start;
  const elapsed = span > 0 ? Math.min(1, Math.max(0, (now.getTime() - start) / span)) : daysLeft < 0 ? 1 : 0;
  return { daysLeft, tone: deadlineTone(daysLeft), wordsLeft, perDay, perWeek: perDay * 7, elapsed };
}

/** `YYYY-MM-DD` for an `<input type="date">`, in the viewer's calendar. */
export function toDateInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The stored form of a date picked in the UI: noon UTC of that day. Empty input means no deadline. */
export function fromDateInput(value: string): string | undefined {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00.000Z` : undefined;
}
