import type { Metadata, Viewport } from "next";
import "./globals.css";
import PWARegister from "@/components/PWARegister";

export const metadata: Metadata = {
  title: "Thesisfic.edu - Academic Integrity Through AI Regulation",
  description: "The anti-Turnitin. Thesisfic regulates AI usage during the writing process instead of detecting it after the fact. Ensuring genuine academic integrity.",
  keywords: ["academic integrity", "AI regulation", "thesis", "university", "education"],
  manifest: "/manifest.webmanifest",
  applicationName: "Thesisfic",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Thesisfic" },
  icons: { icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192" }], apple: "/icons/apple-touch-icon.png" },
  openGraph: {
    title: "Thesisfic.edu - Academic Integrity Through AI Regulation",
    description: "The anti-Turnitin. Regulate AI usage, don't just detect it.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#4c6ef5",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <PWARegister />
      </body>
    </html>
  );
}
