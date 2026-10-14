import Image from "next/image";
import { Check, Plug } from "lucide-react";
import LandingNav, { Logo } from "@/components/landing/LandingNav";
import QualitySeal from "@/components/QualitySeal";
import Hero from "@/components/landing/Hero";
import HowItWorks from "@/components/landing/HowItWorks";
import TrialForm from "@/components/landing/TrialForm";
import Reveal from "@/components/landing/Reveal";
import StatTiles from "@/components/landing/StatTiles";
import { getT } from "@/lib/i18n/server";

const CARD = "bg-white rounded-2xl border border-gray-100 shadow-sm p-7";

export default function LandingPage() {
  const t = getT();

  const roles = [
    { who: t("landing.role.teacher.who"), chip: "bg-brand-50 text-brand-700", title: t("landing.role.teacher.title"), items: [1, 2, 3].map((i) => t(`landing.role.teacher.item${i}`)) },
    { who: t("landing.role.student.who"), chip: "bg-prov-ai-soft text-prov-ai-deep", title: t("landing.role.student.title"), items: [1, 2, 3].map((i) => t(`landing.role.student.item${i}`)) },
    { who: t("landing.role.institution.who"), chip: "bg-accent-50 text-accent-700", title: t("landing.role.institution.title"), items: [1, 2, 3].map((i) => t(`landing.role.institution.item${i}`)) },
  ];

  const footerLinks = [
    { href: "#how", label: t("landing.footer.model") },
    { href: "#how", label: t("landing.footer.data") },
    { href: "#how", label: t("landing.footer.privacy") },
    { href: "#trial", label: t("landing.footer.contact") },
  ];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <LandingNav />

      <Hero />

      {/* Integrated with the institution's digital workspace (ENT) */}
      <section id="ent" className="px-5 sm:px-8 pb-16 scroll-mt-16 bg-brand-light">
        <Reveal><div className="mx-auto max-w-[1200px] rounded-2xl border border-brand-100 bg-brand-50 p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-6 items-center">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 text-[12px] font-bold tracking-[0.14em] uppercase text-brand-700 mb-3">
              <Plug className="w-4 h-4" strokeWidth={2.2} aria-hidden="true" />
              {t("landing.ent.kicker")}
            </div>
            <h2 className="font-display text-[22px] sm:text-[26px] font-bold leading-[1.25] tracking-[-0.01em] mb-3 [text-wrap:balance]">{t("landing.ent.title")}</h2>
            <p className="text-[15px] leading-[1.6] text-gray-700 m-0 [text-wrap:pretty]">{t("landing.ent.body")}</p>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-3 rounded-xl bg-white border border-brand-100 shadow-sm px-4 py-3">
                {/* Official Moodle wordmark (Moodle Pty Ltd trademark), shown to name the platform the tool is tested with. */}
                <Image src="/logos/moodle.svg" alt={t("landing.ent.moodleAlt")} width={117} height={30} className="h-7 w-auto" />
                <span className="text-[12px] font-semibold text-gray-700 border-l border-gray-200 pl-3">{t("landing.ent.tested")}</span>
              </span>
              <span className="inline-flex items-center rounded-xl bg-white border border-brand-100 shadow-sm px-4 py-3 text-[14px] font-bold tracking-[-0.01em] text-gray-900">{t("landing.ent.standard")}</span>
            </div>
            <div className="text-[13px] text-gray-700 lg:text-right max-w-[460px]">
              <span className="font-semibold">{t("landing.ent.others")}</span>
              <span className="block text-gray-500 mt-0.5">{t("landing.ent.othersNote")}</span>
            </div>
          </div>
        </div></Reveal>
      </section>

      {/* The evidence: published figures with their sources */}
      <section id="data" className="py-20 px-5 sm:px-8 bg-gray-50 scroll-mt-16">
        <div className="mx-auto max-w-[1200px]">
          <Reveal className="text-center mb-12">
            <h2 className="font-display text-[30px] sm:text-[36px] font-bold tracking-[-0.01em] mb-3 [text-wrap:balance]">{t("landing.data.title")}</h2>
            <p className="text-[16px] text-gray-600 max-w-[600px] mx-auto">{t("landing.data.subtitle")}</p>
          </Reveal>
          <Reveal delay={120}><StatTiles /></Reveal>
          <Reveal><p className="mt-10 mx-auto max-w-[720px] text-center text-[17px] leading-[1.6] text-gray-800 [text-wrap:pretty]">{t("landing.data.takeaway")}</p></Reveal>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-20 px-5 sm:px-8 bg-white scroll-mt-16">
        <div className="mx-auto max-w-[1200px]">
          <Reveal className="text-center mb-14">
            <h2 className="font-display text-[30px] sm:text-[36px] font-bold tracking-[-0.01em] mb-3">
              {t("landing.how.titleA")}
              <span className="gradient-text">{t("landing.how.titleHi")}</span>
              {t("landing.how.titleB")}
            </h2>
            <p className="text-[16px] text-gray-600 max-w-[600px] mx-auto">{t("landing.how.subtitle")}</p>
          </Reveal>
          <Reveal delay={120}><HowItWorks /></Reveal>
        </div>
      </section>

      {/* Three readers */}
      <section id="roles" className="py-20 px-5 sm:px-8 bg-gray-50 scroll-mt-16">
        <div className="mx-auto max-w-[1200px]">
          <Reveal className="text-center mb-14">
            <h2 className="font-display text-[30px] sm:text-[36px] font-bold tracking-[-0.01em]">{t("landing.roles.title")}</h2>
          </Reveal>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {roles.map((r, i) => (
              <Reveal key={r.who} delay={i * 130} className="flex"><article className={`${CARD} w-full`}>
                <div className={`inline-flex px-2.5 py-1 rounded-full text-[12px] font-semibold mb-3.5 ${r.chip}`}>{r.who}</div>
                <h3 className="font-display text-[20px] font-semibold leading-[1.3] tracking-[-0.01em] mb-3.5">{r.title}</h3>
                <ul className="flex flex-col gap-2.5 text-[14px] leading-[1.55] text-gray-600 list-none p-0 m-0">
                  {r.items.map((it) => (
                    <li key={it} className="flex gap-2.5">
                      <Check className="w-4 h-4 text-accent-500 flex-shrink-0 mt-[3px]" strokeWidth={2.4} aria-hidden="true" />
                      {it}
                    </li>
                  ))}
                </ul>
              </article></Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 7-day trial */}
      {/* Academic quality seal: what the seal certifies and why it tells institutions apart today */}
      <section id="seal" className="py-20 px-5 sm:px-8 scroll-mt-16">
        <Reveal><div className="mx-auto max-w-[1200px] grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] gap-10 md:gap-14 items-center">
          <div className="flex justify-center"><QualitySeal size={200} /></div>
          <div className="min-w-0 max-w-[640px]">
            <div className="text-[12px] font-bold tracking-[0.14em] uppercase text-brand-600 mb-3">{t("landing.sealSection.kicker")}</div>
            <h2 className="text-[28px] sm:text-[36px] font-bold leading-[1.15] tracking-[-0.02em] mb-4 [text-wrap:balance]">{t("landing.sealSection.title")}</h2>
            <p className="text-[16px] sm:text-[17px] leading-[1.65] text-gray-600 m-0 [text-wrap:pretty]">{t("landing.sealSection.body")}</p>
          </div>
        </div></Reveal>
      </section>

      <section id="trial" className="px-5 sm:px-8 pt-10 pb-24 scroll-mt-16">
        <Reveal><div className="mx-auto max-w-[1200px] bg-brand-dark text-white rounded-3xl p-7 sm:p-10 lg:p-14 grid grid-cols-1 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] gap-10 lg:gap-12 items-center">
          <div>
            <div className="text-[12px] font-bold tracking-[0.14em] uppercase text-brand-200 mb-4">{t("landing.trial.eyebrow")}</div>
            <h2 className="font-display text-[30px] sm:text-[36px] leading-[1.15] font-bold tracking-[-0.01em] mb-4 [text-wrap:pretty]">{t("landing.trial.title")}</h2>
            <p className="text-[16px] leading-[1.6] text-brand-100 max-w-[520px] [text-wrap:pretty]">{t("landing.trial.body")}</p>
          </div>
          <TrialForm />
        </div></Reveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-gray-50 px-5 sm:px-8 py-8 text-[13px] text-gray-500">
        <div className="mx-auto max-w-[1200px] flex flex-wrap items-center justify-between gap-6">
          <Logo size="footer" />
          <nav className="flex flex-wrap gap-6" aria-label={t("landing.footer.nav")}>
            {footerLinks.map((l) => (
              <a key={l.label} href={l.href} className="hover:text-gray-900 transition-colors">
                {l.label}
              </a>
            ))}
          </nav>
          <span>© 2026 Thesisfic</span>
        </div>
      </footer>
    </div>
  );
}
