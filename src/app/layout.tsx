import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerCleanup from "@/components/ServiceWorkerCleanup";
import { LocaleProvider } from "@/lib/i18n/client";
import { getLocale, getT } from "@/lib/i18n/server";

export function generateMetadata(): Metadata {
  const t = getT();
  return {
    title: t("meta.title"),
    description: t("meta.description"),
    keywords: ["academic integrity", "AI", "thesis", "university", "provenance"],
    applicationName: "Thesisfic",
    icons: { icon: [{ url: "/icons/favicon-32.png?v=4", sizes: "32x32", type: "image/png" }, { url: "/icons/icon-192.png?v=4", sizes: "192x192", type: "image/png" }], apple: "/icons/apple-touch-icon.png?v=4" },
    openGraph: { title: t("meta.title"), description: t("meta.ogDescription"), type: "website" },
  };
}

export const viewport: Viewport = {
  themeColor: "#037947",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getLocale();
  return (
    <html lang={locale}>
      <body>
        <LocaleProvider locale={locale}>
          {children}
          <ServiceWorkerCleanup />
        </LocaleProvider>
      </body>
    </html>
  );
}
