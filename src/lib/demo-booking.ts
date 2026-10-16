/** Only an actual HTTPS Cal.com event link is a booking destination. Never substitute a signup or a guessed account. */
export function demoBookingUrl(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw.trim());
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.protocol !== "https:" || !["cal.com", "www.cal.com"].includes(url.hostname) || url.port || url.username || url.password || parts.length < 2 || ["auth", "signup", "login", "apps", "settings"].includes(parts[0])) return null;
    return url.toString();
  } catch { return null; }
}
