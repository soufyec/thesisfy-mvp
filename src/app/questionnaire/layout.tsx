import type { Metadata } from "next";
import { LocaleProvider } from "@/lib/i18n/client";
import { BASE } from "@/lib/questionnaire";

/** The questionnaire is French only (the study is run in France): the locale is forced whatever the cookie says. */
export const metadata: Metadata = {
  title: BASE.title,
  description: BASE.description.split("\n")[0],
  robots: { index: false },
};

export default function QuestionnaireLayout({ children }: { children: React.ReactNode }) {
  return <LocaleProvider locale="fr">{children}</LocaleProvider>;
}
