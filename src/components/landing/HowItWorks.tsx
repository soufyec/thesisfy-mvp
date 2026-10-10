"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";

/** The three things that happen inside an assignment, each with a small moving preview of the real feature. */

const MODES = ["outline", "critique", "explain", "gaps", "paraphrase_check", "citations"] as const;
const AI_PCT = 11;
const LIMIT = 25;
const SPLIT = { written: 74, quoted: 15, ai: 11 };

function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return setInView(true);
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && (setInView(true), io.disconnect()), { threshold: 0.2 });
    io.observe(el);
    const fallback = setTimeout(() => setInView(true), 3000);
    return () => { io.disconnect(); clearTimeout(fallback); };
  }, []);
  return { ref, inView };
}

function ModesPreview() {
  const t = useT();
  const [i, setI] = useState(1);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((n) => (n + 1) % MODES.length), 1700);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-[13px]">
      <div className="flex flex-wrap gap-1.5 mb-3" aria-hidden="true">
        {MODES.map((m, k) => (
          <span key={m} className={`px-2.5 py-1 rounded-[10px] text-[12px] font-medium transition-colors duration-300 ${k === i ? "bg-brand-600 text-white" : "bg-white text-gray-600 border border-gray-200"}`}>
            {t(`assistant.mode.${m}.label`)}
          </span>
        ))}
      </div>
      <div className="rounded-lg bg-white border border-gray-200 p-3">
        <div className="text-[11px] font-semibold text-gray-500 mb-1">{t("glossary.assistant")} · {t(`assistant.mode.${MODES[i]}.label`)}</div>
        <p className="m-0 text-gray-800 leading-[1.5]">{t("landing.how.modes.answer")}</p>
      </div>
    </div>
  );
}

function PolicyPreview() {
  const t = useT();
  const { ref, inView } = useInView<HTMLDivElement>();
  const rows = [
    [t("landing.how.policy.limit"), `${LIMIT}%`],
    [t("landing.how.policy.modes"), t("landing.how.policy.modesValue")],
    [t("landing.how.policy.paid"), t("landing.how.policy.paidValue")],
    [t("landing.how.policy.scopes"), t("landing.how.policy.scopesValue")],
  ];
  return (
    <div ref={ref} className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-[13px]">
      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.08em] mb-2">{t("landing.how.policy.title")}</div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 py-1.5 border-b border-gray-200 last:border-0">
          <span className="text-gray-600">{k}</span>
          <span className="font-semibold text-gray-900 text-right">{v}</span>
        </div>
      ))}
      <div className="mt-3 text-[12px] text-gray-600 flex justify-between"><span>{t("landing.how.policy.current", { pct: AI_PCT })}</span><span className="text-gray-400">{LIMIT}%</span></div>
      <div className="relative h-2 rounded-full bg-gray-200 mt-1 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-y-0 left-0 rounded-full bg-prov-ai land-bar" style={{ width: inView ? `${(AI_PCT / LIMIT) * 100}%` : "0%" }} />
      </div>
    </div>
  );
}

function ReportPreview() {
  const t = useT();
  const { ref, inView } = useInView<HTMLDivElement>();
  const rows = [
    [t("landing.how.report.interactions"), t("landing.how.report.interactionsValue")],
    [t("landing.how.report.declared"), "2"],
    [t("landing.how.report.notices"), "0"],
    [t("landing.how.report.time"), t("landing.how.report.timeValue")],
  ];
  const seg = (w: number, cls: string) => <div className={`h-full land-bar ${cls}`} style={{ width: inView ? `${w}%` : "0%" }} />;
  return (
    <div ref={ref} className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-[13px]">
      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.08em] mb-2">{t("landing.how.report.title")}</div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-200" aria-hidden="true">
        {seg(SPLIT.written, "bg-prov-human")}
        {seg(SPLIT.quoted, "bg-prov-paste")}
        {seg(SPLIT.ai, "bg-prov-ai")}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500 mt-1.5 mb-2">
        <span><span className="inline-block w-2 h-2 rounded-full bg-prov-human mr-1" />{t("landing.how.report.written")} {SPLIT.written}%</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-prov-paste mr-1" />{t("landing.how.report.quoted")} {SPLIT.quoted}%</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-prov-ai mr-1" />{t("landing.how.report.ai")} {SPLIT.ai}%</span>
      </div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 py-1.5 border-b border-gray-200 last:border-0">
          <span className="text-gray-600">{k}</span>
          <span className="font-semibold text-gray-900 text-right">{v}</span>
        </div>
      ))}
    </div>
  );
}

const CHIPS = ["bg-brand-50 text-brand-700", "bg-accent-50 text-accent-700", "bg-prov-ai-soft text-prov-ai-deep"];
const PREVIEWS = [ModesPreview, PolicyPreview, ReportPreview];

export default function HowItWorks() {
  const t = useT();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {[1, 2, 3].map((n, k) => {
        const Preview = PREVIEWS[k];
        return (
          <article key={n} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-7 flex flex-col gap-4 min-w-0">
            <div className={`inline-flex w-fit px-2.5 py-1 rounded-full text-[12px] font-semibold ${CHIPS[k]}`}>{t(`landing.how.${n}.kicker`)}</div>
            <h3 className="text-[20px] font-bold leading-[1.3] tracking-[-0.01em] m-0 [text-wrap:balance]">{t(`landing.how.${n}.title`)}</h3>
            <p className="text-[14px] leading-[1.65] text-gray-600 m-0 [text-wrap:pretty]">{t(`landing.how.${n}.body`)}</p>
            <div className="mt-auto pt-1"><Preview /></div>
          </article>
        );
      })}
    </div>
  );
}
