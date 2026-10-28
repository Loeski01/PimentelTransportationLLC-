"use strict";
const CACHE = "pimentel-driver-static-v1";
const ASSETS = ["/conductores/offline.html", "/conductores/icon-192.png", "/conductores/icon-512.png"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener("activate", event => event.waitUntil((async()=>{
  for (const key of await caches.keys())
    if (key.startsWith("pimentel-driver-static-") && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  // Never store login HTML, credentials, API responses or passenger/trip information.
  if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
  } else if (event.request.mode === "navigate" && url.pathname.startsWith("/conductores/")) {
    event.respondWith(fetch(event.request).catch(() => caches.match("/conductores/offline.html")));
  }
});
