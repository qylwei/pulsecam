const CACHE = 'pulsecam-shell-v20261105-llm-v1';
const ASSETS = ['/', '/index.html', '/mobile.css', '/app.js', '/face-scan.js', '/scan-engine.js', '/pulse.js', '/ai-chat.js', '/breathing.js', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon-180.png'];
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) return;
  event.respondWith(
    fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
