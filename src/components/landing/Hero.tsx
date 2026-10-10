"use client";

import { useRef } from "react";
import { ArrowRight, GraduationCap } from "lucide-react";
import QualitySeal from "@/components/QualitySeal";
import HeroScene from "./HeroScene";
import ClassroomScene from "./ClassroomScene";
import HeroEditorPreview from "./HeroEditorPreview";
import { useT } from "@/lib/i18n/client";

const BULLETS = [
  { dot: "bg-accent-500", text: "landing.hero.bullet1" },
  { dot: "bg-prov-ai", text: "landing.hero.bullet2" },
  { dot: "bg-prov-paste", text: "landing.hero.bullet3" },
  { dot: "bg-brand-500", text: "landing.hero.bullet4" },
];

export default function Hero() {
  const t = useT();
  const heroRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  return (
    <section ref={heroRef} className="relative overflow-hidden px-5 sm:px-8 pt-12 lg:pt-[72px] pb-14">
      <div className="relative mx-auto max-w-[1200px] grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_104px] gap-8 items-start lg:min-h-[560px]">
        <HeroScene heroRef={heroRef} textRef={textRef} />
        {/* Desktop: the classroom sits low in the left column, under the copy and clear of the orbit on the right */}
        <div className="hidden md:block absolute left-0 bottom-0 w-[50%] max-w-[640px] h-[230px] pointer-events-none opacity-[0.6]" aria-hidden="true">
          <ClassroomScene className="w-full h-full" />
        </div>

        {/* Seal: on the right from 768px; on phones it sits inside the orbital scene below the copy */}
        <div className="relative z-[1] order-2 hidden md:flex flex-col items-center gap-1.5 w-full lg:w-[104px] lg:-mt-4 [&_figcaption]:hidden [&_svg]:w-20 [&_svg]:h-20 lg:[&_svg]:w-[100px] lg:[&_svg]:h-[100px]">
          <QualitySeal size={100} className="!gap-0" />
          <span className="text-[11px] font-semibold text-gray-900 text-center leading-[1.3]">{t("glossary.qualitySeal")}</span>
        </div>

        {/* Copy */}
        <div ref={textRef} className="relative z-[1] order-1 min-w-0 max-w-[720px] md:pb-[230px]">
          <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-brand-50 text-brand-700 text-[13px] font-semibold mb-6">
            <GraduationCap className="w-4 h-4" strokeWidth={2.2} aria-hidden="true" />
            {t("landing.hero.badge")}
          </span>
          <h1 className="text-[36px] sm:text-[46px] lg:text-[58px] font-extrabold leading-[1.05] tracking-[-0.025em] mb-6 mt-0 [text-wrap:pretty]">
            {t("landing.hero.titleA")}
            <span className="hero-properly gradient-text">{t("landing.hero.titleHi")}</span>
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

      {/* Phones: the classroom gets its own band under the bullets, before the orbit */}
      <div className="md:hidden mt-6 -mx-5 h-[190px] opacity-[0.7]" aria-hidden="true">
        <ClassroomScene className="w-full h-full" />
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
