import type { Metadata, Viewport } from "next";
import "./globals.css";
import PWARegister from "@/components/PWARegister";
import { LocaleProvider } from "@/lib/i18n/client";
import { getLocale, getT } from "@/lib/i18n/server";

export function generateMetadata(): Metadata {
  const t = getT();
  return {
    title: t("meta.title"),
    description: t("meta.description"),
    keywords: ["academic integrity", "AI", "thesis", "university", "provenance"],
    manifest: "/manifest.webmanifest",
    applicationName: "Thesisfic",
    appleWebApp: { capable: true, statusBarStyle: "default", title: "Thesisfic" },
    icons: { icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192" }], apple: "/icons/apple-touch-icon.png" },
    openGraph: { title: t("meta.title"), description: t("meta.ogDescription"), type: "website" },
  };
}

export const viewport: Viewport = {
  themeColor: "#4c6ef5",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getLocale();
  return (
    <html lang={locale}>
      <body>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
        <PWARegister />
      </body>
    </html>
  );
}
