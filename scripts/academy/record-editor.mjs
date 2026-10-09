import { chromium } from "playwright";
import fs from "fs";
const B = "http://localhost:3043";
const OUT = process.env.ACADEMY_OUT || "/tmp/academy-video";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--force-device-scale-factor=2"] });
const ctx = await browser.newContext({ viewport: { width: 540, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const t0 = Date.now();
// Full-resolution frames through Chromium's screencast (device pixels), with their timestamps.
fs.rmSync(`${OUT}/frames`, { recursive: true, force: true });
fs.mkdirSync(`${OUT}/frames`);
const cdp = await ctx.newCDPSession(page);
const frames = [];
cdp.on("Page.screencastFrame", async ({ data, sessionId, metadata }) => {
  const i = frames.length;
  fs.writeFileSync(`${OUT}/frames/f${String(i).padStart(5, "0")}.jpg`, Buffer.from(data, "base64"));
  frames.push({ i, t: (Date.now() - t0) / 1000 });
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 2160, maxHeight: 2560, everyNthFrame: 1 });
const marks = [];
const mark = (caption) => { marks.push({ t: (Date.now() - t0) / 1000, caption }); console.log(((Date.now() - t0) / 1000).toFixed(1), caption); };
const wait = (ms) => page.waitForTimeout(ms);
page.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 160)));

await page.goto(`${B}/fr/login`);
await page.fill("input[type=email]", "jane.cooper@stanford.edu");
await page.fill("input[type=password]", "demo123");
await page.click("button[type=submit]");
await page.waitForURL(/dashboard/);
await page.goto(`${B}/fr/dashboard/editor/thesis_1`);
await page.waitForSelector(".ProseMirror");
// Hide the demo-mode note under answers (the clip shows the flow, not the provider) and any toast.
await page.addInitScript(() => {});
await page.evaluate(() => {
  const strip = () => {
    for (const el of document.querySelectorAll("div")) if (el.children.length === 0 && /^Mode démo/.test(el.textContent || "")) el.remove();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (n.nodeValue && n.nodeValue.includes(" (demo)")) n.nodeValue = n.nodeValue.replace(" (demo)", "");
      // Local recording has no provider key: show the chip as production does (the university's Gemini model).
      if (n.nodeValue && /^Aucun modèle/.test(n.nodeValue)) n.nodeValue = "Gemini 3.8 Flash";
    }
  };
  new MutationObserver(strip).observe(document.body, { subtree: true, childList: true });
});
await wait(1500);
mark("L'éditeur Thesisfic : votre mémoire,\ncomme dans Docs ou Word");
await wait(3500);

// 1. Write
// Cursor at the end of the last paragraph of the document (Ctrl+End is unreliable on the mobile layout).
await page.evaluate(() => {
  const pm = document.querySelector(".ProseMirror");
  const blocks = Array.from(pm.children).filter((e) => /^(P|H[1-6]|UL|OL|TABLE|BLOCKQUOTE)$/.test(e.tagName));
  const last = blocks[blocks.length - 1];
  last.scrollIntoView({ block: "center" });
  const r = document.createRange();
  r.selectNodeContents(last);
  r.collapse(false);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
  pm.focus();
});
await wait(600);
await page.keyboard.press("End");
await page.keyboard.press("Enter");
mark("Vous écrivez normalement :\nce texte compte comme « Rédigé »");
await page.keyboard.type("Cette étude compare trois approches de classification sur un corpus de 12 000 articles.", { delay: 32 });
await wait(2200);

// 2. Paste
await page.keyboard.press("Enter");
mark("Vous collez un passage :\nl'éditeur demande d'où il vient");
await page.evaluate(() => {
  const dt = new DataTransfer();
  dt.setData("text/plain", "Les modèles de langage reproduisent les biais présents dans leurs données d'entraînement, ce qui limite leur usage en contexte académique. Leur taille croissante ne corrige pas ce problème : elle amplifie les représentations dominantes du corpus et rend les erreurs plus difficiles à repérer pour un lecteur non spécialiste.");
  const ev = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "clipboardData", { value: dt });
  document.querySelector(".ProseMirror").dispatchEvent(ev);
});
await page.waitForSelector("text=D'où provient ce texte ?", { timeout: 8000 });
await wait(2600);
await page.locator("label", { hasText: "Cité ou adapté" }).click();
await wait(600);
await page.locator("input.input-field").last().fill("Bender et al. (2021)");
await wait(1200);
mark("Déclaré comme cité : marqué en orange.\nJamais une accusation, une attribution.");
await page.getByRole("button", { name: "Continuer" }).click();
await wait(3200);

// 3. Assistant
await page.locator("nav button", { hasText: /^IA$/ }).click();
await wait(1200);
mark("Thesisfic AI pense avec vous :\nplan, critique, sources… jamais la rédaction");
const change = page.getByRole("button", { name: "Changer de mode" });
if (await change.count()) await change.first().click();
await wait(600);
await page.locator("div.grid button", { hasText: /^Plan$/ }).first().click();
await wait(900);
const box = page.locator("textarea").last();
await box.click();
await box.type("Propose un plan pour mon chapitre sur les biais des modèles", { delay: 28 });
await wait(400);
await page.keyboard.press("Enter");
await page.waitForSelector("text=Insérer, marqué comme IA", { timeout: 20000 });
await wait(1800);

// 4. Cost card + insert
mark("Avant d'insérer : le coût en mots et en % d'IA,\nvisible par vous et par votre tuteur");
await page.locator("button", { hasText: "Insérer, marqué comme IA" }).first().click();
await wait(3800);
await page.locator("button", { hasText: "Insérer, marqué comme IA" }).last().click();
await wait(1200);
await page.getByRole("button", { name: "Fermer le panneau" }).first().click().catch(() => {});
await page.mouse.move(20, 420);
await wait(600);
mark("Inséré et marqué « Assisté par IA »,\nen violet, dans le document");
await page.evaluate(() => { const pm = document.querySelector(".ProseMirror"); pm?.scrollIntoView({ block: "end" }); window.scrollTo(0, document.body.scrollHeight); });
await wait(3200);

// 5. Integrity ledger
await page.locator("nav button", { hasText: /^Intégrité$/ }).click();
await wait(900);
mark("Le registre d'intégrité : l'étudiant et le tuteur\nvoient exactement la même chose");
await wait(4000);
mark("Thesisfic.edu\nWe teach your students how to use AI, properly.");
await wait(3500);
const end = (Date.now() - t0) / 1000;
await cdp.send("Page.stopScreencast").catch(() => {});
await page.waitForTimeout(300);
// Frame times are wall-clock seconds since t0, the same clock as the captions.
const lines = ["ffconcat version 1.0"];
const first = frames[0].t;
for (let k = 0; k < frames.length; k++) {
  const dur = k + 1 < frames.length ? frames[k + 1].t - frames[k].t : Math.max(0.1, end - frames[k].t);
  lines.push(`file 'frames/f${String(k).padStart(5, "0")}.jpg'`, `duration ${Math.max(0.01, dur).toFixed(3)}`);
}
lines.push(`file 'frames/f${String(frames.length - 1).padStart(5, "0")}.jpg'`);
fs.writeFileSync(`${OUT}/frames.ffconcat`, lines.join("\n"));
fs.writeFileSync(`${OUT}/marks.json`, JSON.stringify({ end, marks, frames: frames.length, firstFrameOffset: first }, null, 2));
await ctx.close();
await browser.close();
console.log("done", frames.length, "frames", end.toFixed(1), "s");
