/*
  Deliberately minimal service worker: it exists to make CoNest installable
  and to keep the app shell loading on a flaky signal. It does NOT cache any
  application data.

  That restriction is a privacy decision, not an oversight. Everything of
  substance here — the schedule, the kids, later the money — comes from
  Supabase over authenticated requests. Caching those responses would leave
  family data sitting in a cache that outlives sign-out. So we only ever
  cache same-origin static build assets, and every request that could carry
  data goes straight to the network.
*/

const CACHE = "conest-shell-v1";
const PRECACHE = ["/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function isCacheableAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/"))
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!isCacheableAsset(url)) return; // everything else: untouched, straight to network.

  // Immutable hashed build assets — cache-first is safe and fast.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
