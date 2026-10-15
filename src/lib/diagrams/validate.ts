/**
 * Sanitising and checking diagram specs (docs/papers.md §9.1 D26, §9.3). Pure: no I/O, deterministic.
 * - `sanitizeDiagram` trims and caps every label, rejects malformed input with a code (`data.diagram.error.<code>`)
 *   and returns non-blocking notices (`data.diagram.warn.<code>`), including the PRISMA 2020 arithmetic.
 * - `numbersAppearIn` lists the PRISMA counts a text never wrote, so the chat can refuse invented numbers
 *   (`artifact_error` `prisma_numbers`).
 */
import {
  PRISMA_COUNT_KEYS,
  PRISMA_OTHER_IDENTIFIED_KEYS,
  PRISMA_OTHER_KEYS,
  type ConceptEdge,
  type ConceptNode,
  type DiagramSpec,
  type DiagramTranslator,
  type DiagramWarning,
  type GanttTask,
  type PrismaCountKey,
  type PrismaCounts,
  type PrismaReason,
  type PrismaSpec,
  type SanitizeResult,
} from "./types";

/* ------------------------------------------------------------------------------------------------------------------
 * Caps (D26 plus the ones D26 leaves open)
 * ---------------------------------------------------------------------------------------------------------------- */

export const GANTT_MAX_TASKS = 30;
export const GANTT_LABEL_MAX = 80;
export const GANTT_GROUP_MAX = 40;
/** Longest timeline, in years (first start to last end). */
export const GANTT_MAX_YEARS = 10;
/** With no valid `unit`, spans up to this many days use weeks, longer ones months. */
export const GANTT_AUTO_WEEK_DAYS = 120;

export const PRISMA_MAX_REASONS = 12;
export const PRISMA_REASON_MAX = 80;
/** Largest count accepted (a sanity bound, far above any real review). */
export const PRISMA_MAX_COUNT = 10000000;

export const CONCEPT_MIN_NODES = 2;
export const CONCEPT_MAX_NODES = 24;
export const CONCEPT_LABEL_MAX = 40;
export const CONCEPT_MAX_EDGES = 40;
export const CONCEPT_EDGE_LABEL_MAX = 30;
export const CONCEPT_ID_MAX = 64;

const MS_PER_DAY = 86400000;

/* ------------------------------------------------------------------------------------------------------------------
 * Small helpers
 * ---------------------------------------------------------------------------------------------------------------- */

type Fail = { ok: false; code: string; field?: string };
const fail = (code: string, field?: string): Fail => (field ? { ok: false, code, field } : { ok: false, code });

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Text value of a label: strings and finite numbers, without control or bidi-override characters, spaces collapsed. */
function cleanText(v: unknown): string | null {
  if (typeof v === "number" && isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  return v
    .replace(/[\u0000-\u001f\u007f-\u009f​‪-‮⁦-⁩﻿]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Caps `text` at `max` characters (ellipsis included) and records a notice when it had to. */
function capLabel(text: string, max: number, field: string, warnings: DiagramWarning[]): string {
  if (text.length <= max) return text;
  let cut = max - 1;
  const code = text.charCodeAt(cut - 1);
  if (code >= 0xd800 && code <= 0xdbff) cut--; // never split a surrogate pair
  warnings.push({ code: "label_truncated", field, vars: { max } });
  return text.slice(0, cut).replace(/\s+$/, "") + "…";
}

/** A count: a finite integer 0…PRISMA_MAX_COUNT, given as a number or a string of digits. `undefined` = absent. */
function readCount(v: unknown): number | undefined | "bad" {
  if (v === undefined || v === null || v === "") return undefined;
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "string" && /^\s*\d+\s*$/.test(v)) n = parseInt(v, 10);
  else return "bad";
  if (!isFinite(n) || n < 0 || Math.floor(n) !== n || n > PRISMA_MAX_COUNT) return "bad";
  return n;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Day number (days since 1970-01-01, UTC) of a diagram date, or null when invalid.
 * `YYYY-MM-DD`, or `YYYY-MM` meaning the first day (`edge: "start"`) or the last day (`edge: "end"`) of that month.
 * Years 1900–2100 only.
 */
export function parseDiagramDate(value: string, edge: "start" | "end"): number | null {
  const m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(value.trim());
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (year < 1900 || year > 2100 || month < 1 || month > 12) return null;
  const last = daysInMonth(year, month);
  const day = m[3] ? parseInt(m[3], 10) : edge === "start" ? 1 : last;
  if (day < 1 || day > last) return null;
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/* ------------------------------------------------------------------------------------------------------------------
 * sanitizeDiagram
 * ---------------------------------------------------------------------------------------------------------------- */

/** Validates and normalises an untrusted diagram spec (from the form or a copilot block); never throws. */
export function sanitizeDiagram(input: unknown): SanitizeResult {
  try {
    if (!isObject(input)) return fail("invalid");
    const figure = input.figure;
    if (figure === "gantt") return sanitizeGantt(input);
    if (figure === "prisma") return sanitizePrisma(input);
    if (figure === "conceptMap") return sanitizeConceptMap(input);
    return fail("unknown_figure", "figure");
  } catch {
    return fail("invalid");
  }
}

function sanitizeGantt(input: Record<string, unknown>): SanitizeResult {
  const warnings: DiagramWarning[] = [];
  const raw = input.tasks;
  if (!Array.isArray(raw) || raw.length === 0) return fail("no_tasks", "tasks");
  if (raw.length > GANTT_MAX_TASKS) return fail("too_many_tasks", "tasks");
  const tasks: GanttTask[] = [];
  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    const f = `tasks[${i}]`;
    if (!isObject(t)) return fail("task_label_missing", `${f}.label`);
    const label = cleanText(t.label);
    if (!label) return fail("task_label_missing", `${f}.label`);
    const milestone = t.milestone === true;
    const start = cleanText(t.start) ?? "";
    const startDay = parseDiagramDate(start, "start");
    if (startDay === null) return fail("invalid_date", `${f}.start`);
    let end = cleanText(t.end) ?? "";
    if (milestone || !end) end = start;
    const endDay = parseDiagramDate(end, milestone ? "start" : "end");
    if (endDay === null) return fail("invalid_date", `${f}.end`);
    if (endDay < startDay) return fail("end_before_start", `${f}.end`);
    minStart = Math.min(minStart, startDay);
    maxEnd = Math.max(maxEnd, endDay);
    const task: GanttTask = { label: capLabel(label, GANTT_LABEL_MAX, `${f}.label`, warnings), start, end };
    const group = cleanText(t.group);
    if (group) task.group = capLabel(group, GANTT_GROUP_MAX, `${f}.group`, warnings);
    if (milestone) task.milestone = true;
    tasks.push(task);
  }
  if (maxEnd - minStart > GANTT_MAX_YEARS * 366) return fail("range_too_long", "tasks");
  const unit: "week" | "month" =
    input.unit === "week" || input.unit === "month" ? input.unit : maxEnd - minStart + 1 <= GANTT_AUTO_WEEK_DAYS ? "week" : "month";
  return { ok: true, spec: { figure: "gantt", unit, tasks }, warnings };
}

function sanitizePrisma(input: Record<string, unknown>): SanitizeResult {
  const warnings: DiagramWarning[] = [];
  const rawCounts = isObject(input.counts) ? input.counts : {};
  const counts: PrismaCounts = {};
  const keys = Object.keys(rawCounts);
  for (let i = 0; i < keys.length; i++) {
    const rawKey = keys[i];
    const key = (rawKey === "organizations" ? "organisations" : rawKey) as PrismaCountKey;
    if (PRISMA_COUNT_KEYS.indexOf(key) === -1) continue; // unknown keys are dropped
    const n = readCount(rawCounts[rawKey]);
    if (n === "bad") return fail("invalid_count", `counts.${key}`);
    if (n !== undefined) counts[key] = n;
  }
  const reasons: PrismaReason[] = [];
  if (input.reasons !== undefined && input.reasons !== null) {
    if (!Array.isArray(input.reasons)) return fail("invalid", "reasons");
    if (input.reasons.length > PRISMA_MAX_REASONS) return fail("too_many_reasons", "reasons");
    for (let i = 0; i < input.reasons.length; i++) {
      const r = input.reasons[i];
      const f = `reasons[${i}]`;
      if (!isObject(r)) return fail("reason_label_missing", `${f}.label`);
      const label = cleanText(r.label);
      if (!label) return fail("reason_label_missing", `${f}.label`);
      const n = readCount(r.n);
      if (n === undefined || n === "bad") return fail("invalid_count", `${f}.n`);
      reasons.push({ label: capLabel(label, PRISMA_REASON_MAX, `${f}.label`, warnings), n });
    }
  }
  const anyOther = PRISMA_OTHER_KEYS.some((k) => counts[k] !== undefined);
  const otherMethods = input.otherMethods === true || (input.otherMethods !== false && anyOther);
  if (!otherMethods) for (const k of PRISMA_OTHER_KEYS) delete counts[k];

  if (counts.databases === undefined && counts.registers === undefined) return fail("prisma_missing", "counts.databases");
  if (counts.screened === undefined) return fail("prisma_missing", "counts.screened");
  if (counts.studiesIncluded === undefined) return fail("prisma_missing", "counts.studiesIncluded");

  const spec: PrismaSpec = { figure: "prisma", counts: counts as Record<string, number> };
  if (reasons.length) spec.reasons = reasons;
  if (otherMethods) spec.otherMethods = true;
  return { ok: true, spec, warnings: warnings.concat(prismaWarnings(spec)) };
}

function sanitizeConceptMap(input: Record<string, unknown>): SanitizeResult {
  const warnings: DiagramWarning[] = [];
  const rawNodes = input.nodes;
  if (!Array.isArray(rawNodes) || rawNodes.length < CONCEPT_MIN_NODES) return fail("too_few_nodes", "nodes");
  if (rawNodes.length > CONCEPT_MAX_NODES) return fail("too_many_nodes", "nodes");
  const nodes: ConceptNode[] = [];
  const seen: Record<string, true> = {};
  for (let i = 0; i < rawNodes.length; i++) {
    const n = rawNodes[i];
    const f = `nodes[${i}]`;
    if (!isObject(n)) return fail("node_id_missing", `${f}.id`);
    const idText = cleanText(n.id);
    if (!idText) return fail("node_id_missing", `${f}.id`);
    const id = idText.slice(0, CONCEPT_ID_MAX);
    if (seen["#" + id]) return fail("duplicate_id", `${f}.id`);
    seen["#" + id] = true;
    const label = cleanText(n.label);
    if (!label) return fail("node_label_missing", `${f}.label`);
    nodes.push({ id, label: capLabel(label, CONCEPT_LABEL_MAX, `${f}.label`, warnings) });
  }
  const rawEdges = input.edges === undefined || input.edges === null ? [] : input.edges;
  if (!Array.isArray(rawEdges)) return fail("invalid", "edges");
  if (rawEdges.length > CONCEPT_MAX_EDGES) return fail("too_many_edges", "edges");
  const edges: ConceptEdge[] = [];
  const pairs: Record<string, true> = {};
  for (let i = 0; i < rawEdges.length; i++) {
    const e = rawEdges[i];
    const f = `edges[${i}]`;
    if (!isObject(e)) return fail("edge_unknown_node", `${f}.from`);
    const from = (cleanText(e.from) ?? "").slice(0, CONCEPT_ID_MAX);
    const to = (cleanText(e.to) ?? "").slice(0, CONCEPT_ID_MAX);
    if (!seen["#" + from]) return fail("edge_unknown_node", `${f}.from`);
    if (!seen["#" + to]) return fail("edge_unknown_node", `${f}.to`);
    if (from === to) {
      warnings.push({ code: "edge_self_loop", field: f });
      continue;
    }
    const pair = JSON.stringify([from, to]);
    if (pairs[pair]) {
      warnings.push({ code: "edge_duplicate", field: f });
      continue;
    }
    pairs[pair] = true;
    const edge: ConceptEdge = { from, to };
    const label = cleanText(e.label);
    if (label) edge.label = capLabel(label, CONCEPT_EDGE_LABEL_MAX, `${f}.label`, warnings);
    edges.push(edge);
  }
  return { ok: true, spec: { figure: "conceptMap", nodes, edges }, warnings };
}

/* ------------------------------------------------------------------------------------------------------------------
 * PRISMA 2020 arithmetic (flow diagram for new systematic reviews)
 * ---------------------------------------------------------------------------------------------------------------- */

/**
 * Non-blocking arithmetic notices for a PRISMA spec. Absent identification and removal sub-counts count as 0;
 * any other check runs only when all its counts are present. Rules (left column, then other methods):
 *  1. screened = (databases + registers) − (duplicatesRemoved + automationRemoved + otherRemoved)      prisma_screened
 *  2. soughtForRetrieval = screened − screenedExcluded                                                  prisma_sought
 *  3. assessedForEligibility = soughtForRetrieval − notRetrieved                                        prisma_assessed
 *  4. reportsExcluded = Σ reasons[].n (when both are given)                                             prisma_reasons
 *  5. eligible = (assessedForEligibility − excluded) [+ (otherAssessed − otherExcluded) with other methods],
 *     where excluded = reportsExcluded, or Σ reasons when the total is absent;
 *     reportsIncluded = eligible                                                                        prisma_reports_included
 *  6. studiesIncluded ≤ reportsIncluded (a study can have several reports)                              prisma_studies_reports
 *     or, without reportsIncluded, studiesIncluded ≤ eligible                                           prisma_studies_included
 *  7. otherSought ≤ websites + organisations + citationSearching                                        prisma_other_sought
 *  8. otherAssessed = otherSought − otherNotRetrieved                                                   prisma_other_assessed
 * `expected` is what the flow implies, `actual` what the student wrote (the bound, for ≤ rules).
 */
export function prismaWarnings(spec: PrismaSpec): DiagramWarning[] {
  const c = spec.counts as PrismaCounts;
  const has = (k: PrismaCountKey) => typeof c[k] === "number";
  const v = (k: PrismaCountKey) => c[k] as number;
  const sum = (keys: readonly PrismaCountKey[]) => keys.reduce((s, k) => s + (c[k] ?? 0), 0);
  const out: DiagramWarning[] = [];
  const check = (code: DiagramWarning["code"], key: PrismaCountKey, expected: number, actual: number) => {
    if (expected !== actual) out.push({ code, field: `counts.${key}`, expected, actual, vars: { expected, actual } });
  };
  const bound = (code: DiagramWarning["code"], key: PrismaCountKey, max: number, actual: number) => {
    if (actual > max) out.push({ code, field: `counts.${key}`, expected: max, actual, vars: { expected: max, actual } });
  };

  if (has("screened")) {
    const identified = sum(["databases", "registers"]);
    const removed = sum(["duplicatesRemoved", "automationRemoved", "otherRemoved"]);
    check("prisma_screened", "screened", identified - removed, v("screened"));
  }
  if (has("soughtForRetrieval") && has("screened") && has("screenedExcluded")) {
    check("prisma_sought", "soughtForRetrieval", v("screened") - v("screenedExcluded"), v("soughtForRetrieval"));
  }
  if (has("assessedForEligibility") && has("soughtForRetrieval") && has("notRetrieved")) {
    check("prisma_assessed", "assessedForEligibility", v("soughtForRetrieval") - v("notRetrieved"), v("assessedForEligibility"));
  }
  const reasons = spec.reasons ?? [];
  const reasonSum = reasons.reduce((s, r) => s + r.n, 0);
  if (reasons.length && has("reportsExcluded")) check("prisma_reasons", "reportsExcluded", reasonSum, v("reportsExcluded"));

  const excluded = has("reportsExcluded") ? v("reportsExcluded") : reasons.length ? reasonSum : undefined;
  let eligible: number | undefined = has("assessedForEligibility") && excluded !== undefined ? v("assessedForEligibility") - excluded : undefined;
  if (eligible !== undefined && spec.otherMethods) {
    eligible = has("otherAssessed") && has("otherExcluded") ? eligible + v("otherAssessed") - v("otherExcluded") : undefined;
  }
  if (has("reportsIncluded") && eligible !== undefined) check("prisma_reports_included", "reportsIncluded", eligible, v("reportsIncluded"));
  if (has("studiesIncluded")) {
    if (has("reportsIncluded")) bound("prisma_studies_reports", "studiesIncluded", v("reportsIncluded"), v("studiesIncluded"));
    else if (eligible !== undefined) bound("prisma_studies_included", "studiesIncluded", eligible, v("studiesIncluded"));
  }

  if (spec.otherMethods) {
    if (has("otherSought") && PRISMA_OTHER_IDENTIFIED_KEYS.some((k) => has(k))) {
      bound("prisma_other_sought", "otherSought", sum(PRISMA_OTHER_IDENTIFIED_KEYS), v("otherSought"));
    }
    if (has("otherAssessed") && has("otherSought") && has("otherNotRetrieved")) {
      check("prisma_other_assessed", "otherAssessed", v("otherSought") - v("otherNotRetrieved"), v("otherAssessed"));
    }
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------------------------
 * Numbers the student actually wrote
 * ---------------------------------------------------------------------------------------------------------------- */

/** Every integer written in `text` as digits: grouped forms (1,234 · 1.234 · 1 234 · 1'234) and each digit run. */
function writtenIntegers(text: string, into: Record<string, true>): void {
  const re = /\d+(?:[.,'’    ]\d{3})*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const token = m[0];
    into[canonical(token.replace(/\D/g, ""))] = true;
    const runs = token.split(/\D+/);
    for (let i = 0; i < runs.length; i++) if (runs[i]) into[canonical(runs[i])] = true;
  }
}

function canonical(digits: string): string {
  const s = digits.replace(/^0+(?=\d)/, "");
  return s || "0";
}

/**
 * The PRISMA numbers of `spec` (counts and reason counts) that do NOT appear literally as digits in any of `texts`
 * (with or without thousands separators `,` `.` space or apostrophe), as plain digit strings in diagram order,
 * without duplicates. Other figures return []. Used by the chat: a copilot PRISMA with a missing number is refused.
 */
export function numbersAppearIn(spec: DiagramSpec, texts: string[]): string[] {
  if (spec.figure !== "prisma") return [];
  const written: Record<string, true> = {};
  for (let i = 0; i < texts.length; i++) if (typeof texts[i] === "string") writtenIntegers(texts[i], written);
  const missing: string[] = [];
  const consider = (n: unknown) => {
    if (typeof n !== "number" || !isFinite(n)) return;
    const s = canonical(String(Math.round(Math.abs(n))));
    if (!written[s] && missing.indexOf(s) === -1) missing.push(s);
  };
  const counts = spec.counts as PrismaCounts;
  for (let i = 0; i < PRISMA_COUNT_KEYS.length; i++) consider(counts[PRISMA_COUNT_KEYS[i]]);
  const extra = Object.keys(spec.counts).filter((k) => PRISMA_COUNT_KEYS.indexOf(k as PrismaCountKey) === -1);
  for (let i = 0; i < extra.length; i++) consider(spec.counts[extra[i]]);
  for (const r of spec.reasons ?? []) consider(r.n);
  return missing;
}

/* ------------------------------------------------------------------------------------------------------------------
 * Messages
 * ---------------------------------------------------------------------------------------------------------------- */

/** Text of a notice in the writing language: numbers go through `formatNumber` (default: plain digits). */
export function diagramWarningText(w: DiagramWarning, tr: DiagramTranslator, formatNumber: (n: number) => string = String): string {
  const vars: Record<string, string | number> = {};
  const src = w.vars ?? {};
  const keys = Object.keys(src);
  for (let i = 0; i < keys.length; i++) {
    const val = src[keys[i]];
    vars[keys[i]] = typeof val === "number" && keys[i] !== "max" ? formatNumber(val) : val;
  }
  return tr(`data.diagram.warn.${w.code}`, vars);
}

/** Text of a validation error, with the cap filled in for the `too_many_*` and range codes. */
export function diagramErrorText(code: string, tr: DiagramTranslator): string {
  const max: Record<string, number> = {
    too_many_tasks: GANTT_MAX_TASKS,
    range_too_long: GANTT_MAX_YEARS,
    too_many_reasons: PRISMA_MAX_REASONS,
    too_many_nodes: CONCEPT_MAX_NODES,
    too_many_edges: CONCEPT_MAX_EDGES,
  };
  return tr(`data.diagram.error.${code}`, max[code] !== undefined ? { max: max[code] } : undefined);
}
