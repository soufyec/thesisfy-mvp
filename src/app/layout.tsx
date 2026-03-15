import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Thesisfy.edu - Academic Integrity Through AI Regulation",
  description:
    "The anti-Turnitin. Thesisfy regulates AI usage during the writing process instead of detecting it after the fact. Ensuring genuine academic integrity.",
  keywords: ["academic integrity", "AI regulation", "thesis", "university", "education"],
  openGraph: {
    title: "Thesisfy.edu - Academic Integrity Through AI Regulation",
    description: "The anti-Turnitin. Regulate AI usage, don't just detect it.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
