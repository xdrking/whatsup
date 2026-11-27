// Emlak yükseltmesinin sandık açılışı. Sonuç sunucuda çoktan belli olur (mulkYukselt), burada yalnızca oynatılır:
// konan mülkler sandığa uçar, sandık sallanır, patlar, ödül kartı döne döne yavaşlar ve doğru yüzünde durur.
// Hareketler Web Animations API ile, yalnızca transform ve opacity; parçacıklar Şeker Fırtınası'nın tek kanvaslı
// motorundadır (window.SekerEfekt), sesler oyun.js'in Web Audio'sundan (window.KumarhaneSes). Satır içi stil yazılmaz.
// Betik yoksa sandık kartı son halini (`kazandi`/`yandi`) düz gösterir.
;(() => {
  const azHareket = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const bekle = (ms) => new Promise((tamam) => setTimeout(tamam, ms))

  function oynat(kutu) {
    const basarili = kutu.dataset.basarili === '1'
    const sahne = kutu.querySelector('.sandik-sahne')
    const sandik = kutu.querySelector('.sandik')
    const kapak = kutu.querySelector('.sandik-kapak')
    const isin = kutu.querySelector('.sandik-isin')
    const odul = kutu.querySelector('.odul')
    const odulIc = kutu.querySelector('.odul-ic')
    const konanlar = [...kutu.querySelectorAll('.konan')]
    const gec = kutu.querySelector('.sandik-gec')
    if (!sahne || !sandik || !odul || !odulIc || azHareket || !sahne.animate) return 0

    const ses = window.KumarhaneSes
    const efekt = window.SekerEfekt?.(sahne) ?? null
    const animler = []
    let atlandi = false
    const oyna = (el, kareler, ayar) => {
      const a = el.animate(kareler, { fill: 'forwards', ...ayar })
      animler.push(a)
      if (atlandi) a.finish()
      return a.finished.catch(() => {})
    }
    // Atlanınca kalan beklemeler hemen biter.
    const dur = (ms) => (atlandi ? Promise.resolve() : bekle(ms))
    const orta = () => [sahne.clientWidth / 2, sahne.clientHeight / 2]

    kutu.classList.add('oynuyor')
    gec.hidden = false
    gec.addEventListener('click', () => {
      atlandi = true
      for (const a of animler) a.finish()
    }, { once: true })

    return (async () => {
      // 1. Sandık iner.
      await oyna(sandik, [
        { transform: 'translateY(-160px) scale(.6)', opacity: 0 },
        { transform: 'translateY(8px) scale(1.06)', opacity: 1, offset: 0.7 },
        { transform: 'translateY(0) scale(1)', opacity: 1 },
      ], { duration: 520, easing: 'cubic-bezier(.3,1.4,.5,1)' })
      ses?.sesler.dur()

      // 2. Konan mülkler tek tek sandığa uçar.
      for (const [i, el] of konanlar.entries()) {
        const x = (i - (konanlar.length - 1) / 2) * 56
        oyna(el, [
          { transform: `translate(${x}px, 120px) scale(1)`, opacity: 0 },
          { transform: `translate(${x}px, 90px) scale(1.15)`, opacity: 1, offset: 0.3 },
          { transform: 'translate(0, 0) scale(.3)', opacity: 0 },
        ], { duration: 520, easing: 'ease-in' })
        await dur(330)
        ses?.sesler.tak()
        if (efekt && !atlandi) efekt.patlat(...orta(), '#c58cff', 2)
        oyna(sandik, [
          { transform: 'scale(1)' }, { transform: 'scale(1.08, .92)' }, { transform: 'scale(1)' },
        ], { duration: 220, fill: 'none' })
      }
      await dur(260)

      // 3. Işık açılır, sandık giderek sertleşen sarsıntılarla titrer.
      oyna(isin, [{ opacity: 0 }, { opacity: 1 }], { duration: 700 })
      const donus = isin.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 9000, iterations: Infinity })
      for (const [i, sert] of [3, 6, 10].entries()) {
        const k = 90 - i * 18
        const sallanti = [0, -sert, sert, -sert, sert, 0].map((d, j) => ({ transform: `rotate(${d}deg) translateY(${j % 2 ? -sert / 2 : 0}px)` }))
        for (let t = 0; t < 4; t += 1) ses?.sesler.tik(t * (k / 1000))
        await oyna(sandik, sallanti, { duration: k * 5, fill: 'none' })
        if (efekt && !atlandi) efekt.halka(...orta(), '#ffd76a', 60 + i * 30, 0.5)
        await dur(200 - i * 50)
      }

      // 4. Patlama: kapak uçar, sandık söner.
      ses?.sesler.patla()
      if (efekt && !atlandi) {
        efekt.flas('#fff3c4', 0.8)
        efekt.patlat(...orta(), '#ffd76a', 10)
        efekt.halka(...orta(), '#ffffff', 180, 0.7)
      }
      oyna(kapak, [
        { transform: 'translateY(0) rotate(0)', opacity: 1 },
        { transform: 'translateY(-170px) rotate(-35deg)', opacity: 0 },
      ], { duration: 600, easing: 'cubic-bezier(.2,.8,.3,1)' })
      oyna(sandik, [
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(.8) translateY(40px)', opacity: 0 },
      ], { duration: 500, delay: 150, easing: 'ease-in' })

      // 5. Ödül kartı çıkar ve döne döne yavaşlar; sonuç yüzü öne gelince durur.
      const tur = 7
      const sure = 3400
      const son = tur * 360 + (basarili ? 0 : 180)
      oyna(odul, [
        { transform: 'translateY(60px) scale(.3)', opacity: 0 },
        { transform: 'translateY(0) scale(1)', opacity: 1 },
      ], { duration: 500, easing: 'cubic-bezier(.3,1.3,.5,1)' })
      const donme = oyna(odulIc, [
        { transform: 'rotateY(0deg)' },
        { transform: `rotateY(${son}deg)` },
      ], { duration: sure, easing: 'cubic-bezier(.12,.7,.18,1)' })
      // Her yarım turda bir tık: aralıklar dönüşle birlikte açılır.
      if (ses && !atlandi) {
        const yarim = tur * 2 + (basarili ? 0 : 1)
        for (let i = 1; i <= yarim; i += 1) {
          // cubic-bezier(.12,.7,.18,1)'in tersine yakın: ilerleme p için zaman ≈ 1 - (1 - p)^(1/3).
          const p = i / yarim
          ses.sesler.tik((1 - (1 - p) ** (1 / 3)) * (sure / 1000) * 0.92)
        }
      }
      await donme

      // 6. Sonuç.
      if (basarili) {
        ses?.sesler.kazan(10)
        if (efekt && !atlandi) {
          efekt.flas('#ffd76a', 0.7)
          efekt.patlat(...orta(), '#ffd76a', 10)
          efekt.yagmur(70, ['#ffd76a', '#ff9f43', '#fff3c4', '#c58cff'])
        }
        await oyna(odul, [
          { transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' },
        ], { duration: 520, easing: 'ease-out', fill: 'none' })
      } else {
        ses?.sesler.kaybet()
        if (efekt && !atlandi) efekt.patlat(...orta(), '#8a8f98', 4)
        oyna(isin, [{ opacity: 1 }, { opacity: 0 }], { duration: 500 })
        await oyna(odul, [0, -10, 10, -7, 7, 0].map((x) => ({ transform: `translateX(${x}px)` })), { duration: 420, fill: 'none' })
      }

      await dur(250)
      donus.cancel()
      for (const a of animler) a.cancel()
      gec.hidden = true
      kutu.classList.remove('oynuyor')
      kutu.classList.add('bitti')
    })()
  }

  window.EmlakSandik = { oynat }
})()
