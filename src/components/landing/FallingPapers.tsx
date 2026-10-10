"use client";

import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n/client";

/**
 * Hero background: sheets of written work (essays, reports, theses) fall from above, tumbling and swaying, soft
 * and blurred, and dissolve gradually over the lower part of the copy column (no floor, no hard edge). Canvas 2D
 * with paper shading, soft shadows and typeset-looking lines. The sheets stay in the copy column: the left part
 * of the hero on desktop (the orbit lives on the right), the whole column on phones (the orbit has its own band
 * below). One still frame under reduced motion.
 */

type Sheet = {
  x: number; y: number; w: number; h: number;
  vy: number; // px/s
  phi: number; vphi: number; // in-plane rotation
  theta: number; vtheta: number; // tumble around the horizontal axis (foreshortening)
  sway: number; swayAmp: number; swaySpeed: number;
  kind: number; seed: number;
};

const MAX_SHEETS = 8;
const SPAWN_EVERY = 1.3; // s
const G = 160; // px/s²
const V_MAX = 120; // px/s
const BASE_ALPHA = 0.3;
const BLUR_PX = 1.4;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
// Deterministic pseudo-random per sheet, so the "typeset" lines do not flicker between frames.
const prng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

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
    const sheets: Sheet[] = [];
    let raf = 0;
    let last = performance.now();
    let sinceSpawn = 0;
    let seeded = false;

    const zoneWidth = (W: number) => (window.matchMedia("(min-width: 768px)").matches ? Math.min(W * 0.36, 460) : W);

    const spawn = (W: number, H: number, startY?: number): Sheet => {
      const w = rnd(118, 168);
      const h = w * 1.4;
      const zw = zoneWidth(W);
      return {
        x: rnd(w * 0.5, Math.max(w * 0.6, zw - w * 0.5)),
        y: startY ?? -h * 1.2 - rnd(0, H * 0.3),
        w, h,
        vy: rnd(15, 50),
        phi: rnd(-0.35, 0.35), vphi: rnd(-0.5, 0.5),
        theta: rnd(0, Math.PI * 2), vtheta: rnd(0.8, 1.9) * (Math.random() < 0.5 ? -1 : 1),
        sway: rnd(0, Math.PI * 2), swayAmp: rnd(18, 48), swaySpeed: rnd(0.9, 1.6),
        kind: Math.floor(Math.random() * 3), seed: Math.floor(Math.random() * 1e9),
      };
    };

    const drawSheet = (s: Sheet, alpha: number, sy: number, low: number) => {
      const r = prng(s.seed);
      const { w, h } = s;
      ctx.save();
      if ("filter" in ctx) ctx.filter = `blur(${BLUR_PX}px)`;
      ctx.translate(s.x, s.y);
      ctx.rotate(s.phi);
      ctx.scale(1, Math.max(0.06, Math.abs(sy)));
      ctx.globalAlpha = alpha;
      // Drop shadow: wide and soft high up, a little tighter lower down
      ctx.shadowColor = `rgba(17,24,39,${0.18 + 0.12 * low})`;
      ctx.shadowBlur = 26 - 10 * low;
      ctx.shadowOffsetY = 10 - 4 * low;
      // Paper: a slightly warm white with a lighting gradient across the sheet
      const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(1, sy >= 0 ? "#f1efe8" : "#e9e7e1");
      ctx.fillStyle = g;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.shadowColor = "transparent";
      // Edge and a faint curl along the bottom
      ctx.strokeStyle = "rgba(17,24,39,.16)";
      ctx.lineWidth = 1;
      ctx.strokeRect(-w / 2 + 0.5, -h / 2 + 0.5, w - 1, h - 1);
      const curl = ctx.createLinearGradient(0, h / 2 - h * 0.12, 0, h / 2);
      curl.addColorStop(0, "rgba(17,24,39,0)");
      curl.addColorStop(1, "rgba(17,24,39,.08)");
      ctx.fillStyle = curl;
      ctx.fillRect(-w / 2, h / 2 - h * 0.12, w, h * 0.12);
      if (sy < 0) {
        ctx.restore();
        return; // the back of the sheet is blank
      }
      // Typeset content: title, author line, paragraphs of words, a figure on some, a page number
      const pad = w * 0.11;
      const left = -w / 2 + pad;
      const width = w - pad * 2;
      let y = -h / 2 + pad * 1.1;
      ctx.fillStyle = "#1f2937";
      ctx.font = `700 ${Math.max(7, w * 0.07)}px Georgia, "Times New Roman", serif`;
      ctx.textBaseline = "top";
      ctx.fillText(titles[s.kind], left, y);
      y += w * 0.1;
      ctx.fillStyle = "#9ca3af";
      ctx.fillRect(left, y, width * 0.38, Math.max(1, w * 0.012));
      y += w * 0.06;
      const lineH = Math.max(2.4, w * 0.047);
      const th = Math.max(1, w * 0.014);
      let para = 0;
      const gutterLine = 2 + Math.floor(r() * 4);
      let line = 0;
      while (y < h / 2 - pad * 1.3) {
        if (s.kind !== 1 && para === 1 && line === 0 && r() < 0.6) {
          const fh = h * 0.14;
          const fg = ctx.createLinearGradient(left, y, left + width, y + fh);
          fg.addColorStop(0, "rgba(107,114,128,.18)");
          fg.addColorStop(1, "rgba(107,114,128,.34)");
          ctx.fillStyle = fg;
          ctx.fillRect(left + width * 0.1, y, width * 0.8, fh);
          y += fh + lineH * 0.6;
          ctx.fillStyle = "#9ca3af";
          ctx.fillRect(left + width * 0.25, y, width * 0.5, th);
          y += lineH * 1.2;
          para++;
          continue;
        }
        let x = left;
        const end = left + width * (line === 0 ? 1 : r() < 0.18 ? rnd(0.45, 0.8) : 1);
        ctx.fillStyle = "rgba(55,65,81,.72)";
        while (x < end) {
          const ww = width * rnd(0.05, 0.14);
          if (x + ww > end) break;
          ctx.fillRect(x, y, ww, th);
          x += ww + width * 0.025;
        }
        if (line === gutterLine) {
          ctx.fillStyle = ["#20c997", "#7c3aed", "#f59e0b"][s.kind];
          ctx.fillRect(left - pad * 0.5, y - th, Math.max(1.5, w * 0.014), th * 3);
        }
        y += lineH;
        line++;
        if (line >= 4 + Math.floor(r() * 5)) {
          line = 0;
          para++;
          y += lineH * 0.8;
        }
      }
      ctx.fillStyle = "#9ca3af";
      ctx.font = `400 ${Math.max(5, w * 0.045)}px Georgia, serif`;
      ctx.textAlign = "center";
      ctx.fillText(String(12 + (s.seed % 180)), 0, h / 2 - pad * 0.9);
      ctx.restore();
    };

    const frame = (now: number) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (!W || !H) {
        raf = requestAnimationFrame(frame);
        return;
      }
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!seeded) {
        // The scene is full from the first frame: sheets already mid-fall at different heights.
        seeded = true;
        for (let i = 0; i < 6; i++) {
          const sh = spawn(W, H, rnd(-H * 0.05, H * 0.75));
          if (!reduce) sh.vy = rnd(40, 100);
          sheets.push(sh);
        }
      }
      if (!reduce) {
        sinceSpawn += dt;
        if (sinceSpawn > SPAWN_EVERY && sheets.length < MAX_SHEETS) {
          sinceSpawn = 0;
          sheets.push(spawn(W, H));
        }
        for (const s of sheets) {
          s.vy = Math.min(V_MAX, s.vy + G * dt);
          s.y += s.vy * dt;
          s.sway += s.swaySpeed * dt;
          s.x += Math.cos(s.sway) * s.swayAmp * dt;
          s.phi += s.vphi * dt + Math.sin(s.sway) * 0.004;
          s.theta += s.vtheta * dt;
        }
        for (let i = sheets.length - 1; i >= 0; i--) if (sheets[i].y - sheets[i].h / 2 > H) sheets.splice(i, 1);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // Far to near by size. A sheet fades in under the top edge and dissolves over the lower part of the column.
      for (const s of sheets.slice().sort((a, b) => a.w - b.w)) {
        const bottom = s.y + s.h / 2;
        const fadeIn = Math.max(0, Math.min(1, bottom / (H * 0.18)));
        const fadeOut = Math.max(0, Math.min(1, (H * 0.98 - (s.y - s.h / 2)) / (H * 0.45)));
        const alpha = BASE_ALPHA * fadeIn * fadeOut * fadeOut;
        if (alpha < 0.004) continue;
        drawSheet(s, alpha, Math.cos(s.theta), Math.max(0, Math.min(1, s.y / H)));
      }
      // Soft edges: whatever crosses the top or the sides of the column fades out instead of being cut.
      ctx.save();
      if ("filter" in ctx) ctx.filter = "none";
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "destination-in";
      const top = ctx.createLinearGradient(0, 0, 0, H * 0.22);
      top.addColorStop(0, "rgba(0,0,0,0)");
      top.addColorStop(1, "rgba(0,0,0,1)");
      ctx.fillStyle = top;
      ctx.fillRect(0, 0, W, H);
      const sides = ctx.createLinearGradient(0, 0, W, 0);
      sides.addColorStop(0, "rgba(0,0,0,0)");
      sides.addColorStop(Math.min(0.3, 90 / W), "rgba(0,0,0,1)");
      sides.addColorStop(1 - Math.min(0.3, 90 / W), "rgba(0,0,0,1)");
      sides.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sides;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else {
        last = performance.now();
        raf = requestAnimationFrame(frame);
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
