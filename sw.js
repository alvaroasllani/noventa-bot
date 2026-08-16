const CACHE_NAME = 'descargadornova-v7';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon.png',
  './data.json'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Skip cross-origin chrome-extension or external analytics
  if (!url.origin.includes(self.location.hostname)) return;

  // Network-First strategy: Siempre busca la versión más reciente en la red (GitHub/Vercel)
  // Si está offline, sirve la copia en caché de respaldo.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.status === 200) {
          const cacheCopy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, cacheCopy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
