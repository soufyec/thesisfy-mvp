import { cookies } from "next/headers";
import Questionnaire from "@/components/questionnaire/Questionnaire";
import { db } from "@/lib/db";
import { Mode, Profil } from "@/lib/questionnaire";
import { currentQuestionnaire } from "@/lib/questionnaireData";
import { isTeamCookie, TEAM_COOKIE } from "@/lib/team";

/** Server side of /questionnaire and its direct links: current definition, team cookie, mode from the URL. */
export default async function QuestionnairePage({ searchParams, profil }: { searchParams?: Record<string, string | string[] | undefined>; profil?: Profil }) {
  await db.ready();
  const mode: Mode = searchParams?.mode === "entretien" ? "entretien" : "en_ligne";
  const team = isTeamCookie(cookies().get(TEAM_COOKIE)?.value);
  return <Questionnaire questionnaire={currentQuestionnaire()} team={team} initialMode={mode} presetProfil={profil} />;
}
