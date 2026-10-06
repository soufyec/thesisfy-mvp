"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Registers the service worker and shows a one-time "Install app" hint on mobile. */
export default function PWARegister() {
  const t = useT();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    try {
      setDismissed(localStorage.getItem("pwa_dismissed") === "1");
    } catch {
      setDismissed(false);
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!installEvent || dismissed) return null;
  return (
    <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-6 right-4 left-4 lg:left-auto lg:w-80 z-[90] bg-gray-900 text-white rounded-2xl p-3 shadow-2xl flex items-center gap-3 animate-slide-up">
      <img src="/icons/icon-192.png" alt="" className="w-10 h-10 rounded-xl" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{t("ui.pwa.title")}</div>
        <div className="text-xs text-gray-300">{t("ui.pwa.body")}</div>
      </div>
      <button
        onClick={async () => {
          await installEvent.prompt();
          setInstallEvent(null);
        }}
        className="text-xs font-semibold bg-white text-gray-900 px-3 py-1.5 rounded-lg flex items-center gap-1"
      >
        <Download className="w-3.5 h-3.5" /> {t("ui.pwa.install")}
      </button>
      <button
        onClick={() => {
          localStorage.setItem("pwa_dismissed", "1");
          setDismissed(true);
        }}
        className="text-gray-400"
        aria-label={t("ui.pwa.dismiss")}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
