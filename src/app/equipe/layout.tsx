import type { Metadata } from "next";
import { LocaleProvider } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Thesisfic — Équipe", robots: { index: false } };

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return <LocaleProvider locale="fr">{children}</LocaleProvider>;
}
