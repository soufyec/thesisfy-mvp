import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TEAM_COOKIE, isTeamCookie } from "@/lib/team";
import SupportInbox from "@/components/support/SupportInbox";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!isTeamCookie((await cookies()).get(TEAM_COOKIE)?.value)) redirect("/equipe?next=/equipe/support");
  return <SupportInbox />;
}
