// Thesisfic Transparency Companion — content script for external AI chat sites.
// Reports (only while Thesisfic says a consented writing session is active):
//  - a visit to this AI site with its duration
//  - a fingerprint (SHA-256, first 32 hex) of text you copy here, never the text
//  - that you sent a prompt (and its text only if you opted in)

(() => {
  const host = location.hostname.replace(/^www\./, "");
  let status = null;
  let visitStart = Date.now();
  let lastVisitReport = 0;

  const send = (event) => chrome.runtime.sendMessage({ type: "thesisfic:event", event: { host, ...event } }).catch?.(() => {});

  async function fingerprint(text) {
    const norm = text.toLowerCase().replace(/\s+/g, " ").trim();
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  }

  function reportVisit(final) {
    const durationSec = Math.round((Date.now() - visitStart) / 1000);
    if (!final && Date.now() - lastVisitReport < 60000) return;
    lastVisitReport = Date.now();
    send({ type: "external_ai_visit", durationSec });
  }

  document.addEventListener("copy", async () => {
    const text = (window.getSelection() || "").toString();
    if (text.trim().length < 20) return;
    send({ type: "external_ai_copy", fingerprint: await fingerprint(text), length: text.length });
  });

  // Prompt submission heuristics: Enter (without Shift) inside the composer, or clicking a send button.
  function composerText(el) {
    if (!el) return "";
    if (el.tagName === "TEXTAREA") return el.value;
    if (el.isContentEditable) return el.innerText;
    const c = document.querySelector("textarea, [contenteditable='true']");
    return c ? (c.tagName === "TEXTAREA" ? c.value : c.innerText) : "";
  }
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
      const t = e.target;
      if (!(t && (t.tagName === "TEXTAREA" || t.isContentEditable))) return;
      const text = composerText(t).trim();
      if (text.length < 3) return;
      send({ type: "external_ai_prompt", promptLength: text.length, promptText: text.slice(0, 300) });
    },
    true
  );
  document.addEventListener(
    "click",
    (e) => {
      const btn = e.target && e.target.closest && e.target.closest("button[data-testid*='send'], button[aria-label*='Send' i], button[aria-label*='Envoyer' i], button[aria-label*='Enviar' i]");
      if (!btn) return;
      const text = composerText(null).trim();
      if (text.length < 3) return;
      send({ type: "external_ai_prompt", promptLength: text.length, promptText: text.slice(0, 300) });
    },
    true
  );

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) reportVisit(true);
    else visitStart = Date.now();
  });
  window.addEventListener("pagehide", () => reportVisit(true));
  setInterval(() => reportVisit(false), 60000);

  // Small, honest banner so the student always knows when reporting is on.
  function renderBanner() {
    let el = document.getElementById("thesisfic-banner");
    if (!status || !status.monitoring) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.id = "thesisfic-banner";
      el.style.cssText = "position:fixed;bottom:12px;left:12px;z-index:2147483647;background:#111827;color:#fff;font:12px/1.3 Inter,system-ui,sans-serif;padding:8px 12px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.3);display:flex;gap:8px;align-items:center;max-width:320px";
      document.body.appendChild(el);
    }
    const thesis = status.activeSession && status.activeSession.thesisTitle ? status.activeSession.thesisTitle : "your thesis";
    el.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:#20c997;display:inline-block"></span><span><b>Thesisfic transparent mode</b> · this visit${status.scopes && status.scopes.promptText ? ", prompts" : ""} and copied text are logged to <i>${thesis.replace(/</g, "&lt;")}</i></span>`;
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "thesisfic:status") {
      status = msg.status;
      renderBanner();
    }
  });
  chrome.runtime.sendMessage({ type: "thesisfic:getStatus" }).then((r) => {
    status = r && r.status;
    renderBanner();
    if (status && status.monitoring) reportVisit(true);
  }).catch?.(() => {});
})();
