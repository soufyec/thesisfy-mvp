/**
 * Demo data for My papers, assignments and primary data (docs/papers.md §6, D15). Applied once per store document by
 * `migrateStore` in db.ts (guarded there by `hasMigration`/`markMigration` "demo_papers_v1"), and only when the demo
 * accounts are on (`DEMO_ACCOUNTS` is not "off") and the demo student `usr_1` and professor `usr_4` exist.
 *
 * Deterministic: fixed ids, a seeded PRNG for the dataset, and dates anchored to Monday 00:00 UTC of the ISO week in
 * which the migration runs, plus or minus whole days. Nothing here calls uid(), Math.random() or reads the clock
 * other than through `nowMs`. It works on the store object directly (no `db` accessors: it runs while the store
 * is being hydrated) and takes db.ts's own word, provenance and figure counters as a parameter, so this module only
 * imports types from db.ts and there is no import cycle.
 *
 * What it adds:
 * - Students `usr_demo_5` Alex Kim, `usr_demo_6` Sofia Rossi, `usr_demo_7` Liam O'Connor (Stanford), with a password
 *   hash no password matches (they cannot sign in).
 * - `asg_demo_essay` (essay, Prof. Williams, due in 21 days, 2000 words, APA) for Jane, Alex, Sofia and Liam: Jane
 *   has not started it, Alex is writing (≈ 420 words, no AI), Sofia sent it for review on time, Liam has not started.
 * - `asg_demo_lab` (lab report, due in 35 days, 2500 words) for Jane, Alex and Sofia: Jane started it (template
 *   headings and ≈ 300 written words).
 * - The synthetic rain-gauge dataset `src_demo_rain` ("rain-gauges-2010-2020.csv", 132 rows), a primary source of
 *   Jane's linked to her lab report and to `thesis_1`, parsed by the same CSV pipeline as an upload, with its data
 *   card as the indexed text and chunks `chk_demo_rain_<i>`.
 * - `thesis_1` / `thesis_2` deadlines move to +60 / +120 days when they still hold their seed value.
 * No AI-assisted text is seeded (so no AI interaction, session event or mark has to be invented for it).
 */
import { createHash } from "crypto";
import type { Assignment, Consent, Dataset, PaperFigures, ProvenanceStats, SourceChunk, Store, Thesis, ThesisSource, User, WritingSession } from "@/lib/db";
import { readCsv } from "../sources/csv";
import { buildSheets } from "../sources/sheets";
import { chunkText, wordCount } from "../sources/chunk";
import { dataCard } from "../data/summarize";
import { buildTemplateHtml, templateFor } from "../papers/templates";
import { translate } from "../i18n/dictionary";

export const DEMO_PAPERS_MIGRATION = "demo_papers_v1";

/** db.ts counters, passed in by `migrateStore` so this module never imports db.ts at runtime. */
export interface DemoCounters {
  countWords(html: string): number;
  computeProvenance(html: string): ProvenanceStats;
  computeFigures(html: string): PaperFigures;
}

const DAY_MS = 86400000;
const HOUR_MS = 3600000;

/** Monday 00:00 UTC of the ISO week containing `ms`. */
export function isoWeekMonday(ms: number): number {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * DAY_MS;
}

// ---------------------------------------------------------------------------------------------------------------------
// Synthetic rain-gauge dataset
// ---------------------------------------------------------------------------------------------------------------------

export const RAIN_FILE = "rain-gauges-2010-2020.csv";
export const RAIN_TITLE = "Rain-gauge records 2010–2020 (synthetic demo data)";
const RAIN_SEED = 20101231;

/** mulberry32: a small deterministic PRNG. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GAUGES: { id: string; region: "North" | "South" | "Coast"; elevation: number }[] = [
  { id: "G01", region: "North", elevation: 380 },
  { id: "G02", region: "North", elevation: 520 },
  { id: "G03", region: "North", elevation: 690 },
  { id: "G04", region: "North", elevation: 860 },
  { id: "G05", region: "South", elevation: 140 },
  { id: "G06", region: "South", elevation: 230 },
  { id: "G07", region: "South", elevation: 310 },
  { id: "G08", region: "South", elevation: 450 },
  { id: "G09", region: "Coast", elevation: 8 },
  { id: "G10", region: "Coast", elevation: 25 },
  { id: "G11", region: "Coast", elevation: 60 },
  { id: "G12", region: "Coast", elevation: 110 },
];
const REGION_BASE = { North: 860, South: 520, Coast: 900 };
/** Wet and dry years shared by every gauge (2010…2020), on top of a mild decline of 7 mm a year. */
const YEAR_SHOCK = [30, -10, -70, 15, 45, -95, -5, 20, 70, -30, -40];
const DECLINE_PER_YEAR = 7;

/**
 * The CSV text of the demo dataset: 12 gauges × 11 years. Rainfall rises with elevation (0.55 mm per metre), differs
 * by region, declines mildly over the period with shared wet and dry years, and dry days fall as rainfall rises.
 */
export function rainCsv(): string {
  const rnd = prng(RAIN_SEED);
  const lines = ["gauge_id,region,year,annual_rainfall_mm,elevation_m,dry_days"];
  for (const g of GAUGES) {
    for (let y = 2010; y <= 2020; y++) {
      const noise = (rnd() + rnd() + rnd() - 1.5) * 130;
      const rain = REGION_BASE[g.region] + 0.55 * g.elevation + YEAR_SHOCK[y - 2010] - DECLINE_PER_YEAR * (y - 2010) + noise;
      const mm = Math.round(rain * 10) / 10;
      const dry = Math.max(90, Math.min(330, Math.round(258 - 0.082 * mm + (rnd() + rnd() - 1) * 26)));
      lines.push(`${g.id},${g.region},${y},${mm.toFixed(1)},${g.elevation},${dry}`);
    }
  }
  return lines.join("\n") + "\n";
}

/** The demo dataset's sheets, read by the same CSV pipeline as an uploaded file. */
export function rainSheets(csv: string = rainCsv()) {
  const bytes = Buffer.from(csv, "utf8");
  const read = readCsv(bytes, RAIN_FILE.replace(/\.csv$/, ""));
  return buildSheets([read.sheet]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Texts
// ---------------------------------------------------------------------------------------------------------------------

const ESSAY_TITLE = "Essay: Should universities allow generative AI in assessed coursework?";
const LAB_TITLE = "Lab report: Rainfall variability across the study region";

const ESSAY_BRIEF = [
  "Universities are revising their rules on generative AI in assessed work. In this essay you take a position on whether students should be allowed to use generative AI tools in coursework that counts towards their grade, and under which conditions.",
  "Build your argument on at least three academic or policy sources. Consider learning outcomes, fairness between students, the validity of assessment and what transparent use could look like in practice. Address the strongest objection to your position and explain why it does not change your conclusion, or how it limits it.",
  "About 2,000 words, APA style. Write in your own words: you may use Thesisfic AI to brainstorm, outline and get feedback on your drafts, as the course policy allows. It will not write the essay for you.",
].join("\n\n");

const LAB_BRIEF = [
  "Using the rain-gauge data from the course page, describe how annual rainfall varies across the study region between 2010 and 2020.",
  "Compare the three regions, look at how rainfall relates to elevation and to the number of dry days, and say whether there is a trend over the period. Include at least one table and one figure, each with a numbered caption, and explain in your own words what they show.",
  "Follow the lab report structure (abstract, introduction, materials and methods, results, discussion, conclusion). About 2,500 words, APA style. Tables and figures you compute with the Research copilot are marked as AI-assisted in your paper; the interpretation is yours.",
].join("\n\n");

/** Jane's lab report: introduction and methods written, the rest still the template. */
const LAB_TEXT: Record<string, string[]> = {
  "papers.section.introduction": [
    "Rainfall in the study region is uneven. The coastal strip receives moisture from the sea for most of the year, the northern uplands force passing air to rise over the hills, and the southern lowlands lie in a rain shadow and depend on a few winter storms. Water managers plan reservoirs and irrigation on the assumption that these differences are stable from one year to the next, but recent dry years have raised the question of whether that is still true.",
    "This report describes how annual rainfall varied across the study region between 2010 and 2020. It compares the three regions, examines how rainfall relates to the elevation of each gauge and to the number of dry days in a year, and asks whether there is a trend over the eleven years. The aim is descriptive: to establish what the gauge records show before any model of the causes is attempted.",
  ],
  "papers.section.materialsMethods": [
    "The data come from twelve rain gauges, four in each of the North, South and Coast regions, provided on the course page as a CSV file. Each gauge reported one record per year from 2010 to 2020, which gives 132 gauge-years. For every record the file lists the gauge identifier, its region, the year, the annual rainfall in millimetres, the elevation of the gauge in metres and the number of dry days, defined as days with less than 1 mm of rain.",
    "The records were checked for missing values and duplicates before the analysis, and none were found. Rainfall is summarised by region with the mean, the median and the standard deviation. The relation between rainfall and elevation, and between rainfall and dry days, is described with Pearson's correlation coefficient and with scatter plots. The trend is examined through the mean rainfall of each year.",
  ],
};

/** Alex's essay, in progress: introduction, first argument and part of the second. */
const ALEX_TEXT: Record<string, string[]> = {
  "papers.section.introduction": [
    "When generative AI tools became widely available, many universities responded by banning them in assessed work. Two years later, most of those bans have been softened or replaced by course-level rules, and students now receive mixed messages about what is allowed. This essay argues that universities should allow generative AI in assessed coursework, but only when its use is declared and when the assessment is designed so that the student's own thinking remains visible. A blanket ban is difficult to apply and pushes use out of sight, while unrestricted use makes it impossible to know what a grade measures. The essay first considers what assessment is for, then looks at fairness between students, and finally at what declared use could look like in practice.",
  ],
  "papers.section.firstArgument": [
    "The first argument concerns the purpose of assessment. Coursework is meant to show that a student can reason about a problem, use evidence and communicate a position. If a tool produces the text, the grade no longer tells the teacher much about any of these abilities. However, the same is not true of every use. A student who asks a tool to explain a statistical concept, or to point out weaknesses in an outline, still has to do the reasoning and the writing. In these cases the tool works more like a tutor or a study group than like a ghostwriter. A rule that treats all uses as the same therefore protects the purpose of assessment less well than a rule that separates help with thinking from the production of the work itself. The difficulty is that this line is not always easy to draw, especially when feedback on a draft turns into suggested sentences.",
  ],
  "papers.section.secondArgument": [
    "A second argument concerns fairness. Students do not have equal access to paid tools, and some already rely on family members or private tutors for feedback that others cannot get. Students who work while studying, or who care for relatives, have the least time to look for help elsewhere. If each student has to find their own tools, the students who can afford the best ones gain an advantage that has nothing to do with their work. If universities offer the same tools to every student and set the same rules for their use, the gap between students with and without private support may narrow rather than widen. This depends, however, on the rules being clear enough that students know",
  ],
};

/** Sofia's essay, sent for review: every section written. */
const SOFIA_TEXT: Record<string, string[]> = {
  "papers.section.introduction": [
    "Generative AI has changed what a piece of written coursework can prove. A well-structured essay used to be reasonable evidence that its author could research, organise and argue; today a fluent text can be produced in seconds. Universities have answered in different ways, from outright bans to open permission. This essay argues that universities should allow generative AI in assessed coursework under three conditions: students declare how they used it, the assessment rewards the process as well as the product, and the institution offers the same tools to everyone. Under these conditions the use of AI can support learning without emptying the grade of meaning. The argument draws on the guidance published by UNESCO (Miao & Holmes, 2023) and on a review of the opportunities and risks of large language models in education (Kasneci et al., 2023).",
  ],
  "papers.section.firstArgument": [
    "The first reason to allow AI is that some uses support learning. Kasneci et al. (2023) describe how language models can explain concepts at different levels, generate practice questions and give quick feedback on drafts. For a student who is stuck on a method or unsure how to structure a chapter, this kind of help can make the difference between giving up and continuing. These uses do not replace the student's work; they change the conditions under which the work is done, much as a library, a writing centre or a supervisor does. Banning them in assessed coursework would remove a learning resource from exactly the tasks where students spend most of their time. It would also create an odd situation in which students are encouraged to use AI to study but forbidden to use it while writing, even though writing is where much of the learning in a humanities or social science course happens.",
  ],
  "papers.section.secondArgument": [
    "The second reason is practical. A ban that cannot be applied does not prevent use; it only hides it. Tools that claim to recognise machine-written text are unreliable, and universities cannot base academic decisions on them. When use is forbidden, students who rely on AI have every reason to conceal it, and teachers lose the information they would need to give useful feedback. When use is allowed and declared, the conversation changes: a student can explain that a tool helped to reorganise an argument, and the teacher can judge whether the result shows enough independent thinking. Transparency is therefore not a concession to students but a condition for assessing them fairly.",
  ],
  "papers.section.thirdArgument": [
    "The third reason concerns equity. If AI use is allowed but each student has to find their own tools, students with more money will have access to better models and more generous limits. The fairest arrangement is for the institution to offer the tools, set the same rules for everyone and make clear which uses are permitted in each type of assessment. Miao and Holmes (2023) recommend that institutions validate tools before they are used in teaching and that they protect students' data, which is easier to do when the university chooses the service than when students use whatever is available. An institutional service also makes declaration easier, because the record of how a tool was used can be kept with the work.",
  ],
  "papers.section.counterarguments": [
    "The strongest objection is that any use of AI weakens the link between the grade and the student's own ability. If a tool helped to shape the argument, how can a teacher know what the student could have done alone? This objection is serious, but it applies to many accepted forms of help as well. Supervisors suggest structures, peers comment on drafts and writing centres correct style, and none of these are banned. What makes them acceptable is that they are visible and limited. The same can be true of AI if universities require a declaration of use and design assessments that include the process: an outline submitted in advance, a short oral discussion of the work or a reflection on how sources were chosen. These measures do not remove the risk entirely, but they reduce it more than a ban, which leaves use invisible.",
  ],
  "papers.section.conclusion": [
    "Universities should allow generative AI in assessed coursework, but not without conditions. Declared use, assessment that values the process and equal access to the same tools together keep the grade meaningful while allowing students to benefit from a resource that is already part of how they study. A ban would be simpler to announce, yet it would be harder to apply and less fair to students. The question for universities is therefore not whether students use these tools, but whether that use happens in the open, where teachers can see it and help students use it well.",
  ],
  "papers.section.references": [
    "Kasneci, E., Seßler, K., Küchemann, S., Bannert, M., Dementieva, D., Fischer, F., Gasser, U., Groh, G., Günnemann, S., Hüllermeier, E., Krusche, S., Kutyniok, G., Michaeli, T., Nerdel, C., Pfeffer, J., Poquet, O., Sailer, M., Schmidt, A., Seidel, T., … Kasneci, G. (2023). ChatGPT for good? On opportunities and challenges of large language models for education. Learning and Individual Differences, 103, 102274.",
    "Miao, F., & Holmes, W. (2023). Guidance for generative AI in education and research. UNESCO.",
  ],
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * The template document of `kind` (English headings, as `POST /api/assignments/[id]/start` builds it for an English
 * writer), with the given sections written: their hint paragraph is replaced by the text.
 */
export function writtenTemplate(kind: "essay" | "lab_report", title: string, text: Record<string, string[]>): string {
  const tpl = templateFor(kind);
  const html = buildTemplateHtml(tpl, title, (k) => translate("en", k));
  let out = html;
  for (const sec of tpl.sections) {
    const paras = text[sec.key];
    if (!paras || !paras.length) continue;
    const heading = `<h2>${escapeHtml(translate("en", sec.key))}</h2>`;
    const empty = `<p data-hint="${escapeHtml(sec.hint)}"></p>`;
    const at = out.indexOf(heading + empty);
    if (at === -1) continue;
    out = out.slice(0, at) + heading + paras.map((p) => `<p>${escapeHtml(p)}</p>`).join("") + out.slice(at + heading.length + empty.length);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// The migration
// ---------------------------------------------------------------------------------------------------------------------

/** A hash that is not a bcrypt hash: no password matches it, so the demo classmates cannot sign in. */
const UNUSABLE_PASSWORD = "!demo-account-without-password";

const DEMO_STUDENTS: { id: string; name: string; email: string; avatar: string }[] = [
  { id: "usr_demo_5", name: "Alex Kim", email: "alex.kim@stanford.edu", avatar: "AK" },
  { id: "usr_demo_6", name: "Sofia Rossi", email: "sofia.rossi@stanford.edu", avatar: "SR" },
  { id: "usr_demo_7", name: "Liam O'Connor", email: "liam.oconnor@stanford.edu", avatar: "LO" },
];

const THESIS_1_SEED_DEADLINE = "2026-06-15T00:00:00Z";
const THESIS_2_SEED_DEADLINE = "2026-08-01T00:00:00Z";

function session(id: string, thesisId: string, userId: string, start: number, minutes: number, words: number, consentId?: string): WritingSession {
  const end = start + minutes * 60000;
  return {
    id,
    thesisId,
    userId,
    startedAt: new Date(start).toISOString(),
    endedAt: new Date(end).toISOString(),
    lastHeartbeatAt: new Date(end).toISOString(),
    wordsWritten: words,
    aiAssists: 0,
    keystrokes: Math.round(words * 6.4),
    pasteEvents: 0,
    tabSwitches: Math.max(1, Math.round(minutes / 25)),
    ...(consentId ? { consentId } : {}),
    device: "desktop",
    events: [],
    integrityFlags: [],
  };
}

/**
 * Adds the demo papers to `store` (see the module comment). Returns false, changing nothing, when the guards fail:
 * `DEMO_ACCOUNTS` is "off", or `usr_1` / `usr_4` are missing. The caller records the migration when it returns true.
 * Records whose fixed id already exists are left as they are.
 */
export function ensureDemoPapers(store: Store, counters: DemoCounters, nowMs: number = Date.now()): boolean {
  if (typeof process !== "undefined" && process.env && process.env.DEMO_ACCOUNTS === "off") return false;
  const users = Array.isArray(store.users) ? store.users : [];
  const jane = users.find((u) => u.id === "usr_1");
  const williams = users.find((u) => u.id === "usr_4");
  if (!jane || !williams) return false;
  for (const key of ["theses", "assignments", "sources", "sourceChunks", "datasets", "consents"] as const) {
    if (!Array.isArray(store[key])) (store as unknown as Record<string, unknown[]>)[key] = [];
  }

  const monday = isoWeekMonday(nowMs);
  const at = (days: number, hours = 0) => new Date(monday + days * DAY_MS + hours * HOUR_MS).toISOString();
  /** Due dates are stored at noon UTC, as `parseDeadline` writes them. */
  const due = (days: number) => at(days, 12);
  const university = williams.university || jane.university;

  const has = <T extends { id: string }>(list: T[], id: string) => list.some((x) => x.id === id);

  // Students
  for (const s of DEMO_STUDENTS) {
    if (has(users, s.id)) continue;
    const taken = users.some((u) => u.email.toLowerCase() === s.email);
    const user: User = {
      id: s.id,
      email: taken ? s.email.replace("@", "+demo@") : s.email,
      password: UNUSABLE_PASSWORD,
      name: s.name,
      role: "student",
      university,
      avatar: s.avatar,
      createdAt: at(-40),
      preferences: { language: "en", editorFont: "Georgia", editorZoom: 100 },
    };
    if (s.id !== "usr_demo_7") user.lastActiveAt = at(s.id === "usr_demo_5" ? -2 : -4, 12);
    users.push(user);
  }

  // Assignments
  const essay: Assignment = {
    id: "asg_demo_essay",
    university,
    createdBy: williams.id,
    title: ESSAY_TITLE,
    brief: ESSAY_BRIEF,
    kind: "essay",
    templateId: "essay",
    studentIds: ["usr_1", "usr_demo_5", "usr_demo_6", "usr_demo_7"],
    deadline: due(21),
    targetWords: 2000,
    citationStyle: "APA",
    status: "open",
    createdAt: at(-9, 9),
    updatedAt: at(-9, 9),
  };
  const lab: Assignment = {
    id: "asg_demo_lab",
    university,
    createdBy: williams.id,
    title: LAB_TITLE,
    brief: LAB_BRIEF,
    kind: "lab_report",
    templateId: "lab_report",
    studentIds: ["usr_1", "usr_demo_5", "usr_demo_6"],
    deadline: due(35),
    targetWords: 2500,
    citationStyle: "APA",
    status: "open",
    createdAt: at(-7, 10),
    updatedAt: at(-7, 10),
  };
  for (const a of [essay, lab]) if (!has(store.assignments, a.id)) store.assignments.push(a);

  // Papers
  const paper = (p: {
    id: string;
    studentId: string;
    assignment: Assignment;
    status: Thesis["status"];
    content: string;
    tabId: string;
    createdAt: string;
    updatedAt: string;
    submittedAt?: string;
    sessions: WritingSession[];
  }): Thesis => {
    const wordCountValue = counters.countWords(p.content);
    const provenance = counters.computeProvenance(p.content);
    const t: Thesis = {
      id: p.id,
      title: p.assignment.title,
      description: "",
      studentId: p.studentId,
      professorId: p.assignment.createdBy,
      status: p.status,
      content: p.content,
      wordCount: wordCountValue,
      aiUsagePercent: wordCountValue ? Math.round((provenance.ai / wordCountValue) * 100) : 0,
      integrityScore: 100,
      deadline: p.assignment.deadline,
      targetWords: p.assignment.targetWords || templateFor(p.assignment.kind).targetWords,
      citationStyle: p.assignment.citationStyle || "APA",
      provenance,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      sessions: p.sessions,
      references: [],
      tabs: [{ id: p.tabId, title: translate("en", "editor.notesTab"), content: `<h2>${escapeHtml(translate("en", "editor.notesTab"))}</h2><p></p>`, updatedAt: p.createdAt }],
      pageSetup: { orientation: "portrait", size: "A4", margin: 2.54, lineSpacing: 1.5 },
      kind: p.assignment.kind,
      templateId: p.assignment.templateId,
      assignmentId: p.assignment.id,
      writingLanguage: "en",
      figures: counters.computeFigures(p.content),
    };
    if (p.submittedAt) t.submittedAt = p.submittedAt;
    return t;
  };

  const consents: Consent[] = [
    { id: "consent_demo_5", userId: "usr_demo_5", version: "2026-03", scopes: { keystrokes: true, paste: true, aiInteractions: true, tabActivity: true }, grantedAt: at(-6, 17) },
    { id: "consent_demo_6", userId: "usr_demo_6", version: "2026-03", scopes: { keystrokes: true, paste: true, aiInteractions: true, tabActivity: true }, grantedAt: at(-8, 16) },
  ];
  for (const c of consents) if (!has(store.consents, c.id)) store.consents.push(c);
  const janeConsent = (store.consents || []).filter((c) => c.userId === "usr_1" && !c.revokedAt).map((c) => c.id)[0];

  const labContent = writtenTemplate("lab_report", LAB_TITLE, LAB_TEXT);
  const labWords = wordCount(Object.keys(LAB_TEXT).map((k) => LAB_TEXT[k].join(" ")).join(" "));
  const alexContent = writtenTemplate("essay", ESSAY_TITLE, ALEX_TEXT);
  const sofiaContent = writtenTemplate("essay", ESSAY_TITLE, SOFIA_TEXT);
  const alexWords = counters.countWords(alexContent);
  const sofiaWords = counters.countWords(sofiaContent);
  const half = Math.round(sofiaWords * 0.55);

  const papers: Thesis[] = [
    paper({
      id: "thesis_demo_lab_jane",
      studentId: "usr_1",
      assignment: lab,
      status: "in_progress",
      content: labContent,
      tabId: "tab_demo_lab_jane",
      createdAt: at(-4, 14),
      updatedAt: at(-1, 16),
      sessions: [session("sess_demo_lab_jane", "thesis_demo_lab_jane", "usr_1", monday - DAY_MS + 15 * HOUR_MS, 65, labWords, janeConsent)],
    }),
    paper({
      id: "thesis_demo_essay_alex",
      studentId: "usr_demo_5",
      assignment: essay,
      status: "in_progress",
      content: alexContent,
      tabId: "tab_demo_essay_alex",
      createdAt: at(-6, 17),
      updatedAt: at(-2, 19),
      sessions: [
        session("sess_demo_essay_alex_1", "thesis_demo_essay_alex", "usr_demo_5", monday - 5 * DAY_MS + 18 * HOUR_MS, 50, Math.round(alexWords * 0.45), "consent_demo_5"),
        session("sess_demo_essay_alex_2", "thesis_demo_essay_alex", "usr_demo_5", monday - 2 * DAY_MS + 18 * HOUR_MS, 70, alexWords - Math.round(alexWords * 0.45), "consent_demo_5"),
      ],
    }),
    paper({
      id: "thesis_demo_essay_sofia",
      studentId: "usr_demo_6",
      assignment: essay,
      status: "under_review",
      content: sofiaContent,
      tabId: "tab_demo_essay_sofia",
      createdAt: at(-8, 16),
      updatedAt: at(-4, 12),
      submittedAt: at(-4, 12),
      sessions: [
        session("sess_demo_essay_sofia_1", "thesis_demo_essay_sofia", "usr_demo_6", monday - 8 * DAY_MS + 16 * HOUR_MS, 105, half, "consent_demo_6"),
        session("sess_demo_essay_sofia_2", "thesis_demo_essay_sofia", "usr_demo_6", monday - 4 * DAY_MS + 9 * HOUR_MS, 130, sofiaWords - half, "consent_demo_6"),
      ],
    }),
  ];
  for (const p of papers) if (!has(store.theses, p.id)) store.theses.push(p);

  // Primary data: the rain-gauge dataset, linked to Jane's lab report and to thesis_1.
  const linked = ["thesis_demo_lab_jane", "thesis_1"].filter((id) => store.theses.some((t) => t.id === id && t.studentId === "usr_1"));
  if (!has(store.sources, "src_demo_rain") && !store.datasets.some((d) => d.id === "ds_demo_rain")) {
    const csv = rainCsv();
    const bytes = Buffer.from(csv, "utf8");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const built = rainSheets(csv);
    const dataset: Dataset = { id: "ds_demo_rain", sourceId: "src_demo_rain", ownerId: "usr_1", sha256, sheets: built.sheets, cells: built.cells, createdAt: at(-4, 15) };
    const card = dataCard(dataset, RAIN_FILE);
    const source: ThesisSource = {
      id: "src_demo_rain",
      ownerId: "usr_1",
      thesisIds: linked,
      thesisId: linked[0] ?? "",
      kind: "sheet",
      title: RAIN_TITLE,
      text: card,
      wordCount: wordCount(card),
      parseStatus: "parsed",
      addedAt: at(-4, 15),
      role: "primary",
      file: { name: RAIN_FILE, mime: "text/csv", bytes: bytes.length, sha256 },
      datasetId: dataset.id,
    };
    const chunks: SourceChunk[] = chunkText(card, { targetWords: 300, overlap: 40 }).map((c, i) => ({
      id: `chk_demo_rain_${i}`,
      sourceId: source.id,
      index: c.index,
      page: c.page,
      section: c.section,
      text: c.text,
      wordCount: c.wordCount,
    }));
    store.datasets.push(dataset);
    store.sources.push(source);
    store.sourceChunks.push(...chunks);
  }

  // Seeded theses whose due dates have passed move into the future (only when nobody changed them).
  const shift: [string, string, number][] = [
    ["thesis_1", THESIS_1_SEED_DEADLINE, 60],
    ["thesis_2", THESIS_2_SEED_DEADLINE, 120],
  ];
  for (const [id, seedValue, days] of shift) {
    const t = store.theses.find((x) => x.id === id);
    if (t && t.deadline === seedValue) t.deadline = due(days);
  }
  return true;
}
