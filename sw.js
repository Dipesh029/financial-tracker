/* My Finance PWA shell cache.
   Network-first for HTML so updates appear after deploy; offline falls back to cache. */
"use strict";
const CACHE = "myfinance-shell-v17";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("myfinance-shell-") && k !== CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll({ type: "window" }).then((clients) => {
          clients.forEach((c) => c.postMessage({ type: "SW_ACTIVATED", cache: CACHE }));
        })
      )
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isHTML =
    req.mode === "navigate" ||
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/index.html") ||
    (req.headers.get("accept") || "").includes("text/html");

  if (isHTML) {
    // Network first so a new deploy is visible; cache as offline fallback
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            caches.open(CACHE).then((c) => c.put("./index.html", response.clone()));
          }
          return response;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match("./index.html"))
        )
    );
    return;
  }

  // Other shell assets: cache first, then network
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return response;
        })
    )
  );
});
