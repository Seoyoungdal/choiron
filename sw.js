const CACHE = "choiron-shell-2.0.0";
const FILES = ["./", "./index.html", "./styles.css", "./app.js", "./api.js", "./demo.js", "./domain.js", "./calendar.js", "./reports.js", "./excel.js", "./config.js", "./manifest.webmanifest", "./assets/icon.svg", "./assets/icon-192.png", "./assets/icon-512.png", "./vendor/exceljs.min.js"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("choiron-shell-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== self.location.origin || !u.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  const path = u.pathname.slice(new URL(self.registration.scope).pathname.length);
  if (!FILES.some((f) => f.slice(2) === path) && e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request).then((r) => r || (e.request.mode === "navigate" ? caches.match("./index.html") : Response.error()))));
});
