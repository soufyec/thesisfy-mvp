import source from "@/data/questionnaire-strings.json";
import en from "@/data/questionnaire-en.json";
import es from "@/data/questionnaire-es.json";
import de from "@/data/questionnaire-de.json";
import pt from "@/data/questionnaire-pt.json";
import ar from "@/data/questionnaire-ar.json";
import { QuestionnaireLanguage } from "./languages";
import type { Item } from "../questionnaire";

const lists = { en, es, de, pt, ar };
const dictionaries = Object.fromEntries(Object.entries(lists).map(([language, list]) => {
  const pairs: [string, string][] = [];
  source.forEach((s, i) => {
    pairs.push([s, list[i]]);
    const from = s.split(/\n\n+/), to = list[i].split(/\n\n+/);
    if (from.length === to.length) from.forEach((p, j) => pairs.push([p.trim(), to[j].trim()]));
  });
  return [language, new Map(pairs)];
})) as Record<Exclude<QuestionnaireLanguage, "fr">, Map<string, string>>;
export function questionnaireText(language: QuestionnaireLanguage, text: string | undefined): string {
  if (!text) return "";
  return language === "fr" ? text : dictionaries[language].get(text) || text;
}
export function questionTitle(language: QuestionnaireLanguage, item: Item): string { return item.translations?.[language]?.title || questionnaireText(language, item.title); }
export function questionHelp(language: QuestionnaireLanguage, item: Item): string { return item.translations?.[language]?.help ?? questionnaireText(language, item.help); }
export function questionLabel(language: QuestionnaireLanguage, item: Item, label: string): string { return item.translations?.[language]?.labels?.[label] || questionnaireText(language, label); }
export function needsQuestionTranslation(language: QuestionnaireLanguage, item: Item): boolean { return language !== (item.sourceLanguage || "fr") && !item.translations?.[language]?.title && !(language !== "fr" && dictionaries[language].has(item.title)); }
