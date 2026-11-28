// Sosyal bölümün servis işçisi (Faz 66). Yalnızca stil, betik ve ikonu önbellekler;
// sayfalar kişiye özel olduğu için her zaman ağdan gelir, ağ yoksa çevrimdışı notu çıkar.
const ONBELLEK = 'grup-v3'
const STATIK = ['/ikon-192.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(ONBELLEK).then((c) => c.addAll(STATIK)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((adlar) => Promise.all(adlar.filter((a) => a !== ONBELLEK).map((a) => caches.delete(a))))
    .then(() => self.clients.claim()))
})

const CEVRIMDISI = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bağlantı yok</title><body style="font:16px system-ui;padding:40px 20px;text-align:center;background:#f3f1ec;color:#22252a">
<h1 style="font-size:20px">Bağlantı yok</h1><p>İnternet gelince sayfayı yenile.</p></body>`

self.addEventListener('fetch', (e) => {
  const istek = e.request
  if (istek.method !== 'GET') return
  const url = new URL(istek.url)
  if (url.origin !== location.origin) return

  if (/\.(css|js|png)$/.test(url.pathname) && !url.pathname.startsWith('/s/')) {
    e.respondWith(caches.open(ONBELLEK).then(async (c) => {
      const eldeki = await c.match(istek)
      if (eldeki) return eldeki
      const yanit = await fetch(istek)
      if (yanit.ok) c.put(istek, yanit.clone())
      return yanit
    }))
    return
  }
  if (istek.mode === 'navigate') {
    e.respondWith(fetch(istek).catch(() => new Response(CEVRIMDISI, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })))
  }
})

// Web Push (Faz 67): push gövdesiz gelir, metin panelden çekilir. Oturum yoksa ya da
// istek düşerse genel bir bildirim gösterilir: tarayıcı sessiz push'u cezalandırır.
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let ozet = { baslik: 'Yeni bildirim', metin: 'Açıp bak.', adres: '/s' }
    // Önce yönetim uyarısı sorulur (Faz 93): yalnızca yönetim oturumu ve görülmemiş uyarı varsa JSON döner.
    for (const adres of ['/yonetim/push-ozet', '/s/push-ozet']) {
      try {
        const yanit = await fetch(adres, { credentials: 'same-origin', cache: 'no-store' })
        if (yanit.ok && (yanit.headers.get('content-type') || '').includes('json')) {
          ozet = await yanit.json()
          break
        }
      } catch (err) {
        console.warn('Bildirim özeti alınamadı', adres, err)
      }
    }
    await self.registration.showNotification(ozet.baslik, {
      body: ozet.metin, icon: '/ikon-192.png', badge: '/ikon-192.png',
      tag: ozet.etiket || 'genel', renotify: true, data: { adres: ozet.adres || '/s' },
    })
  })())
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const adres = new URL(e.notification.data?.adres || '/s', location.origin).href
  e.waitUntil((async () => {
    const pencereler = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const acik = pencereler.find((p) => p.url.startsWith(location.origin))
    if (acik) {
      await acik.focus()
      return acik.navigate(adres)
    }
    return self.clients.openWindow(adres)
  })())
})
