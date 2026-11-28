// Yönetim panelinin tek betiği (Faz 93): Uyarılar sayfasında bu cihazı push bildirimine abone eder.
// Sosyal bölümün servis işçisi (/sw.js) kullanılır; push gelince önce /yonetim/push-ozet'e sorar.
// Betik yoksa ya da tarayıcı desteklemiyorsa düğmeler gizli kalır, sayfanın geri kalanı betiksiz çalışır.
;(() => {
  const kutu = document.getElementById('uyari-cihaz')
  if (!kutu) return
  const ac = kutu.querySelector('.uyari-ac')
  const kapat = kutu.querySelector('.uyari-kapat')
  const not = kutu.querySelector('.uyari-not')
  const destek = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!destek) return

  const yaz = (metin) => { not.textContent = metin }
  const anahtarCoz = (b64) => {
    const duz = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4))
    return Uint8Array.from(duz, (c) => c.charCodeAt(0))
  }
  const gonder = (adres, endpoint) => fetch(adres, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ endpoint }),
  }).then((r) => { if (!r.ok) throw new Error(`Sunucu ${r.status}`) })

  async function kayit() {
    return navigator.serviceWorker.register('/sw.js')
  }

  async function goster() {
    const sw = await kayit()
    const abonelik = await sw.pushManager.getSubscription()
    // Abonelik sosyal bölümle ortak olabilir: yönetimde kayıtlı mı, sunucuya sorulur.
    const kayitli = abonelik && (await (await fetch('/yonetim/push-durum', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ endpoint: abonelik.endpoint }),
    })).text()) === '1'
    ac.hidden = kayitli
    kapat.hidden = !kayitli
    yaz(kayitli ? 'Bu cihaz uyarı alıyor.' : Notification.permission === 'denied' ? 'Tarayıcı bildirim iznini reddetmiş; ayarlardan açman gerekiyor.' : 'Bu cihaz uyarı almıyor.')
  }

  ac.addEventListener('click', async () => {
    ac.disabled = true
    try {
      if ((await Notification.requestPermission()) !== 'granted') return yaz('İzin verilmedi.')
      const sw = await kayit()
      let abonelik = await sw.pushManager.getSubscription()
      if (!abonelik) {
        const anahtar = await (await fetch('/yonetim/push-anahtar', { credentials: 'same-origin' })).text()
        abonelik = await sw.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: anahtarCoz(anahtar.trim()) })
      }
      await gonder('/yonetim/push-kayit', abonelik.endpoint)
      await goster()
    } catch (err) {
      console.warn('Uyarı aboneliği açılamadı', err)
      yaz('Açılamadı. Tarayıcı bu servisi desteklemiyor olabilir.')
    } finally {
      ac.disabled = false
    }
  })

  kapat.addEventListener('click', async () => {
    try {
      const sw = await kayit()
      const abonelik = await sw.pushManager.getSubscription()
      // Abonelik sosyal bölümle ortaktır: yalnızca yönetim kaydı silinir, cihaz sosyal bildirimleri almaya devam eder.
      if (abonelik) await gonder('/yonetim/push-sil', abonelik.endpoint)
      ac.hidden = false
      kapat.hidden = true
      yaz('Bu cihaz artık yönetim uyarısı almıyor.')
    } catch (err) {
      console.warn('Uyarı aboneliği kapatılamadı', err)
      yaz('Kapatılamadı.')
    }
  })

  goster().catch((err) => {
    console.warn('Bildirim durumu okunamadı', err)
    ac.hidden = false
  })
})()
