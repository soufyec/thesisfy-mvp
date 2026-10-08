import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Results from "@/components/questionnaire/Results";
import { isTeamCookie, TEAM_COOKIE } from "@/lib/team";

export const dynamic = "force-dynamic";

export default function Page() {
  if (!isTeamCookie(cookies().get(TEAM_COOKIE)?.value)) redirect("/equipe?next=/equipe/resultats");
  return <Results />;
}
