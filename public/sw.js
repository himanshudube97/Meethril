// Hearth service worker — push reminders only (v2).
// Plain JS, no build step. Lives in public/ so it's served at /sw.js.

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let payload = { title: 'hearth', body: '' }
  try {
    payload = event.data.json()
  } catch (_) {
    payload.body = event.data ? event.data.text() : ''
  }

  // No icon/badge: previous paths (/icon-192.png, /icons/icon-192.png) don't
  // exist in public/, and on some browser+OS combos a missing icon silently
  // drops the whole notification. Re-add once real PNGs ship.
  event.waitUntil(
    self.registration.showNotification(payload.title || 'hearth', {
      body: payload.body || '',
      tag: 'meethril-reminder',
      renotify: true,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = '/write?write=1'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an existing Hearth tab if one is open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      // Otherwise open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(url)
      }
    })
  )
})
