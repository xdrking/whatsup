// Panelin HTML'i. `h` değerleri kaçırır: WhatsApp adını üyeler kendisi yazdığı için
// bir ad asla ham HTML olarak sayfaya düşmemeli.
import { readFileSync } from 'node:fs'
import { fnv1a } from '../lib/hash.js'
import { ARALIKLAR, SIRALAMALAR } from './veri.js'

// Stil tarayıcıda önbelleklenir: adres içerikle değişmezse yeni HTML eski stille açılır.
const STIL_SURUMU = fnv1a(readFileSync(new URL('./stil.css', import.meta.url), 'utf8'))

class Ham {
  constructor(metin) {
    this.metin = metin
  }
}

const KACIS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

function yaz(deger) {
  if (deger === null || deger === undefined || deger === false) return ''
  if (deger instanceof Ham) return deger.metin
  if (Array.isArray(deger)) return deger.map(yaz).join('')
  return String(deger).replace(/[&<>"']/g, (c) => KACIS[c])
}

export function h(parcalar, ...degerler) {
  return new Ham(parcalar.reduce((metin, parca, i) => metin + parca + (i < degerler.length ? yaz(degerler[i]) : ''), ''))
}

const sayi = new Intl.NumberFormat('tr-TR')
const ondalik = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const tarih = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'medium', timeStyle: 'short' })
const AVATAR_RENGI = 8

const yuzde = new Intl.NumberFormat('tr-TR', { style: 'percent', maximumFractionDigits: 0 })
const adi = (u) => u.ad || `Adı bilinmiyor · ${u.user_jid.split('@')[0].slice(-4)}`
const grupLink = (chat) => `/grup?id=${encodeURIComponent(chat)}`
const kisiLink = (chat, jid) => `/kisi?grup=${encodeURIComponent(chat)}&id=${encodeURIComponent(jid)}`
const hisseLink = (chat, kod, aralik = '7g', tur = 'mum') =>
  `/hisse?grup=${encodeURIComponent(chat)}&kod=${encodeURIComponent(kod)}&aralik=${aralik}&tur=${tur}`

function avatar(u, boyut = '') {
  const harf = [...(u.ad || '?')][0].toLocaleUpperCase('tr')
  return h`<span class="avatar a${fnv1a(u.user_jid) % AVATAR_RENGI} ${boyut}" aria-hidden="true">${harf}</span>`
}

function kabuk(baslik, icerik, { cikis = true, geri = null, ust = baslik } = {}) {
  return h`<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0f1417">
<meta name="robots" content="noindex">
<title>${baslik}</title>
<link rel="stylesheet" href="/stil.css?v=${STIL_SURUMU}">
</head>
<body>
<header class="ust">
  ${geri ? h`<a class="geri" href="${geri}" aria-label="Geri">‹</a>` : ''}
  <h1>${ust}</h1>
  ${cikis ? h`<form method="post" action="/cikis"><button class="sessiz">Çıkış</button></form>` : ''}
</header>
<main>${icerik}</main>
</body>
</html>`.metin
}

export function girisSayfasi(hata = '') {
  return kabuk('Panel', h`
<form class="giris kart" method="post" action="/giris">
  <div class="logo" aria-hidden="true">📊</div>
  <h2>Grup paneli</h2>
  <label for="sifre">Şifre</label>
  <input id="sifre" name="sifre" type="password" autocomplete="current-password" required autofocus>
  ${hata ? h`<p class="hata" role="alert">${hata}</p>` : ''}
  <button>Giriş yap</button>
</form>`, { cikis: false })
}

export function hataSayfasi(mesaj) {
  return kabuk('Panel', h`<p class="bos">${mesaj}</p><p class="bos"><a href="/">Ana sayfa</a></p>`)
}

export function grupListesi(gruplar) {
  const satirlar = gruplar.map((g, i) => h`
<a class="satir" href="${grupLink(g.chat_jid)}">
  <span class="ad"><strong>${g.ad || `Grup ${i + 1}`}</strong><small>${sayi.format(g.uye)} üye</small></span>
  <span class="deger">${sayi.format(g.mesaj)}<small>mesaj</small></span>
</a>`)
  return kabuk('Gruplar', gruplar.length ? h`<section class="kart liste">${satirlar}</section>` : h`<p class="bos">Henüz veri yok.</p>`)
}

function kutu(etiket, deger, not = '') {
  return h`<div class="kutu"><small>${etiket}</small><strong>${deger}</strong>${not ? h`<small>${not}</small>` : ''}</div>`
}

function saatGrafigi(saatler) {
  const enCok = Math.max(...saatler, 1)
  const cubuklar = saatler.map((n, saat) => {
    const boy = Math.max((n / enCok) * 60, n ? 2 : 0.5)
    return h`<rect x="${saat * 10 + 1}" y="${60 - boy}" width="8" height="${boy}" rx="1.5"><title>${saat}:00 · ${sayi.format(n)}</title></rect>`
  })
  const etiketler = [0, 6, 12, 18].map((s) => h`<text x="${s * 10 + 5}" y="72">${s}</text>`)
  return h`<svg class="grafik" viewBox="0 0 240 74" role="img" aria-label="Saatlere göre aktivite">${cubuklar}${etiketler}</svg>`
}

function gunGrafigi(gunler) {
  if (gunler.filter((g) => g.n).length < 2) return h`<p class="birikiyor">Veri birikiyor, birkaç gün sonra burada grafik olacak.</p>`

  const enCok = Math.max(...gunler.map((g) => g.n), 1)
  const cubuklar = gunler.map((g, i) => {
    const boy = Math.max((g.n / enCok) * 60, g.n ? 2 : 0.5)
    return h`<rect x="${i * 8 + 1}" y="${60 - boy}" width="6" height="${boy}" rx="1.5"><title>${g.gun} · ${sayi.format(g.n)} mesaj</title></rect>`
  })
  return h`<svg class="grafik" viewBox="0 0 240 62" role="img" aria-label="Son 30 günün mesajları">${cubuklar}</svg>`
}

/** Çizgi grafiği; en az iki nokta yoksa boş döner. */
function cizgi(degerler, sinif, { genislik = 100, yukseklik = 30 } = {}) {
  if (degerler.length < 2) return ''

  const enAz = Math.min(...degerler)
  const aralik = Math.max(...degerler) - enAz || 1
  const noktalar = degerler.map((d, i) => {
    const x = (i / (degerler.length - 1)) * genislik
    const y = yukseklik - 1 - ((d - enAz) / aralik) * (yukseklik - 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return h`<svg class="cizgi ${sinif}" viewBox="0 0 ${genislik} ${yukseklik}" preserveAspectRatio="none" aria-hidden="true">
    <polygon points="0,${yukseklik} ${noktalar.join(' ')} ${genislik},${yukseklik}"/>
    <polyline points="${noktalar.join(' ')}"/>
  </svg>`
}

function degisim({ fiyat, onceki }) {
  const oran = ((fiyat - onceki) / onceki) * 100
  if (Math.abs(oran) < 0.05) return h`<small class="notr">—</small>`
  return h`<small class="${oran > 0 ? 'artis' : 'dusus'}">${oran > 0 ? '▲' : '▼'} %${ondalik.format(Math.abs(oran))}</small>`
}

function podyum(chatJid, ilkUc, alan) {
  return h`<div class="podyum">${ilkUc.map((u, i) => h`
    <a class="basamak b${i + 1}" href="${kisiLink(chatJid, u.user_jid)}">
      <span class="madalya" aria-hidden="true">${['🥇', '🥈', '🥉'][i]}</span>
      ${avatar(u, i === 0 ? 'orta' : '')}
      <strong>${adi(u)}</strong>
      <small>${sayi.format(u[alan])}</small>
    </a>`)}</div>`
}

function borcDurumu(b) {
  if (b.gecti) return 'Vadesi geçti, ilk mesajında tahsil edilir'
  return b.vade ? `Kredi · vade ${tarih.format(b.vade)}` : 'Eksi bakiye'
}

export function grupSayfasi(chatJid, g, { tekGrup, yedekVar }) {
  const sekmeler = Object.entries(SIRALAMALAR).map(([alan, ad]) =>
    h`<a class="${alan === g.alan ? 'secili' : ''}" href="${grupLink(chatJid)}&sirala=${alan}">${ad}</a>`)

  const ilkUc = g.uyeler.length >= 3 ? g.uyeler.slice(0, 3) : []
  const siralama = g.uyeler.slice(ilkUc.length).map((u, i) => h`
<a class="satir" href="${kisiLink(chatJid, u.user_jid)}">
  <span class="sira">${i + ilkUc.length + 1}</span>
  ${avatar(u)}
  <span class="ad"><strong>${adi(u)}</strong><small>Seviye ${u.seviye}${u.unvan ? ` · ${u.unvan}` : ''}</small></span>
  <span class="deger">${sayi.format(u[g.alan])}</span>
</a>`)

  const baslik = g.ad || 'Grup'
  return kabuk(baslik, h`
<section class="kahraman grup">
  <h2>${baslik}</h2>
  <p>${sayi.format(g.toplam.uye)} üye · bugün ${sayi.format(g.bugun.kisi)} kişi yazdı</p>
</section>

<section class="kutular">
  ${kutu('Bugün', sayi.format(g.bugun.mesaj), 'mesaj')}
  ${kutu('Toplam mesaj', sayi.format(g.toplam.mesaj))}
  ${kutu('Toplam XP', sayi.format(g.toplam.xp))}
  ${kutu('Bankada', sayi.format(g.toplam.banka), 'XP')}
</section>

<div class="ikili">
<div class="yan">
  <section class="kart liste">
    <h2>Sıralama</h2>
    <nav class="sekmeler">${sekmeler}</nav>
    ${ilkUc.length ? podyum(chatJid, ilkUc, g.alan) : ''}
    ${siralama}
  </section>

  ${g.borclular.length ? h`<section class="kart liste"><h2>Borçlular</h2>${g.borclular.map((b) => h`
    <a class="satir" href="${kisiLink(chatJid, b.user_jid)}">
      ${b.uye ? avatar(b.uye) : ''}
      <span class="ad"><strong>${b.uye ? adi(b.uye) : 'Eski üye'}</strong><small>${borcDurumu(b)}</small></span>
      <span class="deger">${sayi.format(b.borc)}</span>
    </a>`)}</section>` : ''}

  ${g.rekorlar.length ? h`<section class="kart"><h2>Grup rekorları</h2><div class="rekorlar">${g.rekorlar.map((r) => h`
    <a class="rekor" href="${kisiLink(chatJid, r.uye.user_jid)}">
      <small>${r.etiket}</small>
      <strong>${adi(r.uye)}</strong>
      <small>${sayi.format(r.deger)} ${r.birim}</small>
    </a>`)}</div></section>` : ''}
</div>

<div class="yan">
  <section class="kart"><h2>Son 30 gün</h2>${gunGrafigi(g.gunlukMesaj)}</section>

  ${g.sezon.length ? h`<section class="kart liste"><h2>Bu haftanın sezonu</h2>${g.sezon.map((s, i) => h`
    <a class="satir" href="${kisiLink(chatJid, s.user_jid)}">
      <span class="sira">${['🥇', '🥈', '🥉'][i]}</span>
      <span class="ad"><strong>${s.uye ? adi(s.uye) : 'Eski üye'}</strong></span>
      <span class="deger">${sayi.format(s.puan)}</span>
    </a>`)}</section>` : ''}

  ${g.borsa.length ? h`<section class="kart liste"><h2>Borsa</h2>${g.borsa.map((b) => h`
    <a class="satir" href="${hisseLink(chatJid, b.kod)}">
      <span class="ad"><strong>${b.ad}</strong></span>
      ${cizgi(b.gecmis, b.gecmis.at(-1) >= b.gecmis[0] ? 'artis' : 'dusus')}
      <span class="deger">${ondalik.format(b.fiyat)}${degisim(b)}</span>
    </a>`)}</section>` : ''}

  <section class="kart"><h2>Saatlere göre aktivite</h2>${saatGrafigi(g.saatler)}</section>

  ${yedekVar ? h`<a class="dugme" href="/yedek">⬇ Son yedeği indir</a>` : ''}
</div>
</div>`, { geri: tekGrup ? null : '/', ust: 'Panel' })
}

const GRAFIK_TURLERI = { mum: 'Mum', cizgi: 'Çizgi' }
const SAAT_FARKI = 3 // Türkiye UTC+3, yaz saati yok: saat dilimleri İstanbul gününe hizalanır.
const SAAT_MS = 3_600_000
const iki = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const saatBicimi = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' })
const gunBicimi = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short' })
const tamBicim = (saat) => `${gunBicimi.format(saat * SAAT_MS)} ${saatBicimi.format(saat * SAAT_MS)}`

/** Saatlik kapanışları mumlara böler. Açılış, bir önceki mumun kapanışıdır. */
export function mumlar(noktalar, mumSaati) {
  const sonuc = []
  let onceki = noktalar[0]?.fiyat
  for (const { saat, fiyat } of noktalar) {
    const dilim = Math.floor((saat + SAAT_FARKI) / mumSaati) * mumSaati - SAAT_FARKI
    let mum = sonuc.at(-1)
    if (mum?.saat !== dilim) {
      mum = { saat: dilim, acilis: onceki, yuksek: onceki, dusuk: onceki, kapanis: onceki }
      sonuc.push(mum)
    }
    mum.yuksek = Math.max(mum.yuksek, fiyat)
    mum.dusuk = Math.min(mum.dusuk, fiyat)
    mum.kapanis = fiyat
    onceki = fiyat
  }
  return sonuc
}

function guzelAdim(aralik, adet) {
  const kaba = aralik / adet
  const us = 10 ** Math.floor(Math.log10(kaba))
  const oran = kaba / us
  return Math.max((oran <= 1 ? 1 : oran <= 2 ? 2 : oran <= 5 ? 5 : 10) * us, 0.1)
}

// Kesintide çizgi birleşmez: kimse .borsa yazmadığı için veri yoktur, düz hareket gibi görünmesin.
function kesintisizParcalar(noktalar) {
  const parcalar = [[]]
  for (const n of noktalar) {
    const son = parcalar.at(-1).at(-1)
    if (son && n.saat - son.saat > 1) parcalar.push([])
    parcalar.at(-1).push(n)
  }
  return parcalar.filter((p) => p.length > 1)
}

function fiyatGrafigi(noktalar, tur, aralik, { sinif, genislik, yukseklik }) {
  const sol = 6
  const sag = genislik - 56
  const ust = 10
  const alt = yukseklik - 26
  const dilimler = mumlar(noktalar, aralik.mum)

  const t0 = tur === 'mum' ? dilimler[0].saat : noktalar[0].saat
  const t1 = tur === 'mum' ? dilimler.at(-1).saat + aralik.mum : noktalar.at(-1).saat
  const x = (t) => sol + ((t - t0) / (t1 - t0 || 1)) * (sag - sol)

  const enAz = Math.min(...dilimler.map((m) => m.dusuk))
  const enCok = Math.max(...dilimler.map((m) => m.yuksek))
  const adim = guzelAdim(enCok - enAz || enCok * 0.02 || 1, 4)
  const taban = Math.floor(enAz / adim) * adim
  const tavan = Math.ceil(enCok / adim) * adim || adim
  const y = (f) => alt - ((f - taban) / (tavan - taban || 1)) * (alt - ust)

  const fiyatCizgileri = []
  for (let f = taban; f <= tavan + adim / 2; f += adim) fiyatCizgileri.push(f)

  const zamanlar = []
  for (let t = Math.ceil(t0); t <= t1; t += 1) {
    const yerel = t + SAAT_FARKI
    const px = x(t)
    if (yerel % aralik.etiket === 0 && px > sol + 18 && px < sag - 18) {
      zamanlar.push({ px, yazi: yerel % 24 === 0 ? gunBicimi.format(t * SAAT_MS) : saatBicimi.format(t * SAAT_MS) })
    }
  }

  const son = noktalar.at(-1).fiyat
  const yon = son >= noktalar[0].fiyat ? 'artis' : 'dusus'
  // Az veride tek mum grafiği kaplamasın.
  const mumGenisligi = Math.min(((sag - sol) / ((t1 - t0) / aralik.mum)) * 0.68, 22)
  const noktaYazi = (parca) => parca.map((n) => `${x(n.saat).toFixed(1)},${y(n.fiyat).toFixed(1)}`).join(' ')
  const gradyan = `dolgu-${sinif}`

  const ozet = `${noktalar.length} saatlik fiyat. En düşük ${iki.format(enAz)}, en yüksek ${iki.format(enCok)}, son ${iki.format(son)}.`
  return h`<svg class="fiyat-grafik ${sinif} ${yon}" viewBox="0 0 ${genislik} ${yukseklik}" role="img" aria-label="${ozet}">
    <defs><linearGradient id="${gradyan}" x1="0" y1="0" x2="0" y2="1"><stop class="dolgu-ust" offset="0"/><stop class="dolgu-alt" offset="1"/></linearGradient></defs>
    ${fiyatCizgileri.map((f) => h`<line class="izgara" x1="${sol}" x2="${sag}" y1="${y(f).toFixed(1)}" y2="${y(f).toFixed(1)}"/>
      <text class="eksen" x="${sag + 8}" y="${(y(f) + 4).toFixed(1)}">${ondalik.format(f)}</text>`)}
    ${zamanlar.map((z) => h`<line class="izgara" x1="${z.px.toFixed(1)}" x2="${z.px.toFixed(1)}" y1="${ust}" y2="${alt}"/>
      <text class="eksen orta" x="${z.px.toFixed(1)}" y="${yukseklik - 8}">${z.yazi}</text>`)}
    ${tur === 'mum'
    ? dilimler.map((m) => {
      const merkez = x(m.saat + aralik.mum / 2)
      const ustKenar = y(Math.max(m.acilis, m.kapanis))
      const boy = Math.max(Math.abs(y(m.acilis) - y(m.kapanis)), 1.5)
      return h`<g class="mum ${m.kapanis >= m.acilis ? 'artis' : 'dusus'}">
        <line x1="${merkez.toFixed(1)}" x2="${merkez.toFixed(1)}" y1="${y(m.yuksek).toFixed(1)}" y2="${y(m.dusuk).toFixed(1)}"/>
        <rect x="${(merkez - mumGenisligi / 2).toFixed(1)}" y="${ustKenar.toFixed(1)}" width="${mumGenisligi.toFixed(1)}" height="${boy.toFixed(1)}" rx="1.5"/>
      </g>`
    })
    : kesintisizParcalar(noktalar).map((p) => h`
      <polygon class="alan" fill="url(#${gradyan})" points="${x(p[0].saat).toFixed(1)},${alt} ${noktaYazi(p)} ${x(p.at(-1).saat).toFixed(1)},${alt}"/>
      <polyline class="hat" points="${noktaYazi(p)}"/>`)}
    <line class="son-cizgi" x1="${sol}" x2="${sag}" y1="${y(son).toFixed(1)}" y2="${y(son).toFixed(1)}"/>
    <rect class="son-kutu" x="${sag + 2}" y="${(y(son) - 10).toFixed(1)}" width="52" height="20" rx="4"/>
    <text class="son-yazi" x="${sag + 6}" y="${(y(son) + 4).toFixed(1)}">${iki.format(son)}</text>
    ${dilimler.map((m, i) => {
    const bas = x(Math.max(m.saat, t0))
    const bit = i + 1 < dilimler.length ? x(dilimler[i + 1].saat) : sag
    return h`<rect class="vuru" x="${bas.toFixed(1)}" y="${ust}" width="${Math.max(bit - bas, 1).toFixed(1)}" height="${alt - ust}"><title>${tamBicim(m.saat)} · Açılış ${iki.format(m.acilis)} · Yüksek ${iki.format(m.yuksek)} · Düşük ${iki.format(m.dusuk)} · Kapanış ${iki.format(m.kapanis)}</title></rect>`
  })}
  </svg>`
}

export function hisseSayfasi(chatJid, v, turIstegi) {
  const tur = GRAFIK_TURLERI[turIstegi] ? turIstegi : 'mum'
  const aralik = ARALIKLAR[v.aralik]
  const { noktalar } = v
  const yeterli = noktalar.length >= 2
  const dilimler = mumlar(noktalar, aralik.mum)
  const ilk = noktalar[0]?.fiyat ?? v.fiyat
  const fark = v.fiyat - ilk
  const oran = ilk ? (fark / ilk) * 100 : 0
  const yon = fark >= 0 ? 'artis' : 'dusus'
  const secili = (kosul) => (kosul ? 'secili' : '')

  return kabuk(v.ad, h`
<section class="kart hisse-ust">
  <h2>${v.ad}</h2>
  <div class="hisse-fiyat">
    <strong>${iki.format(v.fiyat)} <small>XP</small></strong>
    <span class="${yon}">${fark >= 0 ? '▲' : '▼'} ${iki.format(Math.abs(fark))} (%${iki.format(Math.abs(oran))})</span>
    <small>${aralik.ad.toLocaleLowerCase('tr')} içinde</small>
  </div>
</section>

<nav class="sekmeler hisse-sekme">${v.hisseler.map((s) => h`<a class="${secili(s.kod === v.kod)}" href="${hisseLink(chatJid, s.kod, v.aralik, tur)}">${s.ad}</a>`)}</nav>

<section class="kart grafik-kart">
  <div class="grafik-arac">
    <nav class="sekmeler">${Object.entries(ARALIKLAR).map(([ad, a]) => h`<a class="${secili(ad === v.aralik)}" href="${hisseLink(chatJid, v.kod, ad, tur)}">${a.ad}</a>`)}</nav>
    <nav class="sekmeler">${Object.entries(GRAFIK_TURLERI).map(([ad, yazi]) => h`<a class="${secili(ad === tur)}" href="${hisseLink(chatJid, v.kod, v.aralik, ad)}">${yazi}</a>`)}</nav>
  </div>
  ${yeterli ? h`
    ${fiyatGrafigi(noktalar, tur, aralik, { sinif: 'dar', genislik: 380, yukseklik: 280 })}
    ${fiyatGrafigi(noktalar, tur, aralik, { sinif: 'genis', genislik: 860, yukseklik: 400 })}
    ${tur === 'mum' ? h`<div class="anahtar mum-anahtar"><span class="artis">Boş mum: yükseliş</span><span class="dusus">Dolu mum: düşüş</span></div>` : ''}
  ` : h`<p class="birikiyor">Veri birikiyor. Grafik için en az iki saatlik fiyat gerekir.</p>`}
</section>

${yeterli ? h`<section class="kutular">
  ${kutu('Dönem başı', iki.format(ilk), 'XP')}
  ${kutu('En yüksek', iki.format(Math.max(...dilimler.map((m) => m.yuksek))), 'XP')}
  ${kutu('En düşük', iki.format(Math.min(...dilimler.map((m) => m.dusuk))), 'XP')}
  ${kutu('Son veri', tamBicim(noktalar.at(-1).saat))}
</section>

<details class="kart tablo">
  <summary>Fiyat tablosu</summary>
  <table>
    <thead><tr><th>Zaman</th><th>Açılış</th><th>Yüksek</th><th>Düşük</th><th>Kapanış</th></tr></thead>
    <tbody>${dilimler.toReversed().map((m) => h`<tr><td>${tamBicim(m.saat)}</td><td>${iki.format(m.acilis)}</td><td>${iki.format(m.yuksek)}</td><td>${iki.format(m.dusuk)}</td><td>${iki.format(m.kapanis)}</td></tr>`)}</tbody>
  </table>
</details>` : ''}

<p class="birikiyor not">Fiyatlar grupta <code>.borsa</code> kullanıldıkça güncellenir, panel fiyatı kendisi ilerletmez.</p>`, { geri: grupLink(chatJid), ust: v.grupAdi || 'Borsa' })
}

function servetCubugu(k) {
  // Eksi cüzdan çubukta çizilemez, oranlar artı kısımlardan hesaplanır.
  const parcalar = [['cuzdan', 'Cüzdan', k.xp], ['banka', 'Banka', k.bakiye], ['portfoy', 'Portföy', k.portfoy]]
    .filter(([, , n]) => n > 0)
  const toplam = parcalar.reduce((t, [, , n]) => t + n, 0)
  if (!toplam) return ''

  let x = 0
  const dilimler = parcalar.map(([sinif, ad, n]) => {
    const en = (n / toplam) * 100
    const dilim = h`<rect class="${sinif}" x="${x}" y="0" width="${en}" height="6"><title>${ad}: ${sayi.format(n)}</title></rect>`
    x += en
    return dilim
  })
  return h`<svg class="servet" viewBox="0 0 100 6" preserveAspectRatio="none" role="img" aria-label="Servet dağılımı">${dilimler}</svg>
  <div class="anahtar">${parcalar.map(([sinif, ad, n]) => h`<span class="${sinif}">${ad} ${yuzde.format(n / toplam)}</span>`)}</div>`
}

export function kisiSayfasi(chatJid, k) {
  const gorunen = adi(k)
  const kazanilan = k.rozetler.filter((r) => r.kazanildi)
  const kumarNet = k.kumar ? k.kumar.won - k.kumar.lost : 0

  return kabuk(gorunen, h`
<section class="kahraman">
  ${avatar(k, 'buyuk')}
  <h2>${gorunen}</h2>
  <p>#${k.sira} / ${k.uyeSayisi}${k.unvan ? ` · ${k.unvan}` : ''}${k.sampiyonluk ? ` · 🏆 ${k.sampiyonluk}` : ''}</p>
  <div class="seviye">
    <span>Seviye ${k.ilerleme.level}</span>
    <progress value="${k.ilerleme.kazanilan}" max="${k.ilerleme.gereken}"></progress>
    <small>${sayi.format(k.ilerleme.gereken - k.ilerleme.kazanilan)} XP kaldı</small>
  </div>
  ${k.last_seen ? h`<small>Son görülme: ${tarih.format(k.last_seen)}</small>` : ''}
</section>

<section class="kutular">
  ${kutu('Servet', sayi.format(k.servet), 'XP')}
  ${kutu('Mesaj', sayi.format(k.messages))}
  ${kutu('Sticker', sayi.format(k.stickers))}
  ${kutu('Ses', sayi.format(k.voices))}
  ${kutu('Günlük seri', sayi.format(k.seri), 'gün')}
  ${kutu('En aktif saat', k.enAktifSaat === null ? '—' : `${k.enAktifSaat}:00`)}
</section>

<div class="ikili">
<div class="yan">
  <section class="kart"><h2>Servet dağılımı</h2>${servetCubugu(k)}</section>

  ${k.xpGecmisi.length >= 2 ? h`<section class="kart"><h2>XP gelişimi</h2>${cizgi(k.xpGecmisi, 'artis buyuk', { genislik: 240, yukseklik: 60 })}</section>` : ''}

  <section class="kart"><h2>Son 30 gün</h2>${gunGrafigi(k.gunlukMesaj)}</section>

  <section class="kart"><h2>Saatlere göre aktivite</h2>${saatGrafigi(k.saatler)}</section>

  ${k.kumar ? h`<section class="kart liste"><h2>Kumar karnesi</h2>
    <div class="satir"><span class="ad"><strong>Net</strong><small>${sayi.format(k.kumar.games)} oyun</small></span><span class="deger ${kumarNet >= 0 ? 'artis' : 'dusus'}">${kumarNet >= 0 ? '+' : '−'}${sayi.format(Math.abs(kumarNet))}</span></div>
    <div class="satir"><span class="ad"><strong>Kazanılan</strong></span><span class="deger">${sayi.format(k.kumar.won)}</span></div>
    <div class="satir"><span class="ad"><strong>Kaybedilen</strong></span><span class="deger">${sayi.format(k.kumar.lost)}</span></div>
  </section>` : ''}
</div>

<div class="yan">
  <section class="kart"><h2>Rozetler <small>${kazanilan.length}/${k.rozetler.length}</small></h2>
    <div class="etiketler">${k.rozetler.map((r) => h`<span class="${r.kazanildi ? 'var' : 'yok'}" title="${r.aciklama}">${r.ad}</span>`)}</div>
  </section>

  ${k.hisseler.length ? h`<section class="kart liste"><h2>Portföy</h2>${k.hisseler.map((p) => h`
    <div class="satir">
      <span class="ad"><strong>${p.ad}</strong><small>Maliyet ${sayi.format(p.maliyet)}</small></span>
      <span class="deger">${sayi.format(p.deger)}<small class="${p.deger >= p.maliyet ? 'artis' : 'dusus'}">${p.deger >= p.maliyet ? '+' : '−'}${sayi.format(Math.abs(p.deger - p.maliyet))}</small></span>
    </div>`)}</section>` : ''}

  <section class="kart"><h2>Kartlar</h2>${k.setler.map((s) => {
    const sahip = s.kartlar.filter((c) => c.adet).length
    return h`
    <h3>${s.ad} <small>${sahip}/${s.kartlar.length}</small></h3>
    <progress value="${sahip}" max="${s.kartlar.length}"></progress>
    <div class="etiketler">${s.kartlar.map((c) => h`<span class="${c.adet ? 'var' : 'yok'}">${c.ad}${c.adet > 1 ? ` ×${c.adet}` : ''}</span>`)}</div>`
  })}
  </section>
</div>
</div>`, { geri: grupLink(chatJid) })
}
