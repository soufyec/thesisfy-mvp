/**
 * Client-side shapes and small helpers shared by the assignment screens (docs/papers.md §3.2, §4.3).
 * Pure module: no React, safe to import from any client component.
 */
import { daysUntil } from "@/lib/deadline";
import type { RosterCounts, RosterRow, StaffAssignmentView } from "@/lib/papers/views";

/** `GET /api/assignments` (staff) item: the stored assignment plus `createdByName`, `roster` and `counts`. */
export type StaffAssignment = StaffAssignmentView & { templateId?: string };

/** A student of the university as `GET /api/users` lists them (only the fields the picker needs). */
export interface StudentOption {
  id: string;
  name: string;
  email: string;
}

export const BRIEF_MAX = 8000;
export const TITLE_MAX = 200;
export const TARGET_MIN = 100;
export const TARGET_MAX = 200_000;
export const CITATION_STYLES = ["APA", "MLA", "Chicago", "IEEE", "Harvard"] as const;

/** Papers handed in: in review, or approved/submitted (the "X/N submitted" figure). */
export const handedIn = (c: RosterCounts) => c.inReview + c.done;

export const rosterTotal = (c: RosterCounts) => c.notStarted + c.inProgress + c.inReview + c.done;

/** Nobody has a paper yet, so the assignment can still be deleted. */
export const nobodyStarted = (a: Pick<StaffAssignment, "roster">) => a.roster.every((r) => !r.paperId);

/**
 * Order of the list (§4.3 "por plazo más cercano"): upcoming due dates first, nearest first; then past due dates,
 * most recent first; then assignments without a due date, newest first.
 */
export function byNearestDue(a: Pick<StaffAssignment, "deadline" | "createdAt">, b: Pick<StaffAssignment, "deadline" | "createdAt">): number {
  const rank = (x: Pick<StaffAssignment, "deadline">) => {
    const d = daysUntil(x.deadline);
    return d === null ? 2 : d >= 0 ? 0 : 1;
  };
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0) return Date.parse(a.deadline as string) - Date.parse(b.deadline as string);
  if (ra === 1) return Date.parse(b.deadline as string) - Date.parse(a.deadline as string);
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

/** Roster order: papers waiting for the teacher, then overdue, then in progress, not started, and finished last. */
export function rosterOrder(r: RosterRow): number {
  if (r.status === "under_review") return 0;
  if (r.overdue) return 1;
  if (r.status === "draft" || r.status === "in_progress" || r.status === "revision_requested") return 2;
  if (r.status === "not_started") return 3;
  return 4;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((p) => p && !/^(prof|dr|mr|mrs|ms)\.?$/i.test(p))
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
