// Yıldırım Kalesi'nin tarayıcı tarafı: sunucunun `data-yildirim`'e yazdığı adımları oynatır (düşme, patlama,
// şimşekler, küre çarpanı, bedava dönüş), otomatik çevirmeyi yürütür. Sonucu sunucu belirler; burası yalnızca
// gösterir. Hareketler Web Animations API'dir (CSP satır içi stili engeller, CSSOM'u değil). Parçacıklar ve şimşekler
// Şeker Fırtınası'nın tek kanvaslı motorundadır (window.SekerEfekt), sesler oyun.js'in Web Audio'sundan.
(() => {
  'use strict'

  const TURBO_ANAHTARI = 'yildirim-turbo'
  const RENK = { '💧': '#5ac8ff', '🔥': '#ff7b3d', '🌿': '#6dd96a', '🌀': '#9ad7ff', '🗝️': '#ffd25a', '🛡️': '#c8d2e0', '⚔️': '#e8eef7', '🦅': '#d9a066', '🐉': '#ff4d6d', '🌩️': '#b48cff' }
  const BUYUK = [[100, 'TANRISAL ÖFKE'], [50, 'EFSANE FIRTINA'], [25, 'MEGA YILDIRIM'], [10, 'BÜYÜK KAZANÇ']]
  const binlik = new Intl.NumberFormat('tr-TR')
  const virgul = (x) => String(Math.round(x * 100) / 100).replace('.', ',')
  const kureSinifi = (x) => (x >= 100 ? 'k4' : x >= 20 ? 'k3' : x >= 8 ? 'k2' : 'k1')

  let turbo = false
  try {
    turbo = localStorage.getItem(TURBO_ANAHTARI) === 'acik'
  } catch (err) {
    console.warn('Turbo tercihi okunamadı', err)
  }
  let atla = false
  const hiz = () => (atla ? 0.12 : turbo ? 0.45 : 1)
  const bekle = (ms) => new Promise((tamam) => setTimeout(tamam, ms * hiz()))
  const bitince = (anim) => anim?.finished.catch(() => {})

  const sesler = () => window.KumarhaneSes ?? null
  const ton = (...a) => sesler()?.ton(...a)
  const hisirti = (...a) => sesler()?.hisirti(...a)
  const gokGurultusu = (guc = 1) => {
    hisirti(0.9 * guc + 0.3, { guc: 0.16 * guc, filtre: 380 })
    ton(55, 0.6, { tip: 'sawtooth', guc: 0.05 * guc, kayma: 38 })
  }
  const carpmaSesi = () => {
    hisirti(0.12, { guc: 0.2, filtre: 6000 })
    ton(1800, 0.06, { tip: 'square', guc: 0.04, kayma: 300 })
  }
  const patlamaSesi = () => {
    ton(520, 0.09, { tip: 'triangle', guc: 0.1, kayma: 900 })
    hisirti(0.18, { guc: 0.1, filtre: 2600 })
  }
  const dusmeSesi = () => ton(200, 0.08, { tip: 'sine', guc: 0.06, kayma: 130 })

  const yeni = (etiket, sinif, metin) => {
    const d = document.createElement(etiket)
    if (sinif) d.className = sinif
    if (metin !== undefined) d.textContent = metin
    return d
  }

  /** Bir makinenin canlı durumu: hücreler `hucre[sutun][satir]`. */
  function sahneKur(makine, veri) {
    const tahta = makine.querySelector('.yk-tahta')
    return {
      makine, tahta, veri, sahne: makine.querySelector('.yk-sahne'),
      hucre: [], kazanc: 0,
      efekt: window.SekerEfekt?.(makine) ?? null,
      yukseklik: () => tahta.firstElementChild?.offsetHeight || 48,
    }
  }

  function hucreYaz(el, harf, deger) {
    const { s } = el.ykVeri
    if (harf === 'm') {
      el.className = `yk kure ${kureSinifi(deger)}`
      el.replaceChildren(yeni('b', '', `${deger}x`))
      el.dataset.x = String(deger)
      return
    }
    const sembol = s['abcdefghiz'.indexOf(harf)]
    el.className = `yk${sembol === '🌩️' ? ' daginik' : ''}`
    el.textContent = sembol
    delete el.dataset.x
  }

  /** Tahtayı adımdan yeniden kurar (`t` sütun sütun, `v` küre değerleri). */
  function ciz(d, adim) {
    const { sut, sat } = d.veri
    const degerler = new Map(adim.v)
    d.tahta.replaceChildren()
    d.hucre = Array.from({ length: sut }, () => [])
    for (let r = 0; r < sat; r += 1) {
      for (let c = 0; c < sut; c += 1) {
        const i = c * sat + r
        const el = yeni('span', 'yk')
        el.ykVeri = d.veri
        hucreYaz(el, adim.t[i], degerler.get(i))
        d.hucre[c][r] = el
        d.tahta.append(el)
      }
    }
  }

  const hepsi = (d) => d.hucre.flat()

  function merkez(d, el) {
    const m = d.makine.getBoundingClientRect()
    const h = el.getBoundingClientRect()
    return [h.left - m.left + h.width / 2, h.top - m.top + h.height / 2]
  }

  async function dokulGir(d, adim) {
    ciz(d, adim)
    const y = d.yukseklik()
    const { sut, sat } = d.veri
    let son = null
    for (let c = 0; c < sut; c += 1) {
      for (let r = 0; r < sat; r += 1) {
        son = d.hucre[c][r].animate(
          [{ transform: `translateY(${-(sat + 1) * y}px)`, opacity: 0.4 }, { transform: 'translateY(0)', opacity: 1 }],
          { duration: 440 * hiz(), delay: (c * 50 + (sat - 1 - r) * 28) * hiz(), easing: 'cubic-bezier(.25,1.3,.55,1)', fill: 'backwards' },
        )
      }
      setTimeout(dusmeSesi, (c * 50 + 280) * hiz())
    }
    await bitince(son)
    kureGeldi(d, hepsi(d).filter((el) => el.classList.contains('kure')))
  }

  async function bosalt(d) {
    const y = d.yukseklik()
    const sat = d.veri.sat
    let son = null
    d.hucre.forEach((sutun, c) => sutun.forEach((el, r) => {
      son = el.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${(sat + 1) * y}px)`, opacity: 0 }],
        { duration: 320 * hiz(), delay: (c * 32 + (sat - 1 - r) * 18) * hiz(), easing: 'cubic-bezier(.5,0,.9,.5)', fill: 'forwards' })
    }))
    await bitince(son)
  }

  /** Yeni düşen küre: yukarıdan bir şimşek iner, küre parlar. */
  function kureGeldi(d, kureler) {
    kureler.forEach((el, i) => setTimeout(() => {
      const [x, y] = merkez(d, el)
      d.efekt?.simsek(x + (Math.random() - 0.5) * 40, 0, x, y, '#8fd3ff', 0.35, 2.5)
      d.efekt?.halka(x, y, '#cfe9ff', 34, 0.5)
      el.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 380 * hiz(), easing: 'cubic-bezier(.3,1.6,.5,1)' })
      carpmaSesi()
    }, i * 140 * hiz()))
  }

  function yaziUcur(d, metin, sinif = '') {
    const y = yeni('div', `seker-yazi yk-yazi ${sinif}`, metin)
    d.sahne.append(y)
    y.animate([
      { transform: 'translate(-50%, -50%) scale(.3)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1.15)', opacity: 1, offset: 0.25 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.7 },
      { transform: 'translate(-50%, -80%) scale(.9)', opacity: 0 },
    ], { duration: 1150 * hiz(), easing: 'ease-out' }).finished.then(() => y.remove(), () => y.remove())
  }

  function tutarUcur(d, hucreler, xp) {
    if (!hucreler.length || xp < 1) return
    const m = d.makine.getBoundingClientRect()
    let x = 0
    let y = 0
    for (const el of hucreler) {
      const [cx, cy] = merkez(d, el)
      x += cx
      y += cy
    }
    const sol = Math.min(Math.max(x / hucreler.length, 50), m.width - 50)
    const ust = y / hucreler.length
    const yazi = yeni('div', 'seker-tutar yk-tutar', `+${binlik.format(Math.round(xp))}`)
    d.makine.append(yazi)
    yazi.animate([
      { transform: `translate(${sol}px, ${ust}px) translate(-50%, -50%) scale(.5)`, opacity: 0 },
      { transform: `translate(${sol}px, ${ust - 20}px) translate(-50%, -50%) scale(1.2)`, opacity: 1, offset: 0.2 },
      { transform: `translate(${sol}px, ${ust - 70}px) translate(-50%, -50%) scale(1)`, opacity: 0 },
    ], { duration: 1100 * hiz(), easing: 'ease-out' }).finished.then(() => yazi.remove(), () => yazi.remove())
  }

  function sars(d, guc) {
    const p = Math.min(guc, 10)
    d.makine.animate([
      { transform: 'translate(0,0)' }, { transform: `translate(${-p}px, ${p / 2}px)` },
      { transform: `translate(${p}px, ${-p / 2}px)` }, { transform: `translate(${-p / 2}px, ${p / 3}px)` }, { transform: 'translate(0,0)' },
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
    const el = d.makine.querySelector('.yk-kazanc')
    const once = d.kazanc
    d.kazanc += kat * d.veri.taban
    if (el) {
      sayac(el, once, d.kazanc, 500)
      el.classList.remove('vurgu')
      void el.offsetWidth
      el.classList.add('vurgu')
    }
  }

  function carpanYaz(d, deger) {
    const el = d.makine.querySelector('.yk-carpan b')
    if (!el) return
    el.textContent = `x${deger}`
    el.parentElement.classList.toggle('sicak', deger > 0)
    el.animate([{ transform: 'scale(1.8)' }, { transform: 'scale(1)' }], { duration: 320 * hiz(), easing: 'cubic-bezier(.3,1.6,.5,1)' })
  }

  /** Patlayanlar çıkar, üsttekiler düşer, boşluk yenisiyle dolar; yeni küreye şimşek iner. */
  async function dus(d, patlayan, sonraki) {
    const { sut, sat } = d.veri
    const sil = new Set(patlayan)
    const y = d.yukseklik()
    ciz(d, sonraki)
    let son = null
    const yeniKureler = []
    for (let c = 0; c < sut; c += 1) {
      const kalanlar = []
      for (let r = 0; r < sat; r += 1) if (!sil.has(c * sat + r)) kalanlar.push(r)
      const yeniAdet = sat - kalanlar.length
      for (let r = 0; r < sat; r += 1) {
        const mesafe = r < yeniAdet ? yeniAdet + 0.6 : r - kalanlar[r - yeniAdet]
        if (r < yeniAdet && d.hucre[c][r].classList.contains('kure')) yeniKureler.push(d.hucre[c][r])
        if (!mesafe) continue
        son = d.hucre[c][r].animate([
          { transform: `translateY(${-mesafe * y}px)`, opacity: r < yeniAdet ? 0.2 : 1, easing: 'cubic-bezier(.5,0,.75,.4)' },
          { transform: 'translateY(0) scale(1.08, .88)', opacity: 1, offset: 0.78, easing: 'ease-out' },
          { transform: 'translateY(0) scale(1)', opacity: 1 },
        ], { duration: (300 + mesafe * 45) * hiz(), delay: c * 25 * hiz(), fill: 'backwards' })
      }
    }
    setTimeout(dusmeSesi, 240 * hiz())
    await bitince(son)
    kureGeldi(d, yeniKureler)
  }

  /** Tahtada 3 fırtına bulutu varsa dördüncüsü beklenir: gök gürler, bulutlar parlar. */
  async function gerilim(d) {
    const bulutlar = hepsi(d).filter((el) => el.classList.contains('daginik'))
    if (bulutlar.length < 3) return
    d.makine.classList.add('gerilim')
    bulutlar.forEach((el) => {
      el.classList.add('parlak')
      const [x, y] = merkez(d, el)
      d.efekt?.halka(x, y, '#b48cff', 40, 0.6)
    })
    gokGurultusu(0.8)
    await bekle(750)
    d.makine.classList.remove('gerilim')
    bulutlar.forEach((el) => el.classList.remove('parlak'))
  }

  /** Bir dönüşün patlamaları, sonra kürelerin çarpanı. `fs`: bedava dönüşte toplam çarpan göstergesi korunur. */
  async function donusOynat(d, donus, fs = false) {
    const { s, sat } = d.veri
    const adimlar = donus.a
    for (let i = 0; i < adimlar.length - 1; i += 1) {
      const a = adimlar[i]
      const hucreler = a.p.map((n) => d.hucre[Math.floor(n / sat)][n % sat])
      hucreler.forEach((el) => el.classList.add('parlak'))
      ton(988, 0.1, { tip: 'sine', guc: 0.06 })
      a.o.forEach(([si, adet, kat], j) => setTimeout(() => yaziUcur(d, `${adet}× ${s[si]}  ${virgul(kat)}x`, `odeme o${j}`), j * 160 * hiz()))
      await bekle(480)
      // Patlayan kümelere tepeden şimşek iner; bütçe: kümede en çok 3 şimşek.
      const ornek = hucreler.filter((_, j) => j % Math.max(1, Math.ceil(hucreler.length / 3)) === 0)
      for (const el of ornek) {
        const [x, y] = merkez(d, el)
        d.efekt?.simsek(x + (Math.random() - 0.5) * 60, 0, x, y, '#8fd3ff', 0.3, 2.2)
      }
      d.efekt?.flas('rgba(190,225,255,.85)', 0.35)
      hucreler.forEach((el, j) => {
        const [x, y] = merkez(d, el)
        d.efekt?.patlat(x, y, RENK[el.textContent] ?? '#cfe9ff', 3)
        el.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.4)', opacity: 1, offset: 0.35 }, { transform: 'scale(0)', opacity: 0 }],
          { duration: 300 * hiz(), delay: (j % 6) * 12 * hiz(), easing: 'ease-in', fill: 'forwards' })
      })
      patlamaSesi()
      carpmaSesi()
      tutarUcur(d, hucreler, a.k * d.veri.taban)
      kazancYaz(d, a.k)
      await bekle(360)
      await dus(d, a.p, adimlar[i + 1])
      await bekle(110)
    }
    if (donus.h > 0 && donus.u > 0) await kureOynat(d, donus, fs)
  }

  /** Kürelerden çarpan göstergesine şimşek, toplam çarpan büyür, kazanç çarpılır. */
  async function kureOynat(d, donus, fs) {
    const kureler = hepsi(d).filter((el) => el.classList.contains('kure'))
    const hedef = d.makine.querySelector('.yk-carpan')
    const m = d.makine.getBoundingClientRect()
    const h = hedef.getBoundingClientRect()
    const hx = h.left - m.left + h.width / 2
    const hy = h.top - m.top + h.height / 2
    let toplam = fs ? donus.c - donus.u : 0
    d.makine.classList.add('karanlik')
    gokGurultusu(1)
    await bekle(350)
    for (const el of kureler) {
      const [x, y] = merkez(d, el)
      el.classList.add('parlak')
      d.efekt?.simsek(x, y, hx, hy, '#ffe07a', 0.5, 3)
      d.efekt?.halka(x, y, '#ffe07a', 50, 0.5)
      carpmaSesi()
      toplam += Number(el.dataset.x)
      carpanYaz(d, toplam)
      await bekle(260)
    }
    d.efekt?.flas('rgba(255,236,160,.95)', 0.7, hx, hy)
    sars(d, 7)
    yaziUcur(d, `⚡ x${donus.c}`, 'kombo yk-kat')
    gokGurultusu(1.3)
    kazancYaz(d, donus.k - donus.h)
    await bekle(900)
    d.makine.classList.remove('karanlik')
    if (!fs) carpanYaz(d, 0)
  }

  async function bedavaOynat(d) {
    const { fs, ek } = d.veri
    const tur = d.makine.querySelector('.yk-tur')
    hepsi(d).filter((el) => el.classList.contains('daginik')).forEach((el) => el.classList.add('parlak'))
    const ox = d.makine.clientWidth / 2
    const oy = d.makine.clientHeight / 2
    for (let i = 0; i < 5; i += 1) {
      setTimeout(() => {
        d.efekt?.simsek(Math.random() * d.makine.clientWidth, 0, ox + (Math.random() - 0.5) * 80, oy, i % 2 ? '#b48cff' : '#8fd3ff', 0.5, 3)
        d.efekt?.halka(ox, oy, i % 2 ? '#b48cff' : '#8fd3ff', 110 + i * 40, 1)
      }, i * 120 * hiz())
    }
    d.efekt?.flas('rgba(180,160,255,.95)', 0.85)
    d.efekt?.yagmur(60, ['#8fd3ff', '#b48cff', '#ffe07a', '#ffffff'])
    gokGurultusu(1.5)
    sars(d, 7)
    const baslangic = fs.length - fs.reduce((t, x) => t + (x.ek ? 1 : 0) * ek, 0)
    yaziUcur(d, `🌩️ ${baslangic} BEDAVA DÖNÜŞ`, 'bedava')
    await bekle(1500)
    d.makine.classList.add('firtina')
    carpanYaz(d, 0)
    let toplam = baslangic
    for (let i = 0; i < fs.length; i += 1) {
      if (tur) tur.textContent = `🌩️ ${i + 1}/${toplam}`
      await bosalt(d)
      await dokulGir(d, fs[i].a[0])
      await gerilim(d)
      await donusOynat(d, fs[i], true)
      if (fs[i].ek) {
        toplam += fs[i].ek
        hepsi(d).filter((el) => el.classList.contains('daginik')).forEach((el) => el.classList.add('parlak'))
        yaziUcur(d, `+${fs[i].ek} DÖNÜŞ`, 'bedava')
        gokGurultusu(0.8)
        await bekle(1000)
      }
      await bekle(220)
    }
  }

  async function buyukKazanc(d, kat) {
    const seviye = BUYUK.find(([esik]) => kat >= esik)
    if (!seviye) return
    const perde = yeni('div', 'seker-buyuk yk-buyuk')
    const tutar = yeni('span', '', '0')
    perde.append(yeni('strong', '', seviye[1]), tutar, yeni('small', '', `${virgul(kat)}x`))
    d.makine.append(perde)
    const renkler = ['#ffe07a', '#8fd3ff', '#b48cff', '#ffffff']
    d.efekt?.flas('rgba(255,236,160,.95)', 0.9)
    d.efekt?.yagmur(kat >= 50 ? 140 : 90, renkler)
    const w = d.makine.clientWidth
    const hh = d.makine.clientHeight
    for (let i = 0; i < 6; i += 1) {
      setTimeout(() => d.efekt?.simsek(Math.random() * w, 0, Math.random() * w, hh * (0.5 + Math.random() * 0.5), '#ffe07a', 0.45, 3), i * 260 * hiz())
    }
    sayac(tutar, 0, Math.round(kat * d.veri.taban), 1800)
    gokGurultusu(1.6)
    for (let i = 0; i < 14; i += 1) ton(700 + i * 90, 0.08, { tip: 'triangle', guc: 0.07, gecikme: i * 0.1 * hiz() })
    sars(d, 8)
    await bekle(3200)
    perde.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300 * hiz(), fill: 'forwards' }).finished.then(() => perde.remove(), () => perde.remove())
  }

  /** Sonuç kartının makinesini oynatır; animasyon bitince çözülen Promise döner (oyun.js bakiyeyi sonra sayar). */
  function oynat(kutu) {
    const makine = kutu.querySelector('.yk-makine')
    if (!makine) return 0
    if (!makine.dataset.yildirim) {
      if (oto) {
        oto = null
        otoCubugu()
      }
      const hucreler = [...makine.querySelectorAll('.yk')]
      const y = hucreler[0]?.offsetHeight || 48
      hucreler.forEach((el, i) => el.animate([{ transform: `translateY(${-6 * y}px)`, opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
        { duration: 500, delay: (i % 6) * 55 + (4 - Math.floor(i / 6)) * 30, easing: 'cubic-bezier(.25,1.3,.55,1)', fill: 'backwards' }))
      return 0
    }
    let veri
    try {
      veri = JSON.parse(makine.dataset.yildirim)
    } catch (err) {
      console.error('Yıldırım verisi okunamadı', err)
      return 0
    }
    atla = false
    kutu.classList.add('oynuyor')
    const d = sahneKur(makine, veri)
    const tur = makine.querySelector('.yk-tur')
    if (tur) tur.textContent = veri.bonus ? '🎁 BONUS' : ''
    makine.addEventListener('click', () => { atla = true }, { once: true })
    return (async () => {
      await dokulGir(d, veri.ana.a[0])
      await gerilim(d)
      await donusOynat(d, veri.ana)
      if (veri.dk) kazancYaz(d, veri.dk)
      if (veri.fs) await bedavaOynat(d)
      await buyukKazanc(d, veri.kat)
      kutu.classList.remove('oynuyor')
      kutu.classList.add('bitti')
      const durum = kutu.dataset.durum
      if (durum === 'kazandi') sesler()?.sesler.kazan(Number(kutu.dataset.carpan) || 1)
      else if (durum === 'kaybetti' && !veri.ana.a[1]) sesler()?.sesler.kaybet()
      otomatikSonra(kutu, veri)
      return 0
    })()
  }

  /** Beklerken semboller aşağı dökülür. */
  function bekleme() {
    const eski = document.querySelector('#sonuc .yk-makine')
    const gorsel = eski ? eski.cloneNode(true) : null
    if (!gorsel) return null
    delete gorsel.dataset.yildirim
    gorsel.classList.remove('firtina', 'karanlik')
    gorsel.querySelector('.yk-sahne')?.replaceChildren()
    gorsel.querySelector('.seker-buyuk')?.remove()
    gorsel.querySelector('.seker-tuval')?.remove()
    requestAnimationFrame(() => {
      const hucreler = [...gorsel.querySelectorAll('.yk')]
      const y = hucreler[0]?.offsetHeight || 48
      hucreler.forEach((el, i) => el.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${6 * y}px)`, opacity: 0 }],
        { duration: 320 * hiz(), delay: ((i % 6) * 35 + (4 - Math.floor(i / 6)) * 20) * hiz(), easing: 'cubic-bezier(.5,0,.9,.5)', fill: 'forwards' }))
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
      const dur = yeni('button', 'oto-dur', '■ DURDUR')
      dur.type = 'button'
      dur.addEventListener('click', () => {
        oto = null
        otoCubugu()
      })
      cubuk.append(yeni('span', 'oto-yazi'), dur)
      document.body.append(cubuk)
    }
    cubuk.querySelector('.oto-yazi').textContent = `🔁 Otomatik · ${oto.kalan} kaldı`
  }

  function cevir() {
    const form = document.querySelector('form.k-yıldırım')
    const dugme = form?.querySelector('.yk-cevir')
    if (!form || !dugme || document.body.classList.contains('bekliyor')) return false
    form.requestSubmit(dugme)
    return true
  }

  function otomatikSonra(kutu, veri) {
    if (!oto) return
    const durdur = () => {
      oto = null
      otoCubugu()
    }
    if (kutu.dataset.durum === 'hata') return durdur()
    if (oto.bonusDur && veri?.fs) return durdur()
    if (oto.buyukDur && veri?.kat >= 50) return durdur()
    if (oto.kalan <= 0) return durdur()
    setTimeout(() => {
      if (!oto) return
      oto.kalan -= 1
      otoCubugu()
      if (!cevir()) durdur()
    }, 350 * hiz())
  }

  function hazirla() {
    for (const d of document.querySelectorAll('.yk-hizli')) {
      if (d.dataset.kuruldu) continue
      d.dataset.kuruldu = '1'
      d.hidden = false
      d.addEventListener('click', () => {
        if (document.querySelector('#sonuc.oynuyor')) atla = true
        else cevir()
      })
    }
    const form = document.querySelector('form.k-yıldırım')
    if (!form || form.dataset.kuruldu) return
    form.dataset.kuruldu = '1'
    const ayar = form.querySelector('.yk-oto')
    if (ayar) ayar.hidden = false
    const turboKutu = form.querySelector('.yk-turbo')
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
    form.querySelector('.yk-bonus')?.addEventListener('click', (olay) => {
      const fiyat = olay.currentTarget.textContent.match(/(\d+)x/)?.[1] ?? ''
      if (!confirm(`Bonus bahsin ${fiyat} katı tutar ve doğrudan bedava dönüş başlatır. Alınsın mı?`)) olay.preventDefault()
    })
  }

  // Boşluk tuşu çevirir (yazı alanındayken değil).
  document.addEventListener('keydown', (olay) => {
    if (olay.code !== 'Space' || olay.repeat) return
    if (olay.target instanceof HTMLInputElement || olay.target instanceof HTMLSelectElement || olay.target instanceof HTMLTextAreaElement) return
    if (!document.querySelector('form.k-yıldırım')) return
    olay.preventDefault()
    if (document.querySelector('#sonuc.oynuyor')) {
      atla = true
      return
    }
    cevir()
  })

  window.YildirimKalesi = { oynat, bekleme, hazirla }
})()
