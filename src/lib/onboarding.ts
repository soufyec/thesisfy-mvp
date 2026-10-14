import type { Locale } from "@/lib/i18n";
import { film } from "@/lib/films";

/** Student onboarding: shown once, at the first visit to the editor. `localStorage` remembers it on this device and
 *  `users.onboardedAt` on the account, so a second device does not repeat it. Replayable from the ⋯ menu. */
export const ONBOARDING_KEY = "onboarding_v1";

export type TourStepKey = "editor" | "integrity" | "model" | "feedback" | "tabs" | "citations";
export type TourPlacement = "below" | "left" | "right";

/** The six coachmarks, in the order the design fixes. Anchors are `data-tour` attributes on the real UI; `feedback`
 *  and `citations` fall back to toolbar buttons when the document has no advisor comment or pasted passage. */
export const TOUR_STEPS: { key: TourStepKey; place: TourPlacement }[] = [
  { key: "editor", place: "below" },
  { key: "integrity", place: "below" },
  { key: "model", place: "below" },
  { key: "feedback", place: "left" },
  { key: "tabs", place: "below" },
  { key: "citations", place: "right" },
];

export interface OnboardingVideo {
  /** MP4 (H.264 + AAC). `null` shows the chapter placeholder instead of a player. */
  src: string | null;
  poster: string | null;
  /** WebVTT subtitles in the same language as the narration. */
  captions: string | null;
  /** Total length in seconds, for the badge and the chapter bar. */
  duration: number;
  /** Chapter start times in seconds; labels come from `onboarding.chapter.*`. */
  chapters: { at: number; label: "why" | "writing" | "assistant" | "ledger" | "advisor" }[];
}

const chapters = (writing: number, assistant: number, ledger: number, advisor: number): OnboardingVideo["chapters"] => [
  { at: 0, label: "why" },
  { at: writing, label: "writing" },
  { at: assistant, label: "assistant" },
  { at: ledger, label: "ledger" },
  { at: advisor, label: "advisor" },
];

const student = (locale: Locale) => film("student", locale);

/** The students' film (`src/lib/films.ts`), narrated in each UI language. Chapter marks are the starts of the
 *  editor, Research copilot, integrity ledger and advisor scenes, printed by the render pipeline with the durations.
 *  Set `src` to `null` to fall back to the chapter placeholder. */
export const ONBOARDING_VIDEO: Record<Locale, OnboardingVideo> = {
  en: { ...student("en"), chapters: chapters(33, 41, 73, 80) },
  es: { ...student("es"), chapters: chapters(31, 39, 69, 76) },
  fr: { ...student("fr"), chapters: chapters(33, 40, 66, 73) },
  de: { ...student("de"), chapters: chapters(35, 42, 75, 83) },
};

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function readOnboardingDone(): boolean {
  try { return localStorage.getItem(ONBOARDING_KEY) === "done"; } catch { return false; }
}

export function writeOnboardingDone() {
  try { localStorage.setItem(ONBOARDING_KEY, "done"); } catch { /* private mode */ }
}
