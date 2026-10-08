import QuestionnairePage from "@/components/questionnaire/QuestionnairePage";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  return <QuestionnairePage searchParams={searchParams} />;
}
