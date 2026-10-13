"use client";

import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n/client";

/**
 * Hero background: sheets of written work (essays, reports, theses) fall from above, tumbling and swaying, soft
 * and blurred, and dissolve gradually over the lower part of the copy column (no floor, no hard edge). The sheets
 * stay in the copy column: the left part of the hero on desktop (the orbit lives on the right), the whole column
 * on phones (the orbit has its own band below). One still frame under reduced motion.
 *
 * Cost model: every sheet is painted once, into a small offscreen sprite (paper, typeset lines, shadow and blur
 * baked in); each frame only composites those sprites with a transform and an alpha. The canvas covers the copy
 * column only, the loop stops while the hero is off screen or the tab hidden, and the bitmap is capped at 1.5×.
 */

type Sheet = {
  x: number; y: number; w: number; h: number;
  vy: number; // px/s
  phi: number; vphi: number; // in-plane rotation
  theta: number; vtheta: number; // tumble around the horizontal axis (foreshortening)
  sway: number; swayAmp: number; swaySpeed: number;
  kind: number; seed: number;
  front: HTMLCanvasElement; back: HTMLCanvasElement; // pre-rendered faces, PAD px of margin around the paper
};

const MAX_SHEETS = 8;
const SPAWN_EVERY = 1.3; // s
const G = 160; // px/s²
const V_MAX = 120; // px/s
const BASE_ALPHA = 0.3;
const BLUR_PX = 1.4;
const PAD = 36; // room around the sheet for its shadow and blur
const EDGE_FADE = 90; // px over which a sheet fades at the column's sides
const MAX_DPR = 1.5;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
// Deterministic pseudo-random per sheet, so the "typeset" lines are the same on the sprite every time.
const prng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

/** Paints one face of a sheet, centred on (0,0), with its drop shadow. */
function paintFace(ctx: CanvasRenderingContext2D, w: number, h: number, kind: number, seed: number, title: string, front: boolean) {
  const r = prng(seed);
  ctx.shadowColor = "rgba(17,24,39,.24)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 8;
  const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(1, front ? "#f1efe8" : "#e9e7e1");
  ctx.fillStyle = g;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(17,24,39,.16)";
  ctx.lineWidth = 1;
  ctx.strokeRect(-w / 2 + 0.5, -h / 2 + 0.5, w - 1, h - 1);
  const curl = ctx.createLinearGradient(0, h / 2 - h * 0.12, 0, h / 2);
  curl.addColorStop(0, "rgba(17,24,39,0)");
  curl.addColorStop(1, "rgba(17,24,39,.08)");
  ctx.fillStyle = curl;
  ctx.fillRect(-w / 2, h / 2 - h * 0.12, w, h * 0.12);
  if (!front) return; // the back of the sheet is blank
  // Typeset content: title, author line, paragraphs of words, a figure on some, a page number
  const pad = w * 0.11;
  const left = -w / 2 + pad;
  const width = w - pad * 2;
  let y = -h / 2 + pad * 1.1;
  ctx.fillStyle = "#282A30";
  ctx.font = `700 ${Math.max(7, w * 0.07)}px Georgia, "Times New Roman", serif`;
  ctx.textBaseline = "top";
  ctx.fillText(title, left, y);
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
    if (kind !== 1 && para === 1 && line === 0 && r() < 0.6) {
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
    const end = left + width * (line === 0 ? 1 : r() < 0.18 ? 0.45 + r() * 0.35 : 1);
    ctx.fillStyle = "rgba(55,65,81,.72)";
    while (x < end) {
      const ww = width * (0.05 + r() * 0.09);
      if (x + ww > end) break;
      ctx.fillRect(x, y, ww, th);
      x += ww + width * 0.025;
    }
    if (line === gutterLine) {
      ctx.fillStyle = ["#20c997", "#7c3aed", "#f59e0b"][kind];
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
  ctx.fillText(String(12 + (seed % 180)), 0, h / 2 - pad * 0.9);
}

/** One face as a sprite: painted sharp into a scratch canvas, then copied once through the blur. */
function makeFace(w: number, h: number, kind: number, seed: number, title: string, front: boolean, scale: number): HTMLCanvasElement {
  const cw = Math.ceil((w + PAD * 2) * scale);
  const ch = Math.ceil((h + PAD * 2) * scale);
  const sharp = document.createElement("canvas");
  sharp.width = cw;
  sharp.height = ch;
  const sc = sharp.getContext("2d");
  if (sc) {
    sc.scale(scale, scale);
    sc.translate(w / 2 + PAD, h / 2 + PAD);
    paintFace(sc, w, h, kind, seed, title, front);
  }
  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  const oc = out.getContext("2d");
  if (oc) {
    if ("filter" in oc) oc.filter = `blur(${BLUR_PX * scale}px)`;
    oc.drawImage(sharp, 0, 0);
  }
  return out;
}

export default function FallingPapers({ className = "" }: { className?: string }) {
  const t = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const titles = [t("landing.papers.essay"), t("landing.papers.report"), t("landing.papers.thesis")];

  useEffect(() => {
    const canvas = ref.current;
    const stage = canvas?.parentElement;
    if (!canvas || !stage) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const desktop = window.matchMedia("(min-width: 768px)");
    const sheets: Sheet[] = [];
    let raf = 0;
    let last = performance.now();
    let sinceSpawn = 0;
    let seeded = false;
    let inView = true;
    let running = false;
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);

    // The canvas covers the copy column only: the left part of the hero on desktop, the whole hero on phones.
    const layout = () => {
      const full = stage.clientWidth;
      const W = desktop.matches ? Math.round(Math.min(full * 0.36, 460)) : full;
      const H = stage.clientHeight;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      return { W, H };
    };

    const spawn = (W: number, H: number, startY?: number): Sheet => {
      const w = rnd(118, 168);
      const h = w * 1.4;
      const kind = Math.floor(Math.random() * 3);
      const seed = Math.floor(Math.random() * 1e9);
      return {
        x: rnd(w * 0.5, Math.max(w * 0.6, W - w * 0.5)),
        y: startY ?? -h * 1.2 - rnd(0, H * 0.3),
        w, h,
        vy: rnd(15, 50),
        phi: rnd(-0.35, 0.35), vphi: rnd(-0.5, 0.5),
        theta: rnd(0, Math.PI * 2), vtheta: rnd(0.8, 1.9) * (Math.random() < 0.5 ? -1 : 1),
        sway: rnd(0, Math.PI * 2), swayAmp: rnd(18, 48), swaySpeed: rnd(0.9, 1.6),
        kind, seed,
        front: makeFace(w, h, kind, seed, titles[kind], true, dpr),
        back: makeFace(w, h, kind, seed, titles[kind], false, dpr),
      };
    };

    const draw = (W: number, H: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // Far to near by size. A sheet fades in under the top edge, dissolves over the lower part of the column and
      // fades at the column's sides instead of being cut.
      for (const s of sheets.slice().sort((a, b) => a.w - b.w)) {
        const bottom = s.y + s.h / 2;
        const fadeIn = Math.max(0, Math.min(1, bottom / (H * 0.18)));
        const fadeOut = Math.max(0, Math.min(1, (H * 0.98 - (s.y - s.h / 2)) / (H * 0.45)));
        const sides = Math.max(0, Math.min(1, s.x / EDGE_FADE, (W - s.x) / EDGE_FADE));
        const alpha = BASE_ALPHA * fadeIn * fadeOut * fadeOut * sides;
        if (alpha < 0.004) continue;
        const sy = Math.cos(s.theta);
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.phi);
        ctx.scale(1, Math.max(0.06, Math.abs(sy)));
        ctx.globalAlpha = alpha;
        ctx.drawImage(sy >= 0 ? s.front : s.back, -(s.w / 2 + PAD), -(s.h / 2 + PAD), s.w + PAD * 2, s.h + PAD * 2);
        ctx.restore();
      }
    };

    const frame = (now: number) => {
      if (!running) return;
      if (!reduce && now - last < 30) {
        // ~30 fps is plenty for drifting sheets.
        raf = requestAnimationFrame(frame);
        return;
      }
      const { W, H } = layout();
      if (!W || !H) {
        raf = requestAnimationFrame(frame);
        return;
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
      draw(W, H);
      if (reduce) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    // Run only while the hero is on screen and the tab visible; one frame under reduced motion.
    const update = () => {
      const should = inView && !document.hidden;
      if (should && !running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      } else if (!should && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    };
    const io = new IntersectionObserver((entries) => {
      inView = entries.some((e) => e.isIntersecting);
      update();
    });
    io.observe(stage);
    const onVis = () => update();
    document.addEventListener("visibilitychange", onVis);
    const resize = new ResizeObserver(() => {
      if (reduce) {
        const { W, H } = layout();
        if (W && H) draw(W, H);
      }
    });
    resize.observe(stage);
    update();
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      resize.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titles[0], titles[1], titles[2]]);

  return <canvas ref={ref} className={`absolute left-0 top-0 pointer-events-none ${className}`} aria-hidden="true" />;
}
