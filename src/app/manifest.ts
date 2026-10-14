import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Thesisfic",
    short_name: "Thesisfic",
    description: "Write your thesis with transparent, regulated AI assistance.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F5F2ED",
    theme_color: "#2B1F2D",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png?v=3", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png?v=3", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png?v=3", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg?v=3", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Continue writing", url: "/dashboard", icons: [{ src: "/icons/icon-192.png?v=3", sizes: "192x192" }] },
      { name: "AI Assistant", url: "/dashboard/ai-chat", icons: [{ src: "/icons/icon-192.png?v=3", sizes: "192x192" }] },
    ],
  };
}
