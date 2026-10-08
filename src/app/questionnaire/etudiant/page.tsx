import QuestionnairePage from "@/components/questionnaire/QuestionnairePage";

export const dynamic = "force-dynamic";

/** Direct link for students: the profile is preselected. */
export default function Page({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  return <QuestionnairePage searchParams={searchParams} profil="etudiant" />;
}
