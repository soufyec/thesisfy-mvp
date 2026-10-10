"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FileText, Sparkles } from "lucide-react";
import { IntegrityPill } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

/**
 * A scripted preview of one assignment under the hero: the student writes, asks for a critique, inserts a
 * correction (its cost shown first), pastes a quote and attributes it, and the teacher gets the process. Five
 * steps on a loop; the dots below jump to a step. Under reduced motion the finished state is shown at rest.
 */

const AI_PCT = 11;
const LIMIT_PCT = 25;
const STEPS = [1, 2, 3, 4, 5] as const;
type Step = (typeof STEPS)[number];
const HOLD: Record<Step, number> = { 1: 0, 2: 2800, 3: 3000, 4: 3000, 5: 3600 };
const CHAR_MS = 18;

const LEGEND = [
  { label: "landing.preview.legend.written", bar: "bg-prov-human" },
  { label: "landing.preview.legend.ai", bar: "bg-prov-ai" },
  { label: "glossary.quotedOrPasted", bar: "bg-prov-paste" },
];

function Gutter({ tag, tone }: { tag: string; tone: "human" | "ai" | "paste" }) {
  const text = tone === "ai" ? "text-prov-ai font-bold" : tone === "paste" ? "text-prov-paste-deep font-bold" : "text-gray-400";
  const bar = tone === "ai" ? "bg-prov-ai" : tone === "paste" ? "bg-prov-paste" : "bg-prov-human";
  return (
    <span className={`absolute -left-10 top-1 bottom-1 flex gap-[5px] font-sans text-[10px] leading-none ${text}`} aria-hidden="true">
      <span>{tag}</span>
      <span className={`w-[3px] rounded-sm ${bar}`} />
    </span>
  );
}

export default function HeroEditorPreview() {
  const t = useT();
  const p1 = t("landing.preview.p1");
  const [step, setStep] = useState<Step>(1);
  const [typed, setTyped] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setReduce(true);
      setStep(5);
      setTyped(p1.length);
    }
  }, [p1.length]);

  // Step 1 types the first paragraph; the other steps hold, then advance; step 5 loops back.
  useEffect(() => {
    if (reduce || paused) return;
    if (step === 1) {
      if (typed >= p1.length) {
        const id = setTimeout(() => setStep(2), 700);
        return () => clearTimeout(id);
      }
      const id = setTimeout(() => setTyped((n) => n + 1), CHAR_MS);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => {
      if (step === 5) {
        setTyped(0);
        setStep(1);
      } else setStep((step + 1) as Step);
    }, HOLD[step]);
    return () => clearTimeout(id);
  }, [step, typed, p1.length, reduce, paused]);

  const jump = (s: Step) => {
    setPaused(true);
    setStep(s);
    setTyped(p1.length);
  };

  const typing = step === 1 && typed < p1.length;
  const resolved = step >= 4;
  const score = resolved ? 100 : 94;
  const ledger: { label: string; value: string; tone: "green" | "amber" | "plain"; key: string }[] = [
    { key: "start", label: t("landing.preview.ledger.start"), value: "100", tone: "plain" },
    { key: "paste", label: t("landing.preview.ledger.paste"), value: "−0", tone: "green" },
    { key: "share", label: t("landing.preview.ledger.share", { ai: step >= 3 ? AI_PCT : 0, limit: LIMIT_PCT }), value: "−0", tone: "green" },
    resolved ? { key: "notice", label: t("landing.preview.ledger.noticeResolved"), value: "−0", tone: "green" } : { key: "notice", label: t("landing.preview.ledger.notice"), value: "−6", tone: "amber" },
  ];

  return (
    <div className="relative mt-14 max-w-[1200px] mx-auto z-[1]" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="absolute -inset-2 rounded-[28px] bg-gradient-to-r from-brand-600/[0.12] to-accent-500/[0.12] blur-[48px]" aria-hidden="true" />
      <div className="relative bg-white border border-gray-200 rounded-2xl shadow-[0_25px_50px_-12px] shadow-gray-900/15 overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-gray-100 text-[13px] text-gray-500">
          <span className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-white" strokeWidth={2} />
            </span>
            <span className="font-semibold text-gray-900 truncate">{t("landing.preview.chapter")}</span>
            <span className="hidden sm:inline">· {t("landing.preview.kind")}</span>
          </span>
          <IntegrityPill variant="landing" aiPct={step >= 3 ? AI_PCT : 0} pastePct={step >= 4 ? 7 : 0} limitPct={LIMIT_PCT} score={score} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Sheet */}
          <div className="relative flex flex-col gap-3.5 pt-7 pb-7 pr-6 pl-16 sm:pr-8 lg:border-r border-gray-100 font-serif text-[15px] leading-[1.7] text-gray-800 border-b lg:border-b-0 min-h-[260px]" aria-live="polite">
            <p className="relative m-0">
              <Gutter tag="¶1" tone="human" />
              <span className={typing ? "land-caret" : ""}>{p1.slice(0, typed)}</span>
            </p>
            {step >= 3 && (
              <>
                <div className="land-up flex items-center gap-2 font-sans text-[12px] text-prov-ai-deep bg-prov-ai-soft border border-prov-ai-line rounded-[10px] px-3 py-1.5 w-fit max-w-full">
                  <Sparkles className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                  <span>{t("landing.preview.cost")}</span>
                </div>
                <p className="relative m-0 land-up" style={{ animationDelay: "0.9s" }}>
                  <Gutter tag={t("landing.preview.tagAi")} tone="ai" />
                  <span className="bg-prov-ai/[0.13] border-b-2 border-prov-ai/[0.55]">{t("landing.preview.p2")}</span>{" "}
                  <span className="font-sans text-[11px] font-semibold text-prov-ai">{t("landing.preview.p2Meta")}</span>
                </p>
              </>
            )}
            {step >= 4 && (
              <>
                <div className="land-up flex flex-wrap items-center gap-2 font-sans text-[12px] text-gray-700 bg-white border border-gray-200 rounded-[10px] px-3 py-1.5 w-fit max-w-full shadow-sm">
                  <span className="font-semibold">{t("landing.preview.pasteTitle")}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-prov-paste/[0.16] text-prov-paste-deep px-2 py-0.5 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    {t("landing.preview.pasteChoice")}
                  </span>
                </div>
                <p className="relative m-0 land-up" style={{ animationDelay: "1s" }}>
                  <Gutter tag={t("landing.preview.tagQuote")} tone="paste" />
                  <span className="bg-prov-paste/[0.16] border-b-2 border-prov-paste/[0.6]">{t("landing.preview.p3")}</span>{" "}
                  <span className="font-sans text-[11px] font-semibold text-prov-paste-deep">{t("landing.preview.p3Meta")}</span>
                </p>
              </>
            )}
            {step >= 5 && (
              <div className="land-up mt-auto flex items-center gap-2 font-sans text-[12px] font-semibold text-green-700 bg-green-50 rounded-[10px] px-3 py-2 w-fit max-w-full">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                {t("landing.preview.report")}
              </div>
            )}
          </div>

          {/* Assistant and ledger */}
          <div className="flex flex-col gap-4 p-5 bg-gray-50">
            {step >= 2 && (
              <div className="land-up rounded-xl bg-white border border-gray-200 p-3.5 text-[13px] leading-[1.5]">
                <div className="flex items-center gap-2 text-[12px] font-semibold text-gray-900 mb-2">
                  <span className="w-5 h-5 rounded-md bg-brand-600 flex items-center justify-center"><Sparkles className="w-3 h-3 text-white" aria-hidden="true" /></span>
                  {t("landing.preview.assistant.title")}
                </div>
                <p className="m-0 mb-2 text-gray-500 italic">“{t("landing.preview.assistant.prompt")}”</p>
                <p className="m-0 text-gray-800 [text-wrap:pretty]">{t("landing.preview.assistant.answer")}</p>
              </div>
            )}
            <div>
              <div className="text-[12px] font-semibold text-gray-500 uppercase tracking-[0.08em] mb-1">{t("glossary.integrityLedger")}</div>
              {ledger.map((row) => (
                <div key={row.key} className="flex justify-between gap-3 text-[13px] py-2 border-b border-gray-200">
                  <span className="text-gray-700">{row.label}</span>
                  <span className={`font-semibold ${row.tone === "green" ? "text-green-600" : row.tone === "amber" ? "text-amber-600" : "text-gray-900"}`}>{row.value}</span>
                </div>
              ))}
              <div className="flex justify-between text-[14px] py-2">
                <span className="font-semibold text-gray-900">{t("glossary.integrity")}</span>
                <span className="font-bold text-green-600 [font-variant-numeric:tabular-nums]">{score}</span>
              </div>
              <p className="text-[12px] leading-[1.5] text-gray-500 m-0">{t("landing.preview.ledger.note")}</p>
            </div>
          </div>
        </div>

        {/* Steps and legend */}
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 px-5 py-2.5 border-t border-gray-100 text-[12px] text-gray-500 bg-white">
          <div className="flex items-center gap-2.5 min-w-0" role="tablist" aria-label={t("landing.nav.how")}>
            {STEPS.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={s === step}
                aria-label={t(`landing.preview.step${s}`)}
                onClick={() => jump(s)}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${s === step ? "bg-brand-600 land-pulse" : s < step ? "bg-brand-300" : "bg-gray-200"}`}
              />
            ))}
            <span className="font-medium text-gray-700 truncate">
              {step} · {t(`landing.preview.step${step}`)}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {LEGEND.map((l) => (
              <span key={l.label} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-[3px] rounded-sm ${l.bar}`} aria-hidden="true" />
                {t(l.label)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
