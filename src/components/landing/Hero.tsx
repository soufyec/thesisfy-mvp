"use client";

import { useRef } from "react";
import { ArrowRight, Shield } from "lucide-react";
import QualitySeal from "@/components/QualitySeal";
import HeroScene from "./HeroScene";
import HeroEditorPreview from "./HeroEditorPreview";

const BULLETS = [
  { dot: "bg-accent-500", text: "Consent-first, GDPR by design" },
  { dot: "bg-prov-ai", text: "No AI-probability guessing" },
  { dot: "bg-prov-paste", text: "AI costs billed to the institution" },
];

export default function Hero() {
  const heroRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  return (
    <section ref={heroRef} className="relative overflow-hidden px-5 sm:px-8 pt-12 lg:pt-[72px] pb-14">
      <div className="relative mx-auto max-w-[1200px] grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_104px] gap-8 items-start lg:min-h-[520px]">
        <HeroScene heroRef={heroRef} textRef={textRef} />

        {/* Seal column: above the copy under 1024px, on the right from 1024px */}
        <div className="relative z-[1] order-1 lg:order-2 flex flex-col items-center gap-1.5 w-full lg:w-[104px] lg:-mt-4 [&_figcaption]:hidden [&_svg]:w-20 [&_svg]:h-20 lg:[&_svg]:w-[100px] lg:[&_svg]:h-[100px]">
          <QualitySeal size={100} className="!gap-0" />
          <span className="text-[11px] font-semibold text-gray-900 text-center leading-[1.3]">Academic quality seal</span>
        </div>

        {/* Copy */}
        <div ref={textRef} className="relative z-[1] order-2 lg:order-1 min-w-0 max-w-[720px]">
          <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-brand-50 text-brand-700 text-[13px] font-semibold mb-7">
            <Shield className="w-3.5 h-3.5" strokeWidth={2.2} aria-hidden="true" />
            Academic integrity for the AI era
          </div>
          <h1 className="text-[36px] sm:text-[46px] lg:text-[58px] font-extrabold leading-[1.05] tracking-[-0.025em] mb-6 [text-wrap:pretty]">
            Evidence of the writing process, <span className="gradient-text">not suspicion</span> of the result.
          </h1>
          <p className="text-[17px] sm:text-[19px] leading-[1.6] text-gray-600 max-w-[560px] mb-9 [text-wrap:pretty]">
            Thesisfic attributes every sentence of a thesis as it is written: typed, quoted or AI-assisted. Advisors receive a provenance report. Students use the AI tools your policy allows, inside the editor, with their consent and under your budget.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="#pilot" className="btn-primary gap-2 !px-[26px] !py-[15px] !text-[16px] !shadow-[0_10px_20px_-8px] !shadow-brand-600/50">
              Request a pilot
              <ArrowRight className="w-[18px] h-[18px]" strokeWidth={2.2} aria-hidden="true" />
            </a>
            <a href="#model" className="btn-outline !px-[26px] !py-[15px] !text-[16px]">
              Read the integrity model
            </a>
          </div>
          <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-gray-500 list-none p-0 m-0">
            {BULLETS.map((b) => (
              <li key={b.text} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${b.dot}`} aria-hidden="true" />
                {b.text}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <HeroEditorPreview />
    </section>
  );
}
