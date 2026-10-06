// Thesisfic Transparency Companion — background service worker.
// Holds the pairing token, polls session status, and relays consented events to the Thesisfic API.

const STATUS_ALARM = "thesisfic-status";
let status = { monitoring: false, activeSession: null, scopes: null, user: null, policy: null, error: null, checkedAt: 0 };
let queue = [];
let flushTimer = null;

async function getConfig() {
  const { baseUrl, token } = await chrome.storage.local.get(["baseUrl", "token"]);
  return { baseUrl: (baseUrl || "").replace(/\/$/, ""), token };
}

async function apiFetch(path, init = {}) {
  const { baseUrl, token } = await getConfig();
  if (!baseUrl || !token) throw new Error("not_paired");
  const res = await fetch(baseUrl + path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  if (res.status === 401) {
    await chrome.storage.local.remove(["token"]);
    throw new Error("unauthorized");
  }
  return res.json();
}

async function refreshStatus() {
  try {
    const data = await apiFetch("/api/monitor/status");
    status = { ...data, error: null, checkedAt: Date.now() };
  } catch (e) {
    status = { ...status, monitoring: false, activeSession: null, error: e.message, checkedAt: Date.now() };
  }
  await chrome.storage.local.set({ status });
  chrome.action.setBadgeText({ text: status.monitoring ? "ON" : "" });
  chrome.action.setBadgeBackgroundColor({ color: status.monitoring ? "#20c997" : "#9ca3af" });
  broadcast();
  return status;
}

function broadcast() {
  chrome.tabs.query({ url: ["https://chatgpt.com/*", "https://chat.openai.com/*", "https://claude.ai/*", "https://gemini.google.com/*", "https://chat.mistral.ai/*"] }, (tabs) => {
    for (const t of tabs) chrome.tabs.sendMessage(t.id, { type: "thesisfic:status", status }).catch?.(() => {});
  });
}

async function flush() {
  flushTimer = null;
  if (!queue.length) return;
  const events = queue.splice(0, queue.length);
  try {
    const res = await apiFetch("/api/monitor/events", { method: "POST", body: JSON.stringify({ events }) });
    if (res && res.reason === "no_active_session") status.monitoring = false;
  } catch (e) {
    // drop silently; monitoring is best effort and never blocks the student
  }
}

function enqueue(ev) {
  if (!status.monitoring) return; // nothing leaves the browser without an active, consented session
  if (ev.type === "external_ai_prompt" && !(status.scopes && status.scopes.promptText)) delete ev.promptText;
  queue.push({ ...ev, ts: new Date().toISOString() });
  if (!flushTimer) flushTimer = setTimeout(flush, ev.type === "external_ai_copy" ? 300 : 3000);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(STATUS_ALARM, { periodInMinutes: 1 });
  refreshStatus();
});
chrome.runtime.onStartup.addListener(() => refreshStatus());
chrome.alarms.onAlarm.addListener((a) => a.name === STATUS_ALARM && refreshStatus());

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.type === "thesisfic:pair") {
      const baseUrl = msg.baseUrl.replace(/\/$/, "");
      try {
        const res = await fetch(baseUrl + "/api/monitor/pair", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: msg.code, name: `Chrome on ${navigator.platform}` }) });
        const data = await res.json();
        if (!res.ok) return sendResponse({ ok: false, error: data.error || "Pairing failed" });
        await chrome.storage.local.set({ baseUrl, token: data.token, user: data.user });
        chrome.alarms.create(STATUS_ALARM, { periodInMinutes: 1 });
        await refreshStatus();
        sendResponse({ ok: true, user: data.user });
      } catch (e) {
        sendResponse({ ok: false, error: "Could not reach " + baseUrl });
      }
    } else if (msg.type === "thesisfic:unpair") {
      await chrome.storage.local.remove(["token", "user", "status"]);
      status = { monitoring: false, activeSession: null, scopes: null, user: null, error: "not_paired", checkedAt: Date.now() };
      chrome.action.setBadgeText({ text: "" });
      sendResponse({ ok: true });
    } else if (msg.type === "thesisfic:getStatus") {
      if (Date.now() - status.checkedAt > 20000) await refreshStatus();
      sendResponse({ status, config: await getConfig() });
    } else if (msg.type === "thesisfic:event") {
      if (Date.now() - status.checkedAt > 60000) await refreshStatus();
      enqueue(msg.event);
      sendResponse({ ok: true, monitoring: status.monitoring });
    }
  })();
  return true;
});
