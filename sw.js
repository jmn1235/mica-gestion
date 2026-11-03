/* Service worker mínimo: primero la red, y si no hay señal, la última copia guardada.
   Así cada publicación nueva en GitHub Pages se ve al instante. */
const CACHE = "mica-v16";
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Firebase, fuentes y APIs van directo
  e.respondWith(
    // cache: "no-cache" pregunta siempre al servidor si hay una versión nueva, aunque el
    // navegador tenga guardada una copia reciente (GitHub Pages la guarda 10 minutos).
    fetch(req, { cache: "no-cache" }).then(res => {
      const copia = res.clone();
      caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
      return res;
    }).catch(() => caches.match(req))
  );
});
