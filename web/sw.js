// Offline shell for the installed app: always tries the network first so updates show at once;
// falls back to the last copy when offline. API calls are never cached.
const CACHE = 'escritorio-v1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css', 'img/logo-white.png', 'img/icon-192.png',
  'js/main.js', 'js/api.js', 'js/ui.js', 'js/scene.js', 'js/iso.js', 'js/avatars.js', 'js/life.js', 'js/dashboard.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); }
        return res;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match('index.html'))),
  );
});
