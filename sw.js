const CACHE_NAME = 'voxpaper-v1';
const ASSETS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.map((key) => { if (key !== CACHE_NAME) return caches.delete(key); })
  )));
  self.clients.claim();
});

// Interceptador de Áudio Compartilhado do WhatsApp
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(Response.redirect('/'));
    
    event.waitUntil(async function() {
      const formData = await event.request.formData();
      const audioFile = formData.get('audio');
      
      if (audioFile) {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clients) {
          client.postMessage({ type: 'SHARED_AUDIO', file: audioFile });
        }
      }
    }());
    return;
  }

  event.respondWith(caches.match(event.request).then((res) => res || fetch(event.request)));
});