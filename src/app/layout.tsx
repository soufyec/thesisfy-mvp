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
  themeColor: "#2B1F2D",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getLocale();
  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@500;600;700;800&display=swap" />
      </head>
      <body>
        <LocaleProvider locale={locale}>
          {children}
          <PWARegister />
        </LocaleProvider>
      </body>
    </html>
  );
}
