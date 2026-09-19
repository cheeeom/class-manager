/* Service Worker - 班主任工作台 PWA */
const CACHE_NAME = 'class-manager-v2.20.7';
// v2.20.7 移除 './data.json'：数据已搬到私有仓，站仓这份稍后会删除。
// 注意 addAll 是全成全败 —— 清单里只要有一个请求 404，整套预缓存就整体 reject，
// SW 安装直接失败（PWA 离线与后续缓存更新全废）。所以必须在删文件之前先摘掉它。
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon_192.png',
  './icon_512.png'
];

// 安装：预缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// 拦截请求
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 跳过非 GET 请求
  if (event.request.method !== 'GET') return;

  // 云同步 API（GitHub）不缓存，走网络
  if (url.hostname === 'api.github.com' || url.hostname === 'raw.githubusercontent.com') {
    return;
  }

  // 导航请求（index.html）：网络优先 + 绕过 HTTP 缓存（GitHub Pages max-age=600 会截胡默认 fetch）
  // → 每次刷新都真正联网，新版本立即生效；仍写 SW 缓存供离线回退
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 图片同步文件：网络优先，失败回退缓存
  // v2.20.7 起 data.json 不再出现在站点上（改走 api.github.com，文件头已 return 跳过），
  // 故摘掉这个特判：留着它只会让一次 404 响应被写进缓存。
  if (url.pathname.endsWith('.txt')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 静态资源：缓存优先，后台更新
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request, { cache: 'no-store' })
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
