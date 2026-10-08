import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import TeamLogin from "@/components/questionnaire/TeamLogin";
import { isTeamCookie, TEAM_COOKIE } from "@/lib/team";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const raw = typeof searchParams?.next === "string" ? searchParams.next : "";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/equipe/resultats";
  if (isTeamCookie(cookies().get(TEAM_COOKIE)?.value)) redirect(next);
  return <TeamLogin next={next} />;
}
