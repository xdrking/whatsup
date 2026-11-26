// Şeker Zinciri'nin tarayıcı tarafı: kaydırma ya da iki dokunuşla takas, hamleyi /oyun/zincir'e gönderir,
// sunucunun döndürdüğü adımları oynatır (patlama, özel şeker, düşme, kombo). Tahtayı sunucu tutar, burası
// yalnızca gösterir. Hareketler Web Animations API iledir (CSP satır içi stili engeller, CSSOM'u değil).
// Parçacıklar Şeker Fırtınası'nın kanvas motorundandır (window.SekerEfekt), sesler oyun.js'ten.
(() => {
  'use strict'

  // lib/zincir.js:RENKLER ile aynı sırada olmalı.
  const SEMBOL = ['🍓', '🍋', '🍇', '🍏', '🍬']
  const RENK = ['#ff4d6d', '#ffd23f', '#a970ff', '#7bd84a', '#ff7ad9']
  const HARF = 'abcdef'
  const KOMBO_ADI = [[8, 'ŞEKER FIRTINASI'], [5, 'EFSANE'], [3, 'MUHTEŞEM'], [2, 'SÜPER'], [1.5, 'KOMBO']]
  const BIRLESIM_ADI = { ss: 'SÜPER NOVA!', sb: 'MEGA PATLAMA!', sc: 'YILDIZ YAĞMURU!', bb: 'DEV PATLAMA!', bc: 'ÇAPRAZ ATEŞ!', cc: 'ARTI ATEŞ!' }
  // Bu kadar süre hamle yapılmazsa eşleşme yapılabilecek şekerler parlar.
  const IPUCU_MS = 3500
  const binlik = new Intl.NumberFormat('tr-TR')
  const azGuc = (navigator.hardwareConcurrency || 4) <= 4 || matchMedia('(prefers-reduced-motion: reduce)').matches
  const bekle = (ms) => new Promise((tamam) => setTimeout(tamam, ms))
  const ton = (...a) => window.KumarhaneSes?.ton(...a)
  const hisirti = (...a) => window.KumarhaneSes?.hisirti(...a)

  const yeni = (etiket, sinif, metin) => {
    const d = document.createElement(etiket)
    if (sinif) d.className = sinif
    if (metin !== undefined) d.textContent = metin
    return d
  }
  const bitince = (anim) => anim?.finished.catch(() => {})

  const patlamaSesi = (kombo) => {
    const taban = 480 * 1.1 ** Math.min(kombo, 12)
    ton(taban, 0.08, { tip: 'triangle', guc: 0.11, kayma: taban * 1.7 })
    ton(taban * 1.5, 0.1, { tip: 'sine', guc: 0.06, gecikme: 0.04 })
    hisirti(0.16, { guc: 0.1, filtre: 3400 })
  }
  const takasSesi = () => ton(660, 0.06, { tip: 'sine', guc: 0.06, kayma: 880 })
  const hataSesi = () => ton(180, 0.14, { tip: 'square', guc: 0.05, kayma: 120 })
  const ozelSesi = () => [784, 1175, 1568].forEach((f, i) => ton(f, 0.12, { tip: 'sine', guc: 0.06, gecikme: i * 0.05 }))
  const dusmeSesi = () => ton(240, 0.07, { tip: 'sine', guc: 0.05, kayma: 150 })

  /** Hücreye iki harfli kodu yazar (renk a-f, özel . h v b s). Özel şeker kendi meyvesinin parlak halidir. */
  function hucreYaz(el, kod, ek = '') {
    const o = kod[1]
    el.className = `zh r${HARF.indexOf(kod[0])}${o !== '.' ? ` ozel-${o}` : ''}${ek}`
    el.textContent = SEMBOL[HARF.indexOf(kod[0])]
  }
  const kodlar = (t) => Array.from({ length: t.length / 2 }, (_, i) => t.slice(i * 2, i * 2 + 2))
  const renkKodu = (kod) => RENK[HARF.indexOf(kod[0])]

  function kur(makine) {
    if (makine.dataset.kuruldu) return
    makine.dataset.kuruldu = '1'
    const veri = JSON.parse(makine.dataset.zincir)
    const N = veri.boyut
    const tahtaEl = makine.querySelector('.zincir-tahta')
    const sahne = makine.querySelector('.zincir-sahne')
    const hucreler = [...tahtaEl.children]
    const efekt = window.SekerEfekt?.(makine) ?? null
    const d = { kod: kodlar(veri.t), kilit: false, secili: null, xp: veri.xp, kalan: veri.kalan, enerji: 0, ipucu: veri.ipucu ?? [], ipucuZaman: null }
    const komsu = (i, j) => (Math.floor(i / N) === Math.floor(j / N) && Math.abs(i - j) === 1) || Math.abs(i - j) === N

    const ciz = () => hucreler.forEach((el, i) => hucreYaz(el, d.kod[i], d.secili === i ? ' secili' : ''))
    ciz()

    const merkez = (el) => {
      const m = makine.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      return [r.left - m.left + r.width / 2, r.top - m.top + r.height / 2]
    }
    const adim = () => hucreler[N].getBoundingClientRect().top - hucreler[0].getBoundingClientRect().top

    function ustYaz(kombo) {
      makine.querySelector('.zincir-hamle b').textContent = String(d.kalan)
      const k = makine.querySelector('.zincir-kombo b')
      k.textContent = `x${String(kombo).replace('.', ',')}`
      k.parentElement.classList.toggle('sicak', kombo >= 3)
      k.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.3,1.6,.5,1)' })
      const bitir = makine.closest('form')?.querySelector('.zincir-bitir')
      if (bitir) bitir.textContent = `💰 BİTİR · ${binlik.format(d.xp)} XP`
    }

    function kazancSay(yeniXp) {
      const el = makine.querySelector('.zincir-kazanc b')
      const bas = d.xp
      d.xp = yeniXp
      const t0 = performance.now()
      const adimla = (simdi) => {
        const oran = Math.min(1, (simdi - t0) / 450)
        el.textContent = binlik.format(Math.round(bas + (yeniXp - bas) * (1 - (1 - oran) ** 3)))
        if (oran < 1) requestAnimationFrame(adimla)
      }
      requestAnimationFrame(adimla)
      el.parentElement.classList.remove('vurgu')
      void el.offsetWidth
      el.parentElement.classList.add('vurgu')
    }

    function enerjiYaz(basamak) {
      const cubuk = makine.querySelector('.zincir-enerji i')
      const oran = Math.min(1, basamak / 6)
      cubuk.animate([{ transform: `scaleX(${d.enerji})` }, { transform: `scaleX(${oran})` }], { duration: 300, easing: 'cubic-bezier(.3,1.4,.6,1)', fill: 'forwards' })
      d.enerji = oran
      cubuk.parentElement.classList.toggle('dolu', oran >= 1)
    }

    function yazi(metin, sinif = '') {
      const y = yeni('div', `zincir-yazi ${sinif}`, metin)
      sahne.append(y)
      y.animate([
        { transform: 'translate(-50%, -50%) scale(.3) rotate(-8deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.15) rotate(2deg)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%, -85%) scale(.9)', opacity: 0 },
      ], { duration: 1100, easing: 'ease-out' }).finished.then(() => y.remove(), () => y.remove())
    }

    function tutarUcur(liste, xp) {
      if (!liste.length || xp < 1) return
      let x = 0
      let y = 0
      for (const i of liste) {
        const [cx, cy] = merkez(hucreler[i])
        x += cx
        y += cy
      }
      x = Math.min(Math.max(x / liste.length, 50), makine.clientWidth - 50)
      y /= liste.length
      const el = yeni('div', 'zincir-tutar', `+${binlik.format(xp)}`)
      makine.append(el)
      el.animate([
        { transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(.5)`, opacity: 0 },
        { transform: `translate(${x}px, ${y - 18}px) translate(-50%, -50%) scale(1.2)`, opacity: 1, offset: 0.2 },
        { transform: `translate(${x}px, ${y - 64}px) translate(-50%, -50%) scale(1)`, opacity: 0 },
      ], { duration: 1000, easing: 'ease-out' }).finished.then(() => el.remove(), () => el.remove())
    }

    function sars(guc) {
      const p = Math.min(guc, 9)
      makine.animate([
        { transform: 'translate(0,0)' }, { transform: `translate(${-p}px, ${p / 2}px)` },
        { transform: `translate(${p}px, ${-p / 2}px)` }, { transform: 'translate(0,0)' },
      ], { duration: 300 })
      navigator.vibrate?.(Math.min(30 + guc * 10, 140))
    }

    /** Çizgili şekerin ışını satır ya da sütun boyunca çakar. */
    function isin(i, yon) {
      const el = hucreler[i]
      const m = makine.getBoundingClientRect()
      const t = tahtaEl.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      const cizgi = yeni('div', `zincir-isin ${yon === 'h' ? 'yatay' : 'dikey'}`)
      makine.append(cizgi)
      const [x, y] = merkez(el)
      // Boy da kare kareye yazılır: satır içi stil özniteliği yazılmaz (CSP), WAAPI CSSOM'dur.
      const kare = yon === 'h'
        ? [{ width: `${t.width}px`, transform: `translate(${t.left - m.left}px, ${y}px) translateY(-50%) scaleX(0)`, opacity: 1 }, { width: `${t.width}px`, transform: `translate(${t.left - m.left}px, ${y}px) translateY(-50%) scaleX(1)`, opacity: 0 }]
        : [{ height: `${t.height}px`, transform: `translate(${x}px, ${t.top - m.top}px) translateX(-50%) scaleY(0)`, opacity: 1 }, { height: `${t.height}px`, transform: `translate(${x}px, ${t.top - m.top}px) translateX(-50%) scaleY(1)`, opacity: 0 }]
      cizgi.animate(kare, { duration: 420, easing: 'cubic-bezier(.2,.8,.3,1)' }).finished.then(() => cizgi.remove(), () => cizgi.remove())
      efekt?.halka(x, y, '#fff6a0', Math.max(r.width, 30) * 2.2, 0.5)
    }

    /** Bir adımın patlaması: tetiklenen özeller, silinenler, doğan özel şeker, kombo ve tutar. */
    async function patlat(a, n) {
      const kombo = a.c
      for (const [i, tur] of a.e) {
        const [x, y] = merkez(hucreler[i])
        if (tur === 'h' || tur === 'v') isin(i, tur)
        else if (tur === 'b') {
          efekt?.halka(x, y, '#ffb13d', 120, 0.7)
          efekt?.flas('rgba(255,190,80,.9)', 0.35, x, y)
        } else {
          // Süper parlak: geniş halka, beyaz parlama, iki şok dalgası.
          efekt?.halka(x, y, '#ffffff', 190, 0.8)
          efekt?.halka(x, y, renkKodu(d.kod[i]), 140, 0.6)
          efekt?.flas('rgba(255,250,220,.95)', 0.6, x, y)
        }
      }
      if (a.e.length) sars(3 + a.e.length * 2)
      const guc = Math.min(10, n * 1.5 + a.e.length * 2)
      // Parçacık bütçesi: çok şeker patlayınca hepsinden değil, bir kısmından saçılır.
      const ornek = a.s.filter((_, x) => x % Math.max(1, Math.ceil(a.s.length / (azGuc ? 8 : 16))) === 0)
      for (const i of ornek) {
        const [x, y] = merkez(hucreler[i])
        efekt?.patlat(x, y, renkKodu(d.kod[i]), guc)
      }
      let son = null
      for (const i of a.s) {
        son = hucreler[i].animate([
          { transform: 'scale(1)', opacity: 1 },
          { transform: 'scale(1.35) rotate(8deg)', opacity: 1, offset: 0.35 },
          { transform: 'scale(0)', opacity: 0 },
        ], { duration: 300, easing: 'ease-in', fill: 'forwards' })
      }
      patlamaSesi(n)
      for (const [i, o, r] of a.o) {
        d.kod[i] = o === 'r' ? 'xr' : `${HARF[r]}${o}`
        hucreYaz(hucreler[i], d.kod[i])
        hucreler[i].animate([{ transform: 'scale(.2)' }, { transform: 'scale(1.4)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.3,1.5,.5,1)' })
        const [x, y] = merkez(hucreler[i])
        efekt?.halka(x, y, '#ffffff', 60, 0.6)
        ozelSesi()
      }
      const xp = Math.floor(a.k * veri.taban)
      tutarUcur(a.s, xp)
      ustYaz(kombo)
      enerjiYaz(n + 1)
      if (kombo > 1) {
        const ad = KOMBO_ADI.find(([esik]) => kombo >= esik)?.[1] ?? 'KOMBO'
        yazi(`${ad} x${String(kombo).replace('.', ',')}`, `kombo${kombo >= 5 ? ' buyuk' : ''}`)
        if (kombo >= 3) efekt?.flas('rgba(255,255,255,.8)', 0.25)
      }
      await bitince(son)
      return xp
    }

    /** Silinenler çıkar, üsttekiler düşer, boşluğa yenileri yağar; `t` sunucunun son tahtası. */
    async function dus(a) {
      const sil = new Set(a.s)
      const h = adim()
      const yeniKod = kodlar(a.t)
      const dusme = Array(N * N).fill(0)
      for (let c = 0; c < N; c += 1) {
        const kalan = []
        for (let r = 0; r < N; r += 1) if (!sil.has(r * N + c)) kalan.push(r)
        const bos = N - kalan.length
        kalan.forEach((r, m) => { dusme[(bos + m) * N + c] = bos + m - r })
        for (let r = 0; r < bos; r += 1) dusme[r * N + c] = bos
      }
      d.kod = yeniKod
      let son = null
      hucreler.forEach((el, i) => {
        el.getAnimations().forEach((x) => x.cancel())
        hucreYaz(el, d.kod[i])
        if (!dusme[i]) return
        son = el.animate([{ transform: `translateY(${-dusme[i] * h}px)` }, { transform: 'translateY(0)' }],
          { duration: 220 + dusme[i] * 45, easing: 'cubic-bezier(.3,1.25,.55,1)', fill: 'backwards' })
      })
      if (son) setTimeout(dusmeSesi, 200)
      await bitince(son)
    }

    /** Bütün şekerler aşağı dökülür (tahtadan çıkar). */
    async function dok() {
      const h = adim()
      let son = null
      hucreler.forEach((el, i) => {
        el.getAnimations().forEach((x) => x.cancel())
        const r = Math.floor(i / N)
        son = el.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${(N - r + 1) * h}px)`, opacity: 0 }],
          { duration: 420, delay: (i % N) * 35 + (N - 1 - r) * 18, easing: 'cubic-bezier(.5,0,.9,.5)', fill: 'forwards' })
      })
      hisirti(0.5, { guc: 0.08, filtre: 900 })
      await bitince(son)
    }

    /** Yeni tahta yukarıdan yağar. */
    async function yag(t) {
      const h = adim()
      d.kod = kodlar(t)
      let son = null
      hucreler.forEach((el, i) => {
        el.getAnimations().forEach((x) => x.cancel())
        hucreYaz(el, d.kod[i])
        const r = Math.floor(i / N)
        son = el.animate([{ transform: `translateY(${-(N + 1) * h}px)`, opacity: 0.3 }, { transform: 'translateY(0)', opacity: 1 }],
          { duration: 460, delay: (i % N) * 45 + (N - 1 - r) * 28, easing: 'cubic-bezier(.25,1.3,.55,1)', fill: 'backwards' })
      })
      setTimeout(dusmeSesi, 450)
      await bitince(son)
    }

    /** Eşleşme kalmadı: tahta dökülür, yenisi yağar, yağarken eşleşenler patlar. */
    async function yagmur(liste) {
      for (const y of liste) {
        yazi('ŞEKER YAĞMURU', 'kombo')
        await bekle(350)
        await dok()
        await yag(y.t)
        let n = 0
        for (const a of y.a) {
          await patlat(a, n)
          await dus(a)
          n += 1
        }
        if (n >= 2) efekt?.yagmur(30, RENK)
      }
    }

    function ipucuSil() {
      clearTimeout(d.ipucuZaman)
      for (const el of tahtaEl.querySelectorAll('.zh.ipucu')) el.classList.remove('ipucu')
    }
    function ipucuKur() {
      ipucuSil()
      d.ipucuZaman = setTimeout(() => {
        if (d.kilit || d.secili !== null) return
        for (const i of d.ipucu) hucreler[i]?.classList.add('ipucu')
      }, IPUCU_MS)
    }

    /** El bitti: sonuç sayfası getirilir, oyun.js bakiyeyi sayar ve sonuç kartını açar. */
    async function bitir() {
      makine.classList.add('bitti')
      try {
        const yanit = await fetch(location.href, { credentials: 'same-origin' })
        const html = await yanit.text()
        if (window.KumarhaneSayfa) window.KumarhaneSayfa.degistir(html, true, yanit.url)
        else location.reload()
      } catch (err) {
        console.error('Sonuç getirilemedi', err)
        location.reload()
      }
    }

    function geriAl(i, j) {
      const [dx, dy] = farki(i, j)
      hataSesi()
      hucreler[i].animate([{ transform: 'translate(0,0)' }, { transform: `translate(${dx * 0.45}px, ${dy * 0.45}px)` }, { transform: 'translate(0,0)' }], { duration: 300, easing: 'ease-in-out' })
      hucreler[j].animate([{ transform: 'translate(0,0)' }, { transform: `translate(${-dx * 0.45}px, ${-dy * 0.45}px)` }, { transform: 'translate(0,0)' }], { duration: 300, easing: 'ease-in-out' })
    }

    function farki(i, j) {
      const a = hucreler[i].getBoundingClientRect()
      const b = hucreler[j].getBoundingClientRect()
      return [b.left - a.left, b.top - a.top]
    }

    async function takas(i, j) {
      if (d.kilit || !komsu(i, j)) return
      d.kilit = true
      d.secili = null
      ipucuSil()
      ciz()
      const istek = fetch('/oyun/zincir', {
        method: 'POST', credentials: 'same-origin',
        body: new URLSearchParams({ grup: veri.grup, hamle: `${i}-${j}` }),
      }).then((y) => y.json())
      try {
        const [dx, dy] = farki(i, j)
        takasSesi()
        const kayma = { duration: 170, easing: 'ease-in-out', fill: 'forwards' }
        const a1 = hucreler[i].animate([{ transform: 'translate(0,0)' }, { transform: `translate(${dx}px, ${dy}px)` }], kayma)
        const a2 = hucreler[j].animate([{ transform: 'translate(0,0)' }, { transform: `translate(${-dx}px, ${-dy}px)` }], kayma)
        let r
        try {
          ;[r] = await Promise.all([istek, bitince(a1), bitince(a2)])
        } finally {
          a1.cancel()
          a2.cancel()
        }
        if (r.bekle || r.gecersiz || (r.hata && !r.bitti)) {
          geriAl(i, j)
          if (r.uyari || r.hata) yazi(r.gecersiz ? 'PATLAMADI' : 'BİR SANİYE', 'bilgi')
          return
        }
        if (r.hata) return bitir()
        ;[d.kod[i], d.kod[j]] = [d.kod[j], d.kod[i]]
        ciz()
        d.kalan = r.kalan
        if (r.birlesim) {
          yazi(BIRLESIM_ADI[r.birlesim] ?? 'BİRLEŞİM!', 'kombo buyuk')
          efekt?.flas('rgba(255,255,255,.95)', 0.6)
          efekt?.yagmur(40, RENK)
          sars(9)
        }
        let n = 0
        for (const a of r.adimlar) {
          await patlat(a, n)
          await dus(a)
          n += 1
        }
        if (r.yagmurlar) await yagmur(r.yagmurlar)
        kazancSay(r.xp)
        ustYaz(1)
        enerjiYaz(0)
        if (n >= 4) efekt?.yagmur(30, RENK)
        if (r.bitti) {
          await bekle(500)
          return bitir()
        }
        if (d.kalan <= 3) makine.classList.add('az')
        d.ipucu = r.ipucu ?? []
      } catch (err) {
        console.error('Hamle gönderilemedi', err)
        location.reload()
      } finally {
        d.kilit = false
        if (!makine.classList.contains('bitti')) ipucuKur()
      }
    }

    // Kaydırma: hücrede başlayan sürükleme komşuya doğru yarım hücre gidince takas olur. Dokunma: seç ve komşuya dokun.
    let surukle = null
    tahtaEl.addEventListener('pointerdown', (olay) => {
      const el = olay.target.closest('.zh')
      if (!el || d.kilit) return
      ipucuSil()
      surukle = { i: hucreler.indexOf(el), x: olay.clientX, y: olay.clientY, oldu: false }
      el.setPointerCapture?.(olay.pointerId)
    })
    tahtaEl.addEventListener('pointermove', (olay) => {
      if (!surukle || surukle.oldu) return
      const dx = olay.clientX - surukle.x
      const dy = olay.clientY - surukle.y
      const esik = hucreler[0].offsetWidth * 0.4
      if (Math.max(Math.abs(dx), Math.abs(dy)) < esik) return
      surukle.oldu = true
      const { i } = surukle
      const c = i % N
      const r = Math.floor(i / N)
      const j = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? (c < N - 1 ? i + 1 : -1) : (c > 0 ? i - 1 : -1)) : (dy > 0 ? (r < N - 1 ? i + N : -1) : (r > 0 ? i - N : -1))
      if (j >= 0) takas(i, j)
    })
    const birak = () => {
      if (!surukle) return
      const { i, oldu } = surukle
      surukle = null
      if (oldu || d.kilit) return
      if (d.secili !== null && komsu(d.secili, i)) return takas(d.secili, i)
      d.secili = d.secili === i ? null : i
      ciz()
      ipucuKur()
      if (d.secili !== null) hucreler[i].animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1.1)' }], { duration: 200 })
    }
    tahtaEl.addEventListener('pointerup', birak)
    tahtaEl.addEventListener('pointercancel', () => { surukle = null })
    ipucuKur()
    // Betik varken hücre düğmeleri formu göndermez (betiksiz sayfada seçim formla yapılır).
    tahtaEl.addEventListener('click', (olay) => {
      if (olay.target.closest('.zh')) olay.preventDefault()
    })
  }

  function hazirla() {
    for (const makine of document.querySelectorAll('.zincir-makine[data-zincir]')) {
      try {
        kur(makine)
      } catch (err) {
        console.error('Şeker Zinciri kurulamadı', err)
      }
    }
  }

  window.SekerZinciri = { hazirla }
})()
