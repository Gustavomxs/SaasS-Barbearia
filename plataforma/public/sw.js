/* R10 — service worker do painel /agenda: deixa instalar como app e mostra as notificações */
const CACHE = "r10-agenda-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/agenda", "/icones/r10-192.png"])).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// rede primeiro (agenda sempre atual); sem internet, abre a última versão salva da tela
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || !u.pathname.startsWith("/agenda")) return;
  e.respondWith(fetch(e.request).then((r) => {
    const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
    return r;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match("/agenda"))));
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { corpo: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.titulo || "Novo Agendamento - R10", {
    body: d.corpo || "Você tem um novo horário.",
    icon: "/icones/r10-192.png",
    badge: "/icones/r10-96.png",
    tag: d.tag || "r10",
    renotify: true,
    vibrate: [120, 60, 120],
    data: { url: d.url || "/agenda" }
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const alvo = (e.notification.data && e.notification.data.url) || "/agenda";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
    const aberta = lista.find((c) => new URL(c.url).pathname.startsWith("/agenda"));
    return aberta ? aberta.focus() : self.clients.openWindow(alvo);
  }));
});
