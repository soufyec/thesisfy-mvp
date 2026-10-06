"use client";

import { useEffect, useRef } from "react";

/**
 * Orbital scene drawn behind the hero copy: the University (sun) at the centre,
 * the Student (planet) on the main orbit, the AI assistant (moon) and the Advisor
 * (satellite) around the student. Decorative only: `aria-hidden`, no pointer events.
 *
 * Hex colours are allowed in this file only (canvas has no access to Tailwind tokens);
 * every value below mirrors a token from `tailwind.config.ts`.
 */

type Vec3 = { x: number; y: number; z: number };
type Projected = { x: number; y: number; k: number; z: number };
type Body = { label: string; sub: string; c0: string; c1: string; glow: string; r: number };
type Item = { z: number; draw: () => void };

const BODIES: Record<"sun" | "earth" | "moon" | "sat", Body> = {
  sun: { label: "University", sub: "sets policy and budget", c0: "#748ffc", c1: "#364fc7", glow: "rgba(76,110,245,.28)", r: 54 }, // brand-400 → brand-900
  earth: { label: "Student", sub: "writes the thesis", c0: "#63e6be", c1: "#0ca678", glow: "rgba(32,201,151,.25)", r: 24 }, // accent-300 → accent-700
  moon: { label: "AI assistant", sub: "declared, never hidden", c0: "#c4b5fd", c1: "#6d28d9", glow: "rgba(124,58,237,.25)", r: 10 }, // prov.ai range
  sat: { label: "Advisor", sub: "observes the process", c0: "#91a7ff", c1: "#4263eb", glow: "rgba(76,110,245,.2)", r: 8 }, // brand-300 → brand-700
};

const ORBIT = 300;
const MOON_R = 56;
const SAT_R = 84;
const PARTICLE_COLORS = ["#bac8ff", "#96f2d7", "#ddd6fe"]; // brand-200, accent-200, prov.ai-line

// Fixed angles used when the visitor prefers reduced motion.
const STATIC = { yaw: 0.4, earth: 0.9, moon: 2.1, sat: 4.0 };

type Particle = Vec3 & { c: string; s: number };

function makeParticles(): Particle[] {
  return Array.from({ length: 80 }, () => {
    const u = Math.random() * Math.PI * 2;
    const v = Math.acos(2 * Math.random() - 1);
    const r = 430 + Math.random() * 120;
    return {
      x: r * Math.sin(v) * Math.cos(u),
      y: r * Math.cos(v) * 0.6,
      z: r * Math.sin(v) * Math.sin(u),
      c: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      s: 1.5 + Math.random() * 2,
    };
  });
}

export default function HeroScene({ heroRef, textRef }: { heroRef: React.RefObject<HTMLElement>; textRef: React.RefObject<HTMLElement> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const hero = heroRef.current;
    if (!canvas || !hero) return;
    const stage = canvas.parentElement;
    const ctx = canvas.getContext("2d");
    if (!stage || !ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const visible = window.matchMedia("(min-width: 768px)");
    const particles = makeParticles();
    const m = { x: 0, y: 0, tx: 0, ty: 0, px: -1, py: -1 };
    let raf = 0;
    let running = false;
    const start = performance.now();

    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      m.px = e.clientX - r.left;
      m.py = e.clientY - r.top;
      const hr = hero.getBoundingClientRect();
      m.tx = ((e.clientX - hr.left) / hr.width - 0.5) * 2;
      m.ty = ((e.clientY - hr.top) / hr.height - 0.5) * 2;
    };
    const onLeave = () => {
      m.tx = 0;
      m.ty = 0;
      m.px = -1;
      m.py = -1;
    };

    const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };

    const ring = (fn: (a: number) => Projected, color: string, dash?: number[]) => {
      ctx.beginPath();
      for (let i = 0; i <= 96; i++) {
        const q = fn((i / 96) * Math.PI * 2);
        if (i) ctx.lineTo(q.x, q.y);
        else ctx.moveTo(q.x, q.y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash(dash || []);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    const sphere = (q: Projected, body: Body, baseR: number) => {
      const r = baseR * q.k;
      ctx.save();
      ctx.shadowColor = body.glow;
      ctx.shadowBlur = r * 1.4;
      const g = ctx.createRadialGradient(q.x - r * 0.35, q.y - r * 0.4, r * 0.1, q.x, q.y, r);
      g.addColorStop(0, body.c0);
      g.addColorStop(1, body.c1);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
      ctx.stroke();
    };

    const pill = (q: Projected, body: Body, dy: number, hover: boolean) => {
      const fs = (hover ? 13.5 : 12.5) * Math.max(0.85, Math.min(1.1, q.k));
      ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
      const tw = ctx.measureText(body.label).width;
      ctx.font = `500 ${fs * 0.82}px Inter, system-ui, sans-serif`;
      const sw = ctx.measureText(body.sub).width;
      const pw = Math.max(tw, sw) + fs * 1.8;
      const ph = fs * 3.1;
      const x = q.x - pw / 2;
      const y = q.y + dy;
      ctx.save();
      ctx.shadowColor = "rgba(17,24,39,.14)";
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 6;
      roundRect(x, y, pw, ph, 10);
      ctx.fillStyle = hover ? body.c1 : "rgba(255,255,255,.96)";
      ctx.fill();
      ctx.restore();
      roundRect(x, y, pw, ph, 10);
      ctx.strokeStyle = hover ? body.c1 : "#e5e7eb"; // gray-200
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = hover ? "#fff" : "#111827"; // gray-900
      ctx.fillText(body.label, q.x, y + ph * 0.34);
      ctx.font = `500 ${fs * 0.82}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = hover ? "rgba(255,255,255,.85)" : "#6b7280"; // gray-500
      ctx.fillText(body.sub, q.x, y + ph * 0.7);
      ctx.textAlign = "start";
    };

    const drawFrame = (now: number) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (!W || !H) return;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      m.x += (m.tx - m.x) * 0.05;
      m.y += (m.ty - m.y) * 0.05;
      const t = (now - start) / 1000;
      const yaw = (reduce ? STATIC.yaw : t * 0.02) + m.x * 0.5;
      const pitch = -0.42 + m.y * 0.2;
      const F = 900;
      // The sun sits to the right of the text column so the orbit sweeps under the headline.
      const te = textRef.current;
      const textRight = te ? te.getBoundingClientRect().right - stage.getBoundingClientRect().left : W * 0.6;
      // Keep the student orbit (300px) and its pill inside the hero on wide screens.
      const cx = Math.min(W - 150, Math.max(W * 0.68, textRight + 90));
      const cy = H * 0.55;
      const S = Math.max(0.6, Math.min(W / 640, H / 330));
      const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const P = (x: number, y: number, z: number): Projected => {
        const x1 = x * cyw + z * syw;
        const z1 = -x * syw + z * cyw;
        const y1 = y * cp - z1 * sp;
        const z2 = y * sp + z1 * cp;
        const k = F / (F + z2 + 650);
        return { x: cx + x1 * k * S, y: cy + y1 * k * S, k: k * S, z: z2 };
      };

      const items: Item[] = [];
      for (const p of particles) {
        const q = P(p.x, p.y, p.z);
        items.push({
          z: q.z,
          draw: () => {
            ctx.globalAlpha = 0.35 + q.k * 0.4;
            ctx.fillStyle = p.c;
            ctx.beginPath();
            ctx.arc(q.x, q.y, p.s * q.k, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          },
        });
      }

      const ea = reduce ? STATIC.earth : t * 0.08;
      const ma = reduce ? STATIC.moon : t * 0.38;
      const sa = reduce ? STATIC.sat : t * 0.26 + 1.3;
      const E: Vec3 = { x: Math.cos(ea) * ORBIT, y: 0, z: Math.sin(ea) * ORBIT };
      const M: Vec3 = { x: E.x + Math.cos(ma) * MOON_R, y: Math.sin(ma) * MOON_R * 0.35, z: E.z + Math.sin(ma) * MOON_R };
      const SA: Vec3 = { x: E.x + Math.cos(sa) * SAT_R * 0.55, y: Math.sin(sa) * SAT_R, z: E.z + Math.sin(sa) * SAT_R * 0.55 };
      const qS = P(0, 0, 0), qE = P(E.x, E.y, E.z), qM = P(M.x, M.y, M.z), qA = P(SA.x, SA.y, SA.z);

      items.push({ z: 1e4, draw: () => ring((a) => P(Math.cos(a) * ORBIT, 0, Math.sin(a) * ORBIT), "rgba(76,110,245,.18)") });
      items.push({
        z: qE.z + 1,
        draw: () => {
          ring((a) => P(E.x + Math.cos(a) * MOON_R, Math.sin(a) * MOON_R * 0.35, E.z + Math.sin(a) * MOON_R), "rgba(124,58,237,.3)");
          ring((a) => P(E.x + Math.cos(a) * SAT_R * 0.55, Math.sin(a) * SAT_R, E.z + Math.sin(a) * SAT_R * 0.55), "rgba(76,110,245,.25)", [3, 4]);
        },
      });

      const hov = (q: Projected, rad: number) => m.px >= 0 && Math.hypot(m.px - q.x, m.py - q.y) < rad;
      const hS = hov(qS, 70), hE = hov(qE, 44), hM = hov(qM, 26), hA = hov(qA, 26);

      // Sun glow
      items.push({
        z: 1e4 - 1,
        draw: () => {
          const r = BODIES.sun.r * qS.k * 2.4;
          const g = ctx.createRadialGradient(qS.x, qS.y, BODIES.sun.r * qS.k * 0.8, qS.x, qS.y, r);
          g.addColorStop(0, "rgba(116,143,252,.35)");
          g.addColorStop(1, "rgba(116,143,252,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(qS.x, qS.y, r, 0, Math.PI * 2);
          ctx.fill();
        },
      });
      // Sun with shield-check glyph
      items.push({
        z: qS.z,
        draw: () => {
          sphere(qS, BODIES.sun, BODIES.sun.r);
          const r = BODIES.sun.r * qS.k;
          ctx.strokeStyle = "rgba(255,255,255,.9)";
          ctx.lineWidth = Math.max(1.5, 3 * qS.k);
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(qS.x, qS.y - r * 0.5);
          ctx.lineTo(qS.x - r * 0.42, qS.y - r * 0.32);
          ctx.lineTo(qS.x - r * 0.42, qS.y + r * 0.05);
          ctx.bezierCurveTo(qS.x - r * 0.42, qS.y + r * 0.35, qS.x, qS.y + r * 0.52, qS.x, qS.y + r * 0.52);
          ctx.bezierCurveTo(qS.x, qS.y + r * 0.52, qS.x + r * 0.42, qS.y + r * 0.35, qS.x + r * 0.42, qS.y + r * 0.05);
          ctx.lineTo(qS.x + r * 0.42, qS.y - r * 0.32);
          ctx.closePath();
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(qS.x - r * 0.18, qS.y + r * 0.02);
          ctx.lineTo(qS.x - r * 0.04, qS.y + r * 0.16);
          ctx.lineTo(qS.x + r * 0.2, qS.y - r * 0.12);
          ctx.stroke();
          pill(qS, BODIES.sun, r + 12, hS);
        },
      });
      // Advisor sight line to the student
      items.push({
        z: Math.min(qA.z, qE.z) - 0.5,
        draw: () => {
          ctx.strokeStyle = hA ? BODIES.sat.c1 : "rgba(66,99,235,.45)";
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          ctx.moveTo(qA.x, qA.y);
          ctx.lineTo(qE.x, qE.y);
          ctx.stroke();
          ctx.setLineDash([]);
        },
      });
      // Student
      items.push({
        z: qE.z,
        draw: () => {
          sphere(qE, BODIES.earth, BODIES.earth.r);
          pill(qE, BODIES.earth, BODIES.earth.r * qE.k + 10, hE);
        },
      });
      // AI assistant moon
      items.push({
        z: qM.z,
        draw: () => {
          sphere(qM, BODIES.moon, BODIES.moon.r);
          if (hM) {
            pill(qM, BODIES.moon, BODIES.moon.r * qM.k + 8, true);
          } else {
            ctx.font = `600 ${11 * Math.max(0.85, qM.k)}px Inter, system-ui, sans-serif`;
            ctx.fillStyle = "#6d28d9";
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillText("AI", qM.x, qM.y + BODIES.moon.r * qM.k + 4);
            ctx.textAlign = "start";
          }
        },
      });
      // Advisor satellite
      items.push({
        z: qA.z,
        draw: () => {
          const k = qA.k;
          const r = BODIES.sat.r * k;
          ctx.save();
          ctx.translate(qA.x, qA.y);
          ctx.rotate(sa * 0.5);
          ctx.fillStyle = "#4263eb"; // brand-700
          ctx.fillRect(-r * 2.6, -r * 0.45, r * 1.5, r * 0.9);
          ctx.fillRect(r * 1.1, -r * 0.45, r * 1.5, r * 0.9);
          ctx.fillStyle = "#fff";
          ctx.strokeStyle = "#4263eb";
          ctx.lineWidth = 1.2;
          roundRect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6, r * 0.3);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
          if (hA) {
            pill(qA, BODIES.sat, r + 10, true);
          } else {
            ctx.font = `600 ${11 * Math.max(0.85, k)}px Inter, system-ui, sans-serif`;
            ctx.fillStyle = "#4263eb";
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillText("Advisor", qA.x, qA.y - r * 2.2);
            ctx.textAlign = "start";
          }
        },
      });

      items.sort((a, b) => b.z - a.z).forEach((i) => i.draw());
    };

    const loop = (now: number) => {
      if (!running) return;
      drawFrame(now);
      raf = requestAnimationFrame(loop);
    };
    const startLoop = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stopLoop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    const drawStatic = () => drawFrame(performance.now());

    // Under 768px the canvas is display:none; do not animate a hidden scene.
    const onVisibility = () => {
      if (!visible.matches) {
        stopLoop();
        return;
      }
      if (reduce) drawStatic();
      else startLoop();
    };

    const resize = new ResizeObserver(() => {
      if (reduce && visible.matches) drawStatic();
    });
    resize.observe(stage);

    if (!reduce) {
      hero.addEventListener("pointermove", onMove);
      hero.addEventListener("pointerleave", onLeave);
    }
    visible.addEventListener("change", onVisibility);
    onVisibility();

    return () => {
      stopLoop();
      resize.disconnect();
      visible.removeEventListener("change", onVisibility);
      hero.removeEventListener("pointermove", onMove);
      hero.removeEventListener("pointerleave", onLeave);
    };
  }, [heroRef, textRef]);

  return <canvas ref={canvasRef} aria-hidden="true" className="hidden md:block absolute inset-0 w-full h-full opacity-[.38] pointer-events-none" />;
}
