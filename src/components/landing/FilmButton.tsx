"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Play, X } from "lucide-react";
import { useLocale, useT } from "@/lib/i18n/client";
import { film, type FilmKey } from "@/lib/films";
import { formatClock } from "@/lib/onboarding";

/** A play button that opens one of the narrated films in a dark overlay. The film starts on the click, with sound,
 *  and stops when the overlay closes (Escape, the close button or a click outside). The overlay is portalled to
 *  <body>: inside a `Reveal` (which animates `transform`) a fixed overlay would be clipped to that section. */
export default function FilmButton({ which, label, title, tone = "light" }: { which: FilmKey; label: string; title: string; tone?: "light" | "dark" }) {
  const t = useT();
  const { locale } = useLocale();
  const f = film(which, locale);
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      openerRef.current?.focus();
    };
  }, [open]);

  const dark = tone === "dark";
  return (
    <>
      <button
        ref={openerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={`group inline-flex items-center gap-3 rounded-full py-1.5 pl-1.5 pr-4 text-[15px] font-semibold transition-colors ${dark ? "text-white hover:bg-white/10" : "text-gray-900 hover:bg-gray-900/5"}`}
      >
        <span className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm transition-transform group-hover:scale-105 ${dark ? "bg-white text-brand-700" : "bg-white border border-gray-200 text-brand-600"}`}>
          <Play className="w-4 h-4 ml-0.5" fill="currentColor" strokeWidth={0} aria-hidden="true" />
        </span>
        {label}
        <span className={`text-[13px] font-medium tabular-nums ${dark ? "text-brand-100" : "text-gray-500"}`}>{formatClock(f.duration)}</span>
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-8" role="dialog" aria-modal="true" aria-label={title}>
          <div className="absolute inset-0 bg-gray-900/85" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-[1100px]">
            <div className="flex items-center justify-between gap-4 mb-3">
              <h2 className="text-[15px] font-semibold text-white m-0">{title}</h2>
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label={t("common.close")} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center">
                <X className="w-5 h-5" strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
            <video src={f.src} poster={f.poster} controls autoPlay playsInline preload="auto" className="w-full aspect-video rounded-xl bg-gray-900 shadow-2xl" crossOrigin="anonymous">
              <track kind="subtitles" src={f.captions} srcLang={locale} label={title} />
            </video>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
