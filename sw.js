/* Cache do app para funcionar sem internet.
   Estratégia: mostra a versão salva na hora e atualiza em segundo plano
   (uma atualização publicada aparece na segunda vez que o app é aberto). */
const CACHE = 'orlando2027-v3';
const SHELL = ['./', './index.html', './bootstrap.min.css', './app.css', './supabase.js', './config.js', './dados.js', './ingles.js', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (req.method !== 'GET' || (url.origin !== self.location.origin && !isFont)) return; // Supabase vai direto à rede
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(req, {ignoreSearch: req.mode === 'navigate'});
    const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => cached);
    return cached || net;
  }));
});
