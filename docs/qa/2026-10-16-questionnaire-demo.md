# Questionnaire editing, six languages and demo booking

## Changes

- Team-only editing of question titles/help, archived deletion with undo, and order within a stage using native drag or arrow controls. Consent/mode/profile remain because consent and routing depend on them.
- Editor stage selection and previous/next navigation do not require answers. Preview answers are separate; editing cannot submit a respondent response.
- Participants and team can select French, English, Spanish, German, Portuguese or Arabic. The original question catalogue, options, stages and questionnaire UI have translations. Arabic uses RTL. Switching language preserves canonical answer values and routing. Results use translated labels; free responses remain as supplied.
- The team can override question/help/option translations per language. Custom content without a translation falls back to its source with a visible pending indication. This does not call an automatic translation service. CSV retains stable canonical fields and includes response language. Deleted questions remain in historical results/exports.
- Public landing CTAs point to `/demo` instead of the waiting-list form. The route redirects to the HTTPS Cal.com event from `DEMO_BOOKING_URL`; missing or unsafe configuration shows an unavailable state. Existing lead records are untouched.

## Live Cal.com setup

The user chose their existing Google account and the personal free plan. The event is **Démo Thesisfic**, 30 minutes, Google Meet, with the connected calendar checked for conflicts. Initial schedule: Monday–Friday, 09:00–17:00, Europe/Paris.

Public event: https://cal.com/soufyan-ess-dnaecp/demo-thesisfic

The public page displays the title, duration, Google Meet and timezone, and exposes selectable slots. No test booking or invitation was sent. No domain, mailbox or paid plan was purchased. The verified URL was saved as the public Vercel environment variable for development, preview and production; it applies to subsequent deployments.

## Validation

- `node scripts/test-questionnaire-editor.cjs`: passed (edit application, order, removal/undo, stable types/keys, archived CSV, protected routing, translation catalogue/UI coverage and canonical submission validation).
- `node scripts/test-demo-booking.cjs`: passed (event URL and invalid/missing configurations).
- Final production build: passed, including lint/type validation and the `/demo` route.
- Chrome on the production build: passed free stage navigation, title/help updates, native drag reorder, removal/undo, per-language updates, persisted reload, anonymous edit rejection, protected question rejection and duplicate order rejection.
- Public form: required validation preserved; switching through all six languages retains consent and canonical answers. Full Arabic-language response accepted; language recorded. Archived question remains in CSV and Portuguese team results render correctly.
- Arabic editor at 390px: RTL, no horizontal overflow. French desktop editor and Portuguese results screenshots inspected.
- Landing in EN/ES/FR/DE: demo CTA links present, waiting-list copy/form absent, `/demo` returns 307 to the real event. Mobile at 390px has no horizontal overflow; no browser JavaScript errors.
- In-app browser: scrolled to the booking card, inspected and captured the visible section; clicked the CTA and reached the public Cal.com event. No booking submitted. Full-page automated screenshots leave offscreen reveal animations hidden, so the scrolled card capture is the visual check of the replacement section.

Browser checks use a local production build and fixture team password without a production database or model calls. Screenshots are retained in the chat workspace's `outputs/` directory.
