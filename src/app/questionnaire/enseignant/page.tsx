import QuestionnairePage from "@/components/questionnaire/QuestionnairePage";

export const dynamic = "force-dynamic";

/** Direct link for teachers: the profile is preselected. */
export default async function Page({ searchParams: inputSearchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const searchParams = await inputSearchParams;
  return <QuestionnairePage searchParams={Promise.resolve(searchParams || {})} profil="enseignant" />;
}
