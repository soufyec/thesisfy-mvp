# Thesisfy.edu MVP

**Academic integrity through AI regulation, not detection.** Thesisfy attributes every word of a thesis as it is written (typed, pasted, AI-assisted), lets students use the AI account they already have, and gives advisors a provenance report instead of a guessed "AI probability".

## What's in the MVP

| Area | Highlights |
|---|---|
| **Google-Docs-style editor** | TipTap/ProseMirror editor with File/Edit/View/Insert/Format/Tools/Help menus, full toolbar (styles, fonts, sizes, colors, highlight, align, spacing, lists, checklists, indent, super/subscript), A4/Letter page layout with zoom, outline, comments with replies/resolve, version history with preview/restore, citations manager (APA/MLA/Chicago/IEEE/Harvard) and bibliography, find & replace, tables, images, links, page breaks, footnotes, TOC, page setup, word count, print/PDF, export to **.docx**, HTML, Markdown, text. Autosave with named versions. |
| **Provenance tracking** | Text inserted from the assistant is marked `data-provenance="ai"`; large pastes trigger an attribution prompt (own / source / AI); pastes that match text copied from an AI site (via the extension) are attributed automatically. Toggle highlights, see the share per document, integrity score explained line by line. |
| **AI assistant** | Streaming multi-provider assistant (Anthropic Claude via official SDK, OpenAI, Google Gemini, Mistral) with 10 pedagogical modes (ask, brainstorm, outline, critique, grammar, summarize, explain, citations, gaps, paraphrase check), policy guardrails (blocks "write it for me" in EN/ES/FR, mode allow-list, AI % limit), conversation history, insert-to-document as AI-marked text, demo mode without keys. |
| **Bring your own AI account** | Students connect their Claude / ChatGPT / Gemini / Mistral **API key** (validated, AES-256-GCM encrypted, revocable, per-provider model choice). OAuth 2.0 + PKCE "Sign in with …" flow is implemented and activates through env vars once a provider offers third-party sign-in. |
| **Consent-based monitoring** | Students choose scopes (AI interactions, typing rhythm, paste fingerprints, tab activity, extension activity, prompt text) within institution policy; receipts and history; withdrawal ends monitoring instantly. Sessions log counts and fingerprints, never text. |
| **Browser extension** | `extension/` (Manifest V3): with consent and only during an active session, reports visits to chatgpt.com / claude.ai / gemini.google.com / chat.mistral.ai, SHA-256 fingerprints of copied text, and prompt submissions. Pairing via one-time code. |
| **Mobile** | Responsive layouts with bottom navigation, touch editor toolbar, bottom-sheet AI assistant, installable PWA (manifest, service worker, offline page, icons) and a Capacitor wrapper in `mobile/` for iOS/Android. |
| **Institution side** | Dashboard, all theses, per-thesis review page (provenance report, sessions timeline with events, AI log, flags, comments, approve / request revision), students with invites, flag resolution, persisted AI policies (limits, providers, BYOK, external tools, modes, monitoring features, consent requirement). |

## Quick start

```bash
npm install
cp .env.example .env
npm run dev          # http://localhost:3000
```

Demo accounts (password in the table):

| Role | Email | Password |
|---|---|---|
| Student | jane.cooper@stanford.edu | demo123 |
| Student | marie.dupont@sorbonne.fr | demo123 |
| Professor | prof.williams@stanford.edu | demo123 |
| Admin | admin@stanford.edu | admin123 |

Without provider keys the assistant answers in demo mode. Add `ANTHROPIC_API_KEY` (or OpenAI/Gemini/Mistral keys) for institution-wide access, or connect a personal account from **AI Connections**.

### Who pays for the models

Like Copilot inside a company, the university can offer models to its students and pay for them (**Admin → AI access & billing**). Each model has a backend that decides who invoices the university:

| Backend | Runs on | Billed by |
|---|---|---|
| Thesisfy contract | Thesisfy's provider keys | Thesisfy invoice, usage at provider list price |
| Claude in Microsoft Foundry | The university's Azure tenant (`@anthropic-ai/foundry-sdk`) | Microsoft, with the rest of the tenant |
| Azure OpenAI | The university's Azure tenant | Microsoft |
| Anthropic / OpenAI / Mistral / Google account | The university's own API account | That provider |

Spend is metered per request from the model's configured prices; administrators set a monthly budget, a per-student allowance, what happens when it runs out (pause, or fall back to the student's own account) and an alert threshold. Students see their allowance in the assistant and in AI Connections, and may still connect a personal account, which the university never pays for.

## Architecture

```
src/
├── app/
│   ├── page.tsx                     Landing
│   ├── login, register              Auth pages
│   ├── dashboard/                   Student: overview, theses, editor/[id], ai-chat, analytics, connections, settings
│   ├── admin/                       Staff: overview, theses, theses/[id] (review), theses/[id]/document, students, flags, policies
│   ├── manifest.ts                  PWA manifest
│   └── api/
│       ├── auth/{login,logout,me,register}
│       ├── theses, theses/[id], theses/[id]/{versions,comments,sessions}
│       ├── sessions/[sessionId]     Event ingestion + heartbeat/end
│       ├── ai/chat                  SSE streaming, guardrails, logging
│       ├── ai/connections           BYOK keys, oauth/[provider], oauth/callback
│       ├── ai/{providers,logs,conversations}
│       ├── monitor/{consent,pair,status,events}   Consent + extension endpoints
│       ├── policies, flags, notifications, users, stats
├── components/
│   ├── editor/                      DocsEditor, MenuBar, Toolbar, Sidebars, Dialogs, extensions (provenance, comments, search…)
│   ├── ai/AssistantPanel.tsx        Shared assistant UI (editor side panel + full page)
│   ├── ConsentModal.tsx, DashboardLayout.tsx, PWARegister.tsx, ui.tsx, Markdown.tsx
├── lib/
│   ├── db.ts                        In-memory store (globalThis + optional DATA_FILE); swap for Postgres/Prisma
│   ├── ai/{providers,prompts,policy,demo}.ts
│   ├── integrity.ts                 Scoring + flag rules
│   ├── monitor.ts                   Client session monitor (batching, fingerprints, visibility)
│   ├── export.ts                    HTML → DOCX / Markdown / text
│   ├── auth.ts, crypto.ts, api.ts, cors.ts, client.ts, nav.tsx
extension/                           Chrome MV3 transparency companion
mobile/                              Capacitor wrapper + README
```

### How AI use is detected, with authorization

1. **Inside Thesisfy**: every assistant call is logged (provider, model, mode, tokens, blocked-by-policy). Inserted text carries a provenance mark. Nothing is inferred.
2. **Pastes**: the editor fingerprints pasted text (SHA-256 of normalized text, first 32 hex) and asks the student to attribute large pastes. The text itself is never sent for monitoring.
3. **External chat apps**: the extension (opt-in scope) reports visits, copy fingerprints and prompt submissions **only while a session is active**. A paste whose fingerprint matches a reported copy is attributed to that tool automatically.
4. **Consent** is granular, versioned, revocable and enforced on the server: events for scopes the student did not grant are dropped even if a client sends them.

### Production notes

- The store is in memory; on Vercel each cold start re-seeds the demo data. Point `db.ts` at Postgres/Prisma for persistence (all access goes through the `db` object).
- Set `JWT_SECRET` and `ENCRYPTION_KEY`. Stored provider keys are encrypted with AES-256-GCM.
- Claude calls use `@anthropic-ai/sdk` (default model `claude-opus-5-5`, server-side refusal fallbacks enabled); other providers use their HTTP APIs.
- Sign-in with Claude/ChatGPT: the OAuth routes are ready; providers have not yet opened account sign-in for third-party apps, so the UI offers API-key connection today and marks sign-in as "soon".

## Deploy to Vercel

1. Import the repository in Vercel.
2. Set `JWT_SECRET`, `ENCRYPTION_KEY` and optionally provider keys.
3. Deploy. The PWA is served from the same deployment; point `mobile/capacitor.config.ts` (`THESISFY_URL`) at it for native builds.
