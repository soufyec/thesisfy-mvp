import { AIMode, Policy } from "../db";

// Requests that ask the assistant to produce thesis text. Multilingual, deliberately conservative.
const GENERATION_PATTERNS: RegExp[] = [
  /\b(write|draft|compose|generate|produce)\b.{0,40}\b(for me|my (thesis|chapter|section|introduction|abstract|conclusion|literature review|methodology|paragraph)|the (introduction|abstract|conclusion|chapter|section))\b/i,
  /\b(escribe|redacta|genera|elabora|hazme|escríbeme|redáctame)\b.{0,40}\b(por mí|mi (tesis|capítulo|sección|introducción|resumen|conclusión|marco teórico|metodología|párrafo)|la (introducción|conclusión)|el (resumen|capítulo|marco teórico))\b/i,
  /\b(écris|rédige|génère|produis)\b.{0,40}\b(pour moi|mon (mémoire|chapitre|introduction|résumé|conclusion)|ma (thèse|section|méthodologie)|l'introduction|la conclusion)\b/i,
  /\b(write|draft)\s+(me\s+)?(a|an|the)\s+\d*\s*[-\s]?(word|page)s?\b/i,
  /\b(rewrite|reword|paraphrase)\s+(this|it|the following)\s+so\s+(it|that)\s+(isn'?t|is not|won'?t be)\s+detected/i,
];

export interface PolicyCheck {
  allowed: boolean;
  reason?: string;
  message?: string;
}

export function checkPolicy(policy: Policy, mode: AIMode, prompt: string, lang: "en" | "es" | "fr" = "en"): PolicyCheck {
  if (mode === "copilot" ? !policy.researchCopilot : !policy.allowedModes.includes(mode)) {
    return { allowed: false, reason: "mode_not_allowed", message: t(lang, "mode") };
  }
  if (policy.blockGeneration && GENERATION_PATTERNS.some((re) => re.test(prompt))) {
    return { allowed: false, reason: "generation_blocked", message: t(lang, "generation") };
  }
  return { allowed: true };
}

export function detectLang(text: string): "en" | "es" | "fr" {
  const s = text.toLowerCase();
  const es = (s.match(/\b(el|la|los|las|que|para|con|una|por|mi|tesis|escribe|ayuda|cómo|qué)\b/g) || []).length;
  const fr = (s.match(/\b(le|la|les|des|une|pour|avec|mon|ma|mémoire|thèse|écris|comment|est-ce)\b/g) || []).length;
  const en = (s.match(/\b(the|and|for|with|my|thesis|write|help|how|what|is|are)\b/g) || []).length;
  if (es > en && es >= fr) return "es";
  if (fr > en && fr > es) return "fr";
  return "en";
}

function t(lang: "en" | "es" | "fr", key: "mode" | "generation") {
  const msgs = {
    en: {
      mode: "This assistant mode is not enabled by your institution's AI policy. Ask your advisor or switch to a permitted mode.",
      generation:
        "I can't write that part of your thesis for you: your institution's policy (and Thesisfic's rules) block AI-generated thesis text, and this request has been logged as blocked.\n\nWhat I can do instead:\n- **Outline** the section with you, heading by heading\n- Ask you **guiding questions** so you draft it in your own words\n- **Critique** or **correct** a draft you write\n\nWhich would you like?",
    },
    es: {
      mode: "Este modo del asistente no está habilitado por la política de IA de tu institución. Consulta a tu tutor o elige un modo permitido.",
      generation:
        "No puedo escribir esa parte de tu tesis por ti: la política de tu institución (y las reglas de Thesisfic) bloquean el texto de tesis generado por IA, y esta solicitud ha quedado registrada como bloqueada.\n\nLo que sí puedo hacer:\n- Hacer un **esquema** de la sección contigo, apartado por apartado\n- Plantearte **preguntas guía** para que la redactes con tus palabras\n- **Revisar** o **corregir** un borrador que escribas tú\n\n¿Qué prefieres?",
    },
    fr: {
      mode: "Ce mode de l'assistant n'est pas activé par la politique IA de votre établissement. Demandez à votre directeur ou choisissez un mode autorisé.",
      generation:
        "Je ne peux pas rédiger cette partie de votre mémoire à votre place : la politique de votre établissement (et les règles de Thesisfic) bloquent le texte généré par IA, et cette demande a été consignée comme bloquée.\n\nCe que je peux faire :\n- Construire un **plan** de la section avec vous\n- Vous poser des **questions guides** pour que vous rédigiez vous-même\n- **Critiquer** ou **corriger** un brouillon que vous écrivez\n\nQue préférez-vous ?",
    },
  };
  return msgs[lang][key];
}
