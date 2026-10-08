# Thesisfic.edu MVP

**Academic integrity through AI regulation, not detection.** Thesisfic attributes every word of a thesis as it is written (typed, pasted, AI-assisted), lets students use the AI account they already have, and gives advisors a provenance report instead of a guessed "AI probability".

## What's in the MVP

| Area | Highlights |
|---|---|
| **Google-Docs-style editor** | TipTap/ProseMirror editor with File/Edit/View/Insert/Format/Tools/Help menus, full toolbar (styles, fonts, sizes, colors, highlight, align, spacing, lists, checklists, indent, super/subscript), A4/Letter page layout with zoom, outline, comments with replies/resolve, version history with preview/restore, citations manager (APA/MLA/Chicago/IEEE/Harvard) and bibliography, find & replace, tables, images, links, page breaks, footnotes, TOC, page setup, word count, print/PDF, export to **.docx**, HTML, Markdown, text. Autosave with named versions. |
| **Provenance tracking** | Text inserted from the assistant is marked `data-provenance="ai"`; large pastes trigger an attribution prompt (own / source / AI); pastes that match a sentence from the student's assistant or Research copilot answers are attributed automatically. Toggle highlights, see the share per document, integrity score explained line by line. |
| **AI assistant** | Streaming multi-provider assistant (Anthropic Claude via official SDK, OpenAI, Google Gemini, Mistral) with 10 pedagogical modes (ask, brainstorm, outline, critique, grammar, summarize, explain, citations, gaps, paraphrase check), policy guardrails (blocks "write it for me" in EN/ES/FR, mode allow-list, AI % limit), conversation history, insert-to-document as AI-marked text, demo mode without keys. |
| **Bring your own AI account** | Students connect their Claude / ChatGPT / Gemini / Mistral **API key** (validated, AES-256-GCM encrypted, revocable, per-provider model choice). OAuth 2.0 + PKCE "Sign in with …" flow is implemented and activates through env vars once a provider offers third-party sign-in. |
| **Consent-based monitoring** | Students choose scopes (AI interactions, typing rhythm, paste fingerprints, tab activity) within institution policy; receipts and history; withdrawal ends monitoring instantly. Sessions log counts and fingerprints, never text. |
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
| Thesisfic contract | Thesisfic's provider keys | Thesisfic invoice, usage at provider list price |
| Claude in Microsoft Foundry | The university's Azure tenant (`@anthropic-ai/foundry-sdk`) | Microsoft, with the rest of the tenant |
| Azure OpenAI | The university's Azure tenant | Microsoft |
| Anthropic / OpenAI / Mistral / Google account | The university's own API account | That provider |

Spend is metered per request from the model's configured prices; administrators set a monthly budget, a per-student allowance, what happens when it runs out (pause, or fall back to the student's own account) and an alert threshold. Students see their allowance in the assistant and in AI Connections, and may still connect a personal account, which the university never pays for.

### Persistence (Neon Postgres)

Set `DATABASE_URL` (Neon's Vercel integration creates it, along with `POSTGRES_URL`). The whole store is kept as one JSONB document in `thesisfic_store` (`src/lib/store.ts`): each server instance loads it at start (`src/instrumentation.ts`), re-checks the row version every few seconds through `db.ready()` (called by `requireUser`), and writes the document after every mutation. Without the variable, `DATA_FILE` keeps a local JSON file and otherwise the demo seed lives in memory. `GET /api/health` reports which tier is active and the current version. On the first boot against an empty database the demo seed becomes the initial document; delete the row to reseed. Two instances writing in the same second can overwrite each other, which is acceptable for a pilot and the reason this is a document, not a schema.

### Validation questionnaire (Master SMI, Université Paris-Saclay)

A public French questionnaire validates the problem with teachers and students before the MVP goes further.

- `/questionnaire` — online mode (about 10 minutes). `/questionnaire/enseignant` and `/questionnaire/etudiant` preselect the profile. `/fr`, `/es` and `/en` do not apply: the questionnaire is French only.
- `/questionnaire?mode=entretien` — interview mode for the team (25 to 30 minutes): interviewer notes, interviewer name, and the post-demo section appear; help lines starting with « Entretien : » are shown.
- Content lives in `src/data/questionnaire.json` (sections, items, conditional `nav`, `next: "SUBMIT"`) and is rendered as is. The interviewer notes block reuses one id in several sections; answers are keyed by `sectionId.itemId` for those.
- `/equipe` — team sign-in with `TEAM_PASSWORD` (cookie, 30 days). `/equipe/resultats` — counts, filters by profile and mode, decision indicators with their targets, one block per question, free answers, CSV export (`/api/equipe/responses?format=csv`, one column per question).
- Team editing: with the team cookie, the questionnaire shows « Modifier le questionnaire ». The team can add questions to any section (single or multiple choice, scale, short or free text; optional, required, interview-only) and alternative phrasings under any question. Additions are stored with the responses, appear at once for everyone, show in the results and the CSV, and can be removed by the team. Base questions are not editable from the site.
- Responses are anonymous: no IP, no account. A hidden honeypot field and a per-minute limit stop simple bots. Everything is persisted in the same store as the rest of the platform (Neon Postgres when `DATABASE_URL` is set).
- While the study runs the MVP is not public: the landing has no sign-in link and `/dashboard` and `/admin` redirect to the home page without a session. The team signs in at `/login` by its URL.

### Languages

The UI ships in English, Spanish and French. Entry links set a `locale` cookie and keep working for every later page: `/en`, `/es`, `/fr` (or `?lang=es`). The switcher in the landing nav, the login page and the dashboard sidebar changes the language in place and stores it on the account, so the assistant answers in the same language. Strings live in `src/lib/i18n/messages/<area>.ts`; English defines the keys and the other two locales are typed against it, so a missing translation fails `tsc`. Text that comes from data (thesis titles, notices, API errors, institution rubric) is shown as stored.

### AI editor features

Six "thinking-with" features built from the market analysis in `reports/Editores académicos con IA.md` (each has a README next to its code):

| Feature | Where | Benchmark it competes with |
|---|---|---|
| AI reviewer: anchored, resolvable comments with an institutional rubric | `src/components/editor/reviewer`, `/api/ai/reviewer`, `/api/policies/rubric` | Thesify Reviewer, Word Coaching |
| Language review: inline suggestions (EN/ES/FR) with category filters; mechanical fixes stay the student's, style rewrites are marked AI | `src/components/editor/language`, `/api/language/*` (LanguageTool + model) | Writefull, Trinka, Grammarly |
| Verified citations with supporting passage + reference checker | `src/components/editor/citations`, `/api/ai/cite-verified`, `/api/theses/[id]/references/check` | Jenni Cite, Paperpal Reference Checker |
| Writing process: hash-chained snapshots, replay, AI-use declaration from the ledger | `src/components/editor/process`, `/api/theses/[id]/{snapshots,process,declaration}` | Turnitin Clarity, Grammarly Authorship |
| Source library with grounded, page-anchored answers ("Use my sources" in the assistant; pastes from a source are attributed to it) | `src/components/editor/sources`, `/api/theses/[id]/sources`, `/api/ai/sources/ask` | SciSpace, Elicit |
| Evidence check: supports / qualifies / contradicts, no aggregate score | `src/components/editor/evidence`, `/api/ai/evidence` | Consensus, Scite |

Scholarly data comes from OpenAlex, Crossref, Semantic Scholar and Unpaywall (`src/lib/scholar.ts`; set `OPENALEX_MAILTO`, optionally `OPENALEX_API_KEY` and `S2_API_KEY`). The model only ever picks identifiers from retrieved candidates and must quote passages the server verifies. All features have a deterministic demo mode when no AI provider is configured.

### Research copilot

With **Research copilot** enabled (Admin → AI policies), students may ask anything connected to their research on the university-provided models: literature, methods, statistics, code, planning. The history is kept and visible to the institution. Two guardrails stay on: "write it for me" requests are refused and logged as blocked, and every answer is fingerprinted sentence by sentence (SHA-256 of normalised text, never the text itself), so when a student pastes part of an answer into the thesis the editor recognises it, marks it as AI-assisted and links it to the conversation.

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
│       ├── monitor/consent              Consent endpoints
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
mobile/                              Capacitor wrapper + README
```

### How AI use is detected, with authorization

1. **Inside Thesisfic**: every assistant call is logged (provider, model, mode, tokens, blocked-by-policy). Inserted text carries a provenance mark. Nothing is inferred.
2. **Pastes**: the editor fingerprints pasted text (SHA-256 of normalized text, first 32 hex) and asks the student to attribute large pastes. The text itself is never sent for monitoring.
3. **Research copilot answers**: every answer is fingerprinted sentence by sentence; a paste whose sentences match is attributed to that conversation automatically.
4. **Consent** is granular, versioned, revocable and enforced on the server: events for scopes the student did not grant are dropped even if a client sends them.

### Production notes

- The store is in memory; on Vercel each cold start re-seeds the demo data. Point `db.ts` at Postgres/Prisma for persistence (all access goes through the `db` object).
- Set `JWT_SECRET` and `ENCRYPTION_KEY`. Stored provider keys are encrypted with AES-256-GCM.
- Claude calls use `@anthropic-ai/sdk` (default model `claude-opus-5-5`, server-side refusal fallbacks enabled); other providers use their HTTP APIs.
- Sign-in with Claude/ChatGPT: the OAuth routes are ready; providers have not yet opened account sign-in for third-party apps, so the UI offers API-key connection today and marks sign-in as "soon".

## Deploy to Vercel

1. Import the repository in Vercel.
2. Set `JWT_SECRET`, `ENCRYPTION_KEY`, `DATABASE_URL` (Neon) and `TEAM_PASSWORD` (questionnaire results and editing), and optionally provider keys.
3. Deploy. The PWA is served from the same deployment; point `mobile/capacitor.config.ts` (`THESISFIC_URL`) at it for native builds.
