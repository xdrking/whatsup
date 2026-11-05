// Panelin HTML'i. `h` değerleri kaçırır: WhatsApp adını üyeler kendisi yazdığı için
// bir ad asla ham HTML olarak sayfaya düşmemeli.
import { fnv1a } from '../lib/hash.js'
import { SIRALAMALAR } from './veri.js'

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

const adi = (u) => u.ad || `Adı bilinmiyor · ${u.user_jid.split('@')[0].slice(-4)}`
const grupLink = (chat) => `/grup?id=${encodeURIComponent(chat)}`
const kisiLink = (chat, jid) => `/kisi?grup=${encodeURIComponent(chat)}&id=${encodeURIComponent(jid)}`

function avatar(u, boyut = '') {
  const harf = [...(u.ad || '?')][0].toLocaleUpperCase('tr')
  return h`<span class="avatar a${fnv1a(u.user_jid) % AVATAR_RENGI} ${boyut}" aria-hidden="true">${harf}</span>`
}

function kabuk(baslik, icerik, { cikis = true, geri = null } = {}) {
  return h`<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0f1417">
<meta name="robots" content="noindex">
<title>${baslik}</title>
<link rel="stylesheet" href="/stil.css">
</head>
<body>
<header class="ust">
  ${geri ? h`<a class="geri" href="${geri}" aria-label="Geri">‹</a>` : ''}
  <h1>${baslik}</h1>
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
  <span class="ad"><strong>Grup ${i + 1}</strong><small>${sayi.format(g.uye)} üye</small></span>
  <span class="deger">${sayi.format(g.mesaj)}<small>mesaj</small></span>
</a>`)
  return kabuk('Gruplar', gruplar.length ? h`<section class="kart liste">${satirlar}</section>` : h`<p class="bos">Henüz veri yok.</p>`)
}

function kutu(etiket, deger) {
  return h`<div class="kutu"><small>${etiket}</small><strong>${deger}</strong></div>`
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

function degisim({ fiyat, onceki }) {
  const yuzde = ((fiyat - onceki) / onceki) * 100
  if (Math.abs(yuzde) < 0.05) return h`<small class="notr">—</small>`
  return h`<small class="${yuzde > 0 ? 'artis' : 'dusus'}">${yuzde > 0 ? '▲' : '▼'} %${ondalik.format(Math.abs(yuzde))}</small>`
}

export function grupSayfasi(chatJid, g, { tekGrup, yedekVar }) {
  const sekmeler = Object.entries(SIRALAMALAR).map(([alan, ad]) =>
    h`<a class="${alan === g.alan ? 'secili' : ''}" href="${grupLink(chatJid)}&sirala=${alan}">${ad}</a>`)

  const siralama = g.uyeler.map((u, i) => h`
<a class="satir" href="${kisiLink(chatJid, u.user_jid)}">
  <span class="sira">${i + 1}</span>
  ${avatar(u)}
  <span class="ad"><strong>${adi(u)}</strong><small>Seviye ${u.seviye}${u.unvan ? ` · ${u.unvan}` : ''}</small></span>
  <span class="deger">${sayi.format(u[g.alan])}</span>
</a>`)

  return kabuk('Grup', h`
<section class="kutular">
  ${kutu('Üye', sayi.format(g.toplam.uye))}
  ${kutu('Mesaj', sayi.format(g.toplam.mesaj))}
  ${kutu('Toplam XP', sayi.format(g.toplam.xp))}
  ${kutu('Bankada', sayi.format(g.toplam.banka))}
</section>

<div class="ikili">
<section class="kart liste">
  <h2>Sıralama</h2>
  <nav class="sekmeler">${sekmeler}</nav>
  ${siralama}
</section>

<div class="yan">
  ${g.sezon.length ? h`<section class="kart liste"><h2>Bu haftanın sezonu</h2>${g.sezon.map((s, i) => h`
    <a class="satir" href="${kisiLink(chatJid, s.user_jid)}">
      <span class="sira">${['🥇', '🥈', '🥉'][i]}</span>
      <span class="ad"><strong>${s.uye ? adi(s.uye) : 'Eski üye'}</strong></span>
      <span class="deger">${sayi.format(s.puan)}</span>
    </a>`)}</section>` : ''}

  ${g.borsa.length ? h`<section class="kart liste"><h2>Borsa</h2>${g.borsa.map((b) => h`
    <div class="satir">
      <span class="ad"><strong>${b.ad}</strong></span>
      <span class="deger">${ondalik.format(b.fiyat)}${degisim(b)}</span>
    </div>`)}</section>` : ''}

  <section class="kart"><h2>Saatlere göre aktivite</h2>${saatGrafigi(g.saatler)}</section>

  ${yedekVar ? h`<a class="dugme" href="/yedek">⬇ Son yedeği indir</a>` : ''}
</div>
</div>`, { geri: tekGrup ? null : '/' })
}

export function kisiSayfasi(chatJid, k) {
  const gorunen = adi(k)
  return kabuk(gorunen, h`
<section class="kahraman">
  ${avatar(k, 'buyuk')}
  <h2>${gorunen}</h2>
  <p>Seviye ${k.seviye}${k.unvan ? ` · ${k.unvan}` : ''}${k.sampiyonluk ? ` · 🏆 ${k.sampiyonluk}` : ''}</p>
  ${k.last_seen ? h`<small>Son mesaj: ${tarih.format(k.last_seen)}</small>` : ''}
</section>

<section class="kutular">
  ${kutu('Cüzdan XP', sayi.format(k.xp))}
  ${kutu('Banka', sayi.format(k.bakiye))}
  ${kutu('Portföy', sayi.format(k.portfoy))}
  ${kutu('Servet', sayi.format(k.servet))}
  ${kutu('Mesaj', sayi.format(k.messages))}
  ${kutu('Sticker', sayi.format(k.stickers))}
  ${kutu('Ses', sayi.format(k.voices))}
  ${kutu('Günlük seri', sayi.format(k.seri))}
</section>

<div class="ikili">
<div class="yan">
  <section class="kart"><h2>Saatlere göre aktivite</h2>${saatGrafigi(k.saatler)}</section>

  ${k.kumar ? h`<section class="kart liste"><h2>Kumar karnesi</h2>
    <div class="satir"><span class="ad"><strong>Kazanılan</strong></span><span class="deger artis">${sayi.format(k.kumar.won)}</span></div>
    <div class="satir"><span class="ad"><strong>Kaybedilen</strong></span><span class="deger dusus">${sayi.format(k.kumar.lost)}</span></div>
    <div class="satir"><span class="ad"><strong>Oyun</strong></span><span class="deger">${sayi.format(k.kumar.games)}</span></div>
  </section>` : ''}

  ${k.hisseler.length ? h`<section class="kart liste"><h2>Portföy</h2>${k.hisseler.map((p) => h`
    <div class="satir">
      <span class="ad"><strong>${p.ad}</strong><small>Maliyet ${sayi.format(p.maliyet)}</small></span>
      <span class="deger">${sayi.format(p.deger)}</span>
    </div>`)}</section>` : ''}
</div>

<section class="kart"><h2>Kartlar</h2>${k.setler.map((s) => h`
  <h3>${s.ad}</h3>
  <div class="etiketler">${s.kartlar.map((c) => h`<span class="${c.adet ? 'var' : 'yok'}">${c.ad}${c.adet > 1 ? ` ×${c.adet}` : ''}</span>`)}</div>`)}
</section>
</div>`, { geri: grupLink(chatJid) })
}
