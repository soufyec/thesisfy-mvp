"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, Info, Star } from "lucide-react";
import { accessUrl } from "@/lib/library";
import { useT } from "@/lib/i18n/client";

export interface ResearchDb {
  id: string;
  name: string;
  url: string;
  loginUrl?: string;
  description: string;
  subjects: string[];
  access: "sso" | "proxy" | "vpn" | "campus" | "open" | "personal";
  instructions?: string;
  featured: boolean;
  opens?: number;
}

const ACCESS_STYLE: Record<ResearchDb["access"], string> = {
  sso: "bg-brand-50 text-brand-700",
  proxy: "bg-purple-50 text-purple-700",
  vpn: "bg-amber-50 text-amber-800",
  campus: "bg-amber-50 text-amber-800",
  open: "bg-green-50 text-green-700",
  personal: "bg-gray-100 text-gray-700",
};

export function recordOpen(id: string) {
  try {
    const blob = new Blob(["{}"], { type: "application/json" });
    if (!navigator.sendBeacon?.(`/api/research-databases/${id}`, blob)) fetch(`/api/research-databases/${id}`, { method: "POST", keepalive: true }).catch(() => {});
  } catch {
    /* counting is best effort */
  }
}

export default function DatabaseCard({ d, university, proxyPrefix, compact = false, admin }: { d: ResearchDb; university: string; proxyPrefix?: string; compact?: boolean; admin?: React.ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const info = {
    label: t(`dashboard.library.access.${d.access}.label`),
    short: t(`dashboard.library.access.${d.access}.short`),
    how: (u: string) => t(`dashboard.library.access.${d.access}.how`, { university: u }),
  };
  const href = accessUrl(d, proxyPrefix);
  const steps = d.instructions || info.how(university);

  if (compact) {
    return (
      <div className="rounded-xl border border-gray-100 hover:border-gray-200 p-2.5 text-xs">
        <div className="flex items-center gap-2">
          <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => recordOpen(d.id)} className="font-semibold text-gray-800 hover:text-brand-700 flex items-center gap-1 min-w-0">
            <span className="truncate">{d.name}</span>
            <ExternalLink className="w-3 h-3 flex-shrink-0 text-gray-400" />
          </a>
          <span className={`ml-auto badge !text-[10px] flex-shrink-0 ${ACCESS_STYLE[d.access]}`}>{info.short}</span>
        </div>
        <button onClick={() => setOpen((o) => !o)} className="mt-1 text-[11px] text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <Info className="w-3 h-3" />{t("dashboard.library.howSignIn")}
        </button>
        {open && <p className="mt-1 text-[11px] text-gray-600 whitespace-pre-wrap">{steps}</p>}
      </div>
    );
  }

  return (
    <article className="card p-4 sm:p-5 flex flex-col gap-3 min-w-0">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gray-900 text-white flex items-center justify-center font-bold flex-shrink-0" aria-hidden="true">
          {d.name.replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-tight flex items-center gap-1.5">
            {d.name}
            {d.featured && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" aria-label={t("dashboard.library.recommended")} />}
          </h3>
          <div className="flex flex-wrap gap-1 mt-1">
            <span className={`badge !text-[11px] ${ACCESS_STYLE[d.access]}`}>{info.label}</span>
            {d.subjects.map((s) => (
              <span key={s} className="badge !text-[11px] bg-gray-50 text-gray-600">{s}</span>
            ))}
          </div>
        </div>
        {admin}
      </div>
      {d.description && <p className="text-sm text-gray-600">{d.description}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-2">
        <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => recordOpen(d.id)} className="btn-primary !py-2 !px-4 text-sm">
          {d.access === "open" ? t("common.open") : t("dashboard.library.openSignIn")}
          <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
        </a>
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1 px-2 py-2">
          {t("dashboard.library.howAccess")}
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {typeof d.opens === "number" && <span className="ml-auto text-[11px] text-gray-400 font-mono">{d.opens === 1 ? t("dashboard.library.opens_one") : t("dashboard.library.opens", { n: d.opens })}</span>}
      </div>
      {open && (
        <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-wrap">
          {steps}
          {d.instructions && <div className="mt-2 text-xs text-gray-500">{info.label}: {info.how(university)}</div>}
        </div>
      )}
    </article>
  );
}
