import base from "@/data/questionnaire.json";

/**
 * Validation questionnaire (Master SMI, Université Paris-Saclay): the public form at /questionnaire, the team's
 * additions (questions and alternative phrasings) and the aggregation used by /equipe/resultats.
 *
 * The base content is `src/data/questionnaire.json`, kept verbatim (French, validated by the team). Team additions
 * are stored in the data layer and merged here, so the form, the results page and the CSV all see one definition.
 */

export type ItemType = "mc" | "cb" | "scale" | "text" | "para" | "grid";

export interface Item {
  id: string;
  type: ItemType;
  title: string;
  help?: string;
  req?: boolean;
  choices?: string[];
  other?: boolean;
  max?: number;
  min?: number;
  low?: string;
  high?: string;
  rows?: string[];
  cols?: string[];
  nav?: Record<string, string>;
  interviewerOnly?: boolean;
  /** Set on items added by the team (id of the edit), never on base items. */
  addedBy?: string;
  /** Alternative ways of asking the question, added by the team for the interviewer. */
  phrasings?: Phrasing[];
}

export interface Phrasing {
  id: string;
  text: string;
  author?: string;
}

export interface Section {
  id: string;
  title: string;
  description?: string;
  items: Item[];
  next?: string;
}

export interface Questionnaire {
  title: string;
  description: string;
  confirmation: string;
  sections: Section[];
}

/** A team addition: a new question placed in a section, or an alternative phrasing attached to a question. */
export interface QuestionnaireEdit {
  id: string;
  kind: "item" | "phrasing";
  sectionId: string;
  /** item: answer key of the question it goes after (omitted = end of section). phrasing: key of the question. */
  targetKey?: string;
  item?: Omit<Item, "id" | "addedBy" | "phrasings">;
  text?: string;
  author?: string;
  createdAt: string;
}

export type Mode = "en_ligne" | "entretien";
export type Profil = "enseignant" | "etudiant";
export type AnswerValue = string | string[] | number | Record<string, string>;
export type Answers = Record<string, AnswerValue>;

export const BASE: Questionnaire = base as Questionnaire;
export const SUBMIT = "SUBMIT";
export const MODE_ITEM = "mode";
export const PROFIL_ITEM = "profil";
export const CONSENT_ITEM = "start_1";
export const INTERVIEWER_ITEM = "start_3";
/** Prefix of interviewer-only instructions inside `help` and `description`. */
export const INTERVIEWER_PREFIX = /^Entretien\s*:/;
export const OTHER = "Autre";
export const OTHER_PREFIX = "Autre : ";
export const MAX_TEXT = 4000;
export const MAX_OTHER = 300;
export const ENTRETIEN_CHOICE = BASE.sections[0].items.find((i) => i.id === MODE_ITEM)!.choices![1];
export const PROFIL_CHOICES = BASE.sections[0].items.find((i) => i.id === PROFIL_ITEM)!.choices!;

/** Ids that appear in more than one section (the interviewer notes block reuses one id): their key is prefixed. */
const DUPLICATE_IDS = (() => {
  const seen = new Map<string, number>();
  for (const s of BASE.sections) for (const i of s.items) seen.set(i.id, (seen.get(i.id) || 0) + 1);
  return new Set(Array.from(seen.entries()).filter(([, n]) => n > 1).map(([id]) => id));
})();

/** Answer key of an item: its id, or `section.id` when the id is reused by several sections. */
export function keyOf(section: Section, item: Item): string {
  return DUPLICATE_IDS.has(item.id) ? `${section.id}.${item.id}` : item.id;
}

/** Base definition plus the team's additions, in display order. */
export function withEdits(edits: QuestionnaireEdit[]): Questionnaire {
  const sections = BASE.sections.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i })) }));
  const sorted = edits.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const e of sorted) {
    const section = sections.find((s) => s.id === e.sectionId);
    if (!section) continue;
    if (e.kind === "item" && e.item) {
      const item: Item = { ...e.item, id: e.id, addedBy: e.id };
      const at = e.targetKey ? section.items.findIndex((i) => keyOf(section, i) === e.targetKey) : -1;
      if (at >= 0) section.items.splice(at + 1, 0, item);
      else section.items.push(item);
    } else if (e.kind === "phrasing" && e.text && e.targetKey) {
      const target = section.items.find((i) => keyOf(section, i) === e.targetKey);
      if (target) target.phrasings = [...(target.phrasings || []), { id: e.id, text: e.text, author: e.author }];
    }
  }
  return { ...BASE, sections };
}

export function modeOf(answers: Answers): Mode {
  return answers[MODE_ITEM] === ENTRETIEN_CHOICE ? "entretien" : "en_ligne";
}

export function profilOf(answers: Answers): Profil | null {
  const v = answers[PROFIL_ITEM];
  if (v === PROFIL_CHOICES[0]) return "enseignant";
  if (v === PROFIL_CHOICES[1]) return "etudiant";
  return null;
}

export function visibleItems(section: Section, mode: Mode): Item[] {
  return section.items.filter((i) => mode === "entretien" || !i.interviewerOnly);
}

/** Paragraphs of a description or help text, without the interviewer instructions unless in interview mode. */
export function paragraphsFor(text: string | undefined, mode: Mode): string[] {
  if (!text) return [];
  return text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p && (mode === "entretien" || !INTERVIEWER_PREFIX.test(p)));
}

export function isAnswered(item: Item, value: AnswerValue | undefined): boolean {
  if (value === undefined || value === null) return false;
  switch (item.type) {
    case "cb":
      return Array.isArray(value) && value.length > 0;
    case "scale":
      return typeof value === "number" && Number.isFinite(value);
    case "grid":
      return typeof value === "object" && !Array.isArray(value) && (item.rows || []).every((r) => typeof (value as Record<string, string>)[r] === "string" && (value as Record<string, string>)[r] !== "");
    default:
      return typeof value === "string" && value.trim() !== "";
  }
}

/** Valid, plausible answer for the item: wrong shapes and out-of-list choices are rejected server-side. */
export function isValidValue(item: Item, value: AnswerValue): boolean {
  const inChoices = (v: string) => (item.choices || []).includes(v) || (!!item.other && v.startsWith(OTHER_PREFIX) && v.length <= OTHER_PREFIX.length + MAX_OTHER);
  switch (item.type) {
    case "mc":
      return typeof value === "string" && inChoices(value);
    case "cb":
      return Array.isArray(value) && value.every((v) => typeof v === "string" && inChoices(v)) && (!item.max || value.length <= item.max) && new Set(value).size === value.length;
    case "scale":
      return typeof value === "number" && Number.isInteger(value) && value >= (item.min ?? 1) && value <= (item.max ?? 5);
    case "grid":
      return typeof value === "object" && !Array.isArray(value) && Object.entries(value).every(([r, c]) => (item.rows || []).includes(r) && (item.cols || []).includes(c));
    case "text":
    case "para":
      return typeof value === "string" && value.length <= MAX_TEXT;
  }
}

/** Id of the section after `section`, following `nav` answers, or SUBMIT. In online mode the demo question is "Non". */
export function nextSectionId(q: Questionnaire, section: Section, answers: Answers, mode: Mode): string {
  for (const item of section.items) {
    if (!item.nav) continue;
    let value = answers[keyOf(section, item)];
    if (item.interviewerOnly && mode !== "entretien") value = "Non";
    if (typeof value === "string" && item.nav[value]) return item.nav[value];
  }
  if (section.next) return section.next;
  const idx = q.sections.findIndex((s) => s.id === section.id);
  return idx >= 0 && idx + 1 < q.sections.length ? q.sections[idx + 1].id : SUBMIT;
}

/** Sections still to come after `sectionId` given the answers so far (unanswered branches take the next section). */
export function remainingAfter(q: Questionnaire, sectionId: string, answers: Answers, mode: Mode): number {
  let n = 0;
  let cur = q.sections.find((s) => s.id === sectionId);
  const seen = new Set<string>();
  while (cur && n < q.sections.length) {
    const next = nextSectionId(q, cur, answers, mode);
    if (next === SUBMIT || seen.has(next)) break;
    seen.add(next);
    cur = q.sections.find((s) => s.id === next);
    if (cur) n++;
  }
  return n;
}

/** Items a respondent could have answered along `path`, in order (used by results and CSV). */
export function itemsAlong(q: Questionnaire, sectionIds?: string[]): { section: Section; item: Item; key: string }[] {
  const out: { section: Section; item: Item; key: string }[] = [];
  const sections = sectionIds ? sectionIds.map((id) => q.sections.find((s) => s.id === id)).filter((s): s is Section => !!s) : q.sections;
  for (const s of sections) for (const i of s.items) out.push({ section: s, item: i, key: keyOf(s, i) });
  return out;
}

export interface SubmissionInput {
  answers: Answers;
  path: string[];
  durationSeconds: number;
}

export interface Validated {
  answers: Answers;
  mode: Mode;
  profil: Profil;
  interviewer: string | null;
  path: string[];
  durationSeconds: number;
}

/**
 * Server-side validation of a submission: the path must be walkable from the first section with the given answers,
 * every required visible item on the path must be answered, every value must have the right shape.
 */
export function validateSubmission(q: Questionnaire, input: SubmissionInput): { ok: true; value: Validated } | { ok: false; error: string } {
  const { answers, path } = input;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return { ok: false, error: "answers" };
  if (!Array.isArray(path) || path.length === 0 || path[0] !== q.sections[0].id) return { ok: false, error: "path" };
  const mode = modeOf(answers);
  const profil = profilOf(answers);
  if (!profil) return { ok: false, error: "profil" };
  const consentItem = q.sections[0].items.find((i) => i.id === CONSENT_ITEM)!;
  if (!isAnswered(consentItem, answers[CONSENT_ITEM])) return { ok: false, error: "consent" };

  const clean: Answers = {};
  let cursor: string | undefined = path[0];
  for (let idx = 0; idx < path.length; idx++) {
    const section = q.sections.find((s) => s.id === path[idx]);
    if (!section || section.id !== cursor) return { ok: false, error: "path" };
    for (const item of visibleItems(section, mode)) {
      const key = keyOf(section, item);
      const value = answers[key];
      if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
        if (item.req) return { ok: false, error: `required:${key}` };
        continue;
      }
      if (!isValidValue(item, value)) return { ok: false, error: `invalid:${key}` };
      if (item.type === "grid" && item.req && !isAnswered(item, value)) return { ok: false, error: `required:${key}` };
      clean[key] = typeof value === "string" ? value.trim() : value;
    }
    cursor = nextSectionId(q, section, answers, mode);
  }
  if (cursor !== SUBMIT) return { ok: false, error: "incomplete" };
  const interviewer = mode === "entretien" && typeof clean[INTERVIEWER_ITEM] === "string" ? (clean[INTERVIEWER_ITEM] as string).slice(0, 120) : null;
  const durationSeconds = Math.max(0, Math.min(6 * 3600, Math.round(Number(input.durationSeconds) || 0)));
  return { ok: true, value: { answers: clean, mode, profil, interviewer, path, durationSeconds } };
}

// ---------- team additions ----------

const EDIT_TYPES: ItemType[] = ["mc", "cb", "scale", "text", "para"];

/** Normalises a question proposed by the team; returns null when it cannot be rendered. */
export function sanitizeNewItem(raw: unknown): Omit<Item, "id" | "addedBy" | "phrasings"> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const type = EDIT_TYPES.includes(r.type as ItemType) ? (r.type as ItemType) : null;
  const title = typeof r.title === "string" ? r.title.trim().slice(0, 400) : "";
  if (!type || title.length < 3) return null;
  const item: Omit<Item, "id" | "addedBy" | "phrasings"> = { type, title, req: !!r.req, interviewerOnly: !!r.interviewerOnly };
  if (typeof r.help === "string" && r.help.trim()) item.help = r.help.trim().slice(0, 600);
  if (type === "mc" || type === "cb") {
    const choices = Array.isArray(r.choices) ? Array.from(new Set(r.choices.filter((c): c is string => typeof c === "string").map((c) => c.trim().slice(0, 200)).filter(Boolean))) : [];
    if (choices.length < 2) return null;
    item.choices = choices.slice(0, 20);
    item.other = !!r.other;
    if (type === "cb" && Number.isInteger(Number(r.max)) && Number(r.max) >= 1 && Number(r.max) < choices.length) item.max = Number(r.max);
  }
  if (type === "scale") {
    const min = Number.isInteger(Number(r.min)) ? Number(r.min) : 1;
    const max = Number.isInteger(Number(r.max)) ? Number(r.max) : 5;
    if (min < 0 || max > 10 || max - min < 2) return null;
    item.min = min;
    item.max = max;
    item.low = typeof r.low === "string" ? r.low.trim().slice(0, 80) : "";
    item.high = typeof r.high === "string" ? r.high.trim().slice(0, 80) : "";
  }
  return item;
}

// ---------- results ----------

export interface ResponseRow {
  id: string;
  createdAt: string;
  mode: Mode;
  profil: Profil;
  interviewer: string | null;
  answers: Answers;
  durationSeconds: number;
  path: string[];
}

function fmt(value: AnswerValue | undefined): string {
  if (value === undefined) return "";
  if (Array.isArray(value)) return value.join(" | ");
  if (typeof value === "object") return Object.entries(value).map(([r, c]) => `${r}: ${c}`).join(" | ");
  return String(value);
}

/** One row per response, one column per question (grid rows become their own columns). */
export function toCsv(q: Questionnaire, rows: ResponseRow[]): string {
  const cols: { header: string; get: (r: ResponseRow) => string }[] = [
    { header: "id", get: (r) => r.id },
    { header: "created_at", get: (r) => r.createdAt },
    { header: "mode", get: (r) => r.mode },
    { header: "profil", get: (r) => r.profil },
    { header: "interviewer", get: (r) => r.interviewer || "" },
    { header: "duration_seconds", get: (r) => String(r.durationSeconds) },
    { header: "path", get: (r) => r.path.join(" > ") },
  ];
  for (const { section, item, key } of itemsAlong(q)) {
    if (item.type === "grid") {
      for (const row of item.rows || []) cols.push({ header: `${key} — ${item.title} — ${row}`, get: (r) => ((r.answers[key] as Record<string, string> | undefined) || {})[row] || "" });
    } else {
      cols.push({ header: `${key} — ${item.title}${DUPLICATE_IDS.has(item.id) ? ` (${section.title})` : ""}`, get: (r) => fmt(r.answers[key]) });
    }
  }
  const esc = (s: string) => (/[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [cols.map((c) => esc(c.header)).join(",")];
  for (const r of rows) lines.push(cols.map((c) => esc(c.get(r))).join(","));
  return "﻿" + lines.join("\r\n");
}

export interface Indicator {
  id: string;
  value: number | null;
  /** "mean" renders as x / max, "pct" as a percentage, "count" as n. */
  kind: "mean" | "pct" | "count";
  target?: number;
  n: number;
  max?: number;
  met?: boolean;
  detail?: Record<string, number>;
}

function mean(values: number[]): number | null {
  return values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null;
}
function numbers(rows: ResponseRow[], keys: string[]): number[] {
  const out: number[] = [];
  for (const r of rows) for (const k of keys) if (typeof r.answers[k] === "number") out.push(r.answers[k] as number);
  return out;
}
function share(rows: ResponseRow[], key: string, match: (v: string) => boolean): { pct: number | null; n: number } {
  const answered = rows.filter((r) => typeof r.answers[key] === "string");
  const hits = answered.filter((r) => match(r.answers[key] as string)).length;
  return { pct: answered.length ? Math.round((hits / answered.length) * 1000) / 10 : null, n: answered.length };
}

/** Decision indicators shown at the top of the results page (targets from the research brief). */
export function indicators(rows: ResponseRow[]): Indicator[] {
  const teachers = rows.filter((r) => r.profil === "enseignant");
  const students = rows.filter((r) => r.profil === "etudiant");
  const problem = numbers(rows, ["p_probleme_9", "e_probleme_11"]);
  const problemT = numbers(teachers, ["p_probleme_9"]);
  const problemS = numbers(students, ["e_probleme_11"]);
  const unclear = share(students, "e_probleme_4", (v) => v !== "Oui, c'est clair");
  const fit = numbers(rows, ["p_demo_1", "e_demo_1"]);
  const ellisRows = rows.filter((r) => typeof r.answers.p_demo_6 === "string" || typeof r.answers.e_demo_6 === "string");
  const ellisHits = ellisRows.filter((r) => r.answers.p_demo_6 === "Très déçu·e" || r.answers.e_demo_6 === "Très déçu·e").length;
  const wouldUse = share(students, "e_demo_5", (v) => v === "Oui");
  const pilot = share(teachers, "p_adoption_1", (v) => v === "Oui" || v === "Oui, sous conditions");
  const deciders: Record<string, number> = {};
  for (const r of teachers) for (const v of (Array.isArray(r.answers.p_adoption_3) ? r.answers.p_adoption_3 : []) as string[]) deciders[v] = (deciders[v] || 0) + 1;
  const m = (v: number | null, target: number) => (v === null ? undefined : v >= target);
  return [
    { id: "problem", kind: "mean", value: mean(problem), target: 3.5, max: 5, n: problem.length, met: m(mean(problem), 3.5), detail: { enseignants: mean(problemT) ?? 0, etudiants: mean(problemS) ?? 0 } },
    { id: "unclear", kind: "pct", value: unclear.pct, target: 50, n: unclear.n, met: m(unclear.pct, 50) },
    { id: "fit", kind: "mean", value: mean(fit), target: 4, max: 5, n: fit.length, met: m(mean(fit), 4) },
    { id: "ellis", kind: "pct", value: ellisRows.length ? Math.round((ellisHits / ellisRows.length) * 1000) / 10 : null, target: 40, n: ellisRows.length, met: ellisRows.length ? ellisHits / ellisRows.length >= 0.4 : undefined },
    { id: "wouldUse", kind: "pct", value: wouldUse.pct, target: 60, n: wouldUse.n, met: m(wouldUse.pct, 60) },
    { id: "pilot", kind: "pct", value: pilot.pct, n: pilot.n, detail: deciders },
  ];
}
