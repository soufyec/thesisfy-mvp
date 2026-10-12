"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { useLocale, useT } from "@/lib/i18n/client";
import { formatClock, ONBOARDING_VIDEO } from "@/lib/onboarding";

export type IntroPage = "video" | "provenance" | "assistant" | "integrity";
export const INTRO_PAGES: IntroPage[] = ["video", "provenance", "assistant", "integrity"];

/** Four-page welcome dialog. The first page plays the tour video (or its chapter placeholder); the next three
 *  illustrate provenance, the assistant and the ledger with static cards drawn in the product's own tokens. */
export default function IntroModal({ page, onPage, onSkip, onFinish, vars }: {
  page: number;
  onPage: (n: number) => void;
  onSkip: () => void;
  onFinish: () => void;
  vars: { ai: number; limit: number };
}) {
  const t = useT();
  const key = INTRO_PAGES[page];
  const last = page === INTRO_PAGES.length - 1;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onSkip(); };
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);

  return (
    <div className="onb-overlay fixed inset-0 z-[100] flex items-center justify-center p-6" role="presentation">
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t("onboarding.dialogLabel")} className="w-[720px] max-w-full max-h-[calc(100vh-48px)] bg-white rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.35)] overflow-hidden flex flex-col outline-none">
        {key === "video" ? <VideoPage /> : <IllustrationPage page={key} vars={vars} />}
        <div className="px-7 pt-5 pb-4">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-brand-700">{t(`onboarding.intro.${key}.kicker`)}</div>
          <h2 className="text-[22px] font-bold leading-[1.25] text-gray-900 mt-1.5">{t(`onboarding.intro.${key}.title`)}</h2>
          <p className="text-[14px] leading-[1.6] text-gray-600 mt-2">{t(`onboarding.intro.${key}.body`)}</p>
        </div>
        <div className="px-7 pb-5 flex items-center gap-3">
          <button type="button" onClick={onSkip} className="text-[13px] text-gray-500 hover:text-gray-700">{t("onboarding.skip")}</button>
          <div className="flex-1 flex items-center justify-center gap-1.5" role="tablist" aria-label={t("onboarding.page", { n: page + 1, total: INTRO_PAGES.length })}>
            {INTRO_PAGES.map((p, i) => (
              <button key={p} type="button" role="tab" aria-selected={i === page} aria-label={t("onboarding.page", { n: i + 1, total: INTRO_PAGES.length })} onClick={() => onPage(i)} className={`h-1.5 rounded-full transition-all ${i === page ? "w-[18px] bg-brand-600" : "w-1.5 bg-gray-200 hover:bg-gray-300"}`} />
            ))}
          </div>
          {page > 0 && <button type="button" onClick={() => onPage(page - 1)} className="px-3.5 py-2 rounded-lg border border-gray-200 text-[13px] font-semibold text-gray-700 hover:bg-gray-50">{t("onboarding.back")}</button>}
          <button type="button" onClick={() => (last ? onFinish() : onPage(page + 1))} className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-[13px] font-semibold">{last ? t("onboarding.startTour") : t("onboarding.next")}</button>
        </div>
      </div>
    </div>
  );
}

const CHAPTER_COLORS = ["bg-prov-human", "bg-prov-ai", "bg-brand-500", "bg-prov-paste"];

function VideoPage() {
  const t = useT();
  const { locale } = useLocale();
  const video = ONBOARDING_VIDEO[locale];
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const chapters = video.chapters.map((c, i, all) => ({ ...c, w: (all[i + 1]?.at ?? video.duration) - c.at }));

  const play = () => {
    if (!video.src) return;
    setPlaying(true);
    videoRef.current?.play().catch(() => setPlaying(false));
  };

  return (
    <div className="relative aspect-video max-h-[42vh] min-h-[140px] shrink bg-gray-900 flex items-center justify-center overflow-hidden">
      {video.src ? (
        <video ref={videoRef} src={video.src} poster={video.poster || undefined} controls={playing} playsInline preload="metadata" className="absolute inset-0 w-full h-full object-contain bg-gray-900" onEnded={() => setPlaying(false)} crossOrigin="anonymous">
          {video.captions && <track kind="subtitles" src={video.captions} srcLang={locale} default />}
        </video>
      ) : (
        <div className="absolute inset-0 onb-video-glow" aria-hidden="true" />
      )}
      {!playing && (
        <button type="button" onClick={play} disabled={!video.src} aria-label={t("onboarding.video.play")} className="relative w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-[0_10px_30px_rgba(0,0,0,0.35)] disabled:opacity-60 disabled:cursor-default hover:scale-105 transition-transform">
          <Play className="w-6 h-6 text-brand-600 ml-0.5" fill="currentColor" strokeWidth={0} aria-hidden="true" />
        </button>
      )}
      {!playing && (
        <div className="absolute left-0 right-0 bottom-0 px-5 py-3.5 flex flex-col gap-2 bg-gradient-to-t from-gray-900/85 to-transparent pointer-events-none">
          <div className="flex gap-1.5">
            {chapters.map((c, i) => <span key={c.label} className={`h-[3px] rounded-sm ${CHAPTER_COLORS[i % CHAPTER_COLORS.length]}`} style={{ flex: c.w }} />)}
          </div>
          <div className="flex gap-4 flex-wrap text-[12px] text-gray-300">
            {chapters.map((c) => (
              <span key={c.label} className="flex items-center gap-1.5"><span className="text-gray-400 tabular-nums">{formatClock(c.at)}</span>{t(`onboarding.chapter.${c.label}`)}</span>
            ))}
          </div>
        </div>
      )}
      {!playing && (
        <span className="absolute top-3 right-3 text-[11px] px-2 py-[3px] rounded-full bg-gray-900/70 text-white font-semibold">
          {video.src ? t("onboarding.video.badge", { duration: formatClock(video.duration) }) : t("onboarding.video.placeholder", { duration: formatClock(video.duration) })}
        </span>
      )}
    </div>
  );
}

function IllustrationPage({ page, vars }: { page: Exclude<IntroPage, "video">; vars: { ai: number; limit: number } }) {
  const t = useT();
  const bg = page === "provenance" ? "bg-brand-50" : page === "assistant" ? "bg-prov-ai-soft" : "bg-accent-50";
  return (
    <div className={`aspect-[16/7] max-h-[36vh] min-h-[140px] shrink ${bg} flex items-center justify-center px-7 py-5 overflow-hidden`}>
      <div className="w-full max-w-[520px] bg-white border border-gray-200 rounded-xl shadow-[0_12px_30px_-16px_rgba(17,24,39,0.3)] p-4 flex flex-col gap-2.5 text-[13px]">
        {page === "provenance" && (
          <>
            <p className="font-serif text-[14px] leading-[1.7] text-gray-800 m-0">
              {t("onboarding.sample.p1a")}
              <span className="prov prov-ai">{t("onboarding.sample.p1b")}</span>
              {t("onboarding.sample.p1c")}
              <span className="prov prov-paste">{t("onboarding.sample.p1d")}</span>
              {t("onboarding.sample.p1e")}
            </p>
            <div className="flex gap-4 text-[12px] text-gray-600">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-prov-human" />{t("glossary.written")}</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-prov-ai" />{t("glossary.aiAssisted")}</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-prov-paste" />{t("glossary.quotedOrPasted")}</span>
            </div>
          </>
        )}
        {page === "assistant" && (
          <>
            <div className="flex items-center gap-2 text-[12px]">
              <span className="w-6 h-6 rounded-md bg-brand-600 text-white flex items-center justify-center font-bold text-[11px]">AI</span>
              <span className="font-semibold text-gray-900">Thesisfic AI</span>
              <span className="ml-auto px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 font-medium">{t("onboarding.sample.outline")}</span>
            </div>
            <div className="rounded-lg border border-prov-ai-line bg-prov-ai-soft p-3">
              <div className="font-semibold text-prov-ai-deep text-[12px]">{t("onboarding.sample.costTitle")}</div>
              <p className="text-[12.5px] leading-[1.55] text-gray-700 mt-1 m-0">{t("onboarding.sample.costBody", { words: 64, from: 12, to: 14, limit: vars.limit })}</p>
            </div>
          </>
        )}
        {page === "integrity" && (
          <>
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-semibold uppercase tracking-wide text-gray-500">{t("glossary.integrityLedger")}</span>
              <span className="px-2 py-0.5 rounded-full bg-accent-50 text-accent-700 font-medium">{t("onboarding.sample.sameView")}</span>
            </div>
            <div className="flex justify-between text-gray-700"><span>{t("onboarding.sample.ledgerStart")}</span><span className="tabular-nums font-semibold">100</span></div>
            <div className="flex justify-between text-gray-700"><span>{t("onboarding.sample.ledgerNotice")}</span><span className="tabular-nums font-semibold text-amber-600">−6</span></div>
            <div className="flex justify-between items-baseline border-t border-gray-100 pt-2"><span className="font-semibold text-gray-900">{t("onboarding.sample.ledgerTotal")}</span><span className="tabular-nums text-[22px] font-bold text-green-600">94</span></div>
          </>
        )}
      </div>
    </div>
  );
}
