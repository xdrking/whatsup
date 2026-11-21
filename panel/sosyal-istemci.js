// Sosyal bölümün tarayıcı tarafı (Faz 66, 67). Betik çalışmazsa her form yine normal
// gönderilir. Olaylar belgeye bağlıdır: kaydırınca gelen gönderilerde de çalışsın.
(() => {
  'use strict'

  const grup = document.body.dataset.grup || ''
  const DM_ARALIGI = 3000
  const SAYAC_ARALIGI = 30000
  const YENI_ARALIGI = 45000
  const HIKAYE_SURESI = 6000
  document.body.classList.add('js')

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Servis işçisi kurulamadı', err))
  }

  const istek = (adres, ayar = {}) => fetch(adres, { credentials: 'same-origin', ...ayar, headers: { 'X-Istemci': '1', ...(ayar.headers || {}) } })
  const parca = (html) => {
    const kap = document.createElement('template')
    kap.innerHTML = html
    return kap.content
  }

  // Sonuç şeridi birkaç saniye sonra kaybolur.
  for (const s of document.querySelectorAll('.bildirim-serit')) setTimeout(() => s.classList.add('gidiyor'), 4000)

  // Yazı kutusu yazdıkça uzar; Ctrl/Cmd+Enter gönderir.
  document.addEventListener('input', (e) => {
    if (e.target.matches('textarea')) {
      e.target.style.height = 'auto'
      e.target.style.height = `${Math.min(e.target.scrollHeight, 400)}px`
    }
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.matches('textarea')) {
      e.preventDefault()
      e.target.form?.requestSubmit()
    }
  })

  // Foto önizleme: seçilen dosya formun .onizleme kutusunda görünür.
  document.addEventListener('change', (e) => {
    const girdi = e.target
    if (!girdi.matches('input[type=file]')) return
    const form = girdi.form
    if (girdi.classList.contains('hemen-gonder')) {
      if (girdi.files.length) form.submit()
      return
    }
    const kutu = form.querySelector('.onizleme')
    const etiket = girdi.closest('.foto-sec')
    etiket?.classList.toggle('secildi', girdi.files.length > 0)
    if (!kutu) return
    kutu.replaceChildren()
    kutu.hidden = !girdi.files.length
    if (!girdi.files.length) return
    const resim = document.createElement('img')
    resim.src = URL.createObjectURL(girdi.files[0])
    const kaldir = document.createElement('button')
    kaldir.type = 'button'
    kaldir.textContent = 'Kaldır'
    kaldir.addEventListener('click', () => {
      girdi.value = ''
      kutu.hidden = true
      kutu.replaceChildren()
      etiket?.classList.remove('secildi')
    })
    kutu.append(resim, kaldir)
  })

  async function tepkiGonder(form, tepki) {
    const veri = new URLSearchParams(new FormData(form))
    veri.set('tepki', tepki)
    const yanit = await istek(form.action, { method: 'POST', body: veri })
    if (!yanit.ok) throw new Error(String(yanit.status))
    const eski = form.closest('.eylem')
    const yeni = parca(await yanit.text()).firstElementChild
    if (yeni) {
      eski.replaceWith(yeni)
      yeni.querySelector('.tepki-ana')?.classList.add('zipla')
    }
  }

  document.addEventListener('submit', async (e) => {
    const form = e.target

    // Tepki: sayfa yenilenmeden verilir; sunucu güncel tepki çubuğunu döner.
    if (form.matches('.tepki-form')) {
      e.preventDefault()
      const tepki = e.submitter?.value || '❤️'
      try {
        await tepkiGonder(form, tepki)
      } catch (err) {
        console.warn('Tepki gönderilemedi', err)
        form.submit()
      }
      return
    }

    // Yorum: yeni yorum listeye eklenir, sayfa yenilenmez.
    if (form.matches('.yorum-yaz')) {
      e.preventDefault()
      const girdi = form.querySelector('input[name=metin]')
      if (!girdi.value.trim()) return
      girdi.disabled = true
      try {
        const yanit = await istek(form.action, { method: 'POST', body: new URLSearchParams(new FormData(form)) })
        if (!yanit.ok) throw new Error(String(yanit.status))
        form.previousElementSibling?.append(parca(await yanit.text()))
        girdi.value = ''
      } catch (err) {
        console.warn('Yorum gönderilemedi', err)
        girdi.disabled = false
        form.submit()
        return
      }
      girdi.disabled = false
      girdi.focus()
    }
  })

  // "Yorum" düğmesi aynı sayfadaki yorum kutusuna odaklanır.
  document.addEventListener('click', (e) => {
    const bag = e.target.closest('.yorum-ac')
    const girdi = bag?.closest('.gonderi')?.querySelector('.yorum-yaz input[name=metin]')
    if (!girdi) return
    e.preventDefault()
    girdi.focus()
  })

  // Tepki seçici: dışarı tıklayınca kapanır, aynı anda tek seçici açık kalır.
  document.addEventListener('click', (e) => {
    for (const d of document.querySelectorAll('.tepki-sec[open]')) if (!d.contains(e.target)) d.open = false
  })

  // Fotoğraf büyütme kutusu; çift dokunuş ❤️ verir.
  const kutu = document.createElement('div')
  kutu.className = 'buyutec'
  kutu.hidden = true
  kutu.innerHTML = '<button type="button" aria-label="Kapat">✕</button><img alt="">'
  document.body.append(kutu)
  const kapat = () => { kutu.hidden = true; kutu.querySelector('img').removeAttribute('src') }
  kutu.addEventListener('click', kapat)
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !kutu.hidden) kapat() })
  let sonDokunus = 0
  let tekZamanlayici = 0
  document.addEventListener('click', (e) => {
    const bag = e.target.closest('a.gorsel, .dm a:has(img)')
    if (!bag) return
    e.preventDefault()
    const simdi = Date.now()
    const form = bag.closest('.gonderi')?.querySelector('.tepki-form')
    if (form && simdi - sonDokunus < 300) {
      clearTimeout(tekZamanlayici)
      sonDokunus = 0
      const kalp = document.createElement('span')
      kalp.className = 'kalp-patla'
      kalp.textContent = '❤️'
      bag.append(kalp)
      setTimeout(() => kalp.remove(), 900)
      const ana = form.querySelector('.tepki-ana')
      if (!ana.classList.contains('acik')) tepkiGonder(form, '❤️').catch((err) => console.warn('Tepki gönderilemedi', err))
      return
    }
    sonDokunus = simdi
    tekZamanlayici = setTimeout(() => {
      kutu.querySelector('img').src = bag.href
      kutu.hidden = false
    }, form ? 300 : 0)
  })

  // Sonsuz kaydırma: "Daha eski" bağlantısı görünür olunca sonraki sayfa yerinde yüklenir.
  const daha = document.querySelector('a.daha')
  const akis = document.querySelector('.akis')
  if (daha && akis && 'IntersectionObserver' in window) {
    let yukleniyor = false
    const gozcu = new IntersectionObserver(async ([g]) => {
      if (!g.isIntersecting || yukleniyor) return
      yukleniyor = true
      try {
        const u = new URL(daha.href)
        const yol = u.pathname === '/s/etiket' ? '/s/akis-parca' : u.pathname === '/s' ? '/s/akis-parca' : ''
        if (!yol) return
        const yanit = await istek(`${yol}${u.search}`)
        if (!yanit.ok) throw new Error(String(yanit.status))
        akis.append(parca(await yanit.text()))
        const sonraki = yanit.headers.get('X-Sonraki')
        if (sonraki && sonraki !== '0') {
          u.searchParams.set('once', sonraki)
          daha.href = u.pathname + u.search
        } else {
          gozcu.disconnect()
          daha.remove()
        }
      } catch (err) {
        console.warn('Gönderiler yüklenemedi', err)
        gozcu.disconnect()
      } finally {
        yukleniyor = false
      }
    }, { rootMargin: '600px' })
    gozcu.observe(daha)
  }

  // Yeni gönderi şeridi: akışın başındaki id'den yenisi varsa görünür.
  const yeniSerit = document.querySelector('.yeni-gonderi')
  if (yeniSerit && akis) {
    setInterval(async () => {
      if (document.hidden) return
      try {
        const yanit = await istek(`/s/yeni-sayi?grup=${encodeURIComponent(grup)}&son=${akis.dataset.ilk}`)
        const n = Number(await yanit.text())
        yeniSerit.hidden = !n
        yeniSerit.textContent = `${n} yeni gönderi ↑`
      } catch (err) {
        console.warn('Yeni gönderiler sorulamadı', err)
      }
    }, YENI_ARALIGI)
  }

  // DM: yeni mesajları birkaç saniyede bir sorar; gönderim sayfayı yenilemez.
  const dmAkis = document.querySelector('.dm-akis')
  if (dmAkis) {
    const asagi = () => { dmAkis.scrollTop = dmAkis.scrollHeight }
    asagi()
    let sorguda = false
    const yokla = async () => {
      if (sorguda || document.hidden) return
      sorguda = true
      try {
        const p = new URLSearchParams({ grup, ile: dmAkis.dataset.ile, son: dmAkis.dataset.son })
        const yanit = await istek(`/s/mesaj-yeni?${p}`)
        const html = yanit.ok ? await yanit.text() : ''
        if (html.trim()) {
          dmAkis.querySelector('.bos')?.remove()
          const yeniler = [...parca(html).children].filter((d) => !dmAkis.querySelector(`[data-id="${d.dataset.id}"]`))
          dmAkis.append(...yeniler)
          const son = yeniler.at(-1)
          if (son) dmAkis.dataset.son = son.dataset.id
          asagi()
        }
      } catch (err) {
        console.warn('Mesajlar alınamadı', err)
      } finally {
        sorguda = false
      }
    }
    setInterval(yokla, DM_ARALIGI)

    const form = document.querySelector('.dm-yaz')
    form?.addEventListener('submit', async (e) => {
      e.preventDefault()
      const veri = new FormData(form)
      const foto = veri.get('foto')
      if (!String(veri.get('metin') || '').trim() && !(foto instanceof File && foto.size)) return
      const dugme = form.querySelector('button')
      dugme.disabled = true
      try {
        const yanit = await istek(form.action, { method: 'POST', body: veri })
        if (!yanit.ok) throw new Error(String(yanit.status))
        form.reset()
        form.querySelector('.foto-sec')?.classList.remove('secildi')
        await yokla()
      } catch (err) {
        console.warn('Mesaj gönderilemedi', err)
      } finally {
        dugme.disabled = false
        form.querySelector('input[name=metin]').focus()
      }
    })
  }

  // Hikâye: süre dolunca sıradakine geçer, dokununca hemen geçer.
  const hikaye = document.querySelector('.hikaye-goster')
  if (hikaye) {
    const gec = () => { location.href = hikaye.dataset.sonraki }
    const zamanlayici = setTimeout(gec, HIKAYE_SURESI)
    hikaye.querySelector('img')?.addEventListener('click', () => {
      clearTimeout(zamanlayici)
      gec()
    })
    hikaye.querySelector('.izleyenler')?.addEventListener('toggle', () => clearTimeout(zamanlayici))
  }

  // Web Push aç/kapat (Faz 67). iPhone'da yalnızca ana ekrana eklenmiş uygulamada çalışır.
  const pushKutu = document.querySelector('.push-kutu')
  if (pushKutu && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
    const ac = pushKutu.querySelector('.push-ac')
    const kapa = pushKutu.querySelector('.push-kapat')
    const durum = pushKutu.querySelector('.push-durum')
    const anahtarCoz = (b64) => {
      const ham = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4))
      return Uint8Array.from(ham, (c) => c.charCodeAt(0))
    }
    const goster = (abone) => {
      ac.hidden = abone
      kapa.hidden = !abone
      if (Notification.permission === 'denied') {
        durum.textContent = 'Bildirim izni tarayıcı ayarlarından kapatılmış.'
        ac.hidden = true
      } else if (abone) durum.textContent = 'Bu cihaza bildirim geliyor.'
    }
    const kayit = new URLSearchParams()
    navigator.serviceWorker.ready.then(async (sw) => {
      pushKutu.hidden = false
      goster(Boolean(await sw.pushManager.getSubscription()))
      ac.addEventListener('click', async () => {
        ac.disabled = true
        try {
          if ((await Notification.requestPermission()) !== 'granted') return goster(false)
          const anahtar = await (await istek('/s/push-anahtar')).text()
          const abonelik = await sw.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: anahtarCoz(anahtar) })
          kayit.set('endpoint', abonelik.endpoint)
          const yanit = await istek('/s/push-kayit', { method: 'POST', body: kayit })
          if (!yanit.ok) {
            await abonelik.unsubscribe()
            throw new Error(String(yanit.status))
          }
          goster(true)
        } catch (err) {
          console.warn('Bildirim açılamadı', err)
          durum.textContent = 'Bildirim açılamadı. iPhone kullanıyorsan önce Paylaş › Ana Ekrana Ekle.'
        } finally {
          ac.disabled = false
        }
      })
      kapa.addEventListener('click', async () => {
        const abonelik = await sw.pushManager.getSubscription()
        if (abonelik) {
          kayit.set('endpoint', abonelik.endpoint)
          await istek('/s/push-sil', { method: 'POST', body: kayit }).catch((err) => console.warn('Abonelik silinemedi', err))
          await abonelik.unsubscribe()
        }
        durum.textContent = 'Bildirimler kapalı.'
        goster(false)
      })
    }).catch((err) => console.warn('Servis işçisi hazır değil', err))
  }

  // Menüdeki okunmamış sayıları tazeler.
  const sayacYaz = (bag, n) => {
    for (const a of document.querySelectorAll(`a[href^="/s/${bag}?"]`)) {
      let rozet = a.querySelector('.sayac')
      if (!Number(n)) {
        rozet?.remove()
        continue
      }
      if (!rozet) {
        rozet = document.createElement('span')
        rozet.className = 'sayac'
        a.append(rozet)
      }
      rozet.textContent = Number(n) > 99 ? '99+' : n
    }
  }
  if (grup) {
    setInterval(async () => {
      if (document.hidden) return
      try {
        const yanit = await istek(`/s/sayac?grup=${encodeURIComponent(grup)}`)
        if (!yanit.ok) return
        const [bildirim, dm] = (await yanit.text()).split(':')
        sayacYaz('bildirim', bildirim)
        sayacYaz('mesaj', dm)
      } catch (err) {
        console.warn('Sayaçlar alınamadı', err)
      }
    }, SAYAC_ARALIGI)
  }
})()
