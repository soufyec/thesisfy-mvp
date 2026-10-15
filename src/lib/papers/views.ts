/**
 * Response shapes shared by the assignment routes and the UI. Pure types: no runtime imports.
 * `src/components/editor/types.ts` re-exports them.
 */
import type { PaperKind } from "./kinds";

export type CitationStyle = "APA" | "MLA" | "Chicago" | "IEEE" | "Harvard";
export type PaperStatus = "draft" | "in_progress" | "under_review" | "revision_requested" | "approved" | "submitted";
export type AssignmentStatus = "open" | "closed";

/** What a student and the paper's staff see about an assignment (identical for both). */
export interface AssignmentView {
  id: string;
  title: string;
  brief: string;
  briefUpdatedAt?: string;
  kind: PaperKind;
  createdBy: string;
  createdByName: string;
  deadline?: string;
  targetWords?: number;
  citationStyle?: CitationStyle;
  status: AssignmentStatus;
  createdAt: string;
}

/** An assignment as listed for the student it was sent to. `paperId` once they started it. */
export interface StudentAssignmentView extends AssignmentView {
  paperId?: string;
}

export interface RosterRow {
  studentId: string;
  name: string;
  email: string;
  paperId?: string;
  status: "not_started" | PaperStatus;
  words: number;
  targetWords: number;
  aiUsagePercent: number;
  integrityScore: number;
  submittedAt?: string;
  late: boolean;
  overdue: boolean;
}

export interface RosterCounts {
  notStarted: number;
  inProgress: number;
  inReview: number;
  done: number;
}

/** An assignment as listed for its creator or the university admin. */
export interface StaffAssignmentView extends AssignmentView {
  university: string;
  studentIds: string[];
  updatedAt: string;
  roster: RosterRow[];
  counts: RosterCounts;
}

/** Compact assignment info attached to each paper in `GET /api/theses`. */
export interface PaperAssignmentInfo {
  id: string;
  title: string;
  createdByName: string;
  deadline?: string;
}

/** One top-level section (h2) of the Final submission with its word count. */
export interface PaperSection {
  title: string;
  words: number;
}
