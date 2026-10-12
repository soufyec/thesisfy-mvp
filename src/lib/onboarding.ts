import type { Locale } from "@/lib/i18n";

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
  chapters: { at: number; label: "writing" | "assistant" | "ledger" | "advisor" }[];
}

const CHAPTERS: OnboardingVideo["chapters"] = [
  { at: 0, label: "writing" },
  { at: 50, label: "assistant" },
  { at: 100, label: "ledger" },
  { at: 130, label: "advisor" },
];

/** One video per UI language, narrated in that language. Files live in `public/videos/`; until a file exists its
 *  entry stays `null` and the modal shows the chapter placeholder. */
export const ONBOARDING_VIDEO: Record<Locale, OnboardingVideo> = {
  en: { src: null, poster: null, captions: null, duration: 160, chapters: CHAPTERS },
  es: { src: null, poster: null, captions: null, duration: 160, chapters: CHAPTERS },
  fr: { src: null, poster: null, captions: null, duration: 160, chapters: CHAPTERS },
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
