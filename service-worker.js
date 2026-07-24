// Service worker minimal : ne fait pas de cache agressif (les données viennent
// toujours d'Apps Script en direct), il sert juste à remplir la condition
// technique d'installabilité PWA sur Android/Chrome.
const CACHE_NAME = 'zsdaa-shell-v1';
const SHELL_FILES = ['./', './index.html', './styles.css', './app-core.js', './config.js', './transport-jsonp.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Stratégie "réseau d'abord" : on veut toujours les données à jour ; le cache
// ne sert que de secours hors-ligne pour la coquille de l'application.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
