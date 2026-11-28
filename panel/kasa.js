// Kasa açılışı ve çark dönüşü (Faz 89). Sonuç sunucuda çoktan belli olur; burada yalnızca oynatılır.
// Kasa: ödül şeridi hızla kayar, yavaşlar ve kazanan kutu ortadaki altın çizgide durur; geçen her kutuda tık sesi.
// Çark: tekerlek altı tur dönüp kazanan dilimi tepedeki oka getirir. Hareketler Web Animations API ile, yalnızca
// transform ve opacity; parçacıklar Şeker Fırtınası'nın kanvas motorundadır (window.SekerEfekt), sesler oyun.js'ten
// (window.KumarhaneSes). Satır içi stil yazılmaz. Betik yoksa sonuç düz görünür.
;(() => {
  const azHareket = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const RENK = { mavi: '#4b69ff', mor: '#8847ff', pembe: '#d32ce6', kirmizi: '#eb4b4b', altin: '#ffd700' }
  const SIRA = ['mavi', 'mor', 'pembe', 'kirmizi', 'altin']

  /** Kazanılan rengin sesi: nadirlik arttıkça uzun ve parlak. */
  function bitisSesi(ses, renk) {
    if (!ses) return
    const derece = SIRA.indexOf(renk)
    if (derece <= 0) return ses.sesler.para()
    ses.sesler.kazan(derece >= 3 ? 10 : derece === 2 ? 4 : 2)
    if (derece >= 3) {
      ses.sesler.patla(0.05)
      for (let i = 0; i < 5; i += 1) ses.ton(880 * 2 ** (i / 4), 0.3, { tip: 'triangle', guc: 0.09, gecikme: 0.7 + i * 0.12 })
    }
  }

  function kasaAc(kutu) {
    const pencere = kutu.querySelector('.serit-pencere')
    const serit = kutu.querySelector('.serit')
    const kutular = [...(serit?.children ?? [])]
    const kazanan = kutular[Number(kutu.dataset.kazanan)]
    const gec = kutu.querySelector('.kasa-gec')
    if (!pencere || !kazanan || azHareket || !serit.animate) return 0

    const ses = window.KumarhaneSes
    const efekt = window.SekerEfekt?.(pencere) ?? null
    const renk = kutu.dataset.renk
    const adim = kutular[1].offsetLeft - kutular[0].offsetLeft
    const merkez = pencere.clientWidth / 2
    // Kutunun ortasına değil biraz yanına durur: her açılış aynı görünmesin, gerilim kalsın.
    const sapma = (Math.random() - 0.5) * kazanan.offsetWidth * 0.7
    const hedef = -(kazanan.offsetLeft + kazanan.offsetWidth / 2 - merkez + sapma)
    const sure = 6800

    kutu.classList.add('oynuyor')
    gec.hidden = false
    pencere.animate([{ transform: 'scale(.92)', opacity: 0.4 }, { transform: 'scale(1)', opacity: 1 }], { duration: 350, easing: 'ease-out' })
    const kay = serit.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${hedef}px)` }], {
      duration: sure, easing: 'cubic-bezier(.05,.6,.1,1)', fill: 'forwards',
    })
    gec.addEventListener('click', () => kay.finish(), { once: true })

    // Ortadaki çizgiden her kutu geçişinde bir tık: yavaşladıkça seyrekleşir.
    let son = -1
    let bitti = false
    const tikle = () => {
      if (bitti) return
      const x = merkez - new DOMMatrixReadOnly(getComputedStyle(serit).transform).m41
      const sira = Math.floor((x - kutular[0].offsetLeft) / adim)
      if (sira !== son) {
        son = sira
        ses?.ton(1500 + Math.random() * 300, 0.025, { guc: 0.05 })
      }
      requestAnimationFrame(tikle)
    }
    requestAnimationFrame(tikle)

    return kay.finished.then(() => {
      bitti = true
      gec.hidden = true
      kazanan.classList.add('kazandi')
      const r = pencere.getBoundingClientRect()
      const k = kazanan.getBoundingClientRect()
      const x = k.left - r.left + k.width / 2
      const y = k.top - r.top + k.height / 2
      if (efekt) {
        efekt.patlat(x, y, RENK[renk] ?? '#ffffff', SIRA.indexOf(renk) * 2 + 3)
        efekt.halka(x, y, RENK[renk] ?? '#ffffff', 90, 0.6)
        if (SIRA.indexOf(renk) >= 3) {
          efekt.flas(RENK[renk], 0.7)
          efekt.yagmur(60, [RENK[renk], '#ffffff', '#f5c542'])
        }
      }
      bitisSesi(ses, renk)
      kazanan.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1.06)' }], { duration: 520, easing: 'ease-out', fill: 'forwards' })
      kutu.classList.remove('oynuyor')
      kutu.classList.add('bitti')
    }, () => {})
  }

  function cevir(kutu) {
    const don = kutu.querySelector('.cark-don')
    const aci = Number(kutu.dataset.donus)
    if (!don || !Number.isFinite(aci) || azHareket || !don.animate) return 0
    const ses = window.KumarhaneSes
    const tur = 6
    const sure = 5200
    kutu.classList.add('oynuyor')
    // Teker (svg içindeki grup) sonuca dönük çizilir; dış kap ondan geri sarılıp sıfıra döner, yani görünen tekerlek
    // 0'dan başlayıp sonuçta durur.
    const anim = don.animate([{ transform: `rotate(${-(tur * 360 + aci)}deg)` }, { transform: 'rotate(0deg)' }], {
      duration: sure, easing: 'cubic-bezier(.12,.6,.12,1)',
    })
    let son = null
    let bitti = false
    const dilim = 360 / 9
    const tikle = () => {
      if (bitti) return
      const m = new DOMMatrixReadOnly(getComputedStyle(don).transform)
      const derece = (Math.atan2(m.b, m.a) * 180) / Math.PI
      const sira = Math.floor((derece + 360) / dilim)
      if (son !== null && sira !== son) ses?.sesler.tak()
      son = sira
      requestAnimationFrame(tikle)
    }
    requestAnimationFrame(tikle)
    return anim.finished.then(() => {
      bitti = true
      kutu.classList.remove('oynuyor')
      kutu.classList.add('bitti')
      const bos = kutu.querySelector('.cark-sonuc')?.textContent.includes('Boş')
      if (bos) ses?.sesler.kaybet()
      else bitisSesi(ses, 'pembe')
      const efekt = window.SekerEfekt?.(kutu.querySelector('.cark-sahne'))
      if (efekt && !bos) {
        const s = kutu.querySelector('.cark-sahne')
        efekt.patlat(s.clientWidth / 2, 30, '#f5c542', 6)
      }
    }, () => {})
  }

  window.KasaAcilis = { oynat: kasaAc, cevir }
})()
