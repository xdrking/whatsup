// Sosyal bölümün tarayıcı tarafı (Faz 66). Betik çalışmazsa her form yine normal
// gönderilir; bu dosya yalnızca sayfa yenilemeden beğeni, DM yoklama, foto önizleme,
// hikâye zamanlayıcısı ve PWA kaydı ekler.
(() => {
  'use strict'

  const grup = document.body.dataset.grup || ''
  const DM_ARALIGI = 3000
  const SAYAC_ARALIGI = 30000
  const HIKAYE_SURESI = 6000
  document.body.classList.add('js')

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Servis işçisi kurulamadı', err))
  }

  const istek = (adres, ayar = {}) => fetch(adres, { credentials: 'same-origin', ...ayar, headers: { 'X-Istemci': '1', ...(ayar.headers || {}) } })

  // Foto önizleme: seçilen dosya formun .onizleme kutusunda görünür.
  for (const girdi of document.querySelectorAll('input[type=file]')) {
    girdi.addEventListener('change', () => {
      const form = girdi.form
      if (girdi.classList.contains('hemen-gonder')) {
        if (girdi.files.length) form.submit()
        return
      }
      const kutu = form.querySelector('.onizleme')
      const etiket = girdi.closest('.foto-sec')
      if (etiket) etiket.classList.toggle('secildi', girdi.files.length > 0)
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
        if (etiket) etiket.classList.remove('secildi')
      })
      kutu.append(resim, kaldir)
    })
  }

  // Beğeni: sayfa yenilenmeden açılıp kapanır.
  for (const form of document.querySelectorAll('.begen-form')) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const dugme = form.querySelector('.begen')
      try {
        const yanit = await istek(form.action, { method: 'POST', body: new URLSearchParams(new FormData(form)) })
        if (!yanit.ok) throw new Error(String(yanit.status))
        const [acik, sayi] = (await yanit.text()).split(':')
        dugme.classList.toggle('acik', acik === '1')
        dugme.setAttribute('aria-pressed', acik === '1' ? 'true' : 'false')
        dugme.querySelector('.begeni-sayi').textContent = sayi === '0' ? '' : sayi
      } catch (err) {
        console.warn('Beğeni gönderilemedi', err)
        form.submit()
      }
    })
  }

  // DM: yeni mesajları birkaç saniyede bir sorar; gönderim sayfayı yenilemez.
  const akis = document.querySelector('.dm-akis')
  if (akis) {
    const asagi = () => { akis.scrollTop = akis.scrollHeight }
    asagi()
    let sorguda = false
    const yokla = async () => {
      if (sorguda || document.hidden) return
      sorguda = true
      try {
        const p = new URLSearchParams({ grup, ile: akis.dataset.ile, son: akis.dataset.son })
        const yanit = await istek(`/s/mesaj-yeni?${p}`)
        const html = yanit.ok ? await yanit.text() : ''
        if (html.trim()) {
          akis.querySelector('.bos')?.remove()
          const kap = document.createElement('div')
          kap.innerHTML = html
          const yeniler = [...kap.children].filter((d) => !akis.querySelector(`[data-id="${d.dataset.id}"]`))
          akis.append(...yeniler)
          const son = yeniler.at(-1)
          if (son) akis.dataset.son = son.dataset.id
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
