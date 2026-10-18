// SOWESTIM service worker: precache shell + offline page; network-first for pages, cache-first for static assets. API calls are never cached.
const CACHE = "swim-v1";
const PRECACHE = ["/offline", "/manifest.webmanifest", "/icon.svg"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
// On logout the page asks us to drop cached navigations so a signed-out (or
// next) user on a shared device never sees another session's HTML.
self.addEventListener("message", (e) => {
  if (!e.data || e.data.type !== "CLEAR_PAGE_CACHE") return;
  e.waitUntil(caches.open(CACHE).then(async (c) => {
    const keys = await c.keys();
    await Promise.all(keys.map((req) => {
      const path = new URL(req.url).pathname;
      const keep = PRECACHE.includes(path) || path.startsWith("/_next/static/");
      return keep ? Promise.resolve(false) : c.delete(req);
    }));
  }));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); if (res.ok) caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then((r) => r || caches.match("/offline"))));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || PRECACHE.includes(url.pathname)) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })));
  }
});
