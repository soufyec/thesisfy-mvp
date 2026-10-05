import type { DatabaseAccess } from "./db";

export const ACCESS_INFO: Record<DatabaseAccess, { label: string; short: string; how: (university: string) => string }> = {
  sso: { label: "University login (SSO)", short: "SSO", how: (u) => `Choose “Access through your institution” (or “Institutional login”), select ${u}, and sign in with your university account.` },
  proxy: { label: "Library proxy", short: "Proxy", how: () => "Open it from this page: the link goes through the library proxy, which asks for your university account once." },
  vpn: { label: "University VPN", short: "VPN", how: () => "Connect to the university VPN first, then open the database." },
  campus: { label: "On campus only", short: "Campus", how: () => "Available from the campus network or library computers." },
  open: { label: "Open access", short: "Open", how: () => "Free to use. No login needed." },
  personal: { label: "Personal account", short: "Account", how: () => "Create a personal account with your university email address, then sign in." },
};

/** Builds the link a student should follow: through the library proxy when the database requires it and a prefix is set. */
export function accessUrl(d: { url: string; loginUrl?: string; access: DatabaseAccess }, proxyPrefix?: string) {
  if (d.access === "proxy" && proxyPrefix) return proxyPrefix.includes("{url}") ? proxyPrefix.replace("{url}", encodeURIComponent(d.url)) : proxyPrefix + d.url;
  return d.loginUrl || d.url;
}

const ACCESS: DatabaseAccess[] = ["sso", "proxy", "vpn", "campus", "open", "personal"];

export function parseDatabase(body: Record<string, unknown>) {
  const name = String(body.name || "").trim().slice(0, 120);
  const url = String(body.url || "").trim();
  if (!name) return { error: "Name is required" };
  if (!/^https?:\/\/[^\s]+$/i.test(url)) return { error: "Enter a valid link starting with https://" };
  const loginUrl = String(body.loginUrl || "").trim();
  if (loginUrl && !/^https?:\/\/[^\s]+$/i.test(loginUrl)) return { error: "The login link must start with https://" };
  const access = ACCESS.includes(body.access as DatabaseAccess) ? (body.access as DatabaseAccess) : "sso";
  const subjects = (Array.isArray(body.subjects) ? body.subjects : String(body.subjects || "").split(","))
    .map((x) => String(x).trim())
    .filter(Boolean)
    .slice(0, 8);
  return {
    data: {
      name,
      url,
      loginUrl: loginUrl || undefined,
      description: String(body.description || "").trim().slice(0, 400),
      subjects,
      access,
      instructions: String(body.instructions || "").trim().slice(0, 1500) || undefined,
      featured: !!body.featured,
    },
  };
}

