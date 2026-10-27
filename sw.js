// Parked service worker: app works offline, map tiles near your car are kept.
const SHELL = 'parked-shell-v1';
const TILES = 'parked-tiles';
const FONTS = 'parked-fonts';
const TILE_LIMIT = 900;
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, TILES, FONTS].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (/^[a-d]\.basemaps\.cartocdn\.com$/.test(url.hostname)) { e.respondWith(tile(req)); return; }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { e.respondWith(font(req)); return; }
  if (url.origin === self.location.origin) { e.respondWith(shell(e, req)); }
});

// App files: answer from cache instantly, refresh in the background.
async function shell(e, req) {
  const cache = await caches.open(SHELL);
  const key = req.mode === 'navigate' ? './index.html' : req;
  const hit = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
  const net = fetch(req).then((res) => {
    if (res.ok && res.type === 'basic' && !res.redirected) cache.put(key, res.clone());
    return res;
  });
  if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
  try { return await net; }
  catch (err) { return (await cache.match('./index.html')) || new Response('Offline', { status: 503 }); }
}

// Map tiles: one cache key per tile regardless of a/b/c/d subdomain.
async function tile(req) {
  const key = req.url.replace(/^https:\/\/[a-d]\.basemaps/, 'https://a.basemaps');
  const cache = await caches.open(TILES);
  const hit = await cache.match(key);
  if (hit) return hit;
  try {
    const res = await fetch(key, { mode: 'cors', credentials: 'omit' });
    if (res.ok) { await cache.put(key, res.clone()); trim(cache); }
    return res;
  } catch (err) {
    try { return await fetch(req); } catch (err2) { return new Response('', { status: 504 }); }
  }
}

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length > TILE_LIMIT) {
    await Promise.all(keys.slice(0, keys.length - TILE_LIMIT).map((k) => cache.delete(k)));
  }
}

async function font(req) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  try {
    const res = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
    if (res.ok) cache.put(req.url, res.clone());
    return res;
  } catch (err) {
    try { return await fetch(req); } catch (err2) { return new Response('', { status: 504 }); }
  }
}
