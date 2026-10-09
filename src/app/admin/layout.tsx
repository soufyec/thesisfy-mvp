import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Staff only: a student with a valid session goes back to their dashboard, an anonymous visitor to the home page. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get("token")?.value;
  const payload = token ? verifyToken(token) : null;
  if (!payload) redirect("/");
  await db.ready();
  const user = db.users.findById(payload.userId);
  if (!user) redirect("/");
  if (user.role === "student") redirect("/dashboard");
  return <>{children}</>;
}
