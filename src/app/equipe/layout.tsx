import type { Metadata } from "next";
import TeamLanguage from "@/components/team/TeamLanguage";

export const metadata: Metadata = { title: "Thesisfic — Équipe", robots: { index: false } };

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return <TeamLanguage>{children}</TeamLanguage>;
}
