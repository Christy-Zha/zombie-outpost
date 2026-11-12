// 离线缓存：先用缓存秒开，同时后台悄悄更新，下次打开就是新版本
// 发布新版本时，把 CACHE 的版本号 +1
const CACHE = 'zombie-outpost-v4';
const ASSETS = [
  './', './index.html', './style.css', './manifest.webmanifest',
  './js/main.js', './js/data.js', './js/save.js', './js/battle.js', './js/base.js', './js/util.js', './js/sfx.js',
  './vendor/three.module.min.js',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); // cache:'reload' 绕过浏览器 HTTP 缓存，确保拿到最新文件
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => hit);
    if (hit) { e.waitUntil(net); return hit; }
    return net;
  }));
});
