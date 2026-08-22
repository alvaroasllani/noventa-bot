const CACHE_NAME = 'descargadornova-v9';
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

  // Skip cross-origin chrome-extension or external requests
  if (!url.origin.includes(self.location.hostname)) return;

  // Stale-While-Revalidate for app static assets, Network-First for data.json
  const isDataJson = url.pathname.endsWith('data.json');

  if (isDataJson) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res && res.status === 200) {
            const cacheCopy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, cacheCopy));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then((cachedRes) => {
        const fetchPromise = fetch(e.request)
          .then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              const cacheCopy = networkRes.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(e.request, cacheCopy));
            }
            return networkRes;
          })
          .catch(() => cachedRes);

        return cachedRes || fetchPromise;
      })
    );
  }
});
