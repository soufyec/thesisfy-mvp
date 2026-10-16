import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TEAM_COOKIE, isTeamCookie } from "@/lib/team";
import ProductPanel from "@/components/team/ProductPanel";
export const dynamic = "force-dynamic";
export default function Page() {
  if (!isTeamCookie(cookies().get(TEAM_COOKIE)?.value)) redirect("/equipe?next=/equipe/produit");
  return <ProductPanel />;
}
