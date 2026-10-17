export const QUESTIONNAIRE_LANGUAGES = ["fr", "en", "es", "de", "pt", "ar"] as const;
export type QuestionnaireLanguage = typeof QUESTIONNAIRE_LANGUAGES[number];
export const QUESTIONNAIRE_LANGUAGE_NAMES: Record<QuestionnaireLanguage, string> = { fr: "Français", en: "English", es: "Español", de: "Deutsch", pt: "Português", ar: "العربية" };
export function isQuestionnaireLanguage(value: unknown): value is QuestionnaireLanguage { return typeof value === "string" && QUESTIONNAIRE_LANGUAGES.some(l => l === value); }
