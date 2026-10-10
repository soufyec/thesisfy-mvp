"use client";

import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n/client";

/**
 * Hero background: sheets of written work (essays, reports, theses) fall from above, tumbling and swaying, and
 * come to rest on an invisible floor at the bottom of the copy column, where they pile up; the oldest fade away
 * to make room. Canvas 2D with soft shadows, paper shading and typeset-looking lines. The sheets stay in the
 * copy column: the left part of the hero on desktop (the orbit lives on the right), the whole column on phones
 * (the orbit has its own band below). One still frame under reduced motion.
 */

type Sheet = {
  x: number; y: number; w: number; h: number;
  vy: number; // px/s
  phi: number; vphi: number; // in-plane rotation
  theta: number; vtheta: number; // tumble around the horizontal axis (foreshortening)
  sway: number; swayAmp: number; swaySpeed: number;
  kind: number; seed: number;
  landed: boolean; restY: number; restPhi: number; age: number; fade: number;
};

const MAX_FALLING = 7;
const MAX_PILE = 8;
const SPAWN_EVERY = 1.35; // s
const G = 220; // px/s²
const V_MAX = 150; // px/s
const PILE_STEP = 2.2; // px per settled sheet

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

    const zoneWidth = (W: number) => (window.matchMedia("(min-width: 768px)").matches ? Math.min(W * 0.44, 560) : W);

    const spawn = (W: number, H: number, startY?: number): Sheet => {
      const w = rnd(118, 168);
      const h = w * 1.4;
      const zw = zoneWidth(W);
      return {
        x: rnd(w * 0.5, Math.max(w * 0.6, zw - w * 0.5)),
        y: startY ?? -h - rnd(0, H * 0.4),
        w, h,
        vy: rnd(20, 60),
        phi: rnd(-0.35, 0.35), vphi: rnd(-0.5, 0.5),
        theta: rnd(0, Math.PI * 2), vtheta: rnd(0.8, 1.9) * (Math.random() < 0.5 ? -1 : 1),
        sway: rnd(0, Math.PI * 2), swayAmp: rnd(18, 48), swaySpeed: rnd(0.9, 1.6),
        kind: Math.floor(Math.random() * 3), seed: Math.floor(Math.random() * 1e9),
        landed: false, restY: 0, restPhi: 0, age: 0, fade: 1,
      };
    };

    const drawSheet = (s: Sheet, alpha: number, sy: number, shadow: number) => {
      const r = prng(s.seed);
      const { w, h } = s;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.phi);
      ctx.scale(1, Math.max(0.06, Math.abs(sy)));
      ctx.globalAlpha = alpha;
      // Drop shadow: wide and soft in the air, tight on the floor
      ctx.shadowColor = `rgba(17,24,39,${0.18 + 0.18 * shadow})`;
      ctx.shadowBlur = 26 - 16 * shadow;
      ctx.shadowOffsetY = 10 - 6 * shadow;
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
          // a figure block with a caption
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
        // one line = a run of words of varying width
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
      const floor = H - 6;
      if (reduce && !sheets.length) {
        // A still: a few sheets resting on the floor and two in the air.
        for (let i = 0; i < 5; i++) {
          const s = spawn(W, H, 0);
          s.landed = true;
          s.restY = floor - i * PILE_STEP;
          s.y = s.restY;
          s.restPhi = rnd(-0.3, 0.3);
          s.phi = s.restPhi;
          sheets.push(s);
        }
        for (let i = 0; i < 2; i++) {
          const s = spawn(W, H, rnd(H * 0.2, H * 0.6));
          sheets.push(s);
        }
      }
      if (!reduce) {
        sinceSpawn += dt;
        const falling = sheets.filter((s) => !s.landed).length;
        if (sinceSpawn > SPAWN_EVERY && falling < MAX_FALLING) {
          sinceSpawn = 0;
          sheets.push(spawn(W, H));
        }
        const landed = sheets.filter((s) => s.landed);
        for (const s of sheets) {
          s.age += dt;
          if (!s.landed) {
            s.vy = Math.min(V_MAX, s.vy + G * dt);
            s.y += s.vy * dt;
            s.sway += s.swaySpeed * dt;
            s.x += Math.cos(s.sway) * s.swayAmp * dt;
            s.phi += s.vphi * dt + Math.sin(s.sway) * 0.004;
            s.theta += s.vtheta * dt;
            if (s.y + s.h * 0.1 >= floor - landed.length * PILE_STEP) {
              s.landed = true;
              s.restY = floor - landed.length * PILE_STEP;
              s.y = s.restY;
              s.restPhi = s.phi + rnd(-0.08, 0.08);
              landed.push(s);
            }
          } else {
            // settle flat; the oldest sheets of a full pile fade and leave
            s.phi += (s.restPhi - s.phi) * Math.min(1, dt * 6);
            const idx = landed.indexOf(s);
            if (landed.length > MAX_PILE && idx < landed.length - MAX_PILE) s.fade = Math.max(0, s.fade - dt / 2.2);
          }
        }
        for (let i = sheets.length - 1; i >= 0; i--) if (sheets[i].fade <= 0) sheets.splice(i, 1);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // Floor first (oldest at the bottom), then the air, far to near by size
      const landed = sheets.filter((s) => s.landed);
      const air = sheets.filter((s) => !s.landed).sort((a, b) => a.w - b.w);
      landed.forEach((s, i) => {
        // On the floor the sheet is seen at a low angle: strongly foreshortened, nudged up by its place in the pile
        s.y = s.restY - i * 0.4;
        drawSheet(s, 0.42 * s.fade, 0.22, 1);
      });
      for (const s of air) {
        const near = Math.max(0, Math.min(1, (s.y + s.h / 2) / H)); // closer to the floor: tighter shadow
        drawSheet(s, 0.5, Math.cos(s.theta), near);
      }
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
