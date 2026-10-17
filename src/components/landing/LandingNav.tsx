"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useT } from "@/lib/i18n/client";

const LINKS = [
  { href: "#how", label: "landing.nav.how" },
  { href: "#data", label: "landing.nav.data" },
  { href: "#roles", label: "landing.nav.institutions" },
  { href: "/demo", label: "landing.nav.pilot" },
];

export { default as Logo } from "@/components/Logo";
import Logo from "@/components/Logo";

const CTA = "inline-flex items-center justify-center px-4 py-[9px] rounded-[10px] bg-brand-600 text-white font-semibold text-[14px] hover:bg-brand-700 transition-colors shadow-[0_8px_16px_-6px] shadow-brand-600/45";

export default function LandingNav() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <nav className="sticky top-0 z-50 bg-brand-50/85 backdrop-blur-xl border-b border-gray-100" aria-label={t("landing.nav.main")}>
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8 h-16 flex items-center justify-between gap-6">
        <Logo />
        {/* Section links only where they fit on one line in every language (German is the longest); the demo link
            is left out here because the button next to it already goes there. */}
        <div className="hidden md:flex items-center gap-5 xl:gap-6 text-[14px] font-medium">
          {LINKS.filter((l) => l.href !== "/demo").map((l) => (
            <a key={l.href} href={l.href} className="hidden xl:inline whitespace-nowrap text-gray-600 hover:text-gray-900 transition-colors">
              {t(l.label)}
            </a>
          ))}
          <LanguageSwitcher variant="inline" />
          <a href="/demo" className={`${CTA} whitespace-nowrap`}>
            {t("landing.nav.requestPilot")}
          </a>
        </div>
        <button
          type="button"
          className="md:hidden w-10 h-10 -mr-2 inline-flex items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? t("landing.nav.closeMenu") : t("landing.nav.openMenu")}
          aria-expanded={open}
          aria-controls="landing-menu"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>
      {open && (
        <div id="landing-menu" className="md:hidden border-t border-gray-100 bg-white px-5 py-4 flex flex-col gap-1 text-[14px] font-medium">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="py-2 text-gray-600" onClick={() => setOpen(false)}>
              {t(l.label)}
            </a>
          ))}
          <LanguageSwitcher variant="inline" className="py-2" />
          <a href="/demo" className={`${CTA} mt-2`} onClick={() => setOpen(false)}>
            {t("landing.nav.requestPilot")}
          </a>
        </div>
      )}
    </nav>
  );
}
