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
      enerji: 0,
      efekt: efektKur(makine),
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

  // Zayıf telefonda (az çekirdek ya da "hareketi azalt") parçacık bütçesi küçülür.
  const azGuc = (navigator.hardwareConcurrency || 4) <= 4 || matchMedia('(prefers-reduced-motion: reduce)').matches
  const BUTCE = azGuc ? 160 : 420

  /**
   * Bütün parçacıklar tek bir <canvas>'ta çizilir: her parçacık ayrı DOM öğesi olunca telefon
   * patlama anında kare atlıyordu. Kanvas makinenin üstündedir, tıklamayı geçirir.
   */
  function efektKur(makine) {
    let tuval = makine.querySelector('.seker-tuval')
    if (!tuval) {
      tuval = yeni('canvas', 'seker-tuval')
      tuval.setAttribute('aria-hidden', 'true')
      makine.append(tuval)
    }
    const ctx = tuval.getContext('2d')
    const oran = Math.min(window.devicePixelRatio || 1, azGuc ? 1.5 : 2)
    let parcalar = []
    let halkalar = []
    let simsekler = []
    let flas = null
    let calisiyor = false
    let onceki = 0

    function boyutla() {
      const w = makine.clientWidth
      const hh = makine.clientHeight
      if (tuval.width !== Math.round(w * oran) || tuval.height !== Math.round(hh * oran)) {
        tuval.width = Math.round(w * oran)
        tuval.height = Math.round(hh * oran)
      }
    }

    function ciz(simdi) {
      // rAF'in zamanı baslat()'taki performance.now()'dan önce olabilir: süre eksiye düşerse halka yarıçapı eksi
      // olur, arc() hata atar ve döngü durup efektler donar.
      const dt = Math.max(0, Math.min(0.05, (simdi - onceki) / 1000 || 0.016)) / Math.max(hiz(), 0.3)
      onceki = simdi
      const w = tuval.width / oran
      const hh = tuval.height / oran
      ctx.setTransform(oran, 0, 0, oran, 0, 0)
      ctx.clearRect(0, 0, w, hh)
      if (flas) {
        flas.omur -= dt
        if (flas.omur <= 0) flas = null
        else {
          const g = ctx.createRadialGradient(flas.x, flas.y, 0, flas.x, flas.y, Math.max(w, hh) * 0.75)
          g.addColorStop(0, flas.renk)
          g.addColorStop(1, 'rgba(255,255,255,0)')
          ctx.globalAlpha = (flas.omur / flas.sure) * flas.guc
          ctx.fillStyle = g
          ctx.fillRect(0, 0, w, hh)
        }
      }
      halkalar = halkalar.filter((r) => (r.omur -= dt) > 0)
      for (const r of halkalar) {
        const t = 1 - r.omur / r.sure
        ctx.globalAlpha = (1 - t) * 0.9
        ctx.strokeStyle = r.renk
        ctx.lineWidth = r.kalin * (1 - t) + 1
        ctx.beginPath()
        ctx.arc(r.x, r.y, Math.max(0, 6 + r.yaricap * (1 - (1 - t) ** 3)), 0, Math.PI * 2)
        ctx.stroke()
      }
      // Şimşek her karede yeniden zikzaklanır, titrer; parlaklık shadowBlur'suz iki çizgiyle verilir (telefonda ucuz).
      simsekler = simsekler.filter((b) => (b.omur -= dt) > 0)
      for (const b of simsekler) {
        const boy = Math.hypot(b.x2 - b.x1, b.y2 - b.y1)
        const nx = -(b.y2 - b.y1) / (boy || 1)
        const ny = (b.x2 - b.x1) / (boy || 1)
        const noktalar = [[b.x1, b.y1]]
        for (let i = 1; i < b.parca; i += 1) {
          const t = i / b.parca
          const sapma = (Math.random() - 0.5) * boy * 0.16 * Math.sin(Math.PI * t)
          noktalar.push([b.x1 + (b.x2 - b.x1) * t + nx * sapma, b.y1 + (b.y2 - b.y1) * t + ny * sapma])
        }
        noktalar.push([b.x2, b.y2])
        const yol = () => {
          ctx.beginPath()
          noktalar.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
          ctx.stroke()
        }
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.globalAlpha = Math.min(1, (b.omur / b.sure) * 1.5) * 0.45
        ctx.strokeStyle = b.renk
        ctx.lineWidth = b.kalin * 3
        yol()
        ctx.globalAlpha = Math.min(1, (b.omur / b.sure) * 1.5)
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = b.kalin
        yol()
      }
      parcalar = parcalar.filter((p) => (p.omur -= dt) > 0)
      for (const p of parcalar) {
        p.vy += p.yercekimi * dt
        p.vx *= 1 - 1.6 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.aci += p.donme * dt
        ctx.globalAlpha = Math.min(1, (p.omur / p.sure) * 1.6)
        ctx.fillStyle = p.renk
        if (p.tur === 'kivilcim') {
          ctx.strokeStyle = p.renk
          ctx.lineWidth = p.boy * 0.5
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04)
          ctx.stroke()
        } else if (p.tur === 'serit') {
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.aci)
          ctx.fillRect(-p.boy, -p.boy * 0.35, p.boy * 2, p.boy * 0.7 * Math.abs(Math.cos(p.aci * 1.7)) + 1)
          ctx.restore()
        } else if (p.tur === 'yildiz') {
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.aci)
          ctx.beginPath()
          for (let i = 0; i < 8; i += 1) {
            const yr = i % 2 ? p.boy * 0.4 : p.boy
            ctx.lineTo(Math.cos((i * Math.PI) / 4) * yr, Math.sin((i * Math.PI) / 4) * yr)
          }
          ctx.fill()
          ctx.restore()
        } else {
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.boy, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
      if (parcalar.length || halkalar.length || simsekler.length || flas) requestAnimationFrame(ciz)
      else calisiyor = false
    }

    function baslat() {
      if (calisiyor) return
      calisiyor = true
      boyutla()
      onceki = performance.now()
      requestAnimationFrame(ciz)
    }

    const ekle = (p) => {
      if (parcalar.length >= BUTCE) parcalar.shift()
      parcalar.push(p)
    }

    return {
      /** (x, y) makineye göre; `guc` 0-10, kombo büyüdükçe artar. */
      patlat(x, y, renk, guc) {
        const adet = Math.round((azGuc ? 6 : 10) + guc * (azGuc ? 1 : 2))
        for (let i = 0; i < adet; i += 1) {
          const aci = Math.random() * Math.PI * 2
          const hizi = 90 + Math.random() * 170 + guc * 22
          const tur = i % 5 === 0 ? 'yildiz' : i % 3 === 0 ? 'kivilcim' : 'daire'
          ekle({
            x, y, vx: Math.cos(aci) * hizi, vy: Math.sin(aci) * hizi - 60, yercekimi: 520, aci, donme: 6,
            boy: tur === 'yildiz' ? 5 + Math.random() * 3 : 2.5 + Math.random() * 3.5,
            renk: tur === 'yildiz' ? '#fff8c4' : renk, tur, omur: 0.55 + Math.random() * 0.45, sure: 1,
          })
        }
        halkalar.push({ x, y, renk: '#ffffff', kalin: 5, yaricap: 26 + guc * 5, omur: 0.45, sure: 0.45 })
        baslat()
      },
      /** (x1, y1)'den (x2, y2)'ye titreyen şimşek (Yıldırım Kalesi). */
      simsek(x1, y1, x2, y2, renk = '#8fd3ff', sure = 0.4, kalin = 2.5) {
        simsekler.push({ x1, y1, x2, y2, renk, sure, omur: sure, kalin, parca: azGuc ? 7 : 11 })
        baslat()
      },
      halka(x, y, renk, yaricap, sure = 0.8) {
        halkalar.push({ x, y, renk, kalin: 10, yaricap, omur: sure, sure })
        baslat()
      },
      flas(renk, guc = 0.6, x = makine.clientWidth / 2, y = makine.clientHeight / 2) {
        flas = { renk, guc, x, y, omur: 0.35, sure: 0.35 }
        baslat()
      },
      /** Tepeden konfeti yağar (büyük kazanç, bedava dönüş). */
      yagmur(adet, renkler) {
        const w = makine.clientWidth
        for (let i = 0; i < (azGuc ? Math.round(adet / 2) : adet); i += 1) {
          ekle({
            x: Math.random() * w, y: -20 - Math.random() * 120, vx: Math.random() * 60 - 30, vy: 60 + Math.random() * 120,
            yercekimi: 140, aci: Math.random() * 6, donme: Math.random() * 8 - 4, boy: 4 + Math.random() * 4,
            renk: renkler[i % renkler.length], tur: i % 4 ? 'serit' : 'yildiz', omur: 2.6 + Math.random(), sure: 3.6,
          })
        }
        baslat()
      },
    }
  }

  /** Hücrenin makineye göre ortası. */
  function merkez(d, el) {
    const m = d.makine.getBoundingClientRect()
    const h = el.getBoundingClientRect()
    return [h.left - m.left + h.width / 2, h.top - m.top + h.height / 2]
  }

  /** Kazancın tutarı patlayan kümenin ortasından yükselir. */
  function tutarUcur(d, hucreler, xp) {
    if (!hucreler.length || !xp) return
    const m = d.makine.getBoundingClientRect()
    let x = 0
    let y = 0
    for (const el of hucreler) {
      const [cx, cy] = merkez(d, el)
      x += cx
      y += cy
    }
    const yazi = yeni('div', 'seker-tutar', `+${binlik.format(Math.round(xp))}`)
    d.makine.append(yazi)
    const sol = Math.min(Math.max(x / hucreler.length, 50), m.width - 50)
    yazi.animate([
      { transform: `translate(${sol}px, ${y / hucreler.length}px) translate(-50%, -50%) scale(.5)`, opacity: 0 },
      { transform: `translate(${sol}px, ${y / hucreler.length - 20}px) translate(-50%, -50%) scale(1.25)`, opacity: 1, offset: 0.2 },
      { transform: `translate(${sol}px, ${y / hucreler.length - 70}px) translate(-50%, -50%) scale(1)`, opacity: 0 },
    ], { duration: 1100 * hiz(), easing: 'ease-out' }).finished.then(() => yazi.remove(), () => yazi.remove())
  }

  /** Kombo enerji çubuğu: her patlamada dolar, en üst basamakta yanar. */
  function enerjiYaz(d, basamak) {
    const cubuk = d.makine.querySelector('.seker-enerji i')
    if (!cubuk) return
    const oran = Math.min(1, basamak / 6)
    cubuk.animate([{ transform: `scaleX(${d.enerji ?? 0})` }, { transform: `scaleX(${oran})` }], { duration: 350 * hiz(), easing: 'cubic-bezier(.3,1.4,.6,1)', fill: 'forwards' })
    d.enerji = oran
    cubuk.parentElement.classList.toggle('dolu', oran >= 1)
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
        son = d.hucre[c][r].animate([
          { transform: `translateY(${-mesafe * y}px)`, opacity: r < yeniAdet ? 0.2 : 1, easing: 'cubic-bezier(.5,0,.75,.4)' },
          { transform: 'translateY(0) scale(1.1, .86)', opacity: 1, offset: 0.78, easing: 'ease-out' },
          { transform: 'translateY(0) scale(1)', opacity: 1 },
        ], { duration: (320 + mesafe * 45) * hiz(), delay: c * 25 * hiz(), fill: 'backwards' })
      }
    }
    setTimeout(dusmeSesi, 250 * hiz())
    await son?.finished.catch(() => {})
  }

  /** Tahtada 3 gökkuşağı varsa dördüncüsü beklenir: kalp atışı ve parlama. */
  async function gerilim(d) {
    const daginiklar = hepsi(d).filter((el) => el.classList.contains('daginik'))
    if (daginiklar.length < 3) return
    d.makine.classList.add('gerilim')
    daginiklar.forEach((el) => {
      el.classList.add('parlak')
      const [x, y] = merkez(d, el)
      d.efekt.halka(x, y, '#7cd6ff', 40, 0.6)
    })
    ;[0, 0.32].forEach((g) => ton(70, 0.18, { tip: 'sine', guc: 0.25, gecikme: g, kayma: 50 }))
    await bekle(700)
    d.makine.classList.remove('gerilim')
    daginiklar.forEach((el) => el.classList.remove('parlak'))
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
      d.efekt.flas(a.c >= 5 ? 'rgba(255,190,80,.95)' : 'rgba(255,255,255,.9)', Math.min(0.35 + buyukluk * 0.06, 0.75))
      hucreler.forEach((el, j) => {
        const [x, y] = merkez(d, el)
        d.efekt.patlat(x, y, RENK[el.textContent] ?? '#fff', buyukluk)
        el.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.45) rotate(12deg)', opacity: 1, offset: 0.35 }, { transform: 'scale(0)', opacity: 0 }],
          { duration: 320 * hiz(), delay: (j % 6) * 12 * hiz(), easing: 'ease-in', fill: 'forwards' })
      })
      patlamaSesi(i)
      if (a.c >= 2) {
        yaziUcur(d, `${KOMBO_ADI[a.c] ?? 'KOMBO'} x${a.c}`, `kombo k${Math.min(a.c, 21)}`)
        sars(d, 2 + Math.log2(a.c) * 2.5)
      }
      enerjiYaz(d, i + 1 + (d.komboTaban ?? 0))
      tutarUcur(d, hucreler, a.k * d.veri.taban)
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
    const ox = d.makine.clientWidth / 2
    const oy = d.makine.clientHeight / 2
    ;['#ff5a7a', '#ffd25a', '#6dff9a', '#5ac8ff', '#b48cff'].forEach((r, i) => setTimeout(() => d.efekt.halka(ox, oy, r, 120 + i * 40, 1.1), i * 110 * hiz()))
    d.efekt.flas('rgba(180,140,255,.95)', 0.8)
    d.efekt.yagmur(70, ['#ff5a7a', '#ffd25a', '#6dff9a', '#5ac8ff', '#b48cff', '#ffffff'])
    sars(d, 6)
    yaziUcur(d, `🌈 ${fs.length - fs.reduce((t, x) => t + x.ek, 0)} BEDAVA DÖNÜŞ`, 'bedava')
    await bekle(1500)
    d.makine.classList.add('firtina')
    let toplam = fs.length - fs.reduce((t, x) => t + x.ek, 0)
    for (let i = 0; i < fs.length; i += 1) {
      if (tur) tur.textContent = `🌈 ${i + 1}/${toplam}`
      await bosalt(d)
      await dokulGir(d, fs[i].a[0].t)
      await gerilim(d)
      d.komboTaban = fs.slice(0, i).reduce((t, x) => t + x.a.length - 1, 0)
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
    const renkler = ['#f5c542', '#ffe08a', '#ff4d94', '#ffffff', '#b48cff']
    d.efekt.flas('rgba(255,215,90,.95)', 0.9)
    d.efekt.yagmur(kat >= 50 ? 150 : 100, renkler)
    setTimeout(() => d.efekt.yagmur(80, renkler), 1300 * hiz())
    const ox = d.makine.clientWidth / 2
    const oy = d.makine.clientHeight / 2
    for (let i = 0; i < 3; i += 1) setTimeout(() => d.efekt.halka(ox, oy, '#ffe08a', 160 + i * 60, 1), i * 250 * hiz())
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
      await gerilim(d)
      d.komboTaban = 0
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

  /**
   * Alttaki otomatik çubuğu. Bonus gelince otomatik duraklar (`beklemede`), kalan çevirmeler kaybolmaz:
   * DEVAM kaldığı yerden sürdürür (bot sahibinin şikâyeti: duraklama yerine iptal ediyor, kalan haklar gidiyordu).
   */
  function otoCubugu() {
    let cubuk = document.querySelector('.oto-cubuk')
    if (!oto) {
      cubuk?.remove()
      return
    }
    if (!cubuk) {
      cubuk = yeni('div', 'oto-cubuk')
      document.body.append(cubuk)
    }
    const dur = yeni('button', 'oto-dur', '■ DURDUR')
    dur.type = 'button'
    dur.addEventListener('click', () => {
      oto = null
      otoCubugu()
    })
    if (oto.beklemede) {
      const devam = yeni('button', 'oto-devam', `▶ DEVAM (${oto.kalan})`)
      devam.type = 'button'
      devam.addEventListener('click', otoDevam)
      cubuk.replaceChildren(yeni('span', 'oto-yazi', '⏸ Bonus geldi'), devam, dur)
    } else {
      cubuk.replaceChildren(yeni('span', 'oto-yazi', `🔁 Otomatik · ${oto.kalan} kaldı`), dur)
    }
  }

  function otoDevam() {
    if (!oto) return
    oto.beklemede = false
    if (oto.kalan <= 0) {
      oto = null
      otoCubugu()
      return
    }
    oto.kalan -= 1
    otoCubugu()
    if (!cevir()) {
      oto = null
      otoCubugu()
    }
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
    // Duraklamışken elle çevrilen el otomatiği yeniden başlatmaz, DEVAM bekler.
    if (oto.beklemede) return
    if (oto.bonusDur && veri?.fs) {
      oto.beklemede = true
      otoCubugu()
      return
    }
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
  // Şeker Zinciri aynı parçacık motorunu kullanır (panel/zincir.js).
  window.SekerEfekt = efektKur
})()
