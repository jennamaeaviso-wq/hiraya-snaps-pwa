const VERSION = 'hiraya-pwa-v1';
const SHELL_CACHE = VERSION + '-shell';
const RUNTIME_CACHE = VERSION + '-runtime';
const SHELL_FILES = ['./', './index.html', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png'];
const FIREBASE_SCRIPTS = [
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-database-compat.js'
];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL_FILES.map(async path => {
      try { const response = await fetch(path, {cache:'reload'}); if (response.ok) await cache.put(path, response); } catch (_) {}
    }));
    // Warm the Firebase SDK cache while online so the app shell can still open offline later.
    const runtime = await caches.open(RUNTIME_CACHE);
    await Promise.all(FIREBASE_SCRIPTS.map(async url => {
      try { const response = await fetch(url, {mode:'no-cors', cache:'reload'}); if (response) await runtime.put(url, response); } catch (_) {}
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('hiraya-pwa-') && key !== SHELL_CACHE && key !== RUNTIME_CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return; // Never cache Firebase writes, payments, or other mutations.
  const url = new URL(req.url);
  if (FIREBASE_SCRIPTS.includes(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(req) || await cache.match(url.href);
      if (cached) { fetch(req).then(response => { if (response && (response.ok || response.type === 'opaque')) cache.put(req, response.clone()); }).catch(() => {}); return cached; }
      try { const response = await fetch(req); if (response && (response.ok || response.type === 'opaque')) cache.put(req, response.clone()); return response; }
      catch (_) { return new Response('Firebase SDK is not cached yet. Connect to the internet and reload Hiraya Snaps once.', {status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}}); }
    })());
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try { const response = await fetch(req); const cache = await caches.open(SHELL_CACHE); cache.put('./index.html', response.clone()); return response; }
      catch (_) { return (await caches.match(req)) || (await caches.match('./index.html')) || (await caches.match('./')); }
    })());
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try { const response = await fetch(req); if (response && response.ok) { const cache = await caches.open(RUNTIME_CACHE); cache.put(req, response.clone()); } return response; }
    catch (_) { return new Response('', {status:504,statusText:'Offline'}); }
  })());
});
