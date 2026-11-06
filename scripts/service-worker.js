// The production build substitutes its asset list and content version here.
const CACHE = "ebt-web-__VERSION__";
const APP_SHELL = __ASSETS__;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("ebt-web-") && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  // Next.js RSC/prefetch responses must never overwrite the document shell.
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then((response) => {
      if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put("/", copy)));
      }
      return response;
    }).catch(async () => (await caches.match("/")) || new Response("Open EBT Web online once before using it offline.", { status: 503 })));
    return;
  }
  if (url.pathname === "/") return;
  // Only immutable build assets, local flags and OCR assets may be cached.
  if (!(APP_SHELL.includes(url.pathname) || url.pathname.startsWith("/ocr/") || url.pathname.startsWith("/flags/"))) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)));
    }
    return response;
  })));
});
