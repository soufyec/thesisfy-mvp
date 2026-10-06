"use client";

import { FileText } from "lucide-react";
import { IntegrityPill } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

/**
 * Static preview of the editor shown under the hero: a chapter sheet with the provenance
 * gutter on the left and the Integrity ledger on the right. Content mirrors the demo
 * thesis (`thesis_1`); nothing here is live.
 */

const AI_PCT = 12;
const LIMIT_PCT = 25;

const LEDGER: { label: string; value: string; tone?: "green" | "amber" }[] = [
  { label: "landing.preview.ledger.start", value: "100" },
  { label: "landing.preview.ledger.paste", value: "−0", tone: "green" },
  { label: "landing.preview.ledger.share", value: "−0", tone: "green" },
  { label: "landing.preview.ledger.notice", value: "−6", tone: "amber" },
];

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
  return (
    <div className="relative mt-14 max-w-[1200px] mx-auto z-[1]">
      <div className="absolute -inset-2 rounded-[28px] bg-gradient-to-r from-brand-600/[0.12] to-accent-500/[0.12] blur-[48px]" aria-hidden="true" />
      <div className="relative bg-white border border-gray-200 rounded-2xl shadow-[0_25px_50px_-12px] shadow-gray-900/15 overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-gray-100 text-[13px] text-gray-500">
          <span className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-white" strokeWidth={2} />
            </span>
            <span className="font-semibold text-gray-900 truncate">{t("landing.preview.chapter")}</span>
            <span className="hidden sm:inline">· {t("glossary.finalSubmission")}</span>
          </span>
          <IntegrityPill variant="landing" aiPct={AI_PCT} pastePct={7} limitPct={LIMIT_PCT} score={94} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Sheet */}
          <div className="flex flex-col gap-3.5 pt-7 pb-7 pr-6 pl-16 sm:pr-8 lg:border-r border-gray-100 font-serif text-[15px] leading-[1.7] text-gray-800 border-b lg:border-b-0">
            <p className="relative m-0">
              <Gutter tag="¶1" tone="human" />
              {t("landing.preview.p1")}
            </p>
            <p className="relative m-0">
              <Gutter tag={t("landing.preview.tagAi")} tone="ai" />
              <span className="bg-prov-ai/[0.13] border-b-2 border-prov-ai/[0.55]">
                {t("landing.preview.p2")}
              </span>{" "}
              <span className="font-sans text-[11px] font-semibold text-prov-ai whitespace-nowrap">{t("landing.preview.p2Meta")}</span>
            </p>
            <p className="relative m-0">
              <Gutter tag={t("landing.preview.tagQuote")} tone="paste" />
              <span className="bg-prov-paste/[0.16] border-b-2 border-prov-paste/[0.6]">
                {t("landing.preview.p3")}
              </span>{" "}
              <span className="font-sans text-[11px] font-semibold text-prov-paste-deep whitespace-nowrap">{t("landing.preview.p3Meta")}</span>
            </p>
          </div>

          {/* Integrity ledger */}
          <div className="flex flex-col gap-3 p-5 bg-gray-50">
            <div className="text-[12px] font-semibold text-gray-500 uppercase tracking-[0.08em]">{t("glossary.integrityLedger")}</div>
            {LEDGER.map((row) => (
              <div key={row.label} className="flex justify-between gap-3 text-[13px] py-2 border-b border-gray-200">
                <span className="text-gray-700">{t(row.label, { ai: AI_PCT, limit: LIMIT_PCT })}</span>
                <span className={`font-semibold ${row.tone === "green" ? "text-green-600" : row.tone === "amber" ? "text-amber-600" : "text-gray-900"}`}>{row.value}</span>
              </div>
            ))}
            <div className="flex justify-between text-[14px] py-2">
              <span className="font-semibold text-gray-900">{t("glossary.integrity")}</span>
              <span className="font-bold text-green-600">94</span>
            </div>
            <p className="text-[12px] leading-[1.5] text-gray-500 m-0">{t("landing.preview.ledger.note")}</p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-5 gap-y-2 px-5 py-2.5 border-t border-gray-100 text-[12px] text-gray-500 bg-white">
          {LEGEND.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-[3px] rounded-sm ${l.bar}`} aria-hidden="true" />
              {t(l.label)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
