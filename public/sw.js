// Keeps the app working offline. Uses the network first so updates show straight away,
// and falls back to the saved copy when there's no signal.
const CACHE = 'dt-v1';
const SHELL = [
  '/', '/index.html', '/css/app.css', '/js/config.js', '/vendor/supabase.js',
  '/js/app.js', '/js/db.js', '/js/model.js', '/js/sync.js', '/js/lock.js', '/js/ui.js', '/js/sum.js', '/js/charts.js', '/js/export.js',
  '/js/views/today.js', '/js/views/sessions.js', '/js/views/bp.js', '/js/views/supplies.js', '/js/views/reports.js', '/js/views/settings.js',
  '/fonts/ahn-400.woff2', '/fonts/ahn-600.woff2', '/fonts/ahn-800.woff2',
  '/icons/icon.svg', '/icons/icon-192.png', '/manifest.webmanifest',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Supabase calls go straight to the network
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(e.request);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(e.request, { ignoreSearch: true }) || (e.request.mode === 'navigate' ? await cache.match('/index.html') : null);
      if (hit) return hit;
      throw err;
    }
  })());
});
