// 离线缓存：先用缓存秒开，同时后台悄悄更新，下次打开就是新版本
// 发布新版本时，把 CACHE 的版本号 +1
const CACHE = 'zombie-outpost-v7';
const ASSETS = [
  './', './index.html', './style.css', './manifest.webmanifest',
  './js/main.js', './js/data.js', './js/save.js', './js/battle.js', './js/base.js', './js/util.js', './js/sfx.js',
  './js/story.js', './js/models.js', './js/env.js',
  './vendor/three.module.min.js', './vendor/GLTFLoader.js', './vendor/SkeletonUtils.js', './vendor/utils/BufferGeometryUtils.js',
  // 注意：models/*.glb 不在预缓存清单里（公开仓库不带模型），有的话首次加载时会被自动缓存
  // 写实场景素材（Poly Haven，CC0）
  './assets/env/ammo_box.glb', './assets/env/barrel_03.glb', './assets/env/concrete_road_barrier.glb', './assets/env/covered_car.glb', './assets/env/medical_box.glb', './assets/env/metal_jerrycan.glb', './assets/env/old_military_crate.glb', './assets/env/old_tyre.glb', './assets/env/portable_generator.glb', './assets/env/propane_tank.glb', './assets/env/street_lamp_01.glb', './assets/env/utility_box_01.glb', './assets/env/wooden_crate_02.glb', './assets/tex/asphalt_02_diff.jpg', './assets/tex/asphalt_02_nor.jpg', './assets/tex/brick_wall_001_diff.jpg', './assets/tex/brick_wall_001_nor.jpg', './assets/tex/brown_mud_diff.jpg', './assets/tex/brown_mud_leaves_01_diff.jpg', './assets/tex/brown_mud_leaves_01_nor.jpg', './assets/tex/brown_mud_nor.jpg', './assets/tex/brown_planks_05_diff.jpg', './assets/tex/brown_planks_05_nor.jpg', './assets/tex/concrete_block_wall_diff.jpg', './assets/tex/concrete_block_wall_nor.jpg', './assets/tex/concrete_brick_wall_001_diff.jpg', './assets/tex/concrete_brick_wall_001_nor.jpg', './assets/tex/concrete_floor_01_diff.jpg', './assets/tex/concrete_floor_01_nor.jpg', './assets/tex/concrete_tiles_diff.jpg', './assets/tex/concrete_tiles_nor.jpg', './assets/tex/corrugated_iron_diff.jpg', './assets/tex/corrugated_iron_nor.jpg', './assets/tex/green_metal_rust_diff.jpg', './assets/tex/green_metal_rust_nor.jpg', './assets/tex/rusted_shutter_diff.jpg', './assets/tex/rusted_shutter_nor.jpg', './assets/tex/rust_coarse_01_diff.jpg', './assets/tex/rust_coarse_01_nor.jpg',
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
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (/\/(tools|_model_research|models_src)\//.test(url.pathname)) return; // 开发用的文件不缓存
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
