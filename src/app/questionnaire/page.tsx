import QuestionnairePage from "@/components/questionnaire/QuestionnairePage";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams: inputSearchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const searchParams = await inputSearchParams;
  return <QuestionnairePage searchParams={Promise.resolve(searchParams || {})} />;
}
