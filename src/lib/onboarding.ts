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

const chapters = (assistant: number, ledger: number, advisor: number): OnboardingVideo["chapters"] => [
  { at: 0, label: "writing" },
  { at: assistant, label: "assistant" },
  { at: ledger, label: "ledger" },
  { at: advisor, label: "advisor" },
];

const files = (locale: Locale) => ({ src: `/videos/tour-${locale}.mp4`, poster: `/videos/tour-${locale}.jpg`, captions: `/videos/tour-${locale}.vtt` });

/** One video per UI language, narrated in that language (see `docs/academy/tour.md`; regenerate with
 *  `scripts/academy/make-tour.sh`, which prints these durations and chapter marks). Set `src` to `null` to fall
 *  back to the chapter placeholder. */
export const ONBOARDING_VIDEO: Record<Locale, OnboardingVideo> = {
  en: { ...files("en"), duration: 93, chapters: chapters(33, 63, 73) },
  es: { ...files("es"), duration: 85, chapters: chapters(29, 58, 68) },
  fr: { ...files("fr"), duration: 107, chapters: chapters(32, 64, 74) },
  // No German narration yet: German users get the English tour until `make-tour.sh` produces tour-de.*.
  de: { ...files("en"), duration: 93, chapters: chapters(33, 63, 73) },
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
