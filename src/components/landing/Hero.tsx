"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import QualitySeal from "@/components/QualitySeal";
import HeroScene from "./HeroScene";
import FallingPapers from "./FallingPapers";
import HeroEditorPreview from "./HeroEditorPreview";
import { useT } from "@/lib/i18n/client";

const BULLETS = [
  { dot: "bg-accent-500", text: "landing.hero.bullet1" },
  { dot: "bg-prov-ai", text: "landing.hero.bullet2" },
  { dot: "bg-prov-paste", text: "landing.hero.bullet3" },
  { dot: "bg-brand-500", text: "landing.hero.bullet4" },
];

const HI_WORDS = ["landing.hero.titleHi", "landing.hero.titleHi2", "landing.hero.titleHi3", "landing.hero.titleHi4"] as const;
const FIRST_SWAP_MS = 3600; // after the fly-in of the first word has settled
const SWAP_EVERY_MS = 2600;

/** The highlighted word of the headline: "properly" arrives, then ethically / critically / responsibly take turns.
 *  The leaving word drops out downwards while the next one comes down from above. All words are stacked in one
 *  grid cell so the headline keeps the width of the longest word and never reflows. */
function RotatingWord() {
  const t = useT();
  const [idx, setIdx] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
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
  return (
    <span className="hero-properly hero-rotate" aria-live="off">
      {HI_WORDS.map((k, i) => (
        <span
          key={k}
          className={`hero-rotate-word gradient-text${i === idx ? " is-in" : i === prev ? " is-out" : ""}`}
          aria-hidden={i !== idx}
        >
          {t(k)}
        </span>
      ))}
    </span>
  );
}

export default function Hero() {
  const t = useT();
  const heroRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  return (
    <section ref={heroRef} className="relative overflow-hidden px-5 sm:px-8 pt-12 lg:pt-[72px] pb-14">
      <div className="relative mx-auto max-w-[1200px] grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_104px] gap-8 items-start lg:min-h-[560px]">
        {/* Papers fall through the copy column and dissolve before its bottom; the orbit keeps the right */}
        <FallingPapers />
        <HeroScene heroRef={heroRef} textRef={textRef} />

        {/* Seal: on the right from 768px; on phones it sits inside the orbital scene below the copy */}
        <div className="relative z-[1] order-2 hidden md:flex flex-col items-center gap-1.5 w-full lg:w-[104px] lg:-mt-4 [&_figcaption]:hidden [&_svg]:w-20 [&_svg]:h-20 lg:[&_svg]:w-[100px] lg:[&_svg]:h-[100px]">
          <QualitySeal size={100} className="!gap-0" />
          <span className="text-[11px] font-semibold text-gray-900 text-center leading-[1.3]">{t("glossary.qualitySeal")}</span>
        </div>

        {/* Copy */}
        <div ref={textRef} className="relative z-[1] order-1 min-w-0 max-w-[720px]">
          <h1 className="text-[36px] sm:text-[46px] lg:text-[58px] font-extrabold leading-[1.05] tracking-[-0.025em] mb-6 mt-2 [text-wrap:pretty]">
            {t("landing.hero.titleA")}
            <RotatingWord />
            {t("landing.hero.titleB")}
          </h1>
          <p className="text-[17px] sm:text-[19px] leading-[1.6] text-gray-600 max-w-[560px] mb-9 [text-wrap:pretty]">
            {t("landing.hero.body")}
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="#pilot" className="btn-primary gap-2 !px-[26px] !py-[15px] !text-[16px] !shadow-[0_10px_20px_-8px] !shadow-brand-600/50">
              {t("landing.hero.cta")}
              <ArrowRight className="w-[18px] h-[18px]" strokeWidth={2.2} aria-hidden="true" />
            </a>
            <a href="#how" className="btn-outline !px-[26px] !py-[15px] !text-[16px]">
              {t("landing.hero.ctaSecondary")}
            </a>
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

      {/* Phones: the orbital scene gets its own band under the copy, with the seal inside it */}
      <div className="md:hidden relative mt-6 h-[400px] -mx-5 overflow-hidden" aria-hidden="true">
        <HeroScene heroRef={heroRef} textRef={textRef} compact />
        <div className="absolute top-2 right-4 z-[1] flex flex-col items-center gap-1 [&_figcaption]:hidden [&_svg]:!w-[72px] [&_svg]:!h-[72px]">
          <QualitySeal size={72} className="!gap-0" />
          <span className="text-[10px] font-semibold text-gray-900 text-center leading-[1.3] max-w-[88px]">{t("glossary.qualitySeal")}</span>
        </div>
      </div>

      <HeroEditorPreview />
    </section>
  );
}
