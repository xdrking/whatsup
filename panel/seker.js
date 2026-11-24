// Şeker Fırtınası'nın tarayıcı tarafı: sunucunun `data-seker`'e yazdığı adımları oynatır (düşme,
// parlama, patlama parçacıkları, kombo yazısı, bedava dönüş), otomatik çevirmeyi yürütür.
// Sonucu sunucu belirler; burası yalnızca gösterir. Satır içi stil yasak olduğu için (CSP) hareketler
// Web Animations API ile verilir, o CSSOM'dur ve CSP'ye takılmaz. Sesler oyun.js'in Web Audio'sundandır.
(() => {
  'use strict'

  const TURBO_ANAHTARI = 'seker-turbo'
  const KOMBO_ADI = { 2: 'KOMBO', 3: 'SÜPER', 5: 'MUHTEŞEM', 8: 'EFSANE', 13: 'FIRTINA', 21: 'KASIRGA' }
  const RENK = { '🍪': '#e0a45e', '🍩': '#ff8fc7', '🧁': '#b48cff', '🍮': '#ffd25a', '🍫': '#a0673a', '🍬': '#ff5a7a', '🍰': '#fff0c2', '💖': '#ff3d8b', '🌈': '#7cd6ff' }
  const BUYUK = [[100, 'ŞEKER FIRTINASI'], [50, 'EFSANE KAZANÇ'], [25, 'MEGA KAZANÇ'], [10, 'BÜYÜK KAZANÇ']]
  const binlik = new Intl.NumberFormat('tr-TR')
  const virgul = (x) => String(Math.round(x * 100) / 100).replace('.', ',')

  let turbo = false
  try {
    turbo = localStorage.getItem(TURBO_ANAHTARI) === 'acik'
  } catch (err) {
    console.warn('Turbo tercihi okunamadı', err)
  }
  let atla = false
  const hiz = () => (atla ? 0.12 : turbo ? 0.45 : 1)
  const bekle = (ms) => new Promise((tamam) => setTimeout(tamam, ms * hiz()))

  const sesler = () => window.KumarhaneSes ?? null
  const ton = (...a) => sesler()?.ton(...a)
  const hisirti = (...a) => sesler()?.hisirti(...a)
  const patlamaSesi = (kombo) => {
    const taban = 520 * 1.12 ** Math.min(kombo, 12)
    ton(taban, 0.09, { tip: 'triangle', guc: 0.12, kayma: taban * 1.8 })
    ton(taban * 1.5, 0.12, { tip: 'sine', guc: 0.07, gecikme: 0.05 })
    hisirti(0.18, { guc: 0.12, filtre: 3200 })
  }
  const dusmeSesi = () => ton(220, 0.08, { tip: 'sine', guc: 0.06, kayma: 140 })
  const parlamaSesi = () => [988, 1319, 1760].forEach((f, i) => ton(f, 0.12, { tip: 'sine', guc: 0.06, gecikme: i * 0.05 }))

  const yeni = (etiket, sinif, metin) => {
    const d = document.createElement(etiket)
    if (sinif) d.className = sinif
    if (metin !== undefined) d.textContent = metin
    return d
  }

  /** Bir makinenin canlı durumu: hücreler `hucre[sutun][satir]`. */
  function sahneKur(makine, veri) {
    const tahta = makine.querySelector('.seker-tahta')
    const sahne = makine.querySelector('.seker-sahne')
    return {
      makine, tahta, sahne, veri,
      hucre: [],
      kazanc: 0,
      yukseklik: () => tahta.firstElementChild?.offsetHeight || 48,
    }
  }

  /** Tahtayı harf dizisinden yeniden kurar (`t` sütun sütun). */
  function ciz(d, t) {
    const { sut, sat, s } = d.veri
    d.tahta.replaceChildren()
    d.hucre = Array.from({ length: sut }, () => [])
    for (let r = 0; r < sat; r += 1) {
      for (let c = 0; c < sut; c += 1) {
        const sembol = s['abcdefghz'.indexOf(t[c * sat + r])]
        const el = yeni('span', `seker${sembol === '🌈' ? ' daginik' : ''}`, sembol)
        d.hucre[c][r] = el
        d.tahta.append(el)
      }
    }
  }

  const hepsi = (d) => d.hucre.flat()

  async function dokulGir(d, t) {
    ciz(d, t)
    const y = d.yukseklik()
    const { sut, sat } = d.veri
    const sure = 460 * hiz()
    let son = null
    for (let c = 0; c < sut; c += 1) {
      for (let r = 0; r < sat; r += 1) {
        son = d.hucre[c][r].animate(
          [{ transform: `translateY(${-(sat + 1) * y}px)`, opacity: 0.4 }, { transform: 'translateY(0)', opacity: 1 }],
          { duration: sure, delay: (c * 55 + (sat - 1 - r) * 30) * hiz(), easing: 'cubic-bezier(.25,1.35,.55,1)', fill: 'backwards' },
        )
      }
      setTimeout(dusmeSesi, (c * 55 + 300) * hiz())
    }
    await son?.finished.catch(() => {})
  }

  async function bosalt(d) {
    const y = d.yukseklik()
    const sat = d.veri?.sat ?? 5
    let son = null
    d.hucre.forEach((sutun, c) => sutun.forEach((el, r) => {
      son = el.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${(sat + 1) * y}px)`, opacity: 0 }],
        { duration: 340 * hiz(), delay: (c * 35 + (sat - 1 - r) * 20) * hiz(), easing: 'cubic-bezier(.5,0,.9,.5)', fill: 'forwards' })
    }))
    await son?.finished.catch(() => {})
  }

  /** Patlayan hücrenin yerinden parçacık ve şok dalgası çıkar. */
  function parcala(d, el, sembol, buyukluk) {
    const tr = d.sahne.getBoundingClientRect()
    const hr = el.getBoundingClientRect()
    const x = hr.left - tr.left + hr.width / 2
    const y = hr.top - tr.top + hr.height / 2
    const dalga = yeni('i', 'seker-dalga')
    d.sahne.append(dalga)
    dalga.animate([{ transform: `translate(${x}px, ${y}px) scale(.2)`, opacity: 0.9 }, { transform: `translate(${x}px, ${y}px) scale(${1.6 + buyukluk * 0.15})`, opacity: 0 }],
      { duration: 520 * hiz(), easing: 'ease-out' }).finished.then(() => dalga.remove(), () => dalga.remove())
    const adet = 7 + Math.min(buyukluk, 6)
    for (let i = 0; i < adet; i += 1) {
      const p = yeni('i', 'seker-parca')
      p.style.background = RENK[sembol] ?? '#fff'
      d.sahne.append(p)
      const aci = (Math.PI * 2 * i) / adet + Math.random() * 0.6
      const mesafe = 38 + Math.random() * 50 + buyukluk * 6
      p.animate([
        { transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 1 },
        { transform: `translate(${x + Math.cos(aci) * mesafe}px, ${y + Math.sin(aci) * mesafe + 30}px) scale(.1) rotate(${Math.random() * 360}deg)`, opacity: 0 },
      ], { duration: (520 + Math.random() * 300) * hiz(), easing: 'cubic-bezier(.2,.7,.4,1)' }).finished.then(() => p.remove(), () => p.remove())
    }
  }

  function yaziUcur(d, metin, sinif = '') {
    const y = yeni('div', `seker-yazi ${sinif}`, metin)
    d.sahne.append(y)
    y.animate([
      { transform: 'translate(-50%, -50%) scale(.3) rotate(-8deg)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1.15) rotate(2deg)', opacity: 1, offset: 0.25 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.7 },
      { transform: 'translate(-50%, -80%) scale(.9)', opacity: 0 },
    ], { duration: 1150 * hiz(), easing: 'ease-out' }).finished.then(() => y.remove(), () => y.remove())
  }

  function sars(d, guc) {
    const p = Math.min(guc, 10)
    d.makine.animate([
      { transform: 'translate(0,0)' }, { transform: `translate(${-p}px, ${p / 2}px) rotate(-.4deg)` },
      { transform: `translate(${p}px, ${-p / 2}px) rotate(.4deg)` }, { transform: `translate(${-p / 2}px, ${p / 3}px)` }, { transform: 'translate(0,0)' },
    ], { duration: 360 * hiz() })
    navigator.vibrate?.(Math.min(40 + guc * 10, 160))
  }

  function sayac(el, bas, son, ms) {
    const t0 = performance.now()
    const sure = ms * hiz()
    const adim = (simdi) => {
      const oran = Math.min(1, (simdi - t0) / Math.max(sure, 1))
      el.textContent = binlik.format(Math.round(bas + (son - bas) * (1 - (1 - oran) ** 3)))
      if (oran < 1) requestAnimationFrame(adim)
    }
    requestAnimationFrame(adim)
  }

  function kazancYaz(d, kat) {
    const el = d.makine.querySelector('.seker-kazanc')
    const once = d.kazanc
    d.kazanc += kat * d.veri.taban
    if (el) {
      sayac(el, once, d.kazanc, 500)
      el.classList.remove('vurgu')
      void el.offsetWidth
      el.classList.add('vurgu')
    }
  }

  function komboYaz(d, carpan) {
    const el = d.makine.querySelector('.seker-kombo b')
    if (!el) return
    el.textContent = `x${carpan}`
    el.parentElement.classList.toggle('sicak', carpan >= 5)
    el.animate([{ transform: 'scale(1.6)' }, { transform: 'scale(1)' }], { duration: 300 * hiz(), easing: 'cubic-bezier(.3,1.6,.5,1)' })
  }

  /** Patlayanlar çıkınca üsttekiler düşer, boşluk yeni şekerle dolar. */
  async function dus(d, patlayan, sonraki) {
    const { sut, sat } = d.veri
    const sil = new Set(patlayan)
    const y = d.yukseklik()
    ciz(d, sonraki)
    let son = null
    for (let c = 0; c < sut; c += 1) {
      const kalanlar = []
      for (let r = 0; r < sat; r += 1) if (!sil.has(c * sat + r)) kalanlar.push(r)
      const yeniAdet = sat - kalanlar.length
      for (let r = 0; r < sat; r += 1) {
        const mesafe = r < yeniAdet ? yeniAdet + 0.6 : r - kalanlar[r - yeniAdet]
        if (!mesafe) continue
        son = d.hucre[c][r].animate([{ transform: `translateY(${-mesafe * y}px)`, opacity: r < yeniAdet ? 0.2 : 1 }, { transform: 'translateY(0)', opacity: 1 }],
          { duration: (300 + mesafe * 45) * hiz(), delay: c * 25 * hiz(), easing: 'cubic-bezier(.3,1.4,.6,1)', fill: 'backwards' })
      }
    }
    setTimeout(dusmeSesi, 250 * hiz())
    await son?.finished.catch(() => {})
  }

  /** Tek dönüşün adımları: parla, patla, kombo, düş. */
  async function donusOynat(d, adimlar) {
    for (let i = 0; i < adimlar.length - 1; i += 1) {
      const a = adimlar[i]
      const { sat, s } = d.veri
      const hucreler = a.p.map((n) => d.hucre[Math.floor(n / sat)][n % sat])
      komboYaz(d, a.c)
      hucreler.forEach((el) => el.classList.add('parlak'))
      parlamaSesi()
      a.o.forEach(([si, adet, kat], j) => setTimeout(() => yaziUcur(d, `${adet}× ${s[si]}  ${virgul(kat * a.c)}x`, `odeme o${j}`), j * 160 * hiz()))
      await bekle(520)

      const buyukluk = Math.round(Math.log2(a.c) * 2)
      hucreler.forEach((el, j) => {
        parcala(d, el, el.textContent, buyukluk)
        el.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.45) rotate(12deg)', opacity: 1, offset: 0.35 }, { transform: 'scale(0)', opacity: 0 }],
          { duration: 320 * hiz(), delay: (j % 6) * 12 * hiz(), easing: 'ease-in', fill: 'forwards' })
      })
      patlamaSesi(i)
      if (a.c >= 2) {
        yaziUcur(d, `${KOMBO_ADI[a.c] ?? 'KOMBO'} x${a.c}`, `kombo k${Math.min(a.c, 21)}`)
        sars(d, 2 + Math.log2(a.c) * 2.5)
      }
      kazancYaz(d, a.k)
      await bekle(380)
      await dus(d, a.p, adimlar[i + 1].t)
      await bekle(120)
    }
  }

  async function bedavaOynat(d) {
    const { fs, ek } = d.veri
    const tur = d.makine.querySelector('.seker-tur')
    const daginiklar = hepsi(d).filter((el) => el.classList.contains('daginik'))
    daginiklar.forEach((el) => el.classList.add('parlak'))
    ;[523, 659, 784, 1047, 1319].forEach((f, i) => ton(f, 0.25, { tip: 'triangle', guc: 0.11, gecikme: i * 0.1 }))
    yaziUcur(d, `🌈 ${fs.length - fs.reduce((t, x) => t + x.ek, 0)} BEDAVA DÖNÜŞ`, 'bedava')
    await bekle(1500)
    d.makine.classList.add('firtina')
    let toplam = fs.length - fs.reduce((t, x) => t + x.ek, 0)
    for (let i = 0; i < fs.length; i += 1) {
      if (tur) tur.textContent = `🌈 ${i + 1}/${toplam}`
      await bosalt(d)
      await dokulGir(d, fs[i].a[0].t)
      await donusOynat(d, fs[i].a)
      if (fs[i].ek) {
        toplam += ek
        hepsi(d).filter((el) => el.classList.contains('daginik')).forEach((el) => el.classList.add('parlak'))
        yaziUcur(d, `+${fs[i].ek} DÖNÜŞ`, 'bedava')
        parlamaSesi()
        await bekle(1000)
      }
      await bekle(250)
    }
  }

  async function buyukKazanc(d, kat) {
    const seviye = BUYUK.find(([esik]) => kat >= esik)
    if (!seviye) return
    const perde = yeni('div', 'seker-buyuk')
    const baslik = yeni('strong', '', seviye[1])
    const tutar = yeni('span', '', '0')
    perde.append(baslik, tutar, yeni('small', '', `${virgul(kat)}x`))
    d.makine.append(perde)
    for (let i = 0; i < 26; i += 1) {
      const y = yeni('i', 'seker-yagmur', ['🍬', '🍭', '💖', '🍫', '⭐'][i % 5])
      perde.append(y)
      y.style.left = `${Math.random() * 94}%`
      const boy = d.makine.offsetHeight + 40
      y.animate([{ transform: 'translateY(-40px) rotate(0)' }, { transform: `translate(${Math.random() * 60 - 30}px, ${boy}px) rotate(${Math.random() * 720 - 360}deg)` }],
        { duration: (1400 + Math.random() * 1600) * hiz(), delay: Math.random() * 900 * hiz(), iterations: 2, fill: 'backwards' })
    }
    sayac(tutar, 0, Math.round(kat * d.veri.taban), 1800)
    for (let i = 0; i < 16; i += 1) ton(700 + i * 90, 0.08, { tip: 'triangle', guc: 0.07, gecikme: i * 0.1 * hiz() })
    sars(d, 8)
    await bekle(3200)
    perde.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300 * hiz(), fill: 'forwards' }).finished.then(() => perde.remove(), () => perde.remove())
  }

  /**
   * Sonuç kartının makinesini oynatır. Boş makinede yalnızca dökülme yapılır ve 0 döner;
   * sonuçta animasyon bitince çözülen Promise döner (oyun.js bakiyeyi ondan sonra sayar).
   */
  function oynat(kutu) {
    const makine = kutu.querySelector('.seker-makine')
    if (!makine) return 0
    if (!makine.dataset.seker) {
      // Çevirmeden sonra boş makine gelmesi hata demektir (bakiye yetmedi gibi): otomatik durur.
      if (oto) {
        oto = null
        otoCubugu()
      }
      const hucreler = [...makine.querySelectorAll('.seker')]
      const y = hucreler[0]?.offsetHeight || 48
      hucreler.forEach((el, i) => el.animate([{ transform: `translateY(${-6 * y}px)`, opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
        { duration: 500, delay: (i % 6) * 55 + (4 - Math.floor(i / 6)) * 30, easing: 'cubic-bezier(.25,1.35,.55,1)', fill: 'backwards' }))
      return 0
    }
    let veri
    try {
      veri = JSON.parse(makine.dataset.seker)
    } catch (err) {
      console.error('Şeker verisi okunamadı', err)
      return 0
    }
    atla = false
    kutu.classList.add('oynuyor')
    const d = sahneKur(makine, veri)
    // Sunucunun yazdığı tur bilgisi sonucu önceden söylemesin.
    const tur = makine.querySelector('.seker-tur')
    if (tur) tur.textContent = veri.bonus ? '🎁 BONUS' : ''
    makine.addEventListener('click', () => { atla = true }, { once: true })
    return (async () => {
      await dokulGir(d, veri.ana[0].t)
      await donusOynat(d, veri.ana)
      if (veri.dk) kazancYaz(d, veri.dk)
      if (veri.fs) await bedavaOynat(d)
      await buyukKazanc(d, veri.kat)
      kutu.classList.remove('oynuyor')
      kutu.classList.add('bitti')
      const durum = kutu.dataset.durum
      if (durum === 'kazandi') sesler()?.sesler.kazan(Number(kutu.dataset.carpan) || 1)
      else if (durum === 'kaybetti' && !veri.ana[1]) sesler()?.sesler.kaybet()
      otomatikSonra(kutu, veri)
      return 0
    })()
  }

  /** Beklerken tahtadaki şekerler aşağı dökülür. `kutu` bekleme kutusudur. */
  function bekleme() {
    const eski = document.querySelector('#sonuc .seker-makine')
    const gorsel = eski ? eski.cloneNode(true) : null
    if (!gorsel) return null
    delete gorsel.dataset.seker
    gorsel.classList.remove('firtina')
    gorsel.querySelector('.seker-sahne')?.replaceChildren()
    gorsel.querySelector('.seker-buyuk')?.remove()
    requestAnimationFrame(() => {
      const hucreler = [...gorsel.querySelectorAll('.seker')]
      const y = hucreler[0]?.offsetHeight || 48
      hucreler.forEach((el, i) => el.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${6 * y}px)`, opacity: 0 }],
        { duration: 340 * hiz(), delay: ((i % 6) * 35 + (4 - Math.floor(i / 6)) * 20) * hiz(), easing: 'cubic-bezier(.5,0,.9,.5)', fill: 'forwards' }))
    })
    return gorsel
  }

  // --- Otomatik çevirme ---
  let oto = null

  function otoCubugu() {
    let cubuk = document.querySelector('.oto-cubuk')
    if (!oto) {
      cubuk?.remove()
      return
    }
    if (!cubuk) {
      cubuk = yeni('div', 'oto-cubuk')
      cubuk.append(yeni('span', 'oto-yazi'), yeni('button', 'oto-dur', '■ DURDUR'))
      cubuk.querySelector('.oto-dur').type = 'button'
      cubuk.querySelector('.oto-dur').addEventListener('click', () => {
        oto = null
        otoCubugu()
      })
      document.body.append(cubuk)
    }
    cubuk.querySelector('.oto-yazi').textContent = `🔁 Otomatik · ${oto.kalan} kaldı`
  }

  function cevir() {
    const form = document.querySelector('form.k-şeker')
    const dugme = form?.querySelector('.seker-cevir')
    if (!form || !dugme || document.body.classList.contains('bekliyor')) return false
    form.requestSubmit(dugme)
    return true
  }

  function otomatikSonra(kutu, veri) {
    if (!oto) return
    const durdur = (neden) => {
      oto = null
      otoCubugu()
      if (neden) console.info('Otomatik durdu:', neden)
    }
    if (kutu.dataset.durum === 'hata') return durdur('hata')
    if (oto.bonusDur && veri?.fs) return durdur('bonus')
    if (oto.buyukDur && veri?.kat >= 50) return durdur('büyük kazanç')
    if (oto.kalan <= 0) return durdur()
    setTimeout(() => {
      if (!oto) return
      oto.kalan -= 1
      otoCubugu()
      if (!cevir()) durdur('form yok')
    }, 350 * hiz())
  }

  function hazirla() {
    // Makinenin altındaki çevir düğmesi: telefonda bahis formuna kaydırmadan çevrilsin, oynarken basılırsa hızlandırır.
    for (const d of document.querySelectorAll('.seker-hizli')) {
      d.hidden = false
      d.addEventListener('click', () => {
        if (document.querySelector('#sonuc.oynuyor')) atla = true
        else cevir()
      })
    }
    const form = document.querySelector('form.k-şeker')
    if (!form) return
    const ayar = form.querySelector('.seker-oto')
    if (ayar) ayar.hidden = false
    const turboKutu = form.querySelector('.seker-turbo')
    if (turboKutu) {
      turboKutu.checked = turbo
      turboKutu.addEventListener('change', () => {
        turbo = turboKutu.checked
        try {
          localStorage.setItem(TURBO_ANAHTARI, turbo ? 'acik' : 'kapali')
        } catch (err) {
          console.warn('Turbo tercihi kaydedilemedi', err)
        }
      })
    }
    form.querySelector('.oto-basla')?.addEventListener('click', () => {
      oto = {
        kalan: Number(form.querySelector('.oto-adet')?.value) || 10,
        bonusDur: form.querySelector('.oto-bonus')?.checked ?? true,
        buyukDur: form.querySelector('.oto-buyuk')?.checked ?? false,
      }
      oto.kalan -= 1
      otoCubugu()
      if (!cevir()) {
        oto = null
        otoCubugu()
      }
    })
    form.querySelector('.seker-bonus')?.addEventListener('click', (olay) => {
      const fiyat = olay.currentTarget.textContent.match(/(\d+)x/)?.[1] ?? ''
      if (!confirm(`Bonus bahsin ${fiyat} katı tutar ve doğrudan bedava dönüş başlatır. Alınsın mı?`)) olay.preventDefault()
    })
  }

  // Boşluk tuşu çevirir (yazı alanındayken değil).
  document.addEventListener('keydown', (olay) => {
    if (olay.code !== 'Space' || olay.repeat) return
    if (olay.target instanceof HTMLInputElement || olay.target instanceof HTMLSelectElement || olay.target instanceof HTMLTextAreaElement) return
    if (!document.querySelector('form.k-şeker')) return
    olay.preventDefault()
    if (document.querySelector('#sonuc.oynuyor')) {
      atla = true
      return
    }
    cevir()
  })

  window.SekerFirtinasi = { oynat, bekleme, hazirla }
})()
