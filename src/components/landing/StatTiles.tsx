"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useFormat, useT } from "@/lib/i18n/client";

/** Published figures only (CLAUDE.md §2.7): each tile links to its source. */
const TILES: { id: number; n: number; unit: string; url: string }[] = [
  { id: 1, n: 92, unit: "%", url: "https://www.hepi.ac.uk/2025/02/26/student-generative-ai-survey-2025/" },
  { id: 2, n: 36, unit: "%", url: "https://www.hepi.ac.uk/2025/02/26/student-generative-ai-survey-2025/" },
  { id: 3, n: 54, unit: "%", url: "https://www.pewresearch.org/internet/2026/02/24/how-teens-use-and-view-ai/" },
  { id: 4, n: 80, unit: "%", url: "https://www.compilatio.net/en/blog/press-release-ai-survey-2023" },
  { id: 5, n: 61, unit: "%", url: "https://doi.org/10.1016/j.patter.2023.100779" },
  { id: 6, n: 26, unit: "%", url: "https://openai.com/index/new-ai-classifier-for-indicating-ai-written-text/" },
  { id: 7, n: 25, unit: "%", url: "https://www.pewresearch.org/short-reads/2024/05/15/a-quarter-of-u-s-teachers-say-ai-tools-do-more-harm-than-good-in-k-12-education/" },
  { id: 8, n: 319, unit: "", url: "https://doi.org/10.1145/3706598.3713778" },
];

/** Counts from 0 to `n` once the grid scrolls into view; static when motion is reduced. */
function useCountUp(active: boolean, n: number, ms = 1200) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setV(n);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(n * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, n, ms]);
  return v;
}

function Tile({ tile, active }: { tile: (typeof TILES)[number]; active: boolean }) {
  const t = useT();
  const fmt = useFormat();
  const v = useCountUp(active, tile.n);
  return (
    <article className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6 flex flex-col gap-2 min-w-0">
      <div className="text-[40px] sm:text-[44px] leading-none font-extrabold tracking-[-0.03em] text-gray-900 [font-variant-numeric:tabular-nums]">
        {fmt.number(v)}
        <span className="text-[24px] text-brand-600">{tile.unit}</span>
      </div>
      <p className="text-[14px] leading-[1.5] text-gray-600 m-0 [text-wrap:pretty]">{t(`landing.data.${tile.id}.label`)}</p>
      <a href={tile.url} target="_blank" rel="noopener noreferrer" className="mt-auto pt-2 text-[12px] leading-[1.4] text-gray-500 hover:text-brand-700 inline-flex items-start gap-1">
        <ExternalLink className="w-3 h-3 mt-[3px] flex-shrink-0" aria-hidden="true" />
        <span>
          <span className="sr-only">{t("landing.data.source")}: </span>
          {t(`landing.data.${tile.id}.source`)}
        </span>
      </a>
    </article>
  );
}

export default function StatTiles() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return setActive(true);
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && (setActive(true), io.disconnect()), { threshold: 0.1 });
    io.observe(el);
    // A reader who never scrolls (a capture, a print) still gets the real figures.
    const fallback = setTimeout(() => setActive(true), 3000);
    return () => { io.disconnect(); clearTimeout(fallback); };
  }, []);
  return (
    <div ref={ref} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
      {TILES.map((tile) => <Tile key={tile.id} tile={tile} active={active} />)}
    </div>
  );
}
