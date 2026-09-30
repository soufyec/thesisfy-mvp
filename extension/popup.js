const $ = (id) => document.getElementById(id);

async function render() {
  const r = await chrome.runtime.sendMessage({ type: "thesisfy:getStatus" });
  const paired = r && r.config && r.config.token;
  $("pair").hidden = !!paired;
  $("main").hidden = !paired;
  if (!paired) {
    const { baseUrl } = await chrome.storage.local.get(["baseUrl"]);
    if (baseUrl) $("baseUrl").value = baseUrl;
    return;
  }
  const s = r.status || {};
  $("dot").className = "dot" + (s.monitoring ? " on" : "");
  if (s.error === "unauthorized") {
    $("line1").innerHTML = "<b>Token revoked</b>";
    $("line2").textContent = "Pair again from Thesisfy settings.";
  } else if (s.monitoring) {
    $("line1").innerHTML = "<b>Session active</b>";
    $("line2").textContent = (s.user ? s.user.name + " · " : "") + (s.activeSession && s.activeSession.thesisTitle ? s.activeSession.thesisTitle : "");
  } else {
    $("line1").innerHTML = "<b>Idle</b> — nothing is reported";
    $("line2").textContent = s.reason || (s.user ? "Signed in as " + s.user.name + ". Start writing in Thesisfy to activate." : "");
  }
  $("promptScope").textContent = s.scopes && s.scopes.promptText ? "the first 300 characters of prompts you send (you opted in)" : "that you sent a prompt (text not shared)";
}

$("pairBtn").onclick = async () => {
  $("pairErr").textContent = "";
  const baseUrl = $("baseUrl").value.trim();
  const code = $("code").value.trim();
  if (!/^https?:\/\//.test(baseUrl)) return ($("pairErr").textContent = "Enter the full Thesisfy URL, e.g. https://thesisfy.example.edu");
  if (!code) return ($("pairErr").textContent = "Enter the pairing code");
  const r = await chrome.runtime.sendMessage({ type: "thesisfy:pair", baseUrl, code });
  if (!r.ok) return ($("pairErr").textContent = r.error);
  render();
};
$("refresh").onclick = render;
$("unpair").onclick = async () => {
  await chrome.runtime.sendMessage({ type: "thesisfy:unpair" });
  render();
};
render();
