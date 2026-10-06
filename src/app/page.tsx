import { Check } from "lucide-react";
import LandingNav, { Logo } from "@/components/landing/LandingNav";
import Hero from "@/components/landing/Hero";
import PilotForm from "@/components/landing/PilotForm";
import { getT } from "@/lib/i18n/server";

const CARD = "bg-white rounded-2xl border border-gray-100 shadow-sm p-7";

export default function LandingPage() {
  const t = getT();

  const pillars = [1, 2, 3].map((n) => ({ n: `0${n}`, title: t(`landing.pillar${n}.title`), body: t(`landing.pillar${n}.body`) }));

  const roles = [
    { who: t("landing.role.integrity.who"), chip: "bg-brand-50 text-brand-700", title: t("landing.role.integrity.title"), items: [1, 2, 3].map((i) => t(`landing.role.integrity.item${i}`)) },
    { who: t("landing.role.advisor.who"), chip: "bg-accent-50 text-accent-700", title: t("landing.role.advisor.title"), items: [1, 2, 3].map((i) => t(`landing.role.advisor.item${i}`)) },
    { who: t("landing.role.student.who"), chip: "bg-prov-ai-soft text-prov-ai-deep", title: t("landing.role.student.title"), items: [1, 2, 3, 4].map((i) => t(`landing.role.student.item${i}`)) },
  ];

  const footerLinks = [
    { href: "#model", label: t("landing.footer.model") },
    { href: "#model", label: t("landing.footer.data") },
    { href: "#model", label: t("landing.footer.privacy") },
    { href: "#pilot", label: t("landing.footer.contact") },
  ];

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <LandingNav />

      <Hero />

      {/* Integrity model */}
      <section id="model" className="py-20 px-5 sm:px-8 bg-gray-50 scroll-mt-16">
        <div className="mx-auto max-w-[1200px]">
          <div className="text-center mb-14">
            <h2 className="text-[30px] sm:text-[36px] font-bold tracking-[-0.02em] mb-3">
              {t("landing.model.titleA")}
              <span className="gradient-text">{t("landing.model.titleHi")}</span>
            </h2>
            <p className="text-[16px] text-gray-600 max-w-[600px] mx-auto">{t("landing.model.subtitle")}</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {pillars.map((p) => (
              <article key={p.n} className={CARD}>
                <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-[15px] mb-[18px]" aria-hidden="true">
                  {p.n}
                </div>
                <h3 className="text-[17px] font-semibold mb-2">{p.title}</h3>
                <p className="text-[14px] leading-[1.65] text-gray-600 [text-wrap:pretty]">{p.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Three readers */}
      <section id="roles" className="py-20 px-5 sm:px-8 bg-white scroll-mt-16">
        <div className="mx-auto max-w-[1200px]">
          <div className="text-center mb-14">
            <h2 className="text-[30px] sm:text-[36px] font-bold tracking-[-0.02em]">{t("landing.roles.title")}</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {roles.map((r) => (
              <article key={r.who} className={CARD}>
                <div className={`inline-flex px-2.5 py-1 rounded-full text-[12px] font-semibold mb-3.5 ${r.chip}`}>{r.who}</div>
                <h3 className="text-[20px] font-bold leading-[1.3] tracking-[-0.01em] mb-3.5">{r.title}</h3>
                <ul className="flex flex-col gap-2.5 text-[14px] leading-[1.55] text-gray-600 list-none p-0 m-0">
                  {r.items.map((it) => (
                    <li key={it} className="flex gap-2.5">
                      <Check className="w-4 h-4 text-accent-500 flex-shrink-0 mt-[3px]" strokeWidth={2.4} aria-hidden="true" />
                      {it}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Pilot programme */}
      <section id="pilot" className="px-5 sm:px-8 pt-10 pb-24 scroll-mt-16">
        <div className="mx-auto max-w-[1200px] bg-gradient-to-br from-brand-600 to-brand-800 text-white rounded-3xl p-7 sm:p-10 lg:p-14 grid grid-cols-1 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] gap-10 lg:gap-12 items-center">
          <div>
            <div className="text-[12px] font-bold tracking-[0.14em] uppercase text-brand-200 mb-4">{t("landing.pilot.eyebrow")}</div>
            <h2 className="text-[30px] sm:text-[36px] leading-[1.15] font-bold tracking-[-0.02em] mb-4 [text-wrap:pretty]">{t("landing.pilot.title")}</h2>
            <p className="text-[16px] leading-[1.6] text-brand-100 max-w-[520px] [text-wrap:pretty]">
              {t("landing.pilot.body")}
            </p>
          </div>
          <PilotForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-5 sm:px-8 py-8 text-[13px] text-gray-500">
        <div className="mx-auto max-w-[1200px] flex flex-wrap items-center justify-between gap-6">
          <Logo size="footer" />
          <nav className="flex flex-wrap gap-6" aria-label={t("landing.footer.nav")}>
            {footerLinks.map((l) => (
              <a key={l.label} href={l.href} className="hover:text-gray-900 transition-colors">
                {l.label}
              </a>
            ))}
          </nav>
          <span>© 2026 Thesisfic.edu</span>
        </div>
      </footer>
    </div>
  );
}
