const CACHE_NAME = 'lukfook-smart-quote-demo-v2';
const APP_SHELL = [
  './',
  './index.html',
  './smart-quote.html',
  './main-tool.html',
  './discount-scenarios.html',
  './profit-estimator-v1.html',
  './manifest.webmanifest',
  './icon.svg',
  './logo.png',
  './assets/css/app.css',
  './assets/js/common.js',
  './assets/js/smart-quote.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok && response.type !== 'error') await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type !== 'error') {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (url.hostname === 'lukfook-goldprice-proxy.arwing28.workers.dev') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  if (url.origin !== self.location.origin) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request).catch(() => caches.match('./index.html')));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});
