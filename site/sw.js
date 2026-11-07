/*
 * Service worker: lets the app open with no connection, using the last copy of each page and script.
 * Network first, so a normal visit always gets the newest code. It never touches /api/ (live data, login,
 * brand lookups), so it cannot serve stale numbers or someone else's data.
 */
const CACHE = 'db-shell-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') { const shell = await caches.match('/app.html', { ignoreSearch: true }); if (shell) return shell; }
      throw err;
    }
  })());
});
