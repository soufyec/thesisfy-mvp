# Thesisfy Transparency Companion (browser extension)

Chrome/Edge/Brave extension (Manifest V3) that lets a student **opt in** to reporting their use of external AI chat tools while they write in Thesisfy.

## What it reports (only while a Thesisfy writing session is active and the student consented)

| Event | Data sent | Never sent |
|---|---|---|
| Visit to chatgpt.com / claude.ai / gemini.google.com / chat.mistral.ai | hostname, duration | page content, URLs |
| Copy on those sites | SHA-256 fingerprint (32 hex) + length | the copied text |
| Prompt sent | prompt length; first 300 chars **only if** the "share prompt text" scope is on | anything else |

Thesisfy's editor fingerprints pasted text the same way, so a paste that matches a copy from ChatGPT is attributed as **AI-assisted from ChatGPT** instead of being flagged as an unknown paste. This is how "detection" becomes transparency.

## Install (developer mode)

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select this `extension/` folder.
2. In Thesisfy: **Settings & Privacy → Browser extension → Generate pairing code**.
3. Click the extension icon, enter your Thesisfy URL and the code, **Pair**.

The extension shows a small banner on AI sites whenever reporting is active, and the badge reads **ON**. Pairing tokens can be revoked from Thesisfy at any time.

## Publishing

Add a `key`/store listing as usual; no code changes are needed. `host_permissions` is empty because the Thesisfy API answers with CORS headers for the extension endpoints.
