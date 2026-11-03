// Service worker : rend l'application installable (tablette / ordinateur) et
// garde la « coquille » de l'appli disponible hors ligne.
// Les données (Apps Script, polices Google) ne sont JAMAIS mises en cache ici :
// seules les requêtes de la même origine (fichiers de l'appli) sont gérées.
const CACHE_NAME = 'zsdaa-shell-v2';
const SHELL_FILES = [
  './', './index.html', './styles.css', './config.js', './transport-jsonp.js',
  './app-core.js', './pwa-install.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(SHELL_FILES)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// « Réseau d'abord » : on veut toujours la version à jour ; le cache ne sert
// que de secours quand il n'y a pas de connexion.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Apps Script, Google Fonts… : laissé au navigateur

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))
      )
  );
});
