import { NextRequest, NextResponse } from "next/server";
import { isLocale, Locale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/lib/i18n";

/**
 * 1. Language entry points: `/es`, `/es/login`, `/fr/dashboard`, … and `?lang=es`. The prefix is stripped by a rewrite
 *    (so `/es` keeps showing in the address bar for shareable links) and the choice is stored in the `locale` cookie,
 *    which every later request and client navigation reads.
 * 2. Page guard: `/dashboard` and `/admin` need the auth cookie. API routes verify the JWT themselves.
 */
export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  let pathname = url.pathname;
  let chosen: Locale | null = null;

  const m = pathname.match(/^\/(en|es|fr)(\/|$)/);
  if (m && isLocale(m[1])) {
    chosen = m[1];
    pathname = pathname.slice(m[1].length + 1) || "/";
  }
  const q = url.searchParams.get("lang");
  if (isLocale(q)) {
    chosen = q;
    url.searchParams.delete("lang");
  }

  const token = request.cookies.get("token")?.value;
  if ((pathname.startsWith("/dashboard") || pathname.startsWith("/admin")) && !token) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("next", pathname);
    const res = NextResponse.redirect(login);
    if (chosen) res.cookies.set(LOCALE_COOKIE, chosen, { path: "/", maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: "lax" });
    return res;
  }

  if (chosen) {
    url.pathname = pathname;
    // The rewritten render must already see the new locale: the cookie only reaches the *next* request.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-locale", chosen);
    const res = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    res.cookies.set(LOCALE_COOKIE, chosen, { path: "/", maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: "lax" });
    return res;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/admin/:path*", "/login", "/register", "/(en|es|fr)", "/(en|es|fr)/:path*"],
};
