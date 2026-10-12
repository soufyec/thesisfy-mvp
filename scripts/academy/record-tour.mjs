// Records the onboarding tour video for one UI language: a virtual cursor drives the real app at 1280×720 while
// each scene is held at least as long as its narration. Writes <OUT>/<lang>/video.webm and marks.json (scene
// start times on the recording's clock); compose-tour.py then lays the narration over it.
//
//   JWT_SECRET=x npx next start -p 3050            # fresh in-memory store before every take
//   TOUR_LANG=en node scripts/academy/record-tour.mjs
//
// Durations come from <OUT>/nar/durations.json (Kokoro output, see compose-tour.py). Demo-mode notices and the
// "no model" chip are hidden/renamed as production shows them with a university model.
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const B = process.env.TOUR_BASE || "http://localhost:3050";
const LANG = process.env.TOUR_LANG || "en";
const OUT = process.env.TOUR_OUT || "/tmp/tour-video";
const DUR = JSON.parse(fs.readFileSync(path.join(OUT, "nar", "durations.json"), "utf8"))[LANG];
const dir = path.join(OUT, LANG);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const T = {
  en: {
    typed: "This study compares three classification approaches on a corpus of twelve thousand articles.",
    pasted: "Language models reproduce the biases present in their training data, which limits their use in academic settings. Their growing size does not fix the problem: it amplifies the dominant representations of the corpus and makes errors harder to spot for a non-specialist reader.",
    source: "Bender et al. (2021), p. 613",
    critique: "Is my claim about model bias well supported?",
    outline: "Outline my chapter on bias in language models",
    insert: "Insert, marked as AI",
    model: "Gemini 3.8 Flash",
  },
  es: {
    typed: "Este estudio compara tres enfoques de clasificación sobre un corpus de doce mil artículos.",
    pasted: "Los modelos de lenguaje reproducen los sesgos presentes en sus datos de entrenamiento, lo que limita su uso en contextos académicos. Su tamaño creciente no corrige el problema: amplifica las representaciones dominantes del corpus y hace que los errores sean más difíciles de detectar para un lector no especialista.",
    source: "Bender et al. (2021), p. 613",
    critique: "¿Está bien fundamentada mi afirmación sobre el sesgo de los modelos?",
    outline: "Haz un esquema de mi capítulo sobre el sesgo en los modelos de lenguaje",
    insert: "Insertar, marcado como IA",
    model: "Gemini 3.8 Flash",
  },
  fr: {
    typed: "Cette étude compare trois approches de classification sur un corpus de douze mille articles.",
    pasted: "Les modèles de langage reproduisent les biais présents dans leurs données d'entraînement, ce qui limite leur usage en contexte académique. Leur taille croissante ne corrige pas ce problème : elle amplifie les représentations dominantes du corpus et rend les erreurs plus difficiles à repérer pour un lecteur non spécialiste.",
    source: "Bender et al. (2021), p. 613",
    critique: "Mon affirmation sur les biais des modèles est-elle bien étayée ?",
    outline: "Propose un plan pour mon chapitre sur les biais des modèles de langage",
    insert: "Insérer, marqué comme IA",
    model: "Gemini 3.8 Flash",
  },
}[LANG];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--font-render-hinting=none"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, recordVideo: { dir, size: { width: 1280, height: 720 } }, locale: { en: "en-GB", es: "es-ES", fr: "fr-FR" }[LANG] });
const page = await ctx.newPage();
const t0 = Date.now();
const now = () => (Date.now() - t0) / 1000;
const marks = [];
const wait = (ms) => page.waitForTimeout(ms);
page.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 160)));

// ---------- Virtual cursor: an arrow drawn on top of the page, moved with easing before every click ----------
await page.addInitScript((model) => {
  window.__MODEL = model;
  // The take is not the first visit: keep the welcome modal and the tour out of the recording.
  try { localStorage.setItem("onboarding_v1", "done"); } catch { /* ignore */ }
  const make = () => {
    if (document.getElementById("vcur")) return;
    const d = document.createElement("div");
    d.id = "vcur";
    const p = JSON.parse(sessionStorage.getItem("vcur") || "null") || { x: 640, y: 400 };
    d.style.cssText = `position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;transform:translate(${p.x}px,${p.y}px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));transition:none`;
    d.innerHTML = `<svg width="28" height="28" viewBox="0 0 28 28"><path d="M4 3 L4 21 L9 16.5 L12.5 24 L15.5 22.7 L12 15.2 L18.5 15 Z" fill="#111827" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/></svg><span id="vring" style="position:absolute;left:-4px;top:-4px;width:20px;height:20px;border-radius:50%;border:2px solid #4c6ef5;opacity:0;transform:scale(.4)"></span>`;
    document.documentElement.appendChild(d);
    window.__vc = p;
  };
  window.__vcMove = (x, y, ms) => new Promise((res) => {
    make();
    const d = document.getElementById("vcur");
    const from = { ...window.__vc };
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const step = (t) => {
      const k = Math.min(1, (t - start) / ms);
      const e = ease(k);
      const cx = from.x + (x - from.x) * e, cy = from.y + (y - from.y) * e;
      d.style.transform = `translate(${cx}px,${cy}px)`;
      if (k < 1) requestAnimationFrame(step);
      else { window.__vc = { x, y }; sessionStorage.setItem("vcur", JSON.stringify(window.__vc)); res(); }
    };
    requestAnimationFrame(step);
  });
  window.__vcClick = () => {
    make();
    const r = document.getElementById("vring");
    r.style.transition = "none"; r.style.opacity = "0.9"; r.style.transform = "scale(.4)";
    requestAnimationFrame(() => { r.style.transition = "opacity .45s ease, transform .45s ease"; r.style.opacity = "0"; r.style.transform = "scale(2.2)"; });
  };
  if (document.readyState !== "loading") make(); else document.addEventListener("DOMContentLoaded", make);
  // Production shows the university's model; the local take has no key, so rename the chip and hide demo notices.
  // Throttled: a full scan on every mutation would stall the editor.
  let pending = false;
  const strip = () => {
    pending = false;
    for (const el of document.querySelectorAll("[data-tour='model'] span.truncate")) if (/model|modelo|modèle/i.test(el.textContent || "")) el.textContent = window.__MODEL || "Gemini 3.8 Flash";
    for (const el of document.querySelectorAll("div, p, span")) {
      if (el.childElementCount === 0 && /^(Demo mode|Modo demo|Mode démo)/.test(el.textContent || "")) el.style.display = "none";
    }
  };
  new MutationObserver(() => { if (pending) return; pending = true; setTimeout(strip, 400); }).observe(document, { subtree: true, childList: true, characterData: true });
}, T.model);
const cursorTo = async (x, y, ms) => { await page.evaluate(([x, y, ms]) => window.__vcMove(x, y, ms), [x, y, ms]); await page.mouse.move(x, y); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
let cur = { x: 640, y: 400 };
const clickAt = async (x, y, { settle = 350 } = {}) => {
  const ms = Math.min(1100, Math.max(350, dist(cur, { x, y }) * 1.1));
  await cursorTo(x - 3, y - 2, ms);
  cur = { x: x - 3, y: y - 2 };
  await wait(120);
  await page.evaluate(() => window.__vcClick());
  await page.mouse.click(x, y);
  await wait(settle);
};
const clickEl = async (locator, opts = {}) => {
  const el = typeof locator === "string" ? page.locator(locator).first() : locator.first();
  await el.waitFor({ state: "visible", timeout: 15000 });
  const b = await el.boundingBox();
  const x = b.x + (opts.ax ?? b.width / 2), y = b.y + (opts.ay ?? b.height / 2);
  await clickAt(x, y, opts);
};
const typeText = async (text, delay = 26) => { await page.keyboard.type(text, { delay }); };

// A scene starts now and is held at least as long as its narration (plus a breath) before the next one.
let sceneStart = 0, sceneKey = null;
const scene = async (key) => {
  if (sceneKey) await holdScene();
  sceneKey = key; sceneStart = now();
  marks.push({ key, t: sceneStart });
  console.log(sceneStart.toFixed(1), key);
};
const holdScene = async (extra = 0.6) => {
  const need = (DUR[sceneKey] || 0) + extra - (now() - sceneStart);
  if (need > 0) await wait(need * 1000);
};

// ---------- Take ----------
const dump = async (why) => {
  try {
    const cdp = await ctx.newCDPSession(page);
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(dir, "failure.png"), Buffer.from(data, "base64"));
    const btns = await page.$$eval("button", (bs) => bs.map((b) => b.textContent.trim().slice(0, 30)).filter(Boolean));
    fs.writeFileSync(path.join(dir, "failure.json"), JSON.stringify({ why: String(why), url: page.url(), btns }, null, 1));
  } catch (e) { console.log("dump failed", e.message); }
};
const onFail = async (e) => { console.log("FAILED", String(e).slice(0, 300)); await dump(e); process.exit(1); };
process.on("unhandledRejection", onFail);
process.on("uncaughtException", onFail);
const login = async (email, password) => { const r = await page.request.post(`${B}/api/auth/login`, { data: { email, password } }); if (!r.ok()) throw new Error("login failed " + r.status()); };
await login("jane.cooper@stanford.edu", "demo123");
await page.goto(`${B}/${LANG}/dashboard`);
await page.waitForSelector("a[href*='/dashboard/editor/']");
await page.evaluate((m) => { const s = document.createElement("style"); s.textContent = "[data-testid=session-deadline]{display:none !important}"; document.head.appendChild(s); }, "");
await wait(1200);

// 1. Intro: from the dashboard into the editor
await scene("intro");
await wait(1800);
await clickEl(page.locator("a[href*='/dashboard/editor/thesis_1']").first());
await page.waitForSelector(".ProseMirror");
await page.evaluate((m) => { for (const el of document.querySelectorAll("[data-tour='model'] span.truncate")) el.textContent = m; }, T.model);
await wait(600);
await page.evaluate(() => { const s = document.createElement("style"); s.textContent = "[data-testid=session-deadline]{display:none !important}"; document.head.appendChild(s); });

// 2. Write: caret after the first paragraph of the introduction, new line, type
await scene("write");
// The second real paragraph of the sheet (¶2, under "1. Introduction"): the cursor travels to its end and the
// caret is placed there programmatically, which is what a precise click would do without the risk of landing in
// the margin and sending the caret to the end of the document.
const pr = await page.evaluate(() => {
  const pm = document.querySelector(".ProseMirror");
  const ps = [...pm.querySelectorAll("p")].filter((p) => p.getClientRects().length && (p.textContent || "").trim().length > 40);
  const p = ps[1] || ps[0];
  p.scrollIntoView({ block: "center" });
  const r = p.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
});
await wait(400);
const pr2 = await page.evaluate(() => {
  const pm = document.querySelector(".ProseMirror");
  const ps = [...pm.querySelectorAll("p")].filter((p) => p.getClientRects().length && (p.textContent || "").trim().length > 40);
  const p = ps[1] || ps[0];
  const rects = p.getClientRects();
  const last = rects[rects.length - 1];
  return { x: last.right, y: last.top + last.height / 2 };
});
void pr;
await cursorTo(pr2.x + 4, pr2.y, 700);
cur = { x: pr2.x + 4, y: pr2.y };
await page.evaluate(() => window.__vcClick());
await page.evaluate(() => {
  const pm = document.querySelector(".ProseMirror");
  const ps = [...pm.querySelectorAll("p")].filter((p) => p.getClientRects().length && (p.textContent || "").trim().length > 40);
  const p = ps[1] || ps[0];
  const r = document.createRange(); r.selectNodeContents(p); r.collapse(false);
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  pm.focus();
});
await wait(300);
await page.keyboard.press("End");
await page.keyboard.press("Enter");
await wait(300);
await typeText(T.typed);
await wait(800);

// 3. Paste: a passage arrives, the attribution dialog asks where it comes from
await scene("paste");
await page.keyboard.press("Enter");
await wait(400);
await page.evaluate((text) => {
  const dt = new DataTransfer();
  dt.setData("text/plain", text);
  const ev = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "clipboardData", { value: dt });
  document.querySelector(".ProseMirror").dispatchEvent(ev);
}, T.pasted);
await page.waitForSelector("[role=dialog][aria-modal=true] input[type=radio]", { timeout: 8000 });
await wait(1600);
await clickEl(page.locator("[role=dialog][aria-modal=true] label").nth(1), { ax: 14 });
await wait(500);
await clickEl(page.locator("[role=dialog][aria-modal=true] input.input-field"));
await typeText(T.source, 34);
await wait(600);
await clickEl(page.locator("[role=dialog][aria-modal=true] button.btn-primary"));
await wait(900);

// 4. Assistant: Critique mode, a question, the answer streams in
await scene("assistant");
const panelOpen = await page.locator("[data-tour='model']").count();
if (!panelOpen) await clickEl(page.locator("header button", { hasText: /AI|IA/ }).first());
await page.waitForSelector("[data-tour='model']");
await page.evaluate((m) => { for (const el of document.querySelectorAll("[data-tour='model'] span.truncate")) el.textContent = m; }, T.model);
// Mode grid: when a mode is chosen the grid folds into a bar ("<mode> · Change mode", aria-expanded=false);
// open it again before choosing another. Index 4 = Outline, 5 = Critique in every language.
const pickMode = async (idx) => {
  const bar = page.locator("button[aria-expanded='false']").filter({ has: page.locator("span.font-semibold") }).first();
  if (await bar.count()) { await clickEl(bar); await wait(350); }
  await clickEl(page.locator("button[aria-pressed]").nth(idx));
};
await pickMode(5);
await wait(500);
await clickEl(page.locator("textarea").last());
await typeText(T.critique);
await wait(300);
await page.keyboard.press("Enter");
await wait(3500);

// 5. Cost card: Outline mode, an insertable answer, the cost before inserting
await scene("cost");
await pickMode(4);
await wait(400);
await clickEl(page.locator("textarea").last());
await typeText(T.outline);
await page.keyboard.press("Enter");
await page.waitForSelector(`button:has-text("${T.insert}")`, { timeout: 25000 });
await wait(1200);
await clickEl(page.locator(`button:has-text("${T.insert}")`).first());
await page.waitForSelector(".bg-prov-ai-soft[role=dialog]");
await holdScene(0.3);
const before = await page.evaluate(() => [...document.querySelectorAll(".ProseMirror span[data-provenance='ai']")].map((e) => e.getAttribute("data-interaction") || ""));
await clickEl(page.locator(".bg-prov-ai-soft[role=dialog] button").first());

// 6. Inserted: the passage sits in the document, marked violet
await scene("inserted");
await wait(700);
// Scroll to the passage that was just inserted (new interaction id), not to an older AI mark of the seed.
const ab = await page.evaluate((before) => {
  const spans = [...document.querySelectorAll(".ProseMirror span[data-provenance='ai']")];
  const fresh = spans.find((e) => !before.includes(e.getAttribute("data-interaction") || "")) || spans[spans.length - 1];
  if (!fresh) return null;
  fresh.scrollIntoView({ block: "center", behavior: "smooth" });
  return new Promise((res) => setTimeout(() => { const r = fresh.getBoundingClientRect(); res({ x: r.left, y: r.top, height: r.height }); }, 700));
}, before);
if (ab) await cursorTo(ab.x + 40, ab.y + ab.height / 2, 700);

// 7. Ledger
await scene("ledger");
await wait(600);
await clickEl(page.locator("[data-tour='integrity'] button"));
await wait(800);

// 8. Advisor: the same document, the same ledger, read by Prof. Williams
await scene("advisor");
await wait(400);
await login("prof.williams@stanford.edu", "demo123");
await page.goto(`${B}/${LANG}/admin/theses/thesis_1/document`);
await page.waitForSelector(".ProseMirror");
await page.evaluate(() => { const s = document.createElement("style"); s.textContent = "[data-testid=session-deadline]{display:none !important}"; document.head.appendChild(s); });
await wait(1200);
await clickEl(page.locator("[data-tour='integrity'] button"));
await wait(500);

// 9. Outro: the landing headline
await scene("outro");
await page.goto(`${B}/${LANG}`, { waitUntil: "domcontentloaded" });
await wait(600);
await page.evaluate(() => window.scrollTo(0, 0));
await holdScene(1.2);
const end = now();
marks.push({ key: "end", t: end });
await ctx.close();
await browser.close();
const video = fs.readdirSync(dir).find((f) => f.endsWith(".webm"));
fs.renameSync(path.join(dir, video), path.join(dir, "video.webm"));
fs.writeFileSync(path.join(dir, "marks.json"), JSON.stringify({ lang: LANG, end, marks }, null, 2));
console.log("done", LANG, end.toFixed(1), "s");
