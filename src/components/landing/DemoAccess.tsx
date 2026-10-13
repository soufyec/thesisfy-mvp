"use client";

import Link from "next/link";
import { ArrowRight, Building2, GraduationCap, Presentation } from "lucide-react";
import { useT } from "@/lib/i18n/client";

const ROLES = [
  { id: "professor", icon: Presentation, label: "landing.demo.teacher", sub: "landing.demo.teacherSub" },
  { id: "student", icon: GraduationCap, label: "landing.demo.student", sub: "landing.demo.studentSub" },
  { id: "admin", icon: Building2, label: "landing.demo.admin", sub: "landing.demo.adminSub" },
] as const;

/** The demo card of the landing: one entry per role, each signs into the shared demo account and opens its workspace. */
export default function DemoAccess() {
  const t = useT();
  const enabled = process.env.NEXT_PUBLIC_DEMO_ACCOUNTS !== "off";
  return (
    <div className="bg-white text-gray-900 rounded-2xl p-6 sm:p-7 shadow-[0_25px_50px_-12px] shadow-black/25 flex flex-col gap-3">
      <div className="text-[13px] font-semibold text-gray-700 mb-1">{t("landing.demo.cardTitle")}</div>
      {enabled ? (
        ROLES.map(({ id, icon: Icon, label, sub }) => (
          <Link
            key={id}
            href={`/login?demo=${id}`}
            className="group flex items-center gap-3.5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 hover:border-brand-300 hover:bg-brand-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          >
            <span className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 text-brand-700" aria-hidden="true">
              <Icon className="w-[18px] h-[18px]" strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold text-gray-900">{t(label)}</span>
              <span className="block text-[12px] leading-[1.4] text-gray-500">{t(sub)}</span>
            </span>
            <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-brand-600 transition-colors flex-shrink-0" aria-hidden="true" />
          </Link>
        ))
      ) : (
        <Link href="/login" className="btn-primary">
          {t("landing.demo.signIn")}
        </Link>
      )}
      <p className="text-[12px] leading-[1.5] text-gray-500 m-0 mt-1">{t("landing.demo.note")}</p>
    </div>
  );
}
