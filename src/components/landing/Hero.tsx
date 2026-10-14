"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import HeroScene from "./HeroScene";
import FallingPapers from "./FallingPapers";
import HeroEditorPreview from "./HeroEditorPreview";
import FilmButton from "./FilmButton";
import { useT } from "@/lib/i18n/client";

const BULLETS = [
  { dot: "bg-accent-500", text: "landing.hero.bullet1" },
  { dot: "bg-prov-ai", text: "landing.hero.bullet2" },
  { dot: "bg-brand-500", text: "landing.hero.bullet4" },
];

const HI_WORDS = ["landing.hero.titleHi2", "landing.hero.titleHi3", "landing.hero.titleHi4"] as const;
const FIRST_SWAP_MS = 2600;
const SWAP_EVERY_MS = 2600;

/** The highlighted word of the headline: ethically / critically / responsibly take turns, the first one there from
 *  the first paint.
 *  The leaving word drops out downwards while the next one comes down from above. All words are stacked in one
 *  grid cell sized to the longest of them, and the cell is glued to the word before it, so the line breaks are
 *  the same whichever word is showing: nothing reflows on a phone when a long word replaces a short one. The
 *  full stop travels with each word. */
function RotatingWord() {
  const t = useT();
  const [idx, setIdx] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [width, setWidth] = useState<number | undefined>(undefined);
  const [glued, setGlued] = useState(true);
  // When the longest word does not fit the headline (German "verantwortungsvoll nutzt." on a phone), the cell takes
  // the full line and its words wrap instead of being clipped.
  const [wrap, setWrap] = useState(false);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const unitRef = useRef<HTMLSpanElement>(null);
  // Every string the measurement depends on: a language switch re-renders without a resize, so it must re-measure.
  const textKey = [t("landing.hero.titleA"), t("landing.hero.titleB"), ...HI_WORDS.map((k) => t(k))].join("|");
  useLayoutEffect(() => {
    const measure = () => {
      const unit = unitRef.current;
      const h1 = unit?.closest("h1");
      const words = wordRefs.current.filter(Boolean) as HTMLSpanElement[];
      // Natural one-line width of each word, whatever the current mode.
      const saved = words.map((el) => el.style.whiteSpace);
      words.forEach((el) => { el.style.whiteSpace = "nowrap"; });
      const natural = Math.max(0, ...words.map((el) => el.scrollWidth));
      words.forEach((el, i) => { el.style.whiteSpace = saved[i]; });
      const avail = h1 ? h1.clientWidth : natural;
      const tooWide = natural > avail - 2;
      setWrap(tooWide);
      if (natural) setWidth(tooWide ? avail : natural);
      // Glue the word before the cell to it only while the pair fits on one line of the headline.
      if (unit && h1 && !tooWide) {
        unit.style.whiteSpace = "nowrap";
        const fits = unit.getBoundingClientRect().right <= h1.getBoundingClientRect().right + 1;
        unit.style.whiteSpace = "";
        setGlued(fits);
      } else {
        setGlued(false);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => window.removeEventListener("resize", measure);
  }, [textKey]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      setPrev(i);
      i = (i + 1) % HI_WORDS.length;
      setIdx(i);
      timer = setTimeout(next, SWAP_EVERY_MS);
    };
    timer = setTimeout(next, FIRST_SWAP_MS);
    return () => clearTimeout(timer);
  }, []);
  // The word before the cell stays on its line ("AI, properly", "forma correcta", "façon correcte").
  const lead = t("landing.hero.titleA");
  const cut = lead.trimEnd().lastIndexOf(" ");
  const head = cut >= 0 ? lead.slice(0, cut + 1) : "";
  const glue = cut >= 0 ? lead.slice(cut + 1).trimEnd() : lead.trimEnd();
  return (
    <>
      {head}
      <span ref={unitRef} className={glued ? "whitespace-nowrap" : undefined}>
        {glue}{glued ? "\u00a0" : " "}
        <span className="hero-rotate" aria-live="off" style={width ? { width } : undefined}>
          {HI_WORDS.map((k, i) => (
            <span
              key={k}
              ref={(el) => { wordRefs.current[i] = el; }}
              className={`hero-rotate-word gradient-text${i === idx ? " is-in" : i === prev ? " is-out" : ""}`}
              style={wrap ? { whiteSpace: "normal", hyphens: "auto", overflowWrap: "anywhere" } : undefined}
              aria-hidden={i !== idx}
            >
              {t(k)}
              <span className="text-gray-900 ml-[0.08em]">{t("landing.hero.titleB")}</span>
            </span>
          ))}
        </span>
      </span>
    </>
  );
}

export default function Hero() {
  const t = useT();
  const heroRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  return (
    <section ref={heroRef} className="relative overflow-hidden px-5 sm:px-8 pt-12 lg:pt-[72px] pb-14">
      <div className="relative mx-auto max-w-[1200px] grid grid-cols-1 gap-8 items-start lg:min-h-[560px]">
        {/* Papers fall through the copy column and dissolve before its bottom; the orbit keeps the right */}
        <FallingPapers />
        <HeroScene heroRef={heroRef} textRef={textRef} />

        {/* Copy */}
        <div ref={textRef} className="relative z-[1] order-1 min-w-0 max-w-[720px]">
          <h1 className="text-[32px] min-[420px]:text-[36px] sm:text-[46px] lg:text-[58px] font-extrabold leading-[1.05] tracking-[-0.025em] mb-6 mt-2 [text-wrap:pretty]">
            <RotatingWord />
          </h1>
          <p className="text-[17px] sm:text-[19px] leading-[1.6] text-gray-600 max-w-[560px] mb-9 [text-wrap:pretty]">
            {t("landing.hero.body")}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a href="#trial" className="btn-primary gap-2 !px-[26px] !py-[15px] !text-[16px] !shadow-[0_10px_20px_-8px] !shadow-brand-600/50">
              {t("landing.hero.cta")}
              <ArrowRight className="w-[18px] h-[18px]" strokeWidth={2.2} aria-hidden="true" />
            </a>
            <a href="#how" className="btn-outline !px-[26px] !py-[15px] !text-[16px]">
              {t("landing.hero.ctaSecondary")}
            </a>
            <FilmButton which="teaser" label={t("landing.film.watch")} title={t("landing.film.teaserTitle")} />
          </div>
          <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-gray-500 list-none p-0 m-0">
            {BULLETS.map((b) => (
              <li key={b.text} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${b.dot}`} aria-hidden="true" />
                {t(b.text)}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Phones: the orbital scene gets its own band under the copy */}
      <div className="md:hidden relative mt-6 h-[400px] -mx-5 overflow-hidden" aria-hidden="true">
        <HeroScene heroRef={heroRef} textRef={textRef} compact />
      </div>

      <HeroEditorPreview />
    </section>
  );
}
