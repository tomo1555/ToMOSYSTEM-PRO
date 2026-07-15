const CACHE_NAME = 'tomo-sys-v1.6';
const ASSETS = [
  './',
  './index.html',
  './icon.png',
  'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Yuji+Syuku&display=swap'
];

// インストール時にファイルをキャッシュに保存
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// アクティベート時に古いキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ネットワークがオフラインでもキャッシュから返す
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
