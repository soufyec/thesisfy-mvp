"use client";
import { usePathname } from "next/navigation";
import { QuestionnaireLanguageProvider } from "../questionnaire/Language";
export default function TeamLanguage({ children }: { children: React.ReactNode }) {
  return usePathname().startsWith("/equipe/produit") ? <>{children}</> : <QuestionnaireLanguageProvider>{children}</QuestionnaireLanguageProvider>;
}
