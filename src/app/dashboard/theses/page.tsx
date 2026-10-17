import { redirect } from "next/navigation";

/**
 * "My Theses" became "My papers" (docs/papers.md D4). Old links, bookmarks and notifications keep working: the
 * server redirects to /dashboard/papers with the same query (`?new=1`, `?kind=…`, `?assignment=…`).
 */
export default async function ThesesRedirect({ searchParams: inputSearchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const searchParams = await inputSearchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) value.forEach((v) => query.append(key, v));
    else if (value !== undefined) query.set(key, value);
  }
  const qs = query.toString();
  redirect(qs ? `/dashboard/papers?${qs}` : "/dashboard/papers");
}
