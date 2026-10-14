import type { Locale } from "@/lib/i18n";

/** The three narrated films, one per audience, each in the four UI languages (see `docs/academy/films.md`):
 *  - `student`: the first-time introduction in the editor (Léa's example, slogan for students);
 *  - `university`: the same story told to institutions, opened from the landing's trial section;
 *  - `teaser`: thirty seconds for the landing hero, without the product tour.
 *  Files live in `/public/videos` as `<name>-<locale>.{mp4,jpg,vtt}`: H.264 + AAC, a poster frame and WebVTT
 *  subtitles in the language of the narration. */
export type FilmKey = "student" | "university" | "teaser";

export interface Film {
  src: string;
  poster: string;
  captions: string;
  /** Length in seconds, for the badges. */
  duration: number;
}

const NAME: Record<FilmKey, string> = { student: "intro-student", university: "intro-university", teaser: "teaser" };

/** Printed by the render pipeline; update them together with the files. */
const DURATION: Record<FilmKey, Record<Locale, number>> = {
  student: { en: 92, es: 89, fr: 85, de: 96 },
  university: { en: 94, es: 91, fr: 86, de: 98 },
  teaser: { en: 32, es: 31, fr: 33, de: 33 },
};

export function film(key: FilmKey, locale: Locale): Film {
  const base = `/videos/${NAME[key]}-${locale}`;
  return { src: `${base}.mp4`, poster: `${base}.jpg`, captions: `${base}.vtt`, duration: DURATION[key][locale] };
}
