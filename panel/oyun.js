// Panel kumarhanesinin tarayıcı tarafı: formu sayfa yenilemeden gönderir, ses çalar.
// Betik çalışmazsa formlar yine normal gönderilir; animasyonların hepsi CSS'tedir.
// Sesler Web Audio ile üretilir, ses dosyası yoktur. Tarayıcı sesi ancak bir tıklamadan
// sonra açtığı için bağlam ilk form gönderiminde kurulur.
(() => {
  'use strict'

  const SES_ANAHTARI = 'kumarhane-ses'
  const SEMBOLLER = ['🍒', '🍋', '🍇', '🔔', '⭐', '💎']
  let baglam = null
  let sesAcik = true
  try {
    sesAcik = localStorage.getItem(SES_ANAHTARI) !== 'kapali'
  } catch (err) {
    console.warn('Ses tercihi okunamadı', err)
  }

  function ses() {
    if (!sesAcik) return null
    if (!baglam) {
      const Baglam = window.AudioContext || window.webkitAudioContext
      if (!Baglam) return null
      baglam = new Baglam()
    }
    if (baglam.state === 'suspended') baglam.resume().catch((err) => console.warn('Ses açılamadı', err))
    return baglam
  }

  function ton(frekans, sure, { tip = 'square', guc = 0.08, gecikme = 0, kayma = 0 } = {}) {
    const c = ses()
    if (!c) return
    const t = c.currentTime + gecikme
    const osilator = c.createOscillator()
    const kazanc = c.createGain()
    osilator.type = tip
    osilator.frequency.setValueAtTime(frekans, t)
    if (kayma) osilator.frequency.exponentialRampToValueAtTime(kayma, t + sure)
    kazanc.gain.setValueAtTime(0.0001, t)
    kazanc.gain.exponentialRampToValueAtTime(guc, t + 0.01)
    kazanc.gain.exponentialRampToValueAtTime(0.0001, t + sure)
    osilator.connect(kazanc).connect(c.destination)
    osilator.start(t)
    osilator.stop(t + sure + 0.05)
  }

  function hisirti(sure, { guc = 0.15, gecikme = 0, filtre = 1200 } = {}) {
    const c = ses()
    if (!c) return
    const t = c.currentTime + gecikme
    const tampon = c.createBuffer(1, Math.ceil(c.sampleRate * sure), c.sampleRate)
    const veri = tampon.getChannelData(0)
    for (let i = 0; i < veri.length; i += 1) veri[i] = (Math.random() * 2 - 1) * (1 - i / veri.length)
    const kaynak = c.createBufferSource()
    kaynak.buffer = tampon
    const suzgec = c.createBiquadFilter()
    suzgec.type = 'lowpass'
    suzgec.frequency.value = filtre
    const kazanc = c.createGain()
    kazanc.gain.value = guc
    kaynak.connect(suzgec).connect(kazanc).connect(c.destination)
    kaynak.start(t)
  }

  const sesler = {
    tik: (g = 0) => ton(1400, 0.03, { guc: 0.035, gecikme: g }),
    dur: (g = 0) => ton(180, 0.14, { tip: 'triangle', guc: 0.16, gecikme: g, kayma: 80 }),
    kart: (g = 0) => hisirti(0.09, { guc: 0.14, gecikme: g, filtre: 3500 }),
    para: (g = 0) => {
      ton(1568, 0.08, { tip: 'triangle', guc: 0.1, gecikme: g })
      ton(2093, 0.22, { tip: 'triangle', guc: 0.1, gecikme: g + 0.07 })
    },
    kazan: (kat, g = 0) => {
      const notalar = [523, 659, 784, 1047, 1319, 1568]
      const adet = kat >= 10 ? 6 : kat >= 4 ? 5 : kat >= 2 ? 4 : 3
      notalar.slice(0, adet).forEach((f, i) => ton(f, 0.2, { tip: 'triangle', guc: 0.13, gecikme: g + i * 0.09 }))
      if (kat >= 4) {
        for (let i = 0; i < 14; i += 1) ton(1600 + Math.random() * 1400, 0.07, { tip: 'sine', guc: 0.05, gecikme: g + 0.55 + i * 0.07 })
      }
    },
    kaybet: (g = 0) => {
      ton(330, 0.25, { tip: 'sawtooth', guc: 0.06, gecikme: g, kayma: 200 })
      ton(220, 0.45, { tip: 'sawtooth', guc: 0.06, gecikme: g + 0.22, kayma: 100 })
    },
    patla: (g = 0) => hisirti(0.6, { guc: 0.35, gecikme: g, filtre: 700 }),
  }

  let donme = null
  function donmeDurdur() {
    clearInterval(donme)
    donme = null
  }
  function donmeBaslat(aralikMs) {
    donmeDurdur()
    donme = setInterval(() => sesler.tik(), aralikMs)
  }

  /** Crash çarpanını 1,00x'ten patlama noktasına kadar sayar. */
  function crashSay(kutu) {
    const yazi = kutu.querySelector('.crash-sayi')
    const nokta = Number(kutu.dataset.nokta)
    if (!yazi || !nokta) return
    const sure = 1800
    const bas = performance.now()
    ton(180, sure / 1000, { tip: 'sine', guc: 0.05, kayma: 1100 })
    const adim = (simdi) => {
      const oran = Math.min(1, (simdi - bas) / sure)
      yazi.textContent = `${(nokta ** oran).toFixed(2).replace('.', ',')}x`
      if (oran < 1) requestAnimationFrame(adim)
    }
    requestAnimationFrame(adim)
  }

  /** Sunucudan gelen sonucun sesini CSS animasyonunun zamanlamasıyla çalar. */
  function canlandir(hamleSonrasi) {
    const kutu = document.getElementById('sonuc')
    if (!kutu) {
      const el = document.getElementById('acik-el')
      if (!el) return 0
      if (hamleSonrasi && (el.dataset.oyun === 'mayın' || el.dataset.oyun === 'kule')) sesler.para()
      else sesler.kart()
      return 0
    }
    const { oyun, durum } = kutu.dataset
    const kat = Number(kutu.dataset.carpan) || 0
    let bitis = 0.25

    if (oyun === 'slot') {
      for (let i = 0; i < 22; i += 1) sesler.tik(i * 0.09)
      ;[1.3, 1.65, 2].forEach((t) => sesler.dur(t))
      bitis = 2.15
    } else if (oyun === 'rulet') {
      let t = 0
      let aralik = 0.04
      while (t < 2.1) {
        sesler.tik(t)
        t += aralik
        aralik *= 1.1
      }
      sesler.dur(2.1)
      bitis = 2.3
    } else if (oyun === 'bahis') {
      for (let i = 0; i < 10; i += 1) ton(2400, 0.03, { tip: 'sine', guc: 0.04, gecikme: i * 0.12 })
      sesler.dur(1.3)
      bitis = 1.5
    } else if (oyun === 'kazı') {
      for (let i = 0; i < 9; i += 1) hisirti(0.12, { guc: 0.08, gecikme: 0.1 + i * 0.15, filtre: 5000 })
      bitis = 1.7
    } else if (oyun === 'plinko') {
      for (let i = 0; i < 8; i += 1) ton(800 + Math.random() * 600, 0.05, { tip: 'sine', guc: 0.08, gecikme: 0.1 + i * 0.2 })
      sesler.dur(1.65)
      bitis = 1.75
    } else if (oyun === 'crash') {
      crashSay(kutu)
      if (durum === 'kaybetti') sesler.patla(1.75)
      bitis = 1.9
    } else if (kutu.classList.contains('adimli') && durum === 'kaybetti') {
      sesler.patla()
      bitis = 0.3
    }

    if (durum === 'kazandi') sesler.kazan(kat, bitis)
    else if (durum === 'kaybetti') sesler.kaybet(bitis)
    else if (durum === 'hata') sesler.kaybet()
    else sesler.para(bitis)

    // Telefonda kazanç ve patlama ele de gelsin; desteklemeyen tarayıcı yok sayar.
    if (durum === 'kazandi' || (durum === 'kaybetti' && kutu.classList.contains('adimli'))) {
      setTimeout(() => navigator.vibrate?.(durum === 'kazandi' ? [30, 40, 60] : 120), bitis * 1000)
    }
    return durum === 'hata' ? 0 : bitis
  }

  const binlik = new Intl.NumberFormat('tr-TR')

  /**
   * Bakiye eski değerde bekler, animasyon bitince yeni değere sayar: yeni bakiye
   * hemen yazılsaydı makaralar durmadan sonuç belli olurdu.
   */
  function bakiyeSay(eski, gecikmeSn) {
    const yazi = document.querySelector('.bakiye-sayi')
    const yeniXp = Number(yazi?.dataset.xp)
    if (!yazi || !Number.isFinite(eski) || !Number.isFinite(yeniXp) || eski === yeniXp) return
    yazi.textContent = binlik.format(eski)
    setTimeout(() => {
      const kutu = yazi.closest('.bakiye')
      const sinif = yeniXp > eski ? 'artti' : 'azaldi'
      kutu?.classList.add(sinif)
      const sure = 900
      const bas = performance.now()
      const adim = (simdi) => {
        const oran = Math.min(1, (simdi - bas) / sure)
        const yumusak = 1 - (1 - oran) ** 3
        yazi.textContent = binlik.format(Math.round(eski + (yeniXp - eski) * yumusak))
        if (oran < 1) requestAnimationFrame(adim)
        else setTimeout(() => kutu?.classList.remove(sinif), 700)
      }
      requestAnimationFrame(adim)
    }, gecikmeSn * 1000)
  }

  const yeni = (etiket, sinif, metin) => {
    const d = document.createElement(etiket)
    if (sinif) d.className = sinif
    if (metin) d.textContent = metin
    return d
  }

  /** Yanıt beklenirken dönen makara, çark ya da para gösterilir. */
  function beklemeGoster(oyun, baslik) {
    let gorsel = null
    if (oyun === 'slot') {
      gorsel = yeni('div', 'slot-makine')
      const makaralar = yeni('div', 'makaralar')
      for (let i = 0; i < 3; i += 1) {
        const makara = yeni('div', 'makara donuyor')
        const serit = yeni('div', 'serit')
        for (let j = 0; j < 12; j += 1) serit.append(yeni('span', '', SEMBOLLER[j % SEMBOLLER.length]))
        makara.append(serit)
        makaralar.append(makara)
      }
      gorsel.append(makaralar)
      donmeBaslat(90)
    } else if (oyun === 'rulet') {
      gorsel = yeni('div', 'carkfelek donuyor')
      gorsel.append(yeni('div', 'cark-dis'))
      donmeBaslat(60)
    } else if (oyun === 'bahis') {
      gorsel = yeni('div', 'para-alan')
      const para = yeni('div', 'para donuyor')
      para.append(yeni('span', 'on', 'YAZI'), yeni('span', 'arka', 'TURA'))
      gorsel.append(para)
    }
    const eski = document.getElementById('sonuc')
    if (!gorsel) {
      eski?.classList.add('eskidi')
      return
    }
    // Bekleme kutusu gelecek sonuç kartıyla aynı yerde ve aynı ölçüdedir: eski sonucun yerine
    // geçer (iki makine yan yana görünmesin), başlığı ve sonuç yazısının boşluğu vardır
    // (yanıt gelince makine zıplamasın).
    const kutu = yeni('section', 'sonuc bekleme')
    kutu.append(yeni('h2', '', baslik), gorsel, yeni('div', 'bekleme-bosluk'))
    if (eski) eski.replaceWith(kutu)
    else document.querySelector('.kasa')?.after(kutu)
    kutu.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  function sesDugmesi() {
    const d = document.querySelector('.ses-dugme')
    if (!d) return
    d.hidden = false
    d.textContent = sesAcik ? '🔊' : '🔇'
    d.addEventListener('click', () => {
      sesAcik = !sesAcik
      d.textContent = sesAcik ? '🔊' : '🔇'
      try {
        localStorage.setItem(SES_ANAHTARI, sesAcik ? 'acik' : 'kapali')
      } catch (err) {
        console.warn('Ses tercihi kaydedilemedi', err)
      }
      if (sesAcik) sesler.para()
    })
  }

  function sayfayiDegistir(html, hamleSonrasi, adres) {
    const belge = new DOMParser().parseFromString(html, 'text/html')
    const govde = belge.querySelector('main')
    if (!govde) {
      location.reload()
      return
    }
    const eskiXp = Number(document.querySelector('.bakiye-sayi')?.dataset.xp)
    govde.classList.add('degisti')
    // Sonuç bekleme kutusunun yerine geliyorsa kart yeniden açılmaz, yalnızca makaralar durur.
    if (document.querySelector('.sonuc.bekleme')) govde.classList.add('yerinde')
    document.querySelector('main').replaceWith(document.adoptNode(govde))
    hazirla()
    bakiyeSay(eskiXp, canlandir(hamleSonrasi))
    const bildirim = document.getElementById('bildirim')
    if (bildirim?.classList.contains('oldu')) sesler.para()
    else if (bildirim) sesler.kaybet()
    history.replaceState(null, '', adres)
    const hedef = document.getElementById('sonuc') ?? document.getElementById('acik-el') ?? document.getElementById('bildirim')
    hedef?.scrollIntoView({ behavior: 'smooth', block: govde.classList.contains('yerinde') ? 'nearest' : 'start' })
  }

  document.addEventListener('submit', async (olay) => {
    const form = olay.target
    if (!(form instanceof HTMLFormElement)) return
    const yol = new URL(form.action).pathname
    if (!yol.startsWith('/oyun/')) return
    olay.preventDefault()
    if (document.body.classList.contains('bekliyor')) return

    ses()
    const veri = new FormData(form)
    if (olay.submitter?.name) veri.set(olay.submitter.name, olay.submitter.value)
    const hamle = yol === '/oyun/hamle'

    document.body.classList.add('bekliyor')
    if (yol === '/oyun/oyna') {
      const ust = form.querySelector('.masa-ust')
      beklemeGoster(String(veri.get('oyun') ?? ''), `${ust?.querySelector('.masa-ikon')?.textContent ?? ''} ${ust?.querySelector('strong')?.textContent ?? ''}`.trim())
    }
    const baslangic = performance.now()
    try {
      const yanit = await fetch(form.action, { method: 'POST', body: new URLSearchParams(veri), credentials: 'same-origin' })
      if (!yanit.ok || !/^\/oyun(\/|$)/.test(new URL(yanit.url).pathname)) {
        location.href = yanit.url
        return
      }
      const html = await yanit.text()
      // Makara biraz dönsün: yanıt çok hızlı gelirse bekleme görünmeden biter.
      const bekle = Math.max(0, (yol === '/oyun/oyna' ? 500 : 0) - (performance.now() - baslangic))
      await new Promise((tamam) => setTimeout(tamam, bekle))
      sayfayiDegistir(html, hamle, yanit.url)
    } catch (err) {
      console.error('Hamle gönderilemedi', err)
      location.reload()
    } finally {
      donmeDurdur()
      document.body.classList.remove('bekliyor')
    }
  })

  /** Betikle gelen parçaları açar: ses düğmesi ve hızlı bahis düğmeleri. */
  function hazirla() {
    sesDugmesi()
    for (const cipler of document.querySelectorAll('.cipler')) cipler.hidden = false
  }

  const bahisAlanlari = () => document.querySelectorAll('input[name="miktar"]')
  function bahisYaz(deger) {
    for (const alan of bahisAlanlari()) alan.value = deger
  }

  // Bahis bir kartta yazılınca bütün kartlara geçer: her oyunda yeniden yazılmasın.
  document.addEventListener('input', (olay) => {
    if (olay.target instanceof HTMLInputElement && olay.target.name === 'miktar') bahisYaz(olay.target.value)
  })

  document.addEventListener('click', (olay) => {
    const dugme = olay.target instanceof Element ? olay.target.closest('[data-cip]') : null
    if (!dugme) return
    const alan = dugme.closest('form')?.querySelector('input[name="miktar"]')
    if (!alan) return
    ses()
    sesler.tik()
    if (dugme.dataset.cip === 'hepsi') return bahisYaz('hepsi')
    // Yalnızca düz sayı katlanır; "5m" ya da "hepsi" yazılıysa bakiye taban alınır.
    const bakiye = Number(document.querySelector('.bakiye-sayi')?.dataset.xp) || 0
    const simdiki = /^\d+$/.test(alan.value.trim()) ? Number(alan.value.trim()) : bakiye
    const yeniDeger = dugme.dataset.cip === 'yari' ? Math.floor(simdiki / 2) : simdiki * 2
    bahisYaz(String(Math.max(10, Math.min(yeniDeger, Math.max(bakiye, 10)))))
  })

  hazirla()
  canlandir(false)
})()
