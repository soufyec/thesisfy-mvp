"use client";

import { useEffect } from "react";

/**
 * Thesisfic is not offered as an installable web app for now. Earlier versions registered a service worker
 * (`/sw.js`) for the install prompt: remove it and its caches so those browsers load the site normally.
 */
export default function ServiceWorkerCleanup() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => registrations.forEach((r) => void r.unregister()))
      .catch(() => {});
    if ("caches" in window) caches.keys().then((keys) => keys.forEach((k) => void caches.delete(k))).catch(() => {});
  }, []);
  return null;
}
