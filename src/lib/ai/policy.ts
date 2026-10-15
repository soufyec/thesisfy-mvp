import type { AIMode, Policy } from "../db";

// Requests that ask the assistant to produce text of the student's paper (thesis, essay, report or any other
// assessed work). Multilingual, deliberately conservative: a pattern is only ever added or widened, never relaxed
// (CLAUDE.md principle 3; the test in the papers scratchpad checks that every earlier pattern is still here verbatim).
// Accented letters are not word characters for \b (no `u` flag on the ES5 target), so Spanish, French and German use
// explicit letter boundaries.
const L = "a-zA-ZÀ-ÿ";
const NOT_LETTER_BEFORE = `(?:^|[^${L}])`;
const NOT_LETTER_AFTER = `(?![${L}])`;

export const GENERATION_PATTERNS: readonly RegExp[] = [
  // ---- Original patterns (kept verbatim) ----
  /\b(write|draft|compose|generate|produce)\b.{0,40}\b(for me|my (thesis|chapter|section|introduction|abstract|conclusion|literature review|methodology|paragraph)|the (introduction|abstract|conclusion|chapter|section))\b/i,
  /\b(escribe|escríbeme|redacta|redáctame|genera|elabora|hazme)(?![a-zA-ZÀ-ÿ]).{0,40}(?:^|[^a-zA-ZÀ-ÿ])(por mí|en mi lugar|mi (tesis|capítulo|sección|introducción|resumen|conclusión|marco teórico|metodología|párrafo)|la (introducción|conclusión)|el (resumen|capítulo|marco teórico))(?![a-zA-ZÀ-ÿ])/i,
  /(?:^|[^a-zA-ZÀ-ÿ])(écris|écrire|rédige|rédiger|génère|générer|produis)(?![a-zA-ZÀ-ÿ]).{0,40}(?:^|[^a-zA-ZÀ-ÿ])(pour moi|à ma place|mon (mémoire|chapitre|introduction|résumé|conclusion|paragraphe)|ma (thèse|section|méthodologie)|l'introduction|la conclusion)(?![a-zA-ZÀ-ÿ])/i,
  /\b(write|draft)\s+(me\s+)?(a|an|the)\s+\d*\s*[-\s]?(word|page)s?\b/i,
  /\b(rewrite|reword|paraphrase)\s+(this|it|the following)\s+so\s+(it|that)\s+(isn'?t|is not|won'?t be)\s+detected/i,

  // ---- Every kind of paper (decision D14) ----
  // English: "write my essay", "draft my lab report", "generate my case study", "write it on my behalf".
  /\b(write|draft|compose|generate|produce)\b.{0,40}\b(on my behalf|in my place|instead of me|my (essay|reflective essay|report|lab report|case study|proposal|research proposal|article|review|reflection|paper|assignment|coursework|homework|dissertation|discussion|argument)s?)\b/i,
  // English, a request in the imperative for a new piece: "write an essay on Kant", "can you draft me a report".
  /(?:^\s*|[.!?;:]\s+|\b(?:please,?|pls|can you|could you|would you|will you|i need you to|i want you to)\s+)(write|draft|compose)\s+(me\s+)?(a|an)\s+([\w-]+\s+){0,3}?(essay|report|lab report|case study|proposal|article|review|reflection|paper|dissertation|thesis|introduction|conclusion|abstract|chapter|literature review|discussion)\b/i,
  // Spanish: "escribe mi ensayo", "redacta mi informe", "quiero que escribas mi trabajo", "genéralo para mí".
  new RegExp(
    `${NOT_LETTER_BEFORE}(escribe|escríbeme|escribeme|redacta|redáctame|redactame|genera|genérame|elabora|elabórame|escribas|redactes|generes|elabores)${NOT_LETTER_AFTER}.{0,40}${NOT_LETTER_BEFORE}(para mí|mis? (ensayos?|informes?|trabajos?|propuestas?|artículos?|reseñas?|memoria|reflexión|estudio de caso|tfg|tfm|trabajo de fin de (grado|máster|master)))${NOT_LETTER_AFTER}`,
    "i"
  ),
  // Spanish, "make me my essay" with the object right after the verb (so "hazme un gráfico de mis datos" stays allowed).
  new RegExp(`${NOT_LETTER_BEFORE}(hazme|haz|hágame)\\s+(mi|el|la|un|una)\\s+(ensayo|informe|trabajo|propuesta|artículo|reseña|tesis|introducción|conclusión|memoria|tfg|tfm)${NOT_LETTER_AFTER}`, "i"),
  // Spanish, "¿puedes escribir mi ensayo?".
  new RegExp(
    `${NOT_LETTER_BEFORE}(puedes|podrías|podrias|puede|podría|podria|necesito que|quiero que)\\s+(me\\s+)?(escribir|redactar|escribirme|redactarme|escribas|redactes)${NOT_LETTER_AFTER}.{0,40}${NOT_LETTER_BEFORE}(por mí|para mí|en mi lugar|mis? (ensayo|informe|trabajo|propuesta|artículo|reseña|tesis|introducción|conclusión|capítulo|resumen|marco teórico|metodología|memoria)s?)${NOT_LETTER_AFTER}`,
    "i"
  ),
  // French: "rédige ma dissertation", "écrivez mon rapport", "écris mon essai à ma place".
  new RegExp(
    `${NOT_LETTER_BEFORE}(écris|écrivez|écrire|rédige|rédigez|rédiger|génère|générez|générer|produis|produisez|compose|composez)${NOT_LETTER_AFTER}.{0,40}${NOT_LETTER_BEFORE}(pour moi|à ma place|mon (rapport|essai|devoir|article|compte rendu|compte-rendu|travail|projet de recherche|étude de cas|mémoire|chapitre|introduction|résumé|paragraphe)|ma (dissertation|thèse|revue de littérature|réflexion|proposition|section|méthodologie|conclusion|problématique|partie)|mes (dissertations|rapports|devoirs|essais|articles)|l['’]introduction|la conclusion)${NOT_LETTER_AFTER}`,
    "i"
  ),
  // German, verb first: "Schreib meine Hausarbeit", "Verfasse meinen Bericht", "Formuliere das für mich".
  new RegExp(
    `${NOT_LETTER_BEFORE}(schreib|schreibe|schreibt|schreiben|verfass|verfasse|verfasst|verfassen|formulier|formuliere|formuliert|formulieren)${NOT_LETTER_AFTER}.{0,40}${NOT_LETTER_BEFORE}(für mich|an meiner stelle|mein(e|en)? (arbeit|hausarbeit|seminararbeit|abschlussarbeit|bachelorarbeit|masterarbeit|dissertation|einleitung|zusammenfassung|fazit|schluss|kapitel|essay|bericht|laborbericht|aufsatz|methodik|diskussion))${NOT_LETTER_AFTER}`,
    "i"
  ),
  // German, verb last: "Kannst du meine Hausarbeit schreiben?", "… für mich verfassen".
  new RegExp(
    `${NOT_LETTER_BEFORE}(für mich|an meiner stelle|mein(e|en)? (arbeit|hausarbeit|seminararbeit|abschlussarbeit|bachelorarbeit|masterarbeit|dissertation|einleitung|zusammenfassung|fazit|schluss|kapitel|essay|bericht|laborbericht|aufsatz|methodik|diskussion))${NOT_LETTER_AFTER}.{0,60}${NOT_LETTER_BEFORE}(schreiben|verfassen|formulieren|schreibst|verfasst|formulierst)${NOT_LETTER_AFTER}`,
    "i"
  ),
  // German, "write me a …": "Schreib mir eine Einleitung über …".
  new RegExp(
    `${NOT_LETTER_BEFORE}(schreib|schreibe|verfass|verfasse|formulier|formuliere)\\s+(mir|uns)\\s+(eine|einen|ein|die|den|das)\\s+([a-zäöüß-]+\\s+){0,2}(arbeit|hausarbeit|seminararbeit|abschlussarbeit|bachelorarbeit|masterarbeit|einleitung|zusammenfassung|fazit|schluss|kapitel|essay|bericht|aufsatz|absatz|text)${NOT_LETTER_AFTER}`,
    "i"
  ),

  // ---- Section names of the paper templates (docs/papers.md §2) ----
  // A table, chart or figure between the verb and the section ("generate a table of the results") or right after it
  // ("produce the results table") is a request for computation from attached data, not for paper text.
  // English: "write my results section", "write up my findings", "draft the executive summary".
  /\b(write|draft|compose|generate|produce)\b(?:(?!\b(?:tables?|charts?|graphs?|plots?|diagrams?|histograms?)\b).){0,40}\b(my|the)\s+(results?|findings|methods|materials and methods|analysis|data analysis|executive summary|recommendations?|background|problem statement|implementation plan|action plan|evaluation|research questions?|ethical considerations|expected outcomes|theoretical framework|acknowledgements|appendix|appendices|annotations?|annotated bibliography|discussion|(figure |table )?captions?)\b(?!\s+(?:tables?|charts?|graphs?|plots?|diagrams?|histograms?)\b)/i,
  // Spanish: "escribe mis resultados", "redacta la sección de resultados".
  new RegExp(
    `${NOT_LETTER_BEFORE}(escribe|escríbeme|escribeme|redacta|redáctame|redactame|genera|genérame|elabora|elabórame|escribas|redactes|generes|elabores)${NOT_LETTER_AFTER}(?:(?!tabla|gráfic|grafic|figura|diagrama|histograma).){0,40}${NOT_LETTER_BEFORE}(mis? (resultados|hallazgos|análisis|discusión|recomendaciones|conclusiones)|los (resultados|hallazgos)|la (sección|parte|apartado) de [${L} ]{3,30}|el (análisis|resumen ejecutivo|apartado de [${L} ]{3,30})|la discusión|las (recomendaciones|conclusiones))${NOT_LETTER_AFTER}`,
    "i"
  ),
  // French: "rédige mes résultats", "rédige la partie résultats".
  new RegExp(
    `${NOT_LETTER_BEFORE}(écris|écrivez|écrire|rédige|rédigez|rédiger|génère|générez|générer|produis|produisez|compose|composez)${NOT_LETTER_AFTER}(?:(?!tableau|graphique|figure|diagramme|histogramme).){0,40}${NOT_LETTER_BEFORE}(mes (résultats|analyses|recommandations)|les (résultats|recommandations)|la (partie|section) [${L} ]{3,30}|ma discussion|la discussion|mon analyse|l['’]analyse|la synthèse)${NOT_LETTER_AFTER}`,
    "i"
  ),
  // German: "schreib meinen Ergebnisteil", "schreibe die Ergebnisse".
  new RegExp(
    `${NOT_LETTER_BEFORE}(schreib|schreibe|schreibt|verfass|verfasse|verfasst|formulier|formuliere|formuliert)${NOT_LETTER_AFTER}(?:(?!tabelle|diagramm|grafik|abbildung|histogramm).){0,40}${NOT_LETTER_BEFORE}(mein(e|en)? (ergebnisteil|ergebnisse|methodenteil|auswertung|analyse|diskussion|empfehlungen)|die (ergebnisse|auswertung|analyse|diskussion|empfehlungen|methodik)|den (ergebnisteil|methodenteil|diskussionsteil))${NOT_LETTER_AFTER}`,
    "i"
  ),
];

/** True when the prompt asks the assistant to write text of the student's paper (any pattern above). */
export function isGenerationRequest(prompt: string): boolean {
  return GENERATION_PATTERNS.some((re) => re.test(prompt));
}

export interface PolicyCheck {
  allowed: boolean;
  reason?: string;
  message?: string;
}

export function checkPolicy(policy: Policy, mode: AIMode, prompt: string, lang: "en" | "es" | "fr" | "de" = "en"): PolicyCheck {
  if (mode === "copilot" ? !policy.researchCopilot : !policy.allowedModes.includes(mode)) {
    return { allowed: false, reason: "mode_not_allowed", message: t(lang, "mode") };
  }
  if (mode !== "copilot" && policy.blockGeneration && isGenerationRequest(prompt)) {
    return { allowed: false, reason: "generation_blocked", message: t(lang, "generation") };
  }
  return { allowed: true };
}

export function detectLang(text: string): "en" | "es" | "fr" | "de" {
  const s = text.toLowerCase();
  const es = (s.match(/\b(el|la|los|las|que|para|con|una|por|mi|tesis|escribe|ayuda|cómo|qué)\b/g) || []).length;
  const fr = (s.match(/\b(le|la|les|des|une|pour|avec|mon|ma|mémoire|thèse|écris|comment|est-ce)\b/g) || []).length;
  const en = (s.match(/\b(the|and|for|with|my|thesis|write|help|how|what|is|are)\b/g) || []).length;
  // German markers that are not English, Spanish or French words ("für" is matched without \b: ü is not a word character).
  const de = (s.match(/\b(der|die|das|den|dem|und|ich|mein|meine|meinen|mich|mir|nicht|eine|einen|schreib|schreibe|beschreibe|zeige|erstelle|berechne|daten|bitte|wie|ist|arbeit|kannst|von|zu)\b|für|häufigkeit/g) || []).length;
  if (de > en && de > es && de > fr) return "de";
  if (es > en && es >= fr) return "es";
  if (fr > en && fr > es) return "fr";
  return "en";
}

function t(lang: "en" | "es" | "fr" | "de", key: "mode" | "generation") {
  const msgs = {
    en: {
      mode: "This assistant mode is not enabled by your institution's AI policy. Ask your teacher or advisor, or switch to a permitted mode.",
      generation:
        "I can't write that part of your paper for you: your institution's policy (and Thesisfic's rules) block AI-generated text for your paper, and this request has been logged as blocked.\n\nWhat I can do instead:\n- **Outline** the section with you, heading by heading\n- Ask you **guiding questions** so you draft it in your own words\n- **Critique** or **correct** a draft you write\n\nWhich would you like?",
    },
    es: {
      mode: "Este modo del asistente no está habilitado por la política de IA de tu institución. Consulta a tu docente o tutor, o elige un modo permitido.",
      generation:
        "No puedo escribir esa parte de tu trabajo por ti: la política de tu institución (y las reglas de Thesisfic) bloquean el texto generado por IA para tu trabajo, y esta solicitud ha quedado registrada como bloqueada.\n\nLo que sí puedo hacer:\n- Hacer un **esquema** de la sección contigo, apartado por apartado\n- Plantearte **preguntas guía** para que la redactes con tus palabras\n- **Revisar** o **corregir** un borrador que escribas tú\n\n¿Qué prefieres?",
    },
    fr: {
      mode: "Ce mode de l'assistant n'est pas activé par la politique IA de votre établissement. Demandez à votre enseignant ou à votre directeur, ou choisissez un mode autorisé.",
      generation:
        "Je ne peux pas rédiger cette partie de votre travail à votre place : la politique de votre établissement (et les règles de Thesisfic) bloquent le texte généré par IA pour votre travail, et cette demande a été consignée comme bloquée.\n\nCe que je peux faire :\n- Construire un **plan** de la section avec vous\n- Vous poser des **questions guides** pour que vous rédigiez vous-même\n- **Critiquer** ou **corriger** un brouillon que vous écrivez\n\nQue préférez-vous ?",
    },
    de: {
      mode: "Dieser Assistentenmodus ist durch die KI-Richtlinie Ihrer Hochschule nicht freigegeben. Fragen Sie Ihre Lehrkraft oder Betreuung, oder wählen Sie einen erlaubten Modus.",
      generation:
        "Ich kann diesen Teil Ihrer Arbeit nicht für Sie schreiben: Die Richtlinie Ihrer Hochschule (und die Regeln von Thesisfic) blockieren KI-generierten Text für Ihre Arbeit, und diese Anfrage wurde als blockiert protokolliert.\n\nWas ich stattdessen tun kann:\n- Den Abschnitt mit Ihnen **gliedern**, Überschrift für Überschrift\n- Ihnen **Leitfragen** stellen, damit Sie ihn in eigenen Worten schreiben\n- Einen von Ihnen geschriebenen Entwurf **kritisch prüfen** oder **korrigieren**\n\nWas möchten Sie?",
    },
  };
  return msgs[lang][key];
}
