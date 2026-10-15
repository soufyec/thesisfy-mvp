/**
 * Client shape of `GET /api/theses` (docs/papers.md §3.1) and the small pure helpers that My papers, the dashboard
 * home and the Research copilot page share: which paper is "current", the Continue picks, progress and brief previews.
 * Every paper field added for papers is optional here, so an older server response still renders.
 */
import type { PaperAssignmentInfo, PaperKind, PaperSection, PaperStatus, StudentAssignmentView, TeacherLabel, WritingLanguage } from "@/components/editor/types";

export interface PaperListItem {
  id: string;
  title: string;
  description: string;
  status: PaperStatus;
  wordCount: number;
  targetWords: number;
  aiUsagePercent: number;
  integrityScore: number;
  deadline?: string;
  citationStyle?: string;
  createdAt?: string;
  updatedAt: string;
  professorId?: string;
  professorName: string;
  openFlags: number;
  sessionCount: number;
  sourceCount?: number;
  referenceCount?: number;
  kind?: PaperKind;
  assignmentId?: string;
  assignment?: PaperAssignmentInfo;
  lastWorkedAt?: string;
  submittedAt?: string;
  late?: boolean;
  teacherLabel?: TeacherLabel;
  sections?: PaperSection[];
  writingLanguage?: WritingLanguage;
}

export interface PapersResponse {
  theses: PaperListItem[];
  /** Students only: assignments sent to them that they have not started yet. */
  assignments?: StudentAssignmentView[];
}

/** Approved or submitted: read-only, shown under "Completed". */
export const COMPLETED_STATUSES: ReadonlyArray<PaperStatus> = ["approved", "submitted"];
export const isCompleted = (p: Pick<PaperListItem, "status">) => COMPLETED_STATUSES.includes(p.status);

/** Latest activity: the server's `lastWorkedAt` (sessions included) or, from an older server, `updatedAt`. */
export const lastWorked = (p: Pick<PaperListItem, "lastWorkedAt" | "updatedAt">) => p.lastWorkedAt || p.updatedAt;

const time = (iso: string | undefined) => {
  const n = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(n) ? 0 : n;
};

/** Most recent activity first. */
export const byLastWorked = (a: PaperListItem, b: PaperListItem) => time(lastWorked(b)) - time(lastWorked(a));

/** "Currently working on": the open paper worked on last; a completed one only when nothing else is open. */
export function currentPaper(papers: PaperListItem[]): PaperListItem | undefined {
  const open = papers.filter((p) => !isCompleted(p)).sort(byLastWorked);
  return open[0] || [...papers].sort(byLastWorked)[0];
}

/** Continue row: up to `n` open papers, those with a revision requested first, then by latest activity. */
export function continuePicks(papers: PaperListItem[], n = 2): PaperListItem[] {
  const rank = (p: PaperListItem) => (p.status === "revision_requested" ? 0 : 1);
  return papers.filter((p) => !isCompleted(p)).sort((a, b) => rank(a) - rank(b) || byLastWorked(a, b)).slice(0, n);
}

/** Share of the word target, 0–100. A missing or zero target reads 0, never NaN or Infinity. */
export function progressPct(words: number, target: number): number {
  if (!Number.isFinite(words) || !Number.isFinite(target) || target <= 0 || words <= 0) return 0;
  return Math.min(100, Math.round((words / target) * 100));
}

/** Plain-text preview of a brief written in limited Markdown (headings, emphasis, links and list marks removed). */
export function briefPreview(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/[*_`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Focus ring shared by the controls of these pages (CLAUDE.md §7: visible focus). */
export const FOCUS_RING = "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2";
