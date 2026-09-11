const CACHE = 'ghennai-v8'
const PRECACHE = ['./', './manifest.webmanifest', './favicon.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {})))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return
  if (request.url.includes('/api/') || request.url.includes('/uploads/')) return

  const isNav = request.mode === 'navigate'

  e.respondWith(
    (isNav
      ? fetch(request)
          .then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(request, copy))
            return res
          })
          .catch(() => caches.match(request))
      : caches.match(request).then((cached) => {
          const network = fetch(request)
            .then((res) => {
              if (res && res.ok) {
                const copy = res.clone()
                caches.open(CACHE).then((c) => c.put(request, copy))
              }
              return res
            })
            .catch(() => cached)
          return cached || network
        }))
  )
})