// SOWESTIM service worker: precache shell + offline page; network-first for pages, cache-first for static assets. API calls are never cached.
const CACHE = "swim-v2";
// Only public pages are cached for offline use; account pages are never stored.
const PUBLIC_PAGE = /^\/($|deals$|offline$|listings\/\d+$|sellers\/\d+$)/;
const PRECACHE = ["/offline", "/manifest.webmanifest", "/icon.svg"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((res) => {
      // Next marks all dynamic pages no-store, so we rely on the allowlist + cache wipe on logout instead of that header.
      if (res.ok && PUBLIC_PAGE.test(url.pathname)) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })
      .catch(() => caches.match(req).then((r) => r || caches.match("/offline"))));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || PRECACHE.includes(url.pathname)) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })));
  }
});
