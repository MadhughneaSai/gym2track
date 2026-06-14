// Stale-while-revalidate: instant offline launches, refreshes itself in the background.
const CACHE = 'workout-v19';
const ASSETS = [
  '.', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/state.js', 'js/exercises.js', 'js/icons.js',
  'js/log.js', 'js/history.js', 'js/progress.js', 'js/cloud.js', 'js/settings.js', 'js/coach.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fresh = fetch(e.request)
        .then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});
