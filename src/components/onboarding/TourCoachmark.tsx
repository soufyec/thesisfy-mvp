"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { TOUR_STEPS, type TourPlacement, type TourStepKey } from "@/lib/onboarding";

const CARD_W = 320;
const CARD_H_EST = 230;
const MARGIN = 12;
const GAP = 14;
const PAD = 6;

/** Where each step points. The document anchors fall back to toolbar buttons when the thesis has no advisor
 *  comment or pasted passage yet, so the tour never points at nothing. */
export function findAnchor(key: TourStepKey): HTMLElement | null {
  const q = (s: string) => document.querySelector<HTMLElement>(s);
  if (key === "feedback") return q(".ProseMirror [data-comment-id]") || q('[data-tour="comment"]');
  if (key === "citations") return q('.ProseMirror span[data-provenance="paste"]') || q('[data-tour="cite"]');
  return q(`[data-tour="${key}"]`);
}

interface Rect { x: number; y: number; w: number; h: number }

/** Bring an anchor inside the scrollable editor area into view, leaving room for the card. The design asks for
 *  `scrollTop` arithmetic rather than `scrollIntoView`, so the header and toolbar never move. */
function revealInMain(el: HTMLElement, place: TourPlacement) {
  const main = document.querySelector<HTMLElement>("main.docs-workspace");
  if (!main || !main.contains(el)) return;
  const r = el.getBoundingClientRect();
  const mr = main.getBoundingClientRect();
  const needBelow = place === "below" && r.bottom + CARD_H_EST + 40 > mr.bottom;
  if (r.top < mr.top + 40 || r.bottom > mr.bottom - 40 || needBelow) {
    main.scrollTop += r.top - mr.top - Math.max(40, (mr.height - r.height) / 2);
  }
}

export default function TourCoachmark({ step, onStep, onSkip, onFinish, vars }: {
  step: number;
  onStep: (n: number) => void;
  onSkip: () => void;
  onFinish: () => void;
  vars: { ai: number; limit: number };
}) {
  const t = useT();
  const { key, place } = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardPos, setCardPos] = useState<{ left: number; top: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const el = findAnchor(key);
    if (!el) { setRect(null); return; }
    revealInMain(el, place);
    const r = el.getBoundingClientRect();
    setRect({ x: Math.round(r.left) - PAD, y: Math.round(r.top) - PAD, w: Math.round(r.width) + PAD * 2, h: Math.round(r.height) + PAD * 2 });
  }, [key, place]);

  // The anchor can appear a moment after the step starts (the assistant panel opening for "model").
  useEffect(() => {
    let tries = 0;
    let raf = 0;
    const tick = () => { measure(); if (!findAnchor(key) && tries++ < 40) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    const main = document.querySelector("main.docs-workspace");
    main?.addEventListener("scroll", onResize, { passive: true });
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); main?.removeEventListener("scroll", onResize); };
  }, [measure, key]);

  // Place the card once the focus rect and the card's real height are known; clamp inside the viewport.
  useLayoutEffect(() => {
    if (!rect) { setCardPos(null); return; }
    const ch = cardRef.current?.offsetHeight || CARD_H_EST;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left: number;
    let top: number;
    if (place === "below") {
      left = rect.x + rect.w / 2 - CARD_W / 2;
      top = rect.y + rect.h + GAP;
      if (top + ch > vh - MARGIN) top = rect.y - GAP - ch;
    } else if (place === "left") {
      left = rect.x - GAP - CARD_W;
      top = rect.y + rect.h / 2 - ch / 2;
      if (left < MARGIN) { left = rect.x + rect.w + GAP; }
    } else {
      left = rect.x + rect.w + GAP;
      top = rect.y + rect.h / 2 - ch / 2;
      if (left + CARD_W > vw - MARGIN) { left = rect.x - GAP - CARD_W; }
    }
    left = Math.max(MARGIN, Math.min(vw - MARGIN - CARD_W, left));
    top = Math.max(MARGIN, Math.min(vh - MARGIN - ch, top));
    setCardPos({ left, top });
  }, [rect, place]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onSkip(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);

  useEffect(() => { cardRef.current?.focus(); }, [step]);

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none" aria-live="polite">
      {rect && <div className="tour-focus fixed rounded-[10px]" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} aria-hidden="true" />}
      <div ref={cardRef} tabIndex={-1} role="dialog" aria-label={t(`onboarding.tour.${key}.title`)} className="tour-card fixed pointer-events-auto bg-white rounded-xl shadow-[0_20px_40px_-12px_rgba(17,24,39,0.35)] pt-[18px] px-[18px] pb-3.5 outline-none" style={{ width: CARD_W, left: cardPos?.left ?? MARGIN, top: cardPos?.top ?? MARGIN, visibility: cardPos ? "visible" : "hidden" }}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">{t(`onboarding.tour.${key}.kicker`)}</span>
          <span className="text-[11px] text-gray-400 tabular-nums">{t("onboarding.stepCount", { n: step + 1, total: TOUR_STEPS.length })}</span>
        </div>
        <h3 className="text-[16px] font-bold text-gray-900 mt-1.5 leading-snug">{t(`onboarding.tour.${key}.title`)}</h3>
        <p className="text-[13px] leading-[1.55] text-gray-600 mt-1.5 m-0">{t(`onboarding.tour.${key}.body`, vars)}</p>
        <div className="flex items-center gap-2 mt-3.5">
          <button type="button" onClick={onSkip} className="text-[12px] text-gray-500 hover:text-gray-700 mr-auto">{t("onboarding.skipTour")}</button>
          {step > 0 && <button type="button" onClick={() => onStep(step - 1)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-700 hover:bg-gray-50">{t("onboarding.back")}</button>}
          <button type="button" onClick={() => (last ? onFinish() : onStep(step + 1))} className="px-3.5 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-[12px] font-semibold">{last ? t("onboarding.startWriting") : t("onboarding.next")}</button>
        </div>
      </div>
    </div>
  );
}
