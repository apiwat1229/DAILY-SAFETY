/* Daily Safety service worker: offline app shell, cached assets and a small allow-list of read-only API data. */
const VERSION = 'v1'
const SHELL_CACHE = `ds-shell-${VERSION}`
const ASSET_CACHE = `ds-assets-${VERSION}`
const DATA_CACHE = `ds-data-${VERSION}`
const KEEP = [SHELL_CACHE, ASSET_CACHE, DATA_CACHE]

const SHELL_URLS = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png']
// Read-only endpoints that let the inspection form open without a connection.
const CACHEABLE_API = new Set(['/api/checklist', '/api/public/daily-inspection', '/api/suggestions', '/api/employees/directory'])

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('ds-') && !KEEP.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

// The app asks us to forget cached (possibly user-scoped) data when someone signs out.
self.addEventListener('message', (event) => {
  if (event.data === 'clear-data') event.waitUntil(caches.delete(DATA_CACHE))
  if (event.data === 'skip-waiting') self.skipWaiting()
})

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch (error) {
    const cached = await cache.match(request)
    if (cached) return cached
    if (fallbackUrl) {
      const shell = await (await caches.open(SHELL_CACHE)).match(fallbackUrl)
      if (shell) return shell
    }
    throw error
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const update = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone())
    return response
  }).catch(() => undefined)
  return cached || (await update) || Response.error()
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith('/api/')) {
    if (CACHEABLE_API.has(url.pathname)) event.respondWith(networkFirst(request, DATA_CACHE))
    return
  }
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL_CACHE, '/'))
    return
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE))
    return
  }
  if (/\.(?:png|svg|ico|webmanifest|woff2?)$/.test(url.pathname)) event.respondWith(staleWhileRevalidate(request, SHELL_CACHE))
})
