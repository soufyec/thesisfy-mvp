// Captures the product screens for the "Léa" intro animatic from a local build (demo seed, in-memory store).
import { chromium } from "playwright";
const B = process.env.BASE || "http://localhost:3082";
const OUT = process.env.OUT;
const LANG = process.env.LANG_UI || "en";
const b = await chromium.launch({ args: ["--hide-scrollbars"] });
async function ctxFor(role) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", locale: "en-GB" });
  await ctx.addInitScript(() => {
    try { localStorage.setItem("onboarding_v1", "done"); localStorage.setItem("pwa_dismissed", "1"); } catch {}
    // Production shows the model the university offers; the local build has no key, so the chip is renamed and the
    // demo-mode notices are hidden (as in scripts/academy/record-tour.mjs).
    let pending = false;
    const strip = () => {
      pending = false;
      for (const el of document.querySelectorAll("[data-tour='model'] span.truncate")) if (/model|modelo|modèle/i.test(el.textContent || "")) el.textContent = "Gemini 3.8 Flash";
      for (const el of document.querySelectorAll("div, p, span")) if (el.childElementCount === 0 && /^(Demo mode|Modo demo|Mode démo)/.test(el.textContent || "")) el.style.display = "none";
      // The demo account is renamed Léa Martin: its initials and e-mail follow.
      for (const el of document.querySelectorAll("body *")) if (el.childElementCount === 0 && (el.textContent || "").trim() === "JC") el.textContent = "LM";
      for (const el of document.querySelectorAll("input")) if (/jane\.cooper@/.test(el.value)) el.value = el.value.replace("jane.cooper", "lea.martin");
    };
    new MutationObserver(() => { if (pending) return; pending = true; setTimeout(strip, 150); }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await ctx.addCookies([{ name: "locale", value: LANG, url: B }]);
  const p = await ctx.newPage();
  await p.goto(`${B}/login?demo=${role}`);
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  await p.waitForTimeout(1200);
  return { ctx, p };
}
const shot = async (p, name) => { await p.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 84 }); console.log("shot", name); };

const { p } = await ctxFor("student");
// Persona: Léa, three months to go.
const deadline = new Date(Date.now() + 91 * 86400000); deadline.setUTCHours(12, 0, 0, 0);
await p.evaluate(async (d) => {
  const j = (u, m, body) => fetch(u, { method: m, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  await j("/api/auth/me", "PATCH", { name: "Léa Martin", onboarded: true });
  await j("/api/theses/thesis_1", "PUT", { deadline: d });
  // Her library: sources she added, each used by the theses she chose.
  const para = (topic) => `${topic} This summary was written for the demo library. It describes the data, the method and the limits in plain terms, so the assistant can quote it with a page reference. `.repeat(6);
  const add = (title, authors, year, thesisIds, topic) => j("/api/library/sources", "POST", { kind: "text", value: para(topic), title, authors, year, thesisIds });
  // Newest first on the page: the two used by this thesis end up on top.
  await add("Interview notes: credential verification in practice", "Léa Martin", "2025", ["thesis_2"], "Registrars described how diplomas are verified today.");
  await add("Reading notes: verification metrics for precipitation forecasts", "Léa Martin", "2026", [], "Skill scores compare a forecast with a reference such as climatology.");
  await add("Rain-gauge records for the study region, 2010-2020", "Regional climate service", "2024", ["thesis_1"], "Daily totals from 48 gauges, with gaps filled and flagged.");
  await add("Lecture notes: statistical downscaling of precipitation", "Climate Modelling seminar", "2025", ["thesis_1"], "Statistical downscaling links large-scale predictors to local rainfall.");
}, deadline.toISOString());

await p.goto(`${B}/dashboard/settings`); await p.waitForTimeout(2500); await shot(p, "s04-settings");
await p.goto(`${B}/dashboard/papers`); await p.waitForTimeout(2500); await shot(p, "s05-theses");

await p.goto(`${B}/dashboard/editor/thesis_1`); await p.waitForTimeout(5000);
// close the assistant for a clean "written" view, if open
const closeAi = p.locator('aside button[aria-label="Close"], aside button[aria-label="Close panel"]').first();
await shot(p, "s06-editor");

// Research copilot: ask a question in the assistant panel
try {
  const ta = p.locator("aside textarea, textarea").last();
  await ta.click(); await ta.fill("Which validation approach fits a regional precipitation model?"); await ta.press("Enter");
  await p.waitForTimeout(9000);
} catch (e) { console.log("copilot failed", e.message.split("\n")[0]); }
await shot(p, "s07-copilot");

// Cost card before an AI insertion (Outline mode), on a fresh page so the mode grid is there
try {
  await p.goto(`${B}/dashboard/editor/thesis_1`); await p.waitForTimeout(5000);
  const change = p.locator("aside button:has-text('Change')").first();
  if (await change.count()) { await change.click(); await p.waitForTimeout(600); }
  await p.locator("aside button").filter({ hasText: /^Outline$/ }).first().click(); await p.waitForTimeout(800);
  const ta = p.locator("aside textarea").last();
  await ta.fill("Outline section 2.1 on traditional climate models"); await ta.press("Enter");
  const ins = p.locator("button:has-text('Insert, marked as AI')").first();
  await ins.waitFor({ timeout: 30000 }); await p.waitForTimeout(800);
  await ins.click(); await p.waitForTimeout(1500);
} catch (e) { console.log("cost failed", e.message.split("\n")[0]); }
await shot(p, "s08-cost");
await p.keyboard.press("Escape"); await p.waitForTimeout(600);

// Paste a quote → attribution dialog
try {
  await p.goto(`${B}/dashboard/editor/thesis_1`); await p.waitForTimeout(5000);
  const para = p.locator(".ProseMirror p").nth(3);
  await para.click(); await p.keyboard.press("End");
  const quote = "Deep learning models trained on reanalysis data can reproduce large-scale circulation patterns, yet they often fail to conserve physical quantities such as mass and energy unless these constraints are built into the architecture or the loss function, which limits their reliability for long-range regional projections.";
  await p.evaluate((text) => {
    const el = document.querySelector(".ProseMirror");
    const dt = new DataTransfer(); dt.setData("text/plain", text);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, quote);
  await p.waitForTimeout(1500);
} catch (e) { console.log("paste failed", e.message.split("\n")[0]); }
await shot(p, "s09-paste");
await p.keyboard.press("Escape"); await p.waitForTimeout(500);

// Sources & references: one library, chosen per thesis
await p.goto(`${B}/dashboard/sources?thesis=thesis_1`); await p.waitForTimeout(2500);
await shot(p, "s10-sources");

// Integrity ledger
try {
  await p.goto(`${B}/dashboard/editor/thesis_1`); await p.waitForTimeout(5000);
  await p.locator("[data-tour=integrity] button, [data-tour=integrity]").first().click(); await p.waitForTimeout(1500);
} catch (e) { console.log("ledger failed", e.message.split("\n")[0]); }
await shot(p, "s11-ledger");

// Tutor view
const t = await ctxFor("professor");
await t.p.goto(`${B}/admin/theses/thesis_1`); await t.p.waitForTimeout(3500); await shot(t.p, "s12-tutor");
await b.close();
