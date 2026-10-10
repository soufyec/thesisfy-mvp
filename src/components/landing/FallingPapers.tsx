"use client";

import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n/client";

/**
 * Hero background: sheets of written work (essays, reports, theses) drifting down out of the distance towards
 * the viewer, very translucent, like pages falling from the sky. Canvas 2D, about thirty sheets, one draw per
 * frame; under reduced motion a single still frame. Sits behind the copy and the orbit scene.
 */

type Paper = { x: number; y: number; z: number; w: number; rot: number; vr: number; vy: number; vz: number; kind: number; lines: number[]; gutter: number; figure: boolean };

const F = 720;
const FAR = 2600;
const NEAR = -140;
const COUNT = 30;
const PAPER = "#fffdf6"; // warm paper, drawn translucent over the page (canvas: hex allowed, see CLAUDE.md §8)
const INK = "#6b7280"; // gray-500 for the text rules
const TITLE = "#374151"; // gray-700
const GUTTERS = ["#20c997", "#7c3aed", "#f59e0b"]; // prov-human, prov-ai, prov-paste

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function spawn(W: number, H: number, far = true): Paper {
  const lines = Array.from({ length: Math.floor(rnd(7, 13)) }, () => rnd(0.45, 1));
  return {
    x: rnd(-W * 0.75, W * 0.75),
    y: rnd(-H * 0.9, H * 0.4),
    z: far ? rnd(FAR * 0.6, FAR) : rnd(NEAR, FAR),
    w: rnd(150, 230),
    rot: rnd(-0.25, 0.25),
    vr: rnd(-0.05, 0.05),
    vy: rnd(14, 30),
    vz: rnd(110, 190),
    kind: Math.floor(Math.random() * 3),
    lines,
    gutter: Math.floor(Math.random() * 3),
    figure: Math.random() < 0.4,
  };
}

export default function FallingPapers({ className = "" }: { className?: string }) {
  const t = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const titles = [t("landing.papers.essay"), t("landing.papers.report"), t("landing.papers.thesis")];

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let papers: Paper[] = [];
    let raf = 0;
    let last = performance.now();

    const draw = (now: number) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (!W || !H) {
        raf = requestAnimationFrame(draw);
        return;
      }
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      if (!papers.length) papers = Array.from({ length: COUNT }, () => spawn(W, H, false));
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const cx = W * 0.5;
      const cy = H * 0.42;
      papers.sort((a, b) => b.z - a.z);
      for (const p of papers) {
        if (!reduce) {
          p.z -= p.vz * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          if (p.z < NEAR) Object.assign(p, spawn(W, H, true));
        }
        const k = F / (F + p.z);
        const w = p.w * k;
        const h = w * 1.38;
        const x = cx + p.x * k;
        const y = cy + p.y * k;
        // Faint far away, clearest mid-way, gone as it passes the viewer.
        const a = Math.max(0, Math.min(1, (FAR - p.z) / (FAR * 0.55))) * Math.max(0, Math.min(1, (p.z - NEAR) / 260));
        const alpha = 0.16 * a;
        if (alpha < 0.005) continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = alpha;
        ctx.shadowColor = "rgba(17,24,39,.35)";
        ctx.shadowBlur = 14 * k;
        ctx.shadowOffsetY = 6 * k;
        ctx.fillStyle = PAPER;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = "rgba(17,24,39,.18)";
        ctx.lineWidth = 1;
        ctx.strokeRect(-w / 2, -h / 2, w, h);
        // Title
        const pad = w * 0.1;
        const fs = Math.max(6, w * 0.075);
        ctx.fillStyle = TITLE;
        ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`;
        ctx.textBaseline = "top";
        ctx.fillText(titles[p.kind], -w / 2 + pad, -h / 2 + pad);
        // Optional figure (an engraving-like block) under the title
        let ly = -h / 2 + pad + fs * 1.9;
        if (p.figure) {
          ctx.fillStyle = "rgba(107,114,128,.28)";
          ctx.fillRect(-w / 2 + pad, ly, w - pad * 2, h * 0.16);
          ly += h * 0.16 + fs * 0.9;
        }
        // Text rules, one of them with a provenance gutter bar
        const gap = Math.max(3, w * 0.058);
        const th = Math.max(1, w * 0.016);
        p.lines.forEach((len, i) => {
          if (ly + th > h / 2 - pad) return;
          ctx.fillStyle = INK;
          ctx.globalAlpha = alpha * 0.75;
          ctx.fillRect(-w / 2 + pad, ly, (w - pad * 2) * len, th);
          if (i === 2 || i === 3) {
            ctx.fillStyle = GUTTERS[p.gutter];
            ctx.globalAlpha = alpha * 1.6;
            ctx.fillRect(-w / 2 + pad * 0.55, ly - th * 0.5, Math.max(1.5, w * 0.014), th * 2);
          }
          ly += gap;
        });
        ctx.restore();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else {
        last = performance.now();
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titles[0], titles[1], titles[2]]);

  return <canvas ref={ref} className={`absolute inset-0 w-full h-full pointer-events-none ${className}`} aria-hidden="true" />;
}
