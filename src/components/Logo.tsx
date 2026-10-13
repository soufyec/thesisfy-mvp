"use client";

import { useId, type CSSProperties } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { SPARK_D, T_D, T_FOLD_D, WORDMARK_D } from "./logoAssets";

// The Thesisfic logo: three overlapping circles with a white T at their shared centre, the wordmark
// in Inter 800 and a spark. It is brand artwork, so its colours live here and nowhere else; the
// same files ship as SVG/PNG under public/brand for use outside the product.
const MARK = {
  deep: ["#0b7a5b", "#043d33"],
  deepOnDark: ["#1aa57c", "#0b6b4f"],
  pale: ["#b6ead3", "#5fcfa6"],
  mint: ["#2ee0ad", "#0ea57a"],
  ink: "#0f3d35",
  spark: ["#ff8a5c", "#ff5a36"],
};

export function LogoMark({ size = 32, onDark = false, className = "" }: { size?: number; onDark?: boolean; className?: string }) {
  // Unique ids per instance: two marks on one page must not share gradient or filter ids.
  const id = useId().replace(/:/g, "");
  const deep = onDark ? MARK.deepOnDark : MARK.deep;
  const blend = onDark ? "normal" : "multiply";
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" className={`block flex-shrink-0 ${className}`}>
      <defs>
        <linearGradient id={`${id}-deep`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={deep[0]} />
          <stop offset="1" stopColor={deep[1]} />
        </linearGradient>
        <linearGradient id={`${id}-pale`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={MARK.pale[0]} />
          <stop offset="1" stopColor={MARK.pale[1]} />
        </linearGradient>
        <linearGradient id={`${id}-mint`} x1="0.5" y1="1" x2="0.5" y2="0">
          <stop offset="0" stopColor={MARK.mint[0]} />
          <stop offset="1" stopColor={MARK.mint[1]} />
        </linearGradient>
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="9" result="b" />
          <feFlood floodColor="#b9f3e3" floodOpacity="0.9" />
          <feComposite in2="b" operator="in" result="g" />
          <feMerge>
            <feMergeNode in="g" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id={`${id}-fold`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.45" stopColor="#b6ead3" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g style={{ isolation: "isolate" }}>
        <circle cx="170" cy="200" r="150" fill={`url(#${id}-deep)`} fillOpacity={onDark ? 1 : 0.96} />
        <circle cx="342" cy="200" r="150" fill={`url(#${id}-pale)`} fillOpacity={onDark ? 0.82 : 0.9} style={{ mixBlendMode: blend }} />
        <circle cx="256" cy="330" r="150" fill={`url(#${id}-mint)`} fillOpacity={onDark ? 0.88 : 0.92} style={{ mixBlendMode: blend }} />
        <g filter={`url(#${id}-glow)`}>
          <path fill="#ffffff" d={T_D} />
          <path fill={`url(#${id}-fold)`} d={T_FOLD_D} />
        </g>
      </g>
    </svg>
  );
}

// Wordmark "Thesisfic" with the spark. `height` is the cap height in px (the T is that tall).
export function Wordmark({ height = 15, onDark = false, className = "" }: { height?: number; onDark?: boolean; className?: string }) {
  const id = useId().replace(/:/g, "");
  // Glyphs span x 3..458 on baseline 0 with an 80.5-unit cap height; the spark sits past the "c", above the x-height.
  const vb = { x: 0, y: -108, w: 512, h: 112 };
  const px = (height / 80.5) * vb.h;
  return (
    <svg width={(px * vb.w) / vb.h} height={px} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} aria-hidden="true" className={`block flex-shrink-0 ${className}`}>
      <defs>
        <linearGradient id={`${id}-spark`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={MARK.spark[0]} />
          <stop offset="1" stopColor={MARK.spark[1]} />
        </linearGradient>
      </defs>
      <path d={WORDMARK_D} fill={onDark ? "#ffffff" : MARK.ink} />
      <path d={SPARK_D} transform="translate(486 -86)" fill={`url(#${id}-spark)`} />
    </svg>
  );
}

const SIZES = {
  nav: { mark: 36, text: 15.5, gap: "gap-2.5" },
  footer: { mark: 26, text: 11.5, gap: "gap-2" },
  sidebar: { mark: 34, text: 13.5, gap: "gap-2.5" },
  panel: { mark: 44, text: 18, gap: "gap-3" },
};

export default function Logo({
  size = "nav",
  onDark = false,
  href = "/",
  className = "",
}: {
  size?: keyof typeof SIZES;
  onDark?: boolean;
  href?: string;
  className?: string;
}) {
  const t = useT();
  const s = SIZES[size];
  return (
    <Link href={href} className={`inline-flex items-center ${s.gap} min-w-0 ${className}`} aria-label={t("landing.nav.home")}>
      <LogoMark size={s.mark} onDark={onDark} />
      <Wordmark height={s.text} onDark={onDark} />
    </Link>
  );
}

// The mark as a loading indicator: the three circles drift apart and orbit each other while the T holds
// the centre. Keyframes live in globals.css (`logo-orbit`, `logo-spread`, `logo-t`) and stop under reduced motion.
export function LogoSpinner({ size = 28, label, className = "" }: { size?: number; label: string; className?: string }) {
  const id = useId().replace(/:/g, "");
  const sat = (sx: number, sy: number): CSSProperties => ({ "--sx": `${sx}px`, "--sy": `${sy}px` } as CSSProperties);
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role="img" aria-label={label} className={`block flex-shrink-0 overflow-visible ${className}`}>
      <defs>
        <linearGradient id={`${id}-deep`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={MARK.deep[0]} />
          <stop offset="1" stopColor={MARK.deep[1]} />
        </linearGradient>
        <linearGradient id={`${id}-pale`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={MARK.pale[0]} />
          <stop offset="1" stopColor={MARK.pale[1]} />
        </linearGradient>
        <linearGradient id={`${id}-mint`} x1="0.5" y1="1" x2="0.5" y2="0">
          <stop offset="0" stopColor={MARK.mint[0]} />
          <stop offset="1" stopColor={MARK.mint[1]} />
        </linearGradient>
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="9" result="b" />
          <feFlood floodColor="#b9f3e3" floodOpacity="0.9" />
          <feComposite in2="b" operator="in" result="g" />
          <feMerge>
            <feMergeNode in="g" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id={`${id}-fold`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.45" stopColor="#b6ead3" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className="logo-spin-orbit" style={{ isolation: "isolate" }}>
        <g className="logo-spin-sat" style={sat(-60, -34)}>
          <circle cx="170" cy="200" r="150" fill={`url(#${id}-deep)`} fillOpacity="0.96" />
        </g>
        <g className="logo-spin-sat" style={sat(60, -34)}>
          <circle cx="342" cy="200" r="150" fill={`url(#${id}-pale)`} fillOpacity="0.9" style={{ mixBlendMode: "multiply" }} />
        </g>
        <g className="logo-spin-sat" style={sat(0, 68)}>
          <circle cx="256" cy="330" r="150" fill={`url(#${id}-mint)`} fillOpacity="0.92" style={{ mixBlendMode: "multiply" }} />
        </g>
      </g>
      <g className="logo-spin-t" filter={`url(#${id}-glow)`}>
          <path fill="#ffffff" d={T_D} />
          <path fill={`url(#${id}-fold)`} d={T_FOLD_D} />
      </g>
    </svg>
  );
}
