"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Shield, X } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useT } from "@/lib/i18n/client";

const LINKS = [
  { href: "#model", label: "landing.nav.model" },
  { href: "#roles", label: "landing.nav.institutions" },
  { href: "#pilot", label: "landing.nav.pilot" },
];

export function Logo({ size = "nav" }: { size?: "nav" | "footer" }) {
  const t = useT();
  const box = size === "nav" ? "w-8 h-8 rounded-lg" : "w-6 h-6 rounded-md";
  const text = size === "nav" ? "text-[20px]" : "text-[16px]";
  return (
    <Link href="/" className={`inline-flex items-center gap-2 text-gray-900 font-bold ${text}`} aria-label={t("landing.nav.home")}>
      <span className={`${box} bg-gradient-to-br from-brand-600 to-accent-500 flex items-center justify-center flex-shrink-0`} aria-hidden="true">
        {size === "nav" && <Shield className="w-5 h-5 text-white" strokeWidth={2} />}
      </span>
      <span>
        Thesisfic<span className="text-brand-600">.edu</span>
      </span>
    </Link>
  );
}

const CTA = "inline-flex items-center justify-center px-4 py-[9px] rounded-[10px] bg-brand-600 text-white font-semibold text-[14px] hover:bg-brand-700 transition-colors shadow-[0_8px_16px_-6px] shadow-brand-600/45";

export default function LandingNav() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <nav className="sticky top-0 z-50 bg-white/85 backdrop-blur-xl border-b border-gray-100" aria-label={t("landing.nav.main")}>
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8 h-16 flex items-center justify-between gap-6">
        <Logo />
        <div className="hidden md:flex items-center gap-7 text-[14px] font-medium">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-gray-600 hover:text-gray-900 transition-colors">
              {t(l.label)}
            </a>
          ))}
          <Link href="/login" className="text-gray-600 hover:text-gray-900 transition-colors">
            {t("common.signIn")}
          </Link>
          <LanguageSwitcher variant="inline" />
          <a href="#pilot" className={CTA}>
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
          <Link href="/login" className="py-2 text-gray-600" onClick={() => setOpen(false)}>
            {t("common.signIn")}
          </Link>
          <LanguageSwitcher variant="inline" className="py-2" />
          <a href="#pilot" className={`${CTA} mt-2`} onClick={() => setOpen(false)}>
            {t("landing.nav.requestPilot")}
          </a>
        </div>
      )}
    </nav>
  );
}
