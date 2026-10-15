/**
 * Strings of the inferential tests, keyed exactly as they will live in `src/lib/i18n/messages/data.ts`
 * (integration copies these four maps there; until then `inferenceTranslator` serves them). English defines the
 * keys; es/fr/de are typed against it. Spanish "tú", French "vous", German "Sie"; no exclamation marks.
 *
 * `data.test.line.<id>` is the start of the APA line: the test's name and its statistic, with `{df}`, `{value}` and
 * (χ²) `{n}` already formatted in the writing language. French uses a no-break space before ":" and "%".
 */
import type { InferenceLang, Translate } from "./types";

const en = {
  // Test names (card titles, table captions)
  "data.test.name.welch": "Welch's t-test",
  "data.test.name.pairedT": "Paired t-test",
  "data.test.name.anova": "One-way ANOVA",
  "data.test.name.chiSquare": "Chi-square test of independence",
  "data.test.name.pearson": "Pearson correlation",
  "data.test.name.spearman": "Spearman correlation",
  "data.test.name.mannWhitney": "Mann–Whitney U test",
  "data.test.name.kruskal": "Kruskal–Wallis test",
  "data.test.name.regression": "Linear regression (OLS)",
  // Start of the APA line
  "data.test.line.welch": "Welch's t({df}) = {value}",
  "data.test.line.pairedT": "Paired t({df}) = {value}",
  "data.test.line.anova": "One-way ANOVA: F({df}) = {value}",
  "data.test.line.chiSquare": "χ²({df}, N = {n}) = {value}",
  "data.test.line.pearson": "Pearson's r({df}) = {value}",
  "data.test.line.spearman": "Spearman's ρ({df}) = {value}",
  "data.test.line.mannWhitney": "Mann–Whitney U = {value}",
  "data.test.line.kruskal": "Kruskal–Wallis H({df}) = {value}",
  "data.test.line.regression": "Linear regression: F({df}) = {value}",
  "data.test.ci": "95% CI {ci}",
  // Notes under the result
  "data.test.note.missingExcluded": "Left out because of missing values: {count}.",
  "data.test.note.dPooled": "d uses the pooled standard deviation.",
  "data.test.note.dPaired": "d is the mean difference divided by the standard deviation of the differences (dz).",
  "data.test.note.expectedLow": "{share}% of the expected counts are below 5: the χ² approximation may be inaccurate.",
  "data.test.note.expectedBelowOne": "At least one expected count is below 1.",
  "data.test.note.emptyDropped": "Empty rows or columns left out: {count}.",
  "data.test.note.smallSampleApprox": "p is a large-sample approximation and is less accurate with groups of 8 or fewer.",
  "data.test.note.referenceLevel": "Reference level of {predictor}: {level}.",
  // Table headers
  "data.test.col.group": "Group",
  "data.test.col.n": "n",
  "data.test.col.mean": "Mean",
  "data.test.col.sd": "SD",
  "data.test.col.meanRank": "Mean rank",
  "data.test.col.term": "Term",
  "data.test.col.estimate": "B",
  "data.test.col.se": "SE",
  "data.test.col.t": "t",
  "data.test.col.p": "p",
  "data.test.col.ciLow": "95% CI lower",
  "data.test.col.ciHigh": "95% CI upper",
  "data.test.term.intercept": "(Intercept)",
  // Fitted equation (left-hand side)
  "data.test.eq.predicted": "Predicted {response}",
};

export type InferenceMessageKey = keyof typeof en;

const es: Record<InferenceMessageKey, string> = {
  "data.test.name.welch": "Prueba t de Welch",
  "data.test.name.pairedT": "Prueba t para muestras relacionadas",
  "data.test.name.anova": "ANOVA de un factor",
  "data.test.name.chiSquare": "Prueba χ² de independencia",
  "data.test.name.pearson": "Correlación de Pearson",
  "data.test.name.spearman": "Correlación de Spearman",
  "data.test.name.mannWhitney": "Prueba U de Mann–Whitney",
  "data.test.name.kruskal": "Prueba de Kruskal–Wallis",
  "data.test.name.regression": "Regresión lineal (MCO)",
  "data.test.line.welch": "t de Welch({df}) = {value}",
  "data.test.line.pairedT": "t pareada({df}) = {value}",
  "data.test.line.anova": "ANOVA de un factor: F({df}) = {value}",
  "data.test.line.chiSquare": "χ²({df}, N = {n}) = {value}",
  "data.test.line.pearson": "r de Pearson({df}) = {value}",
  "data.test.line.spearman": "ρ de Spearman({df}) = {value}",
  "data.test.line.mannWhitney": "U de Mann–Whitney = {value}",
  "data.test.line.kruskal": "H de Kruskal–Wallis({df}) = {value}",
  "data.test.line.regression": "Regresión lineal: F({df}) = {value}",
  "data.test.ci": "IC 95 % {ci}",
  "data.test.note.missingExcluded": "Excluidos por valores ausentes: {count}.",
  "data.test.note.dPooled": "d usa la desviación típica combinada.",
  "data.test.note.dPaired": "d es la diferencia media dividida por la desviación típica de las diferencias (dz).",
  "data.test.note.expectedLow": "El {share} % de las frecuencias esperadas es menor que 5: la aproximación χ² puede ser imprecisa.",
  "data.test.note.expectedBelowOne": "Al menos una frecuencia esperada es menor que 1.",
  "data.test.note.emptyDropped": "Filas o columnas vacías excluidas: {count}.",
  "data.test.note.smallSampleApprox": "p es una aproximación para muestras grandes y es menos precisa con grupos de 8 o menos.",
  "data.test.note.referenceLevel": "Nivel de referencia de {predictor}: {level}.",
  "data.test.col.group": "Grupo",
  "data.test.col.n": "n",
  "data.test.col.mean": "Media",
  "data.test.col.sd": "DT",
  "data.test.col.meanRank": "Rango medio",
  "data.test.col.term": "Término",
  "data.test.col.estimate": "B",
  "data.test.col.se": "EE",
  "data.test.col.t": "t",
  "data.test.col.p": "p",
  "data.test.col.ciLow": "IC 95 % inferior",
  "data.test.col.ciHigh": "IC 95 % superior",
  "data.test.term.intercept": "(Intercepto)",
  "data.test.eq.predicted": "Valor predicho de {response}",
};

const fr: Record<InferenceMessageKey, string> = {
  "data.test.name.welch": "Test t de Welch",
  "data.test.name.pairedT": "Test t pour échantillons appariés",
  "data.test.name.anova": "ANOVA à un facteur",
  "data.test.name.chiSquare": "Test du χ² d'indépendance",
  "data.test.name.pearson": "Corrélation de Pearson",
  "data.test.name.spearman": "Corrélation de Spearman",
  "data.test.name.mannWhitney": "Test U de Mann-Whitney",
  "data.test.name.kruskal": "Test de Kruskal-Wallis",
  "data.test.name.regression": "Régression linéaire (MCO)",
  "data.test.line.welch": "t de Welch({df}) = {value}",
  "data.test.line.pairedT": "t apparié({df}) = {value}",
  "data.test.line.anova": "ANOVA à un facteur : F({df}) = {value}",
  "data.test.line.chiSquare": "χ²({df}, N = {n}) = {value}",
  "data.test.line.pearson": "r de Pearson({df}) = {value}",
  "data.test.line.spearman": "ρ de Spearman({df}) = {value}",
  "data.test.line.mannWhitney": "U de Mann-Whitney = {value}",
  "data.test.line.kruskal": "H de Kruskal-Wallis({df}) = {value}",
  "data.test.line.regression": "Régression linéaire : F({df}) = {value}",
  "data.test.ci": "IC à 95 % {ci}",
  "data.test.note.missingExcluded": "Exclus pour valeurs manquantes : {count}.",
  "data.test.note.dPooled": "d utilise l'écart-type combiné.",
  "data.test.note.dPaired": "d est la différence moyenne divisée par l'écart-type des différences (dz).",
  "data.test.note.expectedLow": "{share} % des effectifs attendus sont inférieurs à 5 : l'approximation du χ² peut être imprécise.",
  "data.test.note.expectedBelowOne": "Au moins un effectif attendu est inférieur à 1.",
  "data.test.note.emptyDropped": "Lignes ou colonnes vides exclues : {count}.",
  "data.test.note.smallSampleApprox": "p est une approximation pour grands échantillons, moins précise avec des groupes de 8 ou moins.",
  "data.test.note.referenceLevel": "Niveau de référence de {predictor} : {level}.",
  "data.test.col.group": "Groupe",
  "data.test.col.n": "n",
  "data.test.col.mean": "Moyenne",
  "data.test.col.sd": "ET",
  "data.test.col.meanRank": "Rang moyen",
  "data.test.col.term": "Terme",
  "data.test.col.estimate": "B",
  "data.test.col.se": "ES",
  "data.test.col.t": "t",
  "data.test.col.p": "p",
  "data.test.col.ciLow": "IC à 95 % inf.",
  "data.test.col.ciHigh": "IC à 95 % sup.",
  "data.test.term.intercept": "(Constante)",
  "data.test.eq.predicted": "Valeur prédite de {response}",
};

const de: Record<InferenceMessageKey, string> = {
  "data.test.name.welch": "Welch-t-Test",
  "data.test.name.pairedT": "t-Test für abhängige Stichproben",
  "data.test.name.anova": "Einfaktorielle ANOVA",
  "data.test.name.chiSquare": "χ²-Unabhängigkeitstest",
  "data.test.name.pearson": "Pearson-Korrelation",
  "data.test.name.spearman": "Spearman-Korrelation",
  "data.test.name.mannWhitney": "Mann-Whitney-U-Test",
  "data.test.name.kruskal": "Kruskal-Wallis-Test",
  "data.test.name.regression": "Lineare Regression (KQ)",
  "data.test.line.welch": "Welch-t-Test: t({df}) = {value}",
  "data.test.line.pairedT": "t-Test für abhängige Stichproben: t({df}) = {value}",
  "data.test.line.anova": "Einfaktorielle ANOVA: F({df}) = {value}",
  "data.test.line.chiSquare": "χ²({df}, N = {n}) = {value}",
  "data.test.line.pearson": "Pearson-Korrelation: r({df}) = {value}",
  "data.test.line.spearman": "Spearman-Korrelation: ρ({df}) = {value}",
  "data.test.line.mannWhitney": "Mann-Whitney-U-Test: U = {value}",
  "data.test.line.kruskal": "Kruskal-Wallis-Test: H({df}) = {value}",
  "data.test.line.regression": "Lineare Regression: F({df}) = {value}",
  "data.test.ci": "95-%-KI {ci}",
  "data.test.note.missingExcluded": "Wegen fehlender Werte ausgeschlossen: {count}.",
  "data.test.note.dPooled": "d verwendet die gepoolte Standardabweichung.",
  "data.test.note.dPaired": "d ist die mittlere Differenz geteilt durch die Standardabweichung der Differenzen (dz).",
  "data.test.note.expectedLow": "{share} % der erwarteten Häufigkeiten liegen unter 5: Die χ²-Näherung kann ungenau sein.",
  "data.test.note.expectedBelowOne": "Mindestens eine erwartete Häufigkeit liegt unter 1.",
  "data.test.note.emptyDropped": "Leere Zeilen oder Spalten ausgeschlossen: {count}.",
  "data.test.note.smallSampleApprox": "p ist eine Näherung für große Stichproben und bei Gruppen mit 8 oder weniger Fällen ungenauer.",
  "data.test.note.referenceLevel": "Referenzkategorie von {predictor}: {level}.",
  "data.test.col.group": "Gruppe",
  "data.test.col.n": "n",
  "data.test.col.mean": "M",
  "data.test.col.sd": "SD",
  "data.test.col.meanRank": "Mittlerer Rang",
  "data.test.col.term": "Term",
  "data.test.col.estimate": "B",
  "data.test.col.se": "SE",
  "data.test.col.t": "t",
  "data.test.col.p": "p",
  "data.test.col.ciLow": "95-%-KI unten",
  "data.test.col.ciHigh": "95-%-KI oben",
  "data.test.term.intercept": "(Konstante)",
  "data.test.eq.predicted": "Vorhersage für {response}",
};

/** The four message maps (en defines the keys). */
export const inferenceMessages: Record<InferenceLang, Record<InferenceMessageKey, string>> = { en, es, fr, de };

/** Every key the inference module uses (for the integration into `messages/data.ts`). */
export const INFERENCE_MESSAGE_KEYS = Object.keys(en) as InferenceMessageKey[];

/** `{var}` interpolation, same rule as `interpolate` in src/lib/i18n (unknown vars stay as written). */
function interpolate(template: string, vars?: Record<string, string | number | undefined>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
}

/** Translator over the built-in maps (falls back to English, then to the key). */
export function inferenceTranslator(lang: InferenceLang | string): Translate {
  const map = (inferenceMessages as Record<string, Record<string, string>>)[lang] || inferenceMessages.en;
  return (key, vars) => interpolate(map[key] ?? (inferenceMessages.en as Record<string, string>)[key] ?? key, vars);
}
