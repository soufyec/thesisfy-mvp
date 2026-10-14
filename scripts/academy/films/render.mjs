// Renders the animatic to frames at a fixed rate, using the page's deterministic seek(), then muxes the narration.
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
const [, , lang, cut, out, fpsArg, onlyAt] = process.argv;
const FPS = Number(fpsArg || 25);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(process.env.FILMS_URL || "http://localhost:3095/index.html", { waitUntil: "load" });
await p.waitForTimeout(800);
const info = await p.evaluate((l) => window.__render.setup(l[0], l[1]), [lang, cut]);
await p.evaluate(() => document.fonts.ready);
if (onlyAt) {
  for (const t of onlyAt.split(",").map(Number)) { await p.evaluate((x) => window.__render.seek(x), t); await p.screenshot({ path: `${out}/at-${cut}-${lang}-${t}.jpg`, type: "jpeg", quality: 80 }); }
  console.log(JSON.stringify({ total: info.total, errs })); await b.close(); process.exit(0);
}
const dir = `${out}/frames-${cut}-${lang}`;
const N = Math.ceil(info.total * FPS);
// FROM/TO (seconds) re-render only that stretch into the existing frames; otherwise the whole film from scratch.
const from = process.env.FROM ? Math.floor(Number(process.env.FROM) * FPS) : 0, to = process.env.TO ? Math.min(N, Math.ceil(Number(process.env.TO) * FPS)) : N;
if (!process.env.FROM) { rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true }); }
for (let f = from; f < to; f++) {
  await p.evaluate((x) => window.__render.seek(x), f / FPS);
  await p.screenshot({ path: `${dir}/${String(f).padStart(5, "0")}.jpg`, type: "jpeg", quality: 90 });
  if (f % 250 === 0) console.log(cut, lang, f, "/", N);
}
await b.close();
console.log(JSON.stringify({ cut, lang, frames: N, total: info.total, errs }));
