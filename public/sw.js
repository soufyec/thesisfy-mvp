/* Thesisfic service worker: app-shell caching for installable PWA use. API calls always go to the network. */
const VERSION = "thesisfic-v1";
const SHELL = ["/", "/login", "/offline.html", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // never cache API responses

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(caches.open(VERSION).then(async (cache) => (await cache.match(req)) || fetch(req).then((res) => (res.ok && cache.put(req, res.clone()), res))));
    return;
  }

  // Pages: network first, fall back to cache, then offline page.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && req.mode === "navigate") caches.open(VERSION).then((c) => c.put(req, res.clone()));
        return res;
      })
      .catch(async () => (await caches.match(req)) || (req.mode === "navigate" ? caches.match("/offline.html") : Response.error()))
  );
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || "Thesisfic", { body: data.message || "", icon: "/icons/icon-192.png", data: { url: data.link || "/dashboard" } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url || "/dashboard"));
});
