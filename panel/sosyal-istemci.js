// Sosyal bölümün tarayıcı tarafı (Faz 66, 67, 70). Betik çalışmazsa her form yine normal
// gönderilir. Olaylar belgeye bağlıdır: kaydırınca gelen gönderilerde de çalışsın.
(() => {
  'use strict'

  const grup = document.body.dataset.grup || ''
  const DM_ARALIGI = 3000
  const SAYAC_ARALIGI = 30000
  const YENI_ARALIGI = 45000
  const HIKAYE_SURESI = 6000
  // Sunucu "yazıyor"u son sinyalden 5 sn sonra düşürür; sinyal bundan sık gider.
  const YAZIYOR_ARALIGI = 2500
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

    // Anket oyu ve etkinlik katılımı: sunucu kartın güncel HTML'ini döner.
    if (form.matches('.anket, .etkinlik')) {
      e.preventDefault()
      const veri = new URLSearchParams(new FormData(form))
      if (e.submitter?.name) veri.set(e.submitter.name, e.submitter.value)
      try {
        const yanit = await istek(form.action, { method: 'POST', body: veri })
        if (!yanit.ok && yanit.status !== 409) throw new Error(String(yanit.status))
        const yeni = parca(await yanit.text()).firstElementChild
        if (yeni) form.replaceWith(yeni)
      } catch (err) {
        console.warn('Oy gönderilemedi', err)
        form.submit()
      }
      return
    }

    // Yorum, yanıt ve yorum tepkisi: sunucu yorum dalının güncel HTML'ini döner.
    // Yeni yorum listeye eklenir, yanıt ve tepki kendi dalını yeniler.
    if (form.matches('.yorum-yaz, .yanit-yaz, .yorum-tepki')) {
      e.preventDefault()
      const girdi = form.querySelector('input[name=metin]')
      if (girdi && !girdi.value.trim()) return
      const veri = new URLSearchParams(new FormData(form))
      if (e.submitter?.name === 'tepki') veri.set('tepki', e.submitter.value)
      if (girdi) girdi.disabled = true
      try {
        const yanit = await istek(form.action, { method: 'POST', body: veri })
        if (!yanit.ok) throw new Error(String(yanit.status))
        const dal = parca(await yanit.text()).firstElementChild
        if (form.matches('.yorum-yaz')) {
          form.previousElementSibling?.append(dal)
          girdi.value = ''
          girdi.disabled = false
          girdi.focus()
        } else {
          form.closest('.yorum-dal')?.replaceWith(dal)
          if (form.matches('.yanit-yaz')) dal.querySelector('.yanitlar li:last-child .yorum')?.classList.add('yeni')
          else dal.querySelector(`#c${veri.get('id')} .yorum-tepki .baglanti`)?.classList.add('zipla')
        }
      } catch (err) {
        console.warn('Yorum gönderilemedi', err)
        form.submit()
      }
    }
  })

  // "Yanıtla" açılınca kutuya odaklanır, imleç ön ekin sonuna gider.
  document.addEventListener('toggle', (e) => {
    if (!e.target.matches?.('.yanit-ac') || !e.target.open) return
    const girdi = e.target.querySelector('input[name=metin]')
    girdi.focus()
    girdi.setSelectionRange(girdi.value.length, girdi.value.length)
  }, true)

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

  // DM ve grup sohbeti: yeni mesajları, kimin yazdığını ve görüldü durumunu birkaç saniyede bir
  // sorar; gönderim sayfayı yenilemez.
  const dmAkis = document.querySelector('.dm-akis')
  if (dmAkis) {
    const sohbet = dmAkis.dataset.sohbet || ''
    const kanal = sohbet ? { sohbet } : { ile: dmAkis.dataset.ile }
    const durumYeri = document.querySelector('.dm-durum')
    const yaziyorYeri = document.querySelector('.yaziyor')
    const asagi = () => { dmAkis.scrollTop = dmAkis.scrollHeight }
    asagi()
    const sonBalonBenim = () => [...dmAkis.querySelectorAll('[data-id]')].at(-1)?.classList.contains('benim')
    let sorguda = false
    const yokla = async () => {
      if (sorguda || document.hidden) return
      sorguda = true
      try {
        const p = new URLSearchParams({ grup, son: dmAkis.dataset.son, ...(sohbet ? { id: sohbet } : kanal) })
        const yanit = await istek(`${sohbet ? '/s/sohbet-yeni' : '/s/mesaj-yeni'}?${p}`)
        if (!yanit.ok) return
        const veri = await yanit.json()
        if (veri.html.trim()) {
          dmAkis.querySelector('.bos')?.remove()
          const yeniler = [...parca(veri.html).children].filter((d) => !dmAkis.querySelector(`[data-id="${d.dataset.id}"]`))
          dmAkis.append(...yeniler)
          const son = yeniler.at(-1)
          if (son) dmAkis.dataset.son = son.dataset.id
          asagi()
        }
        if (yaziyorYeri) yaziyorYeri.textContent = veri.yaziyor
        if (durumYeri) {
          const benim = sonBalonBenim()
          durumYeri.textContent = !benim ? '' : sohbet ? veri.gorenler : Number(veri.goruldu) >= Number(dmAkis.dataset.son) ? 'Görüldü' : 'Gönderildi'
        }
      } catch (err) {
        console.warn('Mesajlar alınamadı', err)
      } finally {
        sorguda = false
      }
    }
    setInterval(yokla, DM_ARALIGI)

    const form = document.querySelector('.dm-yaz')
    // Yazarken karşı tarafa "yazıyor…" sinyali; boş kutu sinyal göndermez.
    let sonSinyal = 0
    form?.querySelector('input[name=metin]')?.addEventListener('input', (e) => {
      const simdi = Date.now()
      if (!e.target.value.trim() || simdi - sonSinyal < YAZIYOR_ARALIGI) return
      sonSinyal = simdi
      istek('/s/yaziyor', { method: 'POST', body: new URLSearchParams({ grup, ...kanal }) })
        .catch((err) => console.warn('Yazıyor sinyali gitmedi', err))
    })
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
        sonSinyal = 0
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
    // Yanıt yazan ya da tepki seçen kişinin elinden hikâye kaçmasın.
    const yanitFormu = hikaye.querySelector('.hikaye-yanit')
    for (const olay of ['focusin', 'pointerdown']) yanitFormu?.addEventListener(olay, () => clearTimeout(zamanlayici))
  }

  // --- Web Push ve kurulum (Faz 67, 68) -------------------------------------------
  // Tarayıcı izin penceresini ancak bir dokunuşla açar; bu yüzden izin şeridi düğmelidir.
  // iPhone'da push yalnızca ana ekrana eklenmiş uygulamada vardır, orada rehber çıkar.
  const pushVar = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const kurulu = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  const SONRA_MS = 3 * 24 * 3600 * 1000
  const sonraAl = (ad) => {
    try { return Number(localStorage.getItem(`sonra-${ad}`)) || 0 } catch { return 0 }
  }
  const sonraYaz = (ad) => {
    try { localStorage.setItem(`sonra-${ad}`, String(Date.now())) } catch (err) { console.warn('Tercih saklanamadı', err) }
  }
  const ertelendi = (ad) => Date.now() - sonraAl(ad) < SONRA_MS

  const anahtarCoz = (b64) => {
    const ham = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4))
    return Uint8Array.from(ham, (c) => c.charCodeAt(0))
  }
  const sunucuyaYaz = async (yol, endpoint) => {
    const yanit = await istek(yol, { method: 'POST', body: new URLSearchParams({ endpoint }) })
    if (!yanit.ok) throw new Error(`${yol} ${yanit.status}`)
  }
  /** İzin alınmışsa cihazı abone eder ve sunucuya yazar; abonelik zaten varsa yalnızca tazeler. */
  async function aboneOl() {
    const sw = await navigator.serviceWorker.ready
    let abonelik = await sw.pushManager.getSubscription()
    if (!abonelik) {
      const anahtar = await (await istek('/s/push-anahtar')).text()
      abonelik = await sw.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: anahtarCoz(anahtar) })
    }
    try {
      await sunucuyaYaz('/s/push-kayit', abonelik.endpoint)
    } catch (err) {
      await abonelik.unsubscribe()
      throw err
    }
    return abonelik
  }
  async function izinIste() {
    if ((await Notification.requestPermission()) !== 'granted') return false
    await aboneOl()
    return true
  }

  const serit = document.querySelector('.izin-serit')
  const kutuGoster = (sinif) => {
    if (!serit) return
    for (const k of serit.children) k.hidden = !k.classList.contains(sinif)
    serit.hidden = false
  }
  const seritKapat = () => { if (serit) serit.hidden = true }
  serit?.addEventListener('click', (e) => {
    const sonra = e.target.closest('.izin-sonra')
    if (!sonra) return
    sonraYaz(sonra.closest('.izin-push, .izin-yukle, .izin-ios').className)
    seritKapat()
  })

  let kurulumOlayi = null
  if (serit && !kurulu) {
    // Android Chrome ve masaüstü Chrome/Edge "yükle" olayını verir; Safari ve Firefox vermez.
    addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()
      kurulumOlayi = e
      if (serit.hidden && !ertelendi('izin-yukle')) kutuGoster('izin-yukle')
    })
    serit.querySelector('.izin-kur').addEventListener('click', async () => {
      if (!kurulumOlayi) return seritKapat()
      kurulumOlayi.prompt()
      await kurulumOlayi.userChoice.catch((err) => console.warn('Kurulum sorulamadı', err))
      kurulumOlayi = null
      seritKapat()
    })
  }

  if (serit && ios && !kurulu) {
    if (!ertelendi('izin-ios')) kutuGoster('izin-ios')
  } else if (serit && pushVar) {
    if (Notification.permission === 'granted') {
      // İzin önceden verilmiş: abonelik sessizce tazelenir (sunucu silmiş ya da cihaz değişmiş olabilir).
      aboneOl().catch((err) => console.warn('Bildirim aboneliği tazelenemedi', err))
    } else if (Notification.permission === 'default' && !ertelendi('izin-push')) {
      kutuGoster('izin-push')
    }
    const ver = serit.querySelector('.izin-ver')
    ver.addEventListener('click', async () => {
      ver.disabled = true
      try {
        await izinIste()
        seritKapat()
      } catch (err) {
        console.warn('Bildirim açılamadı', err)
        serit.querySelector('.izin-push small').textContent = 'Bildirim açılamadı, biraz sonra yeniden dene.'
      } finally {
        ver.disabled = false
      }
    })
  }

  // Bildirimler sayfasındaki aç/kapat kutusu.
  const pushKutu = document.querySelector('.push-kutu')
  if (pushKutu && pushVar) {
    const ac = pushKutu.querySelector('.push-ac')
    const kapa = pushKutu.querySelector('.push-kapat')
    const durum = pushKutu.querySelector('.push-durum')
    const goster = (abone) => {
      ac.hidden = abone
      kapa.hidden = !abone
      if (Notification.permission === 'denied') {
        durum.textContent = 'Bildirim izni tarayıcı ayarlarından kapatılmış. Site ayarlarından izin verip sayfayı yenile.'
        ac.hidden = true
      } else if (abone) durum.textContent = 'Bu cihaza bildirim geliyor.'
    }
    navigator.serviceWorker.ready.then(async (sw) => {
      pushKutu.hidden = false
      goster(Boolean(await sw.pushManager.getSubscription()))
      ac.addEventListener('click', async () => {
        ac.disabled = true
        try {
          goster(await izinIste())
          seritKapat()
        } catch (err) {
          console.warn('Bildirim açılamadı', err)
          durum.textContent = 'Bildirim açılamadı, biraz sonra yeniden dene.'
        } finally {
          ac.disabled = false
        }
      })
      kapa.addEventListener('click', async () => {
        const abonelik = await sw.pushManager.getSubscription()
        if (abonelik) {
          await sunucuyaYaz('/s/push-sil', abonelik.endpoint).catch((err) => console.warn('Abonelik silinemedi', err))
          await abonelik.unsubscribe()
        }
        // Kapatan kişiye şerit hemen yeniden sorulmasın.
        sonraYaz('izin-push')
        durum.textContent = 'Bildirimler kapalı.'
        goster(false)
      })
    }).catch((err) => console.warn('Servis işçisi hazır değil', err))
  } else if (pushKutu && ios && !kurulu) {
    pushKutu.hidden = false
    pushKutu.querySelector('.push-ac').hidden = true
    pushKutu.querySelector('.push-durum').textContent = 'iPhone’da önce uygulamayı ana ekrana ekle (sayfanın üstündeki adımlar).'
    if (serit) kutuGoster('izin-ios')
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
