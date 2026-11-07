/* Little Feed offline service worker (no web app manifest required). */
const CACHE_NAME = 'little-feed-shell-v2';
const SCOPE_URL = self.registration.scope;
const INDEX_URL = new URL('index.html', SCOPE_URL).href;
const SHELL_URLS = [SCOPE_URL, INDEX_URL];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(SHELL_URLS.map(async url => {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (response.ok) await cache.put(url, response);
      } catch (_) {
        // Keep installation resilient when the network is temporarily unavailable.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('little-feed-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          await cache.put(request, response.clone());
          if (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')) {
            await cache.put(SCOPE_URL, response.clone());
            await cache.put(INDEX_URL, response.clone());
          }
        }
        return response;
      } catch (_) {
        return (await cache.match(request))
          || (await cache.match(SCOPE_URL))
          || (await cache.match(INDEX_URL))
          || new Response('Little Feed is not available offline yet. Open it online once first.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
      }
    })());
    return;
  }

  // Cache same-origin static resources on first use and serve them offline later.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok) await cache.put(request, response.clone());
      return response;
    } catch (_) {
      return new Response('Offline and this resource is not cached.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});
