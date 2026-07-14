// Cambia VERSION en cada despliegue para forzar la actualización en Android/Chrome.
const VERSION = "mf-v1";
const ARCHIVOS = ["./", "./index.html", "./admin.html", "./db.js", "./manifest.json"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(k => Promise.all(k.filter(x => x !== VERSION).map(x => caches.delete(x))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // Firebase y fuentes: siempre a la red.
  if (url.origin !== location.origin) return;
  // Red primero para el HTML/JS propio (evita servir versiones viejas), caché de respaldo.
  e.respondWith(
    fetch(e.request)
      .then(r => { const copia = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request))
  );
});
