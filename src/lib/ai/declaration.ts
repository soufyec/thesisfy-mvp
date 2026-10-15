// AI-use declaration rendered from the ledger with a deterministic template (no model involved), so every
// number in it is traceable to a logged event or a provenance mark. A model may only offer a rewording,
// which the student accepts explicitly and which is marked as AI-assisted wherever it is inserted.

import type { Policy, User } from "../db";
import { db } from "../db";
import type { LedgerSummary } from "../process";
import { FIGURE_KINDS } from "../countable";
import type { FigureKind } from "../countable";
import { resolveProvider, streamCompletion } from "./providers";
import { costOf } from "./providers";

export type DeclarationLang = "en" | "es" | "fr";

export interface DeclarationOpts {
  studentName: string;
  thesisTitle: string;
  university: string;
  lang: DeclarationLang;
  /** Defaults to the summary's generation time. */
  date?: string;
}

const MODE_NAMES: Record<DeclarationLang, Record<string, string>> = {
  en: { chat: "Ask", brainstorm: "Brainstorm", outline: "Outline", critique: "Critique", grammar: "Grammar", summarize: "Summarize", explain: "Explain", citations: "Citations", gaps: "Find gaps", paraphrase_check: "Paraphrase", copilot: "Research copilot" },
  es: { chat: "Preguntar", brainstorm: "Lluvia de ideas", outline: "Esquema", critique: "Crítica", grammar: "Gramática", summarize: "Resumen", explain: "Explicación", citations: "Citas", gaps: "Lagunas", paraphrase_check: "Paráfrasis", copilot: "Research copilot" },
  fr: { chat: "Question", brainstorm: "Remue-méninges", outline: "Plan", critique: "Critique", grammar: "Grammaire", summarize: "Résumé", explain: "Explication", citations: "Citations", gaps: "Lacunes", paraphrase_check: "Paraphrase", copilot: "Research copilot" },
};

const SCOPE_NAMES: Record<DeclarationLang, Record<string, string>> = {
  en: { aiInteractions: "AI interactions", keystrokes: "typing rhythm and counts (never the text)", paste: "paste sizes and fingerprints", tabActivity: "tab activity during sessions" },
  es: { aiInteractions: "interacciones con IA", keystrokes: "ritmo y recuento de tecleo (nunca el texto)", paste: "tamaño y huellas de los pegados", tabActivity: "actividad de pestañas durante las sesiones" },
  fr: { aiInteractions: "interactions avec l'IA", keystrokes: "rythme et nombre de frappes (jamais le texte)", paste: "taille et empreintes des collages", tabActivity: "activité des onglets pendant les sessions" },
};

const fmtDate = (iso: string, lang: DeclarationLang) => new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : lang === "es" ? "es-ES" : "fr-FR", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const n = (v: number) => v.toLocaleString("en-US");
const pct = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
/** "1 request" / "3 requests": the count followed by the right noun form. */
const count = (v: number, one: string, many: string) => `${n(v)} ${v === 1 ? one : many}`;

function listJoin(items: string[], lang: DeclarationLang) {
  if (items.length <= 1) return items.join("");
  const and = lang === "en" ? "and" : lang === "es" ? "y" : "et";
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}

/**
 * How the declaration names the work and the person who reviews it. Summaries stored before paper kinds existed have
 * no `paperKind`/`teacher`: they read as a thesis with an advisor, so their text stays exactly as it was.
 */
function workWords(s: Partial<Pick<LedgerSummary, "paperKind" | "teacher">>, lang: DeclarationLang) {
  const kind = s.paperKind || "thesis";
  const teacher = s.teacher || "advisor";
  const doctoral = kind === "doctoral_thesis";
  const thesis = kind === "thesis" || doctoral;
  if (lang === "es") {
    return {
      my: thesis ? "mi tesis" : "mi trabajo",
      text: thesis ? "texto de la tesis" : "texto del trabajo",
      accompanies: thesis ? "acompaña a la tesis" : "acompaña al trabajo",
      sees:
        teacher === "none"
          ? `Quien revise ${thesis ? "esta tesis" : "este trabajo"} en mi institución ve exactamente los mismos datos.`
          : `${teacher === "teacher" ? "Mi docente" : doctoral ? "Mi director de tesis" : "Mi tutor"} ve exactamente los mismos datos.`,
    };
  }
  if (lang === "fr") {
    return {
      my: doctoral ? "ma thèse" : thesis ? "mon mémoire" : "mon travail",
      text: doctoral ? "texte de la thèse" : thesis ? "texte du mémoire" : "texte du travail",
      accompanies: doctoral ? "jointe à la thèse" : thesis ? "jointe au mémoire" : "jointe au travail",
      sees:
        teacher === "none"
          ? `Les personnes de mon établissement qui examinent ${doctoral ? "cette thèse" : thesis ? "ce mémoire" : "ce travail"} voient exactement les mêmes données.`
          : `${teacher === "teacher" ? "Mon enseignant" : doctoral ? "Mon directeur de thèse" : "Mon directeur"} voit exactement les mêmes données.`,
    };
  }
  return {
    my: thesis ? "my thesis" : "my paper",
    text: thesis ? "thesis text" : "text of the paper",
    accompanies: thesis ? "accompanies the thesis" : "accompanies the paper",
    sees:
      teacher === "none"
        ? `Anyone at my institution who reviews this ${thesis ? "thesis" : "paper"} sees exactly the same data.`
        : `My ${teacher === "teacher" ? "teacher" : "advisor"} sees exactly the same data.`,
  };
}

type Nouns = Record<"table" | "figure" | "test" | "diagram" | "equation" | FigureKind, [string, string]>;

const NOUNS: Record<DeclarationLang, Nouns> = {
  en: { table: ["table", "tables"], figure: ["figure", "figures"], test: ["test result", "test results"], diagram: ["diagram", "diagrams"], equation: ["equation", "equations"], chart: ["chart", "charts"], gantt: ["timeline", "timelines"], prisma: ["PRISMA flow diagram", "PRISMA flow diagrams"], conceptMap: ["concept map", "concept maps"] },
  es: { table: ["tabla", "tablas"], figure: ["figura", "figuras"], test: ["resultado de prueba", "resultados de pruebas"], diagram: ["diagrama", "diagramas"], equation: ["ecuación", "ecuaciones"], chart: ["gráfico", "gráficos"], gantt: ["cronograma", "cronogramas"], prisma: ["diagrama de flujo PRISMA", "diagramas de flujo PRISMA"], conceptMap: ["mapa conceptual", "mapas conceptuales"] },
  fr: { table: ["tableau", "tableaux"], figure: ["figure", "figures"], test: ["résultat de test", "résultats de tests"], diagram: ["diagramme", "diagrammes"], equation: ["équation", "équations"], chart: ["graphique", "graphiques"], gantt: ["calendrier", "calendriers"], prisma: ["diagramme de flux PRISMA", "diagrammes de flux PRISMA"], conceptMap: ["carte conceptuelle", "cartes conceptuelles"] },
};

/** "2 tables, 1 figure and 1 test result": the non-zero counts, in the order given. */
function countList(items: [keyof Nouns, number][], lang: DeclarationLang): string {
  const nouns = NOUNS[lang];
  return listJoin(
    items.filter(([, v]) => v > 0).map(([k, v]) => count(v, nouns[k][0], nouns[k][1])),
    lang
  );
}

/** Whether a summary carries anything §9 added (test results, diagrams, equations, figures the student made). */
function hasExtendedArtifacts(s: LedgerSummary): boolean {
  const byKind = s.figuresByKind;
  return (
    (s.artifacts?.tests ?? 0) + (s.artifacts?.diagrams ?? 0) + (s.artifacts?.equations ?? 0) > 0 ||
    (s.aiInserts?.tests ?? 0) + (s.aiInserts?.equations ?? 0) > 0 ||
    (s.equations?.total ?? 0) > 0 ||
    (s.figures?.total ?? 0) > (s.figures?.ai ?? 0) ||
    (!!byKind && FIGURE_KINDS.some((k) => k !== "chart" && (byKind[k]?.total ?? 0) > 0))
  );
}

/**
 * Tables, figures and equations from the Research copilot (D12, D21–D27; docs/papers.md §4.6, §9.4): what Thesisfic
 * computed from attached data, what the copilot proposed and Thesisfic checked (diagrams, equations), what was
 * inserted with the AI mark (from `ai_insert` events), and the figures (by class) and equations of the Final
 * submission, AI-assisted and made by the student. Null when the student used none of it. Summaries with only tables
 * and charts keep the paragraph they had before diagrams and equations existed, word for word.
 */
function artifactsParagraph(s: LedgerSummary, lang: DeclarationLang): string | null {
  const computedTables = s.artifacts?.tables ?? 0;
  const computedCharts = s.artifacts?.charts ?? 0;
  const insertedTables = s.aiInserts?.tables ?? 0;
  const insertedFigures = s.aiInserts?.figures ?? 0;
  const aiFigures = s.figures?.ai ?? 0;
  if (hasExtendedArtifacts(s)) return extendedArtifactsParagraph(s, lang);
  if (!computedTables && !computedCharts && !insertedTables && !insertedFigures && !aiFigures) return null;
  const computed = countList([["table", computedTables], ["figure", computedCharts]], lang);
  const inserted = countList([["table", insertedTables], ["figure", insertedFigures]], lang);
  const parts: string[] = [];
  if (lang === "es") {
    parts.push("Tablas y figuras calculadas a partir de mis datos.");
    if (computed) parts.push(`Calculadas por Thesisfic en conversaciones con Research copilot a partir de archivos que adjunté: ${computed}.`);
    if (inserted) parts.push(`Insertadas desde el asistente con la marca de IA: ${inserted}.`);
    parts.push(`Figuras asistidas por IA en la Final submission: ${n(aiFigures)}.`);
    parts.push("Las tablas insertadas cuentan en las palabras asistidas por IA indicadas arriba; las figuras no añaden palabras.");
  } else if (lang === "fr") {
    parts.push("Tableaux et figures calculés à partir de mes données.");
    if (computed) parts.push(`Calculés par Thesisfic dans des conversations Research copilot à partir de fichiers que j'ai joints : ${computed}.`);
    if (inserted) parts.push(`Insérés depuis l'assistant avec la marque IA : ${inserted}.`);
    parts.push(`Figures assistées par l'IA dans la Final submission : ${n(aiFigures)}.`);
    parts.push("Les tableaux insérés comptent dans les mots assistés par l'IA indiqués plus haut ; les figures n'ajoutent aucun mot.");
  } else {
    parts.push("Tables and figures computed from my data.");
    if (computed) parts.push(`Computed by Thesisfic in Research copilot conversations from files I attached: ${computed}.`);
    if (inserted) parts.push(`Inserted from the assistant with the AI mark: ${inserted}.`);
    parts.push(`AI-assisted figures in the Final submission: ${n(aiFigures)}.`);
    parts.push("Inserted tables count toward the AI-assisted words above; figures add no words.");
  }
  return parts.join(" ");
}

/** "2 figures (1 timeline and 1 concept map) and 3 equations": what the student made, figures with their classes. */
function ownList(figures: number, kinds: string, equations: number, lang: DeclarationLang): string {
  const nouns = NOUNS[lang];
  const items = [figures ? `${count(figures, nouns.figure[0], nouns.figure[1])}${kinds ? ` (${kinds})` : ""}` : "", equations ? count(equations, nouns.equation[0], nouns.equation[1]) : ""].filter(Boolean);
  return listJoin(items, lang);
}

/** The paragraph of `artifactsParagraph` once test results, diagrams or equations are part of the record. */
function extendedArtifactsParagraph(s: LedgerSummary, lang: DeclarationLang): string {
  const a = s.artifacts || { tables: 0, charts: 0 };
  const ins = s.aiInserts;
  const figures = s.figures || { total: 0, ai: 0 };
  const equations = s.equations || { total: 0, ai: 0 };
  const byKind = s.figuresByKind;
  const computed = countList([["table", a.tables || 0], ["figure", a.charts || 0], ["test", a.tests || 0]], lang);
  const proposed = countList([["diagram", a.diagrams || 0], ["equation", a.equations || 0]], lang);
  const inserted = countList([["table", ins?.tables || 0], ["test", ins?.tests || 0], ["figure", ins?.figures || 0], ["equation", ins?.equations || 0]], lang);
  // Figures by class: AI-assisted ones, and the ones the student made (total − ai).
  const kinds = (ai: boolean) => (byKind ? countList(FIGURE_KINDS.map((k): [keyof Nouns, number] => [k, ai ? byKind[k]?.ai || 0 : Math.max(0, (byKind[k]?.total || 0) - (byKind[k]?.ai || 0))]), lang) : "");
  const aiKinds = kinds(true);
  const ownKinds = kinds(false);
  const ownFigures = Math.max(0, figures.total - figures.ai);
  const ownEquations = Math.max(0, equations.total - equations.ai);
  const parts: string[] = [];
  if (lang === "es") {
    parts.push("Tablas, figuras y ecuaciones del asistente.");
    if (computed) parts.push(`Cálculos de Thesisfic en conversaciones con Research copilot a partir de archivos que adjunté: ${computed}.`);
    if (proposed) parts.push(`Propuestas de Research copilot a partir de lo que escribí, comprobadas por Thesisfic: ${proposed}.`);
    if (inserted) parts.push(`Inserciones desde el asistente con la marca de IA: ${inserted}.`);
    parts.push(`En la Final submission: ${count(figures.ai, "figura con ayuda de IA", "figuras con ayuda de IA")}${aiKinds ? ` (${aiKinds})` : ""} y ${count(equations.ai, "ecuación con ayuda de IA", "ecuaciones con ayuda de IA")}.`);
    if (ownFigures || ownEquations) parts.push(`${ownList(ownFigures, ownKinds, ownEquations, lang)} ${ownFigures + ownEquations === 1 ? "hecha" : "hechas"} por mí.`);
    parts.push("Las tablas y los resultados de pruebas insertados cuentan en las palabras con ayuda de IA indicadas arriba; las figuras y las ecuaciones no añaden palabras.");
  } else if (lang === "fr") {
    parts.push("Tableaux, figures et équations de l'assistant.");
    if (computed) parts.push(`Calculs de Thesisfic dans des conversations Research copilot à partir de fichiers que j'ai joints : ${computed}.`);
    if (proposed) parts.push(`Propositions de Research copilot à partir de ce que j'ai écrit, vérifiées par Thesisfic : ${proposed}.`);
    if (inserted) parts.push(`Insertions depuis l'assistant avec la marque IA : ${inserted}.`);
    parts.push(`Dans la Final submission : ${count(figures.ai, "figure assistée par IA", "figures assistées par IA")}${aiKinds ? ` (${aiKinds})` : ""} et ${count(equations.ai, "équation assistée par IA", "équations assistées par IA")}.`);
    if (ownFigures || ownEquations) parts.push(`${ownList(ownFigures, ownKinds, ownEquations, lang)} ${ownFigures + ownEquations === 1 ? "réalisée" : "réalisées"} par moi-même.`);
    parts.push("Les tableaux et les résultats de tests insérés comptent dans les mots assistés par l'IA indiqués plus haut ; les figures et les équations n'ajoutent aucun mot.");
  } else {
    parts.push("Tables, figures and equations from the assistant.");
    if (computed) parts.push(`Computed by Thesisfic in Research copilot conversations from files I attached: ${computed}.`);
    if (proposed) parts.push(`Proposed by the Research copilot from what I wrote, and checked by Thesisfic: ${proposed}.`);
    if (inserted) parts.push(`Inserted from the assistant with the AI mark: ${inserted}.`);
    parts.push(`In the Final submission: ${count(figures.ai, "AI-assisted figure", "AI-assisted figures")}${aiKinds ? ` (${aiKinds})` : ""} and ${count(equations.ai, "AI-assisted equation", "AI-assisted equations")}.`);
    if (ownFigures || ownEquations) parts.push(`${ownList(ownFigures, ownKinds, ownEquations, lang)} made by me.`);
    parts.push("Inserted tables and test results count toward the AI-assisted words above; figures and equations add no words.");
  }
  return parts.join(" ");
}

function modesSentence(s: LedgerSummary, lang: DeclarationLang) {
  const names = MODE_NAMES[lang];
  return s.interactions.byMode.map((m) => `${names[m.mode] || m.mode} (${m.count})`);
}

function scopesList(s: LedgerSummary, lang: DeclarationLang) {
  if (!s.scopes) return [];
  const names = SCOPE_NAMES[lang];
  return (Object.keys(names) as (keyof typeof s.scopes)[]).filter((k) => s.scopes && s.scopes[k]).map((k) => names[k]);
}

/**
 * Deterministic declaration text. Same summary and options always give the same text, so the
 * declaration can be regenerated and compared against the stored ledger summary.
 */
export function renderDeclaration(s: LedgerSummary, opts: DeclarationOpts): string {
  const lang = opts.lang;
  const date = fmtDate(opts.date || s.generatedAt, lang);
  const modes = modesSentence(s, lang);
  const scopes = scopesList(s, lang);
  const chapters = s.aiChapters;
  const paragraphs: string[] = [];
  const w = workWords(s, lang);
  const artifacts = artifactsParagraph(s, lang);

  if (lang === "es") {
    paragraphs.push(`DECLARACIÓN DE USO DE IA`);
    paragraphs.push(`Yo, ${opts.studentName}, declaro lo siguiente sobre la elaboración de ${w.my} «${opts.thesisTitle}» (${opts.university}). Esta declaración se ha generado a partir del registro de procedencia de Thesisfic; cada cifra procede de un evento registrado en el editor o de una marca de procedencia del documento, no de una estimación.`);
    paragraphs.push(
      s.interactions.total === 0
        ? `Asistente de IA. No utilicé el asistente de Thesisfic durante la redacción.`
        : `Asistente de IA. Utilicé el asistente de Thesisfic en ${count(s.interactions.total, "interacción", "interacciones")}, en ${s.interactions.byMode.length === 1 ? "el modo" : "los modos"} ${listJoin(modes, lang)}.${s.interactions.copilot ? ` ${n(s.interactions.copilot)} de ellas ${s.interactions.copilot === 1 ? "fue una conversación" : "fueron conversaciones"} en Research copilot sobre mi investigación.` : ""}${s.interactions.blocked ? ` ${count(s.interactions.blocked, "petición fue rechazada", "peticiones fueron rechazadas")} por la política de la institución y no ${s.interactions.blocked === 1 ? "produjo" : "produjeron"} texto.` : ""} El asistente no redactó ${w.text}; solo pudo esquematizar, criticar, corregir, explicar y citar.`
    );
    paragraphs.push(
      s.words.ai === 0
        ? `Texto asistido por IA. Ningún pasaje de la Final submission lleva marca de IA.`
        : `Texto asistido por IA. ${n(s.words.ai)} palabras (${pct(s.pct.ai)} % de ${n(s.words.total)}; límite institucional ${s.aiLimitPct} %) están marcadas como asistidas por IA en la Final submission${chapters.length ? `, en las secciones: ${listJoin(chapters.map((c) => `«${c}»`), lang)}` : ""}. Son inserciones desde el asistente (${count(s.aiInserts.events, "inserción", "inserciones")}) o pegados reconocidos por huella como respuestas del asistente o del Research copilot.`
    );
    if (artifacts) paragraphs.push(artifacts);
    paragraphs.push(
      s.pastes.events === 0 && s.words.paste === 0
        ? `Texto pegado o citado. No se registraron pegados.`
        : `Texto pegado o citado. ${n(s.words.paste)} palabras (${pct(s.pct.paste)} %) están marcadas como citadas o pegadas. De ${count(s.pastes.events, "pegado registrado", "pegados registrados")}, ${n(s.pastes.attributedToSource)} se atribuyeron a una fuente de la biblioteca o a una cita declarada, ${n(s.pastes.recognisedFromAssistant)} se reconocieron como texto del asistente, ${n(s.pastes.declaredAiTool)} se declararon como procedentes de una herramienta de IA, ${n(s.pastes.ownText)} como texto propio del estudiante y ${n(s.pastes.unattributed)} quedaron sin atribuir. ${n(s.pastes.attributedWords)} palabras pegadas nombran su fuente en el propio documento.`
    );
    if (s.budget) paragraphs.push(`Coste de la IA. ${count(s.budget.requests, "petición se ejecutó", "peticiones se ejecutaron")} en los modelos que ofrece Thesisfic, con un coste de ${s.budget.institutionLocal.toFixed(2)} ${s.budget.currency} (${s.budget.institutionUsd.toFixed(4)} USD a precio de lista del proveedor).${s.budget.studentPaidRequests ? ` ${count(s.budget.studentPaidRequests, "petición usó", "peticiones usaron")} mi propia cuenta.` : ""}`);
    paragraphs.push(
      scopes.length
        ? `Monitorización consentida. Autoricé el registro de: ${listJoin(scopes, lang)}${s.consent ? ` (consentimiento v${s.consent.version}, ${fmtDate(s.consent.grantedAt, lang)})` : ""}. Se ${s.sessions.count + s.snapshots.count === 1 ? "registró" : "registraron"} ${count(s.sessions.count, "sesión de escritura", "sesiones de escritura")} (${count(s.sessions.minutes, "minuto", "minutos")}) y ${count(s.snapshots.count, "instantánea del documento", "instantáneas del documento")}, encadenadas por hash${s.snapshots.chainOk ? " y verificadas" : "; la verificación de la cadena ha fallado"}.`
        : `Monitorización consentida. No hay consentimiento de monitorización registrado; el documento solo conserva las marcas de procedencia.`
    );
    paragraphs.push(`Lo que este registro no demuestra. El registro refleja lo ocurrido dentro del editor de Thesisfic. No puede detectar texto generado por una IA externa y transcrito manualmente, ni acreditar la autoría de ideas. Es una prueba de proceso que ${w.accompanies}, no una puntuación de probabilidad.`);
    paragraphs.push(`Generada el ${date} a partir del ledger de integridad. ${w.sees}`);
    paragraphs.push(`Firma: ______________________    ${opts.studentName}    Fecha: ______________`);
    return paragraphs.join("\n\n");
  }

  if (lang === "fr") {
    paragraphs.push(`DÉCLARATION D'UTILISATION DE L'IA`);
    paragraphs.push(`Je, ${opts.studentName}, déclare ce qui suit concernant la rédaction de ${w.my} « ${opts.thesisTitle} » (${opts.university}). Cette déclaration est générée à partir du registre de provenance de Thesisfic ; chaque chiffre provient d'un événement enregistré dans l'éditeur ou d'une marque de provenance du document, jamais d'une estimation.`);
    paragraphs.push(
      s.interactions.total === 0
        ? `Assistant IA. Je n'ai pas utilisé l'assistant Thesisfic pendant la rédaction.`
        : `Assistant IA. J'ai utilisé l'assistant Thesisfic lors de ${count(s.interactions.total, "interaction", "interactions")}, dans ${s.interactions.byMode.length === 1 ? "le mode" : "les modes"} ${listJoin(modes, lang)}.${s.interactions.copilot ? ` ${n(s.interactions.copilot)} d'entre elles ${s.interactions.copilot === 1 ? "était une conversation" : "étaient des conversations"} Research copilot sur ma recherche.` : ""}${s.interactions.blocked ? ` ${count(s.interactions.blocked, "demande a été refusée", "demandes ont été refusées")} par la politique de l'établissement et n'${s.interactions.blocked === 1 ? "a" : "ont"} produit aucun texte.` : ""} L'assistant n'a rédigé aucun ${w.text} ; il a seulement pu structurer, critiquer, corriger, expliquer et citer.`
    );
    paragraphs.push(
      s.words.ai === 0
        ? `Texte assisté par l'IA. Aucun passage de la Final submission ne porte de marque IA.`
        : `Texte assisté par l'IA. ${n(s.words.ai)} mots (${pct(s.pct.ai)} % de ${n(s.words.total)} ; limite institutionnelle ${s.aiLimitPct} %) sont marqués comme assistés par l'IA dans la Final submission${chapters.length ? `, dans les sections : ${listJoin(chapters.map((c) => `« ${c} »`), lang)}` : ""}. Il s'agit d'insertions depuis l'assistant (${count(s.aiInserts.events, "insertion", "insertions")}) ou de collages reconnus par empreinte comme des réponses de l'assistant ou du Research copilot.`
    );
    if (artifacts) paragraphs.push(artifacts);
    paragraphs.push(
      s.pastes.events === 0 && s.words.paste === 0
        ? `Texte collé ou cité. Aucun collage n'a été enregistré.`
        : `Texte collé ou cité. ${n(s.words.paste)} mots (${pct(s.pct.paste)} %) sont marqués comme cités ou collés. Sur ${count(s.pastes.events, "collage enregistré", "collages enregistrés")}, ${n(s.pastes.attributedToSource)} ont été attribués à une source de la bibliothèque ou à une citation déclarée, ${n(s.pastes.recognisedFromAssistant)} ont été reconnus comme du texte de l'assistant, ${n(s.pastes.declaredAiTool)} ont été déclarés comme issus d'un outil d'IA, ${n(s.pastes.ownText)} comme texte de l'étudiant et ${n(s.pastes.unattributed)} restent non attribués. ${n(s.pastes.attributedWords)} mots collés nomment leur source dans le document.`
    );
    if (s.budget) paragraphs.push(`Coût de l'IA. ${count(s.budget.requests, "demande a été exécutée", "demandes ont été exécutées")} sur les modèles proposés dans Thesisfic, pour ${s.budget.institutionLocal.toFixed(2)} ${s.budget.currency} (${s.budget.institutionUsd.toFixed(4)} USD au tarif public du fournisseur).${s.budget.studentPaidRequests ? ` ${count(s.budget.studentPaidRequests, "demande a utilisé", "demandes ont utilisé")} mon propre compte.` : ""}`);
    paragraphs.push(
      scopes.length
        ? `Suivi consenti. J'ai autorisé l'enregistrement de : ${listJoin(scopes, lang)}${s.consent ? ` (consentement v${s.consent.version}, ${fmtDate(s.consent.grantedAt, lang)})` : ""}. ${count(s.sessions.count, "session d'écriture", "sessions d'écriture")} (${count(s.sessions.minutes, "minute", "minutes")}) et ${count(s.snapshots.count, "instantané du document ont été enregistrés", "instantanés du document ont été enregistrés")}, chaînés par hachage${s.snapshots.chainOk ? " et vérifiés" : " ; la vérification de la chaîne a échoué"}.`
        : `Suivi consenti. Aucun consentement de suivi n'est enregistré ; le document ne conserve que les marques de provenance.`
    );
    paragraphs.push(`Ce que ce registre ne prouve pas. Le registre reflète ce qui s'est passé dans l'éditeur Thesisfic. Il ne peut pas détecter un texte produit par une IA externe puis transcrit à la main, ni attester la paternité des idées. C'est une preuve de processus ${w.accompanies}, pas un score de probabilité.`);
    paragraphs.push(`Générée le ${date} à partir du registre d'intégrité. ${w.sees}`);
    paragraphs.push(`Signature : ______________________    ${opts.studentName}    Date : ______________`);
    return paragraphs.join("\n\n");
  }

  paragraphs.push(`AI-USE DECLARATION`);
  paragraphs.push(`I, ${opts.studentName}, declare the following about the writing of ${w.my} "${opts.thesisTitle}" (${opts.university}). This declaration is generated from the Thesisfic provenance record; every figure comes from an event logged in the editor or from a provenance mark in the document, not from an estimate.`);
  paragraphs.push(
    s.interactions.total === 0
      ? `AI assistant. I did not use the Thesisfic assistant while writing.`
      : `AI assistant. I used the Thesisfic assistant in ${count(s.interactions.total, "interaction", "interactions")}, in the ${s.interactions.byMode.length === 1 ? "mode" : "modes"} ${listJoin(modes, lang)}.${s.interactions.copilot ? ` ${n(s.interactions.copilot)} of them ${s.interactions.copilot === 1 ? "was a Research copilot conversation" : "were Research copilot conversations"} about my research.` : ""}${s.interactions.blocked ? ` ${count(s.interactions.blocked, "request was", "requests were")} declined by the institution's policy and produced no text.` : ""} The assistant did not write ${w.text}; it could only outline, critique, correct, explain and cite.`
  );
  paragraphs.push(
    s.words.ai === 0
      ? `AI-assisted text. No passage of the Final submission carries an AI mark.`
      : `AI-assisted text. ${count(s.words.ai, "word", "words")} (${pct(s.pct.ai)}% of ${n(s.words.total)}; institutional limit ${s.aiLimitPct}%) ${s.words.ai === 1 ? "is" : "are"} marked as AI-assisted in the Final submission${chapters.length ? `, in the ${chapters.length === 1 ? "section" : "sections"} ${listJoin(chapters.map((c) => `"${c}"`), lang)}` : ""}. They are insertions from the assistant (${count(s.aiInserts.events, "insertion", "insertions")}) or pastes recognised by fingerprint as answers from the assistant or the Research copilot.`
  );
  if (artifacts) paragraphs.push(artifacts);
  paragraphs.push(
    s.pastes.events === 0 && s.words.paste === 0
      ? `Quoted or pasted text. No pastes were recorded.`
      : `Quoted or pasted text. ${count(s.words.paste, "word", "words")} (${pct(s.pct.paste)}%) ${s.words.paste === 1 ? "is" : "are"} marked as quoted or pasted. Of the ${count(s.pastes.events, "paste", "pastes")} recorded, ${n(s.pastes.attributedToSource)} ${s.pastes.attributedToSource === 1 ? "was" : "were"} attributed to a library source or a declared citation, ${n(s.pastes.recognisedFromAssistant)} ${s.pastes.recognisedFromAssistant === 1 ? "was" : "were"} recognised as assistant text, ${n(s.pastes.declaredAiTool)} ${s.pastes.declaredAiTool === 1 ? "was" : "were"} declared as coming from an AI tool, ${n(s.pastes.ownText)} as the student's own text and ${n(s.pastes.unattributed)} ${s.pastes.unattributed === 1 ? "remains" : "remain"} unattributed. ${count(s.pastes.attributedWords, "pasted word names", "pasted words name")} their source in the document itself.`
  );
  if (s.budget) paragraphs.push(`AI cost. ${count(s.budget.requests, "request", "requests")} ran on the models offered in Thesisfic, at a cost of ${s.budget.institutionLocal.toFixed(2)} ${s.budget.currency} (${s.budget.institutionUsd.toFixed(4)} USD at the provider's list price).${s.budget.studentPaidRequests ? ` ${count(s.budget.studentPaidRequests, "request", "requests")} used my own account.` : ""}`);
  paragraphs.push(
    scopes.length
      ? `Monitoring I consented to. I allowed the recording of: ${listJoin(scopes, lang)}${s.consent ? ` (consent v${s.consent.version}, ${fmtDate(s.consent.grantedAt, lang)})` : ""}. ${count(s.sessions.count, "writing session", "writing sessions")} (${count(s.sessions.minutes, "minute", "minutes")}) and ${count(s.snapshots.count, "document snapshot was", "document snapshots were")} recorded, hash-chained${s.snapshots.chainOk ? " and verified" : "; the chain verification failed"}.`
      : `Monitoring I consented to. No monitoring consent is on record; the document keeps only its provenance marks.`
  );
  paragraphs.push(`What this record does not prove. The record reflects what happened inside the Thesisfic editor. It cannot detect text produced by an external AI and transcribed by hand, and it does not attest the authorship of ideas. It is process evidence that ${w.accompanies}, not a probability score.`);
  paragraphs.push(`Generated on ${date} from the integrity ledger. ${w.sees}`);
  paragraphs.push(`Signature: ______________________    ${opts.studentName}    Date: ______________`);
  return paragraphs.join("\n\n");
}

const REPHRASE_SYSTEM = `You reword an AI-use declaration written by a student. Keep every number, percentage, section title, date, name and the signature line exactly as given, in the same order and the same language. Do not add, remove or soften any statement, and do not add commentary. Return only the reworded declaration as plain text paragraphs.`;

export interface RephraseResult {
  text: string;
  provider: string;
  model: string;
  demo: boolean;
  billedTo: "institution" | "student" | "none";
  costUsd: number;
  usage: { inputTokens: number; outputTokens: number };
  error?: string;
}

/**
 * Asks the resolved model for a reworded version of the declaration. The student decides whether to accept it;
 * if accepted and inserted, the text is marked `ai`. In demo mode (no key) the same text comes back unchanged.
 */
export async function rephraseWithModel(text: string, user: User, policy: Policy, requested?: string | null): Promise<RephraseResult> {
  const cfg = resolveProvider(user, policy, requested);
  const base: RephraseResult = { text, provider: cfg.provider, model: cfg.model, demo: cfg.provider === "demo", billedTo: cfg.billedTo, costUsd: 0, usage: { inputTokens: 0, outputTokens: 0 } };
  if (cfg.provider === "demo") return base;
  let out = "";
  let usage = { inputTokens: 0, outputTokens: 0 };
  let error: string | undefined;
  for await (const chunk of streamCompletion(cfg, REPHRASE_SYSTEM, [{ role: "user", content: text }], 2048)) {
    if (chunk.type === "delta") out += chunk.text;
    else if (chunk.type === "usage") usage = { inputTokens: chunk.inputTokens, outputTokens: chunk.outputTokens };
    else if (chunk.type === "error") error = chunk.message;
  }
  if (!out.trim()) return { ...base, error: error || "The model returned no text" };
  if (cfg.connectionId) db.connections.update(cfg.connectionId, { lastUsedAt: new Date().toISOString() });
  return { ...base, text: out.trim(), usage, costUsd: costOf(cfg, usage), error };
}
