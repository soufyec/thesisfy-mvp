import type { Metadata } from "next";
import { QuestionnaireLanguageProvider } from "@/components/questionnaire/Language";
import { BASE } from "@/lib/questionnaire";

/** Six questionnaire languages, independent of the application locale. */
export const metadata: Metadata = {
  title: BASE.title,
  description: BASE.description.split("\n")[0],
  robots: { index: false },
};

export default function QuestionnaireLayout({ children }: { children: React.ReactNode }) {
  return <QuestionnaireLanguageProvider>{children}</QuestionnaireLanguageProvider>;
}
