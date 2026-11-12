// Panelin HTML'i. `h` değerleri kaçırır: WhatsApp adını üyeler kendisi yazdığı için
// bir ad asla ham HTML olarak sayfaya düşmemeli.
import { readFileSync } from 'node:fs'
import { fnv1a } from '../lib/hash.js'
import { oranYaz } from '../lib/banka.js'
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

export function kabuk(baslik, icerik, { cikis = true, geri = null, ust = baslik } = {}) {
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

export function girisSayfasi(hata = '', kimlik = '') {
  return kabuk('Panel', h`
<form class="giris kart" method="post" action="/giris">
  <div class="logo" aria-hidden="true">🎰</div>
  <h2>Grup paneli</h2>
  <label for="kimlik">Numara ya da LID</label>
  <input id="kimlik" name="kimlik" inputmode="numeric" autocomplete="username" value="${kimlik}" placeholder="905551112233">
  <label for="sifre">Şifre</label>
  <input id="sifre" name="sifre" type="password" autocomplete="current-password" required>
  ${hata ? h`<p class="hata" role="alert">${hata}</p>` : ''}
  <button>Giriş yap</button>
  <p class="not">Hesabın yoksa bota <strong>özelden</strong> <code>.panel kayıt &lt;şifre&gt;</code> yaz.</p>
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
  const tur = b.tefeci !== undefined ? `Tefeci${b.tefeci ? ` (${adi(b.tefeci)})` : ''}` : 'Kredi'
  if (b.gecti) return `${tur} · vadesi geçti, ilk mesajında tahsil edilir`
  return b.vade ? `${tur} · vade ${tarih.format(b.vade)}` : 'Eksi bakiye'
}

/** Üyeye bağlanan liste satırı; üye gruptan çıkmışsa "Eski üye" yazar. */
function uyeSatiri(chatJid, jid, uye, alt, deger, degerAlt = '') {
  return h`<a class="satir" href="${kisiLink(chatJid, jid)}">
    ${uye ? avatar(uye) : ''}
    <span class="ad"><strong>${uye ? adi(uye) : 'Eski üye'}</strong>${alt ? h`<small>${alt}</small>` : ''}</span>
    ${deger === '' ? '' : h`<span class="deger">${deger}${degerAlt ? h`<small>${degerAlt}</small>` : ''}</span>`}
  </a>`
}

const duzSatir = (ad, deger, alt = '') =>
  h`<div class="satir"><span class="ad"><strong>${ad}</strong>${alt ? h`<small>${alt}</small>` : ''}</span><span class="deger">${deger}</span></div>`

const bitisYaz = (bitis) => (bitis ? `${tarih.format(bitis)}'e kadar` : 'Kaldırılana kadar')

function hazineKarti(chatJid, hz) {
  return h`<section class="kart liste">
    <h2>Hazine <small>bot hesabı</small></h2>
    ${duzSatir('Kasa', sayi.format(hz.banka), 'Botun bankası')}
    ${duzSatir('Bot cüzdanı', sayi.format(hz.cuzdan))}
    ${hz.coin ? duzSatir('Bot coini', sayi.format(hz.coin)) : ''}
    ${hz.mulkDeger ? duzSatir('Bot mülkleri', sayi.format(hz.mulkDeger), 'Satış değeri') : ''}
    ${duzSatir('Bugün ödenen maaş', sayi.format(hz.maas))}
    ${duzSatir('Toplanan vergi', sayi.format(hz.vergi), 'Kayıt başladığından beri')}
    ${hz.aktarimlar.length ? h`<h3>Bugünkü hazine aktarımları</h3>${hz.aktarimlar.map((a) => uyeSatiri(chatJid, a.user_jid, a.uye, '', sayi.format(a.miktar)))}` : ''}
  </section>`
}

function hukumetKarti(chatJid, satirlar) {
  return h`<section class="kart liste"><h2>Hükümet</h2>${satirlar.map((m) => h`
    ${m.user_jid
    ? uyeSatiri(chatJid, m.user_jid, m.uye, `${m.ad}${m.askida ? (m.kod === 'baskan' ? ' · darbe' : ' · kayyum') : ''}`, '')
    : duzSatir(m.ad, '', m.kod === 'baskan' ? 'Seçilmiş başkan yok, bot sahibi yönetir' : 'Boş')}
    ${m.secim ? h`<div class="satir alt-satir"><span class="ad"><small>🗳️ Seçim sürüyor · ${tarih.format(m.secim.bitis)}'de kapanır</small></span></div>
      ${m.secim.adaylar.map((a) => uyeSatiri(chatJid, a.user_jid, a.uye, 'Aday', sayi.format(a.oy), 'oy'))}` : ''}`)}
  </section>`
}

function kumarKarti(chatJid, kt) {
  if (!kt.kazananlar.length && !kt.kaybedenler.length) return ''
  return h`<section class="kart liste"><h2>Kumarhane</h2>
    ${kt.kazananlar.length ? h`<h3>En çok kazananlar</h3>${kt.kazananlar.map((u) => uyeSatiri(chatJid, u.user_jid, u, '', h`<span class="artis">+${sayi.format(u.kumarNet)}</span>`))}` : ''}
    ${kt.kaybedenler.length ? h`<h3>En çok kaybedenler</h3>${kt.kaybedenler.map((u) => uyeSatiri(chatJid, u.user_jid, u, '', h`<span class="dusus">−${sayi.format(u.kumarZarar)}</span>`))}` : ''}
  </section>`
}

function kriptoKarti(chatJid, k) {
  return h`<section class="kart liste"><h2>🟠 Suly</h2>
    ${duzSatir('1 Suly', sayi.format(k.xp), `$${sayi.format(Math.round(k.usd))} · son işlem fiyatı`)}
    ${k.sahipler.map((u) => uyeSatiri(chatJid, u.user_jid, u, 'Suly', sulyMetni(u.suly)))}
  </section>`
}

const sulyMetni = (birim) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 8 }).format(birim / 100_000_000)

function petKarti(chatJid, petler) {
  return h`<section class="kart liste"><h2>Evcil hayvanlar</h2>${petler.map((p) =>
    uyeSatiri(chatJid, p.user_jid, p.uye, `${p.tur} ${p.ad} · tokluk ${p.tokluk} · mutluluk ${p.mutluluk}`, sayi.format(p.seviye), 'seviye'))}
  </section>`
}


function ekonomiKarti(chatJid, e) {
  return h`<section class="kart liste">
    <h2>Ekonomi</h2>
    <div class="satir"><span class="ad"><strong>Piyasadaki para</strong><small>Bugünün kaydı, bot hariç</small></span><span class="deger">${sayi.format(e.arz)}</span></div>
    <div class="satir"><span class="ad"><strong>1 coin</strong></span><span class="deger">${sayi.format(e.kur)}</span></div>
    <div class="satir"><span class="ad"><strong>Günlük enflasyon</strong></span><span class="deger">${e.enflasyon === null ? 'veri yok' : yuzde.format(e.enflasyon)}</span></div>
    <div class="satir"><span class="ad"><strong>Saatlik faiz</strong><small>Banka / kredi</small></span><span class="deger">%${oranYaz(e.faiz.banka)} / %${oranYaz(e.faiz.kredi)}</span></div>
    <div class="satir"><span class="ad"><strong>Toplam coin</strong></span><span class="deger">${sayi.format(e.toplamCoin)}</span></div>
    ${e.mulkler.map((m) => h`<div class="satir"><span class="ad"><strong>${m.ad}</strong></span><span class="deger">${sayi.format(m.adet)}</span></div>`)}
    ${e.coinSahipleri.map((c) => h`<a class="satir" href="${kisiLink(chatJid, c.user_jid)}">
      ${c.uye ? avatar(c.uye) : ''}
      <span class="ad"><strong>${c.uye ? adi(c.uye) : 'Eski üye'}</strong><small>Coin</small></span>
      <span class="deger">${sayi.format(c.bakiye)}</span>
    </a>`)}
    ${e.arzGecmisi.length >= 2 ? cizgi(e.arzGecmisi, 'artis buyuk', { genislik: 240, yukseklik: 60 }) : ''}
  </section>`
}

function toplumKartlari(chatJid, t) {
  return h`
  ${t.ceteler.length ? h`<section class="kart liste"><h2>Çeteler</h2>${t.ceteler.map((c) => h`
    <a class="satir" href="${kisiLink(chatJid, c.lider)}">
      <span class="ad"><strong>${c.ad}</strong><small>Lider ${c.liderUye ? adi(c.liderUye) : 'eski üye'} · ${sayi.format(c.uyeSayisi)} üye · kasa ${sayi.format(c.kasa)}</small></span>
      <span class="deger">${sayi.format(c.puan)}<small>puan</small></span>
    </a>`)}</section>` : ''}

  ${t.hapistekiler.length ? h`<section class="kart liste"><h2>Hapishane</h2>${t.hapistekiler.map((m) => h`
    <a class="satir" href="${kisiLink(chatJid, m.user_jid)}">
      ${m.uye ? avatar(m.uye) : ''}
      <span class="ad"><strong>${m.uye ? adi(m.uye) : 'Eski üye'}</strong><small>Çıkış ${tarih.format(m.bitis)}</small></span>
      <span class="deger">${sayi.format(m.kefalet)}<small>kefalet</small></span>
    </a>`)}</section>` : ''}

  ${t.ciftler.length ? h`<section class="kart liste"><h2>Evlilikler</h2>${t.ciftler.map((c) => h`
    <a class="satir" href="${kisiLink(chatJid, c.user_jid)}">
      <span class="ad"><strong>${c.uye ? adi(c.uye) : 'Eski üye'} 💍 ${c.es ? adi(c.es) : 'Eski üye'}</strong><small>${tarih.format(c.tarih)}</small></span>
    </a>`)}</section>` : ''}

  ${t.meslekler.length ? h`<section class="kart liste"><h2>Meslekler</h2>${t.meslekler.map((m) => h`
    <div class="satir"><span class="ad"><strong>${m.ad}</strong></span><span class="deger">${sayi.format(m.adet)}</span></div>`)}</section>` : ''}`
}

function hayatKarti(chatJid, y, v) {
  if (!y.meslek && !y.es && !y.cete && !y.hapis && !y.makam?.length && !y.sustur && !y.ambargo && !v.pet && !v.kalkan && !v.sigorta) return ''

  return h`<section class="kart liste"><h2>Hayat</h2>
    ${(y.makam ?? []).map((m) => duzSatir(m, '', 'Makam'))}
    ${y.sustur ? duzSatir('🔇 Susturuldu', '', bitisYaz(y.sustur.bitis)) : ''}
    ${y.ambargo ? duzSatir('🌍 Ambargoda', '', bitisYaz(y.ambargo.bitis)) : ''}
    ${v.kalkan ? duzSatir('🛡️ Soygun kalkanı', '', bitisYaz(v.kalkan)) : ''}
    ${v.sigorta ? duzSatir('📄 Haciz sigortası', '', bitisYaz(v.sigorta)) : ''}
    ${v.pet ? duzSatir(`${v.pet.tur} ${v.pet.ad}`, `${sayi.format(v.pet.seviye)}`, `Tokluk ${v.pet.tokluk} · mutluluk ${v.pet.mutluluk} · seviye`) : ''}
    ${y.hapis ? h`<div class="satir"><span class="ad"><strong>🚔 Hapiste</strong><small>Çıkış ${tarih.format(y.hapis.bitis)}</small></span><span class="deger">${sayi.format(y.hapis.kefalet)}<small>kefalet</small></span></div>` : ''}
    ${y.meslek ? h`<div class="satir"><span class="ad"><strong>${y.meslek}</strong><small>Meslek</small></span></div>` : ''}
    ${y.cete ? h`<div class="satir"><span class="ad"><strong>🏴 ${y.cete.ad}</strong><small>${y.cete.lider ? 'Lider' : 'Üye'}</small></span><span class="deger">${sayi.format(y.cete.kasa)}<small>kasa</small></span></div>` : ''}
    ${y.es ? h`<a class="satir" href="${kisiLink(chatJid, y.es.es_jid)}">
      ${y.es.uye ? avatar(y.es.uye) : ''}
      <span class="ad"><strong>💍 ${y.es.uye ? adi(y.es.uye) : 'Eski üye'}</strong><small>${tarih.format(y.es.tarih)}</small></span>
    </a>` : ''}
  </section>`
}

export function grupSayfasi(chatJid, g, { tekGrup, yedekVar }) {
  const sekmeler = Object.entries(SIRALAMALAR).map(([alan, ad]) =>
    h`<a class="${alan === g.alan ? 'secili' : ''}" href="${grupLink(chatJid)}&sirala=${alan}">${ad}</a>`)

  const ilkUc = g.uyeler.length >= 3 ? g.uyeler.slice(0, 3) : []
  const siralama = g.uyeler.slice(ilkUc.length).map((u, i) => h`
<a class="satir" href="${kisiLink(chatJid, u.user_jid)}">
  <span class="sira">${i + ilkUc.length + 1}</span>
  ${avatar(u)}
  <span class="ad"><strong>${adi(u)}</strong><small>${u.bot ? '🤖 Hazine · ' : ''}Seviye ${u.seviye}${u.unvan ? ` · ${u.unvan}` : ''}</small></span>
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

  ${g.kumarTop ? kumarKarti(chatJid, g.kumarTop) : ''}

  ${g.vergiTop.length ? h`<section class="kart liste"><h2>Vergi rekortmenleri</h2>${g.vergiTop.map((v) => uyeSatiri(chatJid, v.user_jid, v.uye, '', sayi.format(v.toplam)))}</section>` : ''}

  ${g.cezalilar.length ? h`<section class="kart liste"><h2>Cezalılar</h2>${g.cezalilar.map((c) => uyeSatiri(chatJid, c.user_jid, c.uye, `${c.tur} · ${bitisYaz(c.bitis)}`, ''))}</section>` : ''}

  ${g.rekorlar.length ? h`<section class="kart"><h2>Grup rekorları</h2><div class="rekorlar">${g.rekorlar.map((r) => h`
    <a class="rekor" href="${kisiLink(chatJid, r.uye.user_jid)}">
      <small>${r.etiket}</small>
      <strong>${adi(r.uye)}</strong>
      <small>${sayi.format(r.deger)} ${r.birim}</small>
    </a>`)}</div></section>` : ''}
</div>

<div class="yan">
  ${g.hukumet.length ? hukumetKarti(chatJid, g.hukumet) : ''}

  ${g.hazine ? hazineKarti(chatJid, g.hazine) : ''}

  ${g.ekonomi ? ekonomiKarti(chatJid, g.ekonomi) : ''}

  ${g.kripto ? kriptoKarti(chatJid, g.kripto) : ''}

  ${g.wordle ? h`<section class="kart liste"><h2>Bugünün wordle'ı</h2>
    ${g.wordle.cozen ? uyeSatiri(chatJid, g.wordle.cozen.user_jid, g.wordle.cozen, 'Bildi', sayi.format(g.wordle.toplam), 'tahmin') : duzSatir('Henüz bilen yok', sayi.format(g.wordle.toplam), 'tahmin')}
  </section>` : ''}

  ${toplumKartlari(chatJid, g.toplum)}

  ${g.petler.length ? petKarti(chatJid, g.petler) : ''}

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
      <text class="eksen" font-size="11" x="${sag + 8}" y="${(y(f) + 4).toFixed(1)}">${ondalik.format(f)}</text>`)}
    ${zamanlar.map((z) => h`<line class="izgara" x1="${z.px.toFixed(1)}" x2="${z.px.toFixed(1)}" y1="${ust}" y2="${alt}"/>
      <text class="eksen orta" font-size="11" x="${z.px.toFixed(1)}" y="${yukseklik - 8}">${z.yazi}</text>`)}
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
    <text class="son-yazi" font-size="11" x="${sag + 6}" y="${(y(son) + 4).toFixed(1)}">${iki.format(son)}</text>
    ${dilimler.map((m, i) => {
    const bas = x(Math.max(m.saat, t0))
    const bit = i + 1 < dilimler.length ? x(dilimler[i + 1].saat) : sag
    return h`<rect class="vuru" fill="transparent" x="${bas.toFixed(1)}" y="${ust}" width="${Math.max(bit - bas, 1).toFixed(1)}" height="${alt - ust}"><title>${tamBicim(m.saat)} · Açılış ${iki.format(m.acilis)} · Yüksek ${iki.format(m.yuksek)} · Düşük ${iki.format(m.dusuk)} · Kapanış ${iki.format(m.kapanis)}</title></rect>`
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
  const parcalar = [
    ['cuzdan', 'Cüzdan', k.xp], ['banka', 'Banka', k.bakiye], ['portfoy', 'Portföy', k.portfoy],
    ['coin', 'Coin', k.coinDeger], ['suly', 'Suly', k.sulyDeger], ['mulk', 'Mülk', k.mulkDeger], ['yatirim', 'Yatırım', k.yatirim],
  ]
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

function varlikKarti(v) {
  if (!v.coin && !v.suly && !v.mulkler.length && !v.yatirim && !v.vergi) return ''
  return h`<section class="kart liste"><h2>Varlıklar</h2>
    ${v.coin ? duzSatir(`🪙 ${sayi.format(v.coin)} coin`, sayi.format(v.coinDeger), 'Bozdurma değeri') : ''}
    ${v.suly ? duzSatir(`🟠 ${sulyMetni(v.suly)} Suly`, sayi.format(v.sulyDeger), 'Satış değeri') : ''}
    ${v.mulkler.map((m) => duzSatir(m.ad, sayi.format(m.adet), 'adet'))}
    ${v.mulkler.length ? duzSatir('Mülklerin değeri', sayi.format(v.mulkDeger), 'Satış değeri ve toplanmamış kira') : ''}
    ${v.yatirim ? duzSatir(`📈 Yatırım · ${v.yatirim.risk}`, sayi.format(v.yatirim.miktar), `Bitiş ${tarih.format(v.yatirim.bitis)}`) : ''}
    ${v.vergi ? duzSatir('🧾 Ödenen vergi', sayi.format(v.vergi), 'Kayıt başladığından beri') : ''}
  </section>`
}

function borcKarti(chatJid, v) {
  if (!v.kredi && !v.tefeci && !v.alacaklar.length) return ''
  return h`<section class="kart liste"><h2>Borç ve alacak</h2>
    ${v.kredi ? duzSatir('💳 Kredi', h`<span class="dusus">${sayi.format(v.kredi.borc)}</span>`, `Vade ${tarih.format(v.kredi.vade)}`) : ''}
    ${v.tefeci ? uyeSatiri(chatJid, v.tefeci.alacakli, v.tefeci.uye, `Tefeci borcu · vade ${tarih.format(v.tefeci.vade)}`, h`<span class="dusus">${sayi.format(v.tefeci.borc)}</span>`) : ''}
    ${v.alacaklar.map((a) => uyeSatiri(chatJid, a.borclu, a.uye, `Alacak · vade ${tarih.format(a.vade)}`, h`<span class="artis">${sayi.format(a.borc)}</span>`))}
  </section>`
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
    ${k.kumarOyunlari.length ? h`<h3>Oyunlar</h3>${k.kumarOyunlari.map((o) => {
    const net = o.won - o.lost
    return duzSatir(o.oyun, h`<span class="${net >= 0 ? 'artis' : 'dusus'}">${net >= 0 ? '+' : '−'}${sayi.format(Math.abs(net))}</span>`, `${sayi.format(o.games)} oyun`)
  })}` : ''}
  </section>` : ''}
</div>

<div class="yan">
  ${hayatKarti(chatJid, k.hayat, k.varlik)}

  ${varlikKarti(k.varlik)}

  ${borcKarti(chatJid, k.varlik)}

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
