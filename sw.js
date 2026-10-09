// Offline cache for the game. Bump VERSION whenever index.html changes so phones pick up the update.
const VERSION = "v12";
const CACHE = "rope-assassin-" + VERSION;
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable.png", "./apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Open instantly from the cache, then fetch the latest copy in the background
// so the next launch uses it (stale-while-revalidate).
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const key = req.mode === "navigate" ? "./index.html" : req;
  e.respondWith(caches.open(CACHE).then((c) => c.match(key).then((hit) => {
    const fresh = fetch(req).then((r) => {
      if (r.ok && (req.url.startsWith(self.location.origin) || req.url.includes("fonts.g"))) c.put(key, r.clone());
      return r;
    }).catch(() => hit);
    if (hit) { e.waitUntil(fresh); return hit; }
    return fresh;
  })));
});
