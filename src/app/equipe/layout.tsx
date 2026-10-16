import type { Metadata } from "next";
import { QuestionnaireLanguageProvider } from "@/components/questionnaire/Language";

export const metadata: Metadata = { title: "Thesisfic — Équipe", robots: { index: false } };

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return <QuestionnaireLanguageProvider>{children}</QuestionnaireLanguageProvider>;
}
