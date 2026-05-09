// nao_00 v2 — PWA assets served by the worker (manifest + service worker).
// Both are returned as plain strings; index.ts mounts them at /manifest.webmanifest and /sw.js.
//
// Service worker scope: served from /sw.js so default scope is "/", which covers /v2.
// We set `Service-Worker-Allowed: /` defensively in case the file ever moves.

export const MANIFEST_JSON = JSON.stringify({
  name: 'nao_00',
  short_name: 'nao_00',
  description: 'Naoufal’s personal AI council — ask, attach, speak.',
  start_url: '/v2',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#faf9f5',
  theme_color: '#c96442',
  lang: 'en',
  categories: ['productivity', 'lifestyle'],
  icons: [
    { src: '/v2/icons/icon-192.png',          sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/v2/icons/icon-512.png',          sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/v2/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/v2/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
}, null, 2)

// Service worker source. Bumped via CACHE_VERSION on each meaningful change.
// Strategy:
//   - shell (/v2, manifest, icons, fonts):   stale-while-revalidate (instant + freshness in background)
//   - GET API calls (/metrics/api-use,
//     /memory/me, /history):                 network-first, fall back to last cached response
//   - everything else:                       network-only (POST /council, POST /talk, etc.)
// Offline message: when the network is unreachable AND there is no cache, return a small JSON envelope
// so the v2 page can show a "you're offline" badge instead of a hard fetch error.
export const SERVICE_WORKER_JS = `// nao_00 v2 service worker
const CACHE_VERSION = 'v2-pwa-1';
const SHELL_CACHE = 'nao00-shell-' + CACHE_VERSION;
const API_CACHE   = 'nao00-api-'   + CACHE_VERSION;

const SHELL_URLS = [
  '/v2',
  '/manifest.webmanifest',
  '/v2/icons/icon-192.png',
  '/v2/icons/icon-512.png',
  '/v2/icons/icon-maskable-192.png',
  '/v2/icons/icon-maskable-512.png',
  '/v2/icons/apple-touch-icon.png',
  '/v2/icons/favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Best-effort — don't fail install if any individual asset fails.
    await Promise.allSettled(SHELL_URLS.map(u => cache.add(new Request(u, { cache: 'reload' }))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if (k !== SHELL_CACHE && k !== API_CACHE) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isShellRequest(url) {
  if (url.pathname === '/v2') return true;
  if (url.pathname === '/manifest.webmanifest') return true;
  if (url.pathname.startsWith('/v2/icons/')) return true;
  if (url.pathname.startsWith('/v2/')) return true;
  return false;
}

function isCachableApiGet(url, method) {
  if (method !== 'GET') return false;
  if (url.pathname === '/metrics/api-use') return true;
  if (url.pathname === '/memory/me') return true;
  if (url.pathname === '/history') return true;
  return false;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req, { ignoreVary: true });
  const fetchPromise = fetch(req).then(res => {
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);
  if (cached) return cached;
  const live = await fetchPromise;
  if (live) return live;
  // Last resort: serve cached /v2 shell so the app launches even with no network and no cache match.
  const shell = await cache.match('/v2');
  if (shell) return shell;
  return new Response('offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
}

async function networkFirstWithCache(req) {
  const cache = await caches.open(API_CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response(JSON.stringify({ ok: false, code: 'offline', error: 'no network and no cached copy' }), {
      status: 503, headers: { 'Content-Type': 'application/json' }
    });
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' && req.method !== 'HEAD') return; // POST goes straight to the network
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // skip cross-origin (fonts.googleapis is cached by browser HTTP cache)
  if (isShellRequest(url)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (isCachableApiGet(url, req.method)) {
    event.respondWith(networkFirstWithCache(req));
    return;
  }
});
`
