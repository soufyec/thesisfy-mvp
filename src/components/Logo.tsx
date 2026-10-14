"use client";

import { useId, type CSSProperties } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { T_D, T_FOLD_D } from "./logoAssets";

// The Thesisfic logo is the brand artwork itself (three overlapping circles, the T where they meet, the wordmark
// and the spark), cut out of the supplied image with a transparent background and served from public/brand.
// It is never redrawn. The dark variant only turns the wordmark ink white for dark grounds.
const LOCKUP_RATIO = 1461 / 438;
const MARK_RATIO = 794 / 704;

export function LogoMark({ size = 32, className = "" }: { size?: number; onDark?: boolean; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/mark-160.webp" alt="" aria-hidden="true" width={Math.round(size * MARK_RATIO)} height={size} decoding="async" className={`block flex-shrink-0 ${className}`} style={{ height: size, width: "auto" }} />
  );
}

/** Height of the full logo (mark and wordmark) in px. */
const SIZES = { nav: 40, footer: 28, sidebar: 36, panel: 48 };

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
  const h = SIZES[size];
  return (
    <Link href={href} className={`inline-flex items-center min-w-0 ${className}`} aria-label={t("landing.nav.home")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={onDark ? "/brand/logo-dark-128.webp" : "/brand/logo-128.webp"} alt="Thesisfic" width={Math.round(h * LOCKUP_RATIO)} height={h} decoding="async" className="block flex-shrink-0" style={{ height: h, width: "auto" }} />
    </Link>
  );
}

// Colours of the loading indicator, sampled from the logo artwork.
const MARK = {
  deep: ["#0b7a5b", "#043d33"],
  pale: ["#b6ead3", "#5fcfa6"],
  mint: ["#2ee0ad", "#0ea57a"],
};

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
