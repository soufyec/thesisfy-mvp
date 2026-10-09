// AI-use declaration rendered from the ledger with a deterministic template (no model involved), so every
// number in it is traceable to a logged event or a provenance mark. A model may only offer a rewording,
// which the student accepts explicitly and which is marked as AI-assisted wherever it is inserted.

import type { Policy, User } from "../db";
import { db } from "../db";
import type { LedgerSummary } from "../process";
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

  if (lang === "es") {
    paragraphs.push(`DECLARACIÓN DE USO DE IA`);
    paragraphs.push(`Yo, ${opts.studentName}, declaro lo siguiente sobre la elaboración de mi tesis «${opts.thesisTitle}» (${opts.university}). Esta declaración se ha generado a partir del registro de procedencia de Thesisfic; cada cifra procede de un evento registrado en el editor o de una marca de procedencia del documento, no de una estimación.`);
    paragraphs.push(
      s.interactions.total === 0
        ? `Asistente de IA. No utilicé el asistente de Thesisfic durante la redacción.`
        : `Asistente de IA. Utilicé el asistente de Thesisfic en ${count(s.interactions.total, "interacción", "interacciones")}, en ${s.interactions.byMode.length === 1 ? "el modo" : "los modos"} ${listJoin(modes, lang)}.${s.interactions.copilot ? ` ${n(s.interactions.copilot)} de ellas ${s.interactions.copilot === 1 ? "fue una conversación" : "fueron conversaciones"} en Research copilot sobre mi investigación.` : ""}${s.interactions.blocked ? ` ${count(s.interactions.blocked, "petición fue rechazada", "peticiones fueron rechazadas")} por la política de la institución y no ${s.interactions.blocked === 1 ? "produjo" : "produjeron"} texto.` : ""} El asistente no redactó texto de la tesis; solo pudo esquematizar, criticar, corregir, explicar y citar.`
    );
    paragraphs.push(
      s.words.ai === 0
        ? `Texto asistido por IA. Ningún pasaje de la Final submission lleva marca de IA.`
        : `Texto asistido por IA. ${n(s.words.ai)} palabras (${pct(s.pct.ai)} % de ${n(s.words.total)}; límite institucional ${s.aiLimitPct} %) están marcadas como asistidas por IA en la Final submission${chapters.length ? `, en las secciones: ${listJoin(chapters.map((c) => `«${c}»`), lang)}` : ""}. Son inserciones desde el asistente (${count(s.aiInserts.events, "inserción", "inserciones")}) o pegados reconocidos por huella como respuestas del asistente o del Research copilot.`
    );
    paragraphs.push(
      s.pastes.events === 0 && s.words.paste === 0
        ? `Texto pegado o citado. No se registraron pegados.`
        : `Texto pegado o citado. ${n(s.words.paste)} palabras (${pct(s.pct.paste)} %) están marcadas como citadas o pegadas. De ${count(s.pastes.events, "pegado registrado", "pegados registrados")}, ${n(s.pastes.attributedToSource)} se atribuyeron a una fuente de la biblioteca o a una cita declarada, ${n(s.pastes.recognisedFromAssistant)} se reconocieron como texto del asistente, ${n(s.pastes.declaredAiTool)} se declararon como procedentes de una herramienta de IA, ${n(s.pastes.ownText)} como texto propio del estudiante y ${n(s.pastes.unattributed)} quedaron sin atribuir. ${n(s.pastes.attributedWords)} palabras pegadas nombran su fuente en el propio documento.`
    );
    if (s.budget) paragraphs.push(`Coste de la IA. ${count(s.budget.requests, "petición se ejecutó", "peticiones se ejecutaron")} en modelos pagados por la universidad, con un coste de ${s.budget.institutionLocal.toFixed(2)} ${s.budget.currency} (${s.budget.institutionUsd.toFixed(4)} USD a precio de lista del proveedor).${s.budget.studentPaidRequests ? ` ${n(s.budget.studentPaidRequests)} peticiones usaron mi propia cuenta.` : ""}`);
    paragraphs.push(
      scopes.length
        ? `Monitorización consentida. Autoricé el registro de: ${listJoin(scopes, lang)}${s.consent ? ` (consentimiento v${s.consent.version}, ${fmtDate(s.consent.grantedAt, lang)})` : ""}. Se ${s.sessions.count + s.snapshots.count === 1 ? "registró" : "registraron"} ${count(s.sessions.count, "sesión de escritura", "sesiones de escritura")} (${count(s.sessions.minutes, "minuto", "minutos")}) y ${count(s.snapshots.count, "instantánea del documento", "instantáneas del documento")}, encadenadas por hash${s.snapshots.chainOk ? " y verificadas" : "; la verificación de la cadena ha fallado"}.`
        : `Monitorización consentida. No hay consentimiento de monitorización registrado; el documento solo conserva las marcas de procedencia.`
    );
    paragraphs.push(`Lo que este registro no demuestra. El registro refleja lo ocurrido dentro del editor de Thesisfic. No puede detectar texto generado por una IA externa y transcrito manualmente, ni acreditar la autoría de ideas. Es una prueba de proceso que acompaña a la tesis, no una puntuación de probabilidad.`);
    paragraphs.push(`Generada el ${date} a partir del ledger de integridad. Mi tutor ve exactamente los mismos datos.`);
    paragraphs.push(`Firma: ______________________    ${opts.studentName}    Fecha: ______________`);
    return paragraphs.join("\n\n");
  }

  if (lang === "fr") {
    paragraphs.push(`DÉCLARATION D'UTILISATION DE L'IA`);
    paragraphs.push(`Je, ${opts.studentName}, déclare ce qui suit concernant la rédaction de mon mémoire « ${opts.thesisTitle} » (${opts.university}). Cette déclaration est générée à partir du registre de provenance de Thesisfic ; chaque chiffre provient d'un événement enregistré dans l'éditeur ou d'une marque de provenance du document, jamais d'une estimation.`);
    paragraphs.push(
      s.interactions.total === 0
        ? `Assistant IA. Je n'ai pas utilisé l'assistant Thesisfic pendant la rédaction.`
        : `Assistant IA. J'ai utilisé l'assistant Thesisfic lors de ${count(s.interactions.total, "interaction", "interactions")}, dans ${s.interactions.byMode.length === 1 ? "le mode" : "les modes"} ${listJoin(modes, lang)}.${s.interactions.copilot ? ` ${n(s.interactions.copilot)} d'entre elles ${s.interactions.copilot === 1 ? "était une conversation" : "étaient des conversations"} Research copilot sur ma recherche.` : ""}${s.interactions.blocked ? ` ${count(s.interactions.blocked, "demande a été refusée", "demandes ont été refusées")} par la politique de l'établissement et n'${s.interactions.blocked === 1 ? "a" : "ont"} produit aucun texte.` : ""} L'assistant n'a rédigé aucun texte du mémoire ; il a seulement pu structurer, critiquer, corriger, expliquer et citer.`
    );
    paragraphs.push(
      s.words.ai === 0
        ? `Texte assisté par l'IA. Aucun passage de la Final submission ne porte de marque IA.`
        : `Texte assisté par l'IA. ${n(s.words.ai)} mots (${pct(s.pct.ai)} % de ${n(s.words.total)} ; limite institutionnelle ${s.aiLimitPct} %) sont marqués comme assistés par l'IA dans la Final submission${chapters.length ? `, dans les sections : ${listJoin(chapters.map((c) => `« ${c} »`), lang)}` : ""}. Il s'agit d'insertions depuis l'assistant (${count(s.aiInserts.events, "insertion", "insertions")}) ou de collages reconnus par empreinte comme des réponses de l'assistant ou du Research copilot.`
    );
    paragraphs.push(
      s.pastes.events === 0 && s.words.paste === 0
        ? `Texte collé ou cité. Aucun collage n'a été enregistré.`
        : `Texte collé ou cité. ${n(s.words.paste)} mots (${pct(s.pct.paste)} %) sont marqués comme cités ou collés. Sur ${count(s.pastes.events, "collage enregistré", "collages enregistrés")}, ${n(s.pastes.attributedToSource)} ont été attribués à une source de la bibliothèque ou à une citation déclarée, ${n(s.pastes.recognisedFromAssistant)} ont été reconnus comme du texte de l'assistant, ${n(s.pastes.declaredAiTool)} ont été déclarés comme issus d'un outil d'IA, ${n(s.pastes.ownText)} comme texte de l'étudiant et ${n(s.pastes.unattributed)} restent non attribués. ${n(s.pastes.attributedWords)} mots collés nomment leur source dans le document.`
    );
    if (s.budget) paragraphs.push(`Coût de l'IA. ${count(s.budget.requests, "demande a été exécutée", "demandes ont été exécutées")} sur des modèles payés par l'université, pour ${s.budget.institutionLocal.toFixed(2)} ${s.budget.currency} (${s.budget.institutionUsd.toFixed(4)} USD au tarif public du fournisseur).${s.budget.studentPaidRequests ? ` ${n(s.budget.studentPaidRequests)} demandes ont utilisé mon propre compte.` : ""}`);
    paragraphs.push(
      scopes.length
        ? `Suivi consenti. J'ai autorisé l'enregistrement de : ${listJoin(scopes, lang)}${s.consent ? ` (consentement v${s.consent.version}, ${fmtDate(s.consent.grantedAt, lang)})` : ""}. ${count(s.sessions.count, "session d'écriture", "sessions d'écriture")} (${count(s.sessions.minutes, "minute", "minutes")}) et ${count(s.snapshots.count, "instantané du document ont été enregistrés", "instantanés du document ont été enregistrés")}, chaînés par hachage${s.snapshots.chainOk ? " et vérifiés" : " ; la vérification de la chaîne a échoué"}.`
        : `Suivi consenti. Aucun consentement de suivi n'est enregistré ; le document ne conserve que les marques de provenance.`
    );
    paragraphs.push(`Ce que ce registre ne prouve pas. Le registre reflète ce qui s'est passé dans l'éditeur Thesisfic. Il ne peut pas détecter un texte produit par une IA externe puis transcrit à la main, ni attester la paternité des idées. C'est une preuve de processus jointe au mémoire, pas un score de probabilité.`);
    paragraphs.push(`Générée le ${date} à partir du registre d'intégrité. Mon directeur voit exactement les mêmes données.`);
    paragraphs.push(`Signature : ______________________    ${opts.studentName}    Date : ______________`);
    return paragraphs.join("\n\n");
  }

  paragraphs.push(`AI-USE DECLARATION`);
  paragraphs.push(`I, ${opts.studentName}, declare the following about the writing of my thesis "${opts.thesisTitle}" (${opts.university}). This declaration is generated from the Thesisfic provenance record; every figure comes from an event logged in the editor or from a provenance mark in the document, not from an estimate.`);
  paragraphs.push(
    s.interactions.total === 0
      ? `AI assistant. I did not use the Thesisfic assistant while writing.`
      : `AI assistant. I used the Thesisfic assistant in ${count(s.interactions.total, "interaction", "interactions")}, in the ${s.interactions.byMode.length === 1 ? "mode" : "modes"} ${listJoin(modes, lang)}.${s.interactions.copilot ? ` ${n(s.interactions.copilot)} of them ${s.interactions.copilot === 1 ? "was a Research copilot conversation" : "were Research copilot conversations"} about my research.` : ""}${s.interactions.blocked ? ` ${count(s.interactions.blocked, "request was", "requests were")} declined by the institution's policy and produced no text.` : ""} The assistant did not write thesis text; it could only outline, critique, correct, explain and cite.`
  );
  paragraphs.push(
    s.words.ai === 0
      ? `AI-assisted text. No passage of the Final submission carries an AI mark.`
      : `AI-assisted text. ${count(s.words.ai, "word", "words")} (${pct(s.pct.ai)}% of ${n(s.words.total)}; institutional limit ${s.aiLimitPct}%) ${s.words.ai === 1 ? "is" : "are"} marked as AI-assisted in the Final submission${chapters.length ? `, in the ${chapters.length === 1 ? "section" : "sections"} ${listJoin(chapters.map((c) => `"${c}"`), lang)}` : ""}. They are insertions from the assistant (${count(s.aiInserts.events, "insertion", "insertions")}) or pastes recognised by fingerprint as answers from the assistant or the Research copilot.`
  );
  paragraphs.push(
    s.pastes.events === 0 && s.words.paste === 0
      ? `Quoted or pasted text. No pastes were recorded.`
      : `Quoted or pasted text. ${count(s.words.paste, "word", "words")} (${pct(s.pct.paste)}%) ${s.words.paste === 1 ? "is" : "are"} marked as quoted or pasted. Of the ${count(s.pastes.events, "paste", "pastes")} recorded, ${n(s.pastes.attributedToSource)} ${s.pastes.attributedToSource === 1 ? "was" : "were"} attributed to a library source or a declared citation, ${n(s.pastes.recognisedFromAssistant)} ${s.pastes.recognisedFromAssistant === 1 ? "was" : "were"} recognised as assistant text, ${n(s.pastes.declaredAiTool)} ${s.pastes.declaredAiTool === 1 ? "was" : "were"} declared as coming from an AI tool, ${n(s.pastes.ownText)} as the student's own text and ${n(s.pastes.unattributed)} ${s.pastes.unattributed === 1 ? "remains" : "remain"} unattributed. ${count(s.pastes.attributedWords, "pasted word names", "pasted words name")} their source in the document itself.`
  );
  if (s.budget) paragraphs.push(`AI cost. ${count(s.budget.requests, "request", "requests")} ran on models paid for by the university, at a cost of ${s.budget.institutionLocal.toFixed(2)} ${s.budget.currency} (${s.budget.institutionUsd.toFixed(4)} USD at the provider's list price).${s.budget.studentPaidRequests ? ` ${count(s.budget.studentPaidRequests, "request", "requests")} used my own account.` : ""}`);
  paragraphs.push(
    scopes.length
      ? `Monitoring I consented to. I allowed the recording of: ${listJoin(scopes, lang)}${s.consent ? ` (consent v${s.consent.version}, ${fmtDate(s.consent.grantedAt, lang)})` : ""}. ${count(s.sessions.count, "writing session", "writing sessions")} (${count(s.sessions.minutes, "minute", "minutes")}) and ${count(s.snapshots.count, "document snapshot was", "document snapshots were")} recorded, hash-chained${s.snapshots.chainOk ? " and verified" : "; the chain verification failed"}.`
      : `Monitoring I consented to. No monitoring consent is on record; the document keeps only its provenance marks.`
  );
  paragraphs.push(`What this record does not prove. The record reflects what happened inside the Thesisfic editor. It cannot detect text produced by an external AI and transcribed by hand, and it does not attest the authorship of ideas. It is process evidence that accompanies the thesis, not a probability score.`);
  paragraphs.push(`Generated on ${date} from the integrity ledger. My advisor sees exactly the same data.`);
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
