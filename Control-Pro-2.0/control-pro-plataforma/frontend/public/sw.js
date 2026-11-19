/* Service worker de la app LURIMA: app instalable, arranque rápido y notificaciones push.
 *
 * - Navegación: primero la red (siempre la versión más reciente); sin conexión, la última página guardada.
 * - /assets/ (archivos con huella de la compilación, fotos y videos del catálogo): primero la caché.
 * - /api nunca se guarda: los datos son privados y deben estar al día.
 * - push: muestra el aviso; al tocarlo enfoca una ventana abierta de la app o abre una nueva en la página del aviso.
 */
const VERSION = 'v3';
const CACHE_PAGINAS = `cp-paginas-${VERSION}`;
const CACHE_RECURSOS = `cp-recursos-${VERSION}`;
const MAX_RECURSOS = 400;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_PAGINAS).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icons/icono-192.png'])).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const vigentes = new Set([CACHE_PAGINAS, CACHE_RECURSOS]);
    for (const nombre of await caches.keys()) if (nombre.startsWith('cp-') && !vigentes.has(nombre)) await caches.delete(nombre);
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

async function recortar(cache) {
  const llaves = await cache.keys();
  for (let i = 0; i < llaves.length - MAX_RECURSOS; i++) await cache.delete(llaves[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api')) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const r = (await e.preloadResponse) || (await fetch(req));
        if (r.ok) { const c = await caches.open(CACHE_PAGINAS); c.put('/', r.clone()); }
        return r;
      } catch {
        return (await caches.match('/', { cacheName: CACHE_PAGINAS })) || Response.error();
      }
    })());
    return;
  }

  // Los videos se piden por rangos: el navegador los maneja mejor sin intermediario.
  if (url.pathname.startsWith('/assets/') && !req.headers.has('range')) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE_RECURSOS);
      const guardada = await c.match(req);
      if (guardada) return guardada;
      const r = await fetch(req);
      if (r.ok && r.status === 200) { c.put(req, r.clone()).then(() => recortar(c)); }
      return r;
    })());
  }
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { cuerpo: e.data && e.data.text() }; }
  const titulo = d.titulo || 'LURIMA';
  // Las ventanas abiertas de la app se actualizan al instante (sin esperar su siguiente consulta).
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((vs) => vs.forEach((v) => v.postMessage({ tipo: 'actividad' }))));
  e.waitUntil(self.registration.showNotification(titulo, {
    body: d.cuerpo || '',
    icon: '/icons/icono-192.png',
    badge: '/icons/insignia-96.png',
    tag: d.etiqueta || undefined,
    renotify: !!d.etiqueta,
    lang: 'es-MX',
    timestamp: Date.now(),
    data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const propia = ventanas.find((v) => new URL(v.url).origin === self.location.origin);
    if (propia) {
      await propia.focus();
      // La app navega dentro del enrutador (sin recargar ni perder la sesión en memoria).
      propia.postMessage({ tipo: 'navegar', url: destino });
      return;
    }
    await self.clients.openWindow(destino);
  })());
});
