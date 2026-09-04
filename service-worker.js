const CACHE_NAME = "raindogs-shell-v70";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./supabase-config.js?v=81", "./supabase-auth.js?v=87", "./supabase-data.js?v=112", "./push-client.js?v=85"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const isDocument = event.request.mode === "navigate" || event.request.destination === "document";
  const req = isDocument ? new Request(event.request.url, { cache: "no-store" }) : event.request;
  event.respondWith(fetch(req).catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html"))));
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { data = { body: event.data?.text() || "Yeni bildirim" }; }
  event.waitUntil(self.registration.showNotification(data.title || "RainDogs", {
    body: data.body || "Yeni bir bildirimin var.",
    icon: "./icon.svg",
    badge: "./icon.svg",
    tag: data.tag || "raindogs-notification",
    data: { url: data.url || "./" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./", self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url.startsWith(self.location.origin));
    if (existing) { existing.navigate(target); return existing.focus(); }
    return self.clients.openWindow(target);
  }));
});
