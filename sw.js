/* Service Worker - 鐝富浠诲伐浣滃彴 PWA */
const CACHE_NAME = 'class-manager-v2.3.12';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon_192.png',
  './icon_512.png',
  './data.json'
];

// 瀹夎锛氶缂撳瓨鏍稿績璧勬簮
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// 婵€娲伙細娓呯悊鏃х紦瀛?self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// 鎷︽埅璇锋眰
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 璺宠繃闈?GET 璇锋眰
  if (event.request.method !== 'GET') return;

  // 浜戝悓姝?API锛圙itHub锛変笉缂撳瓨锛岃蛋缃戠粶
  if (url.hostname === 'api.github.com' || url.hostname === 'raw.githubusercontent.com') {
    return;
  }

  // 瀵艰埅璇锋眰锛坕ndex.html锛夛細缃戠粶浼樺厛锛屼繚璇佹柊鐗堟湰浠ｇ爜绔嬪嵆鐢熸晥
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // data.json 涓庡浘鐗囧悓姝ユ枃浠讹細缃戠粶浼樺厛锛屽け璐ュ洖閫€缂撳瓨
  if (url.pathname.endsWith('data.json') || url.pathname.endsWith('.txt')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 闈欐€佽祫婧愶細缂撳瓨浼樺厛锛屽悗鍙版洿鏂?  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
