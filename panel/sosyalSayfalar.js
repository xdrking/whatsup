// Sosyal bölümün HTML'i (Faz 66). Değerler `h` ile kaçırılır: gönderi, yorum ve DM
// metnini üyeler yazar, hiçbiri ham HTML olarak sayfaya düşmemeli. Betik yalnızca
// /sosyal.js dosyasıdır; o yoksa da her form normal gönderilir.
import { readFileSync } from 'node:fs'
import { fnv1a } from '../lib/hash.js'
import { ANKET_AZAMI, ANKET_GUNLERI, cevrimiciMi, DURUM_AZAMI, DUZENLEME_MS, duzenlenebilir, ETKINLIK_METIN_AZAMI, METIN_AZAMI, SOHBET_AD_AZAMI, TEPKILER, yorumSayisi } from '../lib/sosyal.js'
import { MAKAMLAR } from '../lib/devlet.js'
import { NADIRLIK, nftBul } from '../lib/nft.js'
import { OYUN_ADI } from '../lib/wrapped.js'
import { ikon } from './ikonlar.js'
import { h } from './sayfalar.js'

const surum = (dosya) => fnv1a(readFileSync(new URL(dosya, import.meta.url), 'utf8'))
export const SOSYAL_SURUMU = `${surum('./sosyal.css')}-${surum('./sosyal-istemci.js')}`

const sayi = new Intl.NumberFormat('tr-TR')
const tarih = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
const saatBicimi = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' })
const yuzde = new Intl.NumberFormat('tr-TR', { style: 'percent', maximumFractionDigits: 0 })
const RENK = 8

const q = (chat) => `grup=${encodeURIComponent(chat)}`
export const sLink = (chat, yol = '', ek = {}) => `/s${yol}?${new URLSearchParams({ grup: chat, ...ek })}`
export const medyaLink = (chat, ad) => `/s/medya/${ad}?${q(chat)}`
const profilLink = (chat, jid) => sLink(chat, '/profil', { id: jid })

export const adi = (u) => u?.ad || (u?.jid ? `Üye ${u.jid.split('@')[0].slice(-4)}` : 'Eski üye')

export function zamanYaz(ms, now = Date.now()) {
  const fark = Math.max(0, now - ms)
  if (fark < 60_000) return 'şimdi'
  if (fark < 3_600_000) return `${Math.floor(fark / 60_000)} dk`
  if (fark < 86_400_000) return `${Math.floor(fark / 3_600_000)} sa`
  if (fark < 2 * 86_400_000) return 'dün'
  return tarih.format(ms)
}

export function avatar(chat, u, boyut = '') {
  if (u?.avatar) return h`<img class="av ${boyut}" src="${medyaLink(chat, u.avatar)}" alt="" loading="lazy">`
  const harf = [...(u?.ad || '?')][0].toLocaleUpperCase('tr')
  return h`<span class="av harf r${fnv1a(u?.jid || '') % RENK} ${boyut}" aria-hidden="true">${harf}</span>`
}

/** Son CEVRIMICI_MS içinde paneli açan kişinin avatarına yeşil nokta konur. */
export function avatarDurum(chat, u, boyut = '', now = Date.now()) {
  if (!cevrimiciMi(u, now)) return avatar(chat, u, boyut)
  return h`<span class="av-kap ${boyut}">${avatar(chat, u, boyut)}<i class="cevrimici" title="Çevrimiçi"></i></span>`
}

const BOT = { jid: '', ad: 'Grup Bülteni' }
const botAvatar = h`<span class="av bot" aria-hidden="true">✦</span>`

/**
 * Metindeki @etiketleri profile, adresleri bağlantıya çevirir. Kalan her parça `h` ile
 * kaçırılır. Adlar uzundan kısaya aranır ("@Ali Veli" önce).
 */
export function metinCiz(chat, metin, uyeler) {
  const adlar = uyeler.filter((u) => u.ad).sort((a, b) => b.ad.length - a.ad.length)
  const kacir = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const desen = new RegExp(`(https?://[^\\s<]+)|(?<![\\p{L}\\p{N}_&])#([\\p{L}\\p{N}_]{1,40})${adlar.length ? `|@(${adlar.map((u) => kacir(u.ad)).join('|')})` : ''}`, 'giu')
  const yazi = String(metin)
  const parcalar = []
  let son = 0
  for (const e of yazi.matchAll(desen)) {
    parcalar.push(yazi.slice(son, e.index))
    if (e[1]) {
      parcalar.push(h`<a href="${e[1]}" rel="noopener noreferrer nofollow" target="_blank">${e[1]}</a>`)
    } else if (e[2]) {
      parcalar.push(h`<a class="hashtag" href="${sLink(chat, '/etiket', { ad: e[2].toLocaleLowerCase('tr') })}">#${e[2]}</a>`)
    } else {
      const u = adlar.find((x) => x.ad.toLocaleLowerCase('tr') === e[3].toLocaleLowerCase('tr')) ?? adlar[0]
      parcalar.push(h`<a class="etiket" href="${profilLink(chat, u.jid)}">@${u.ad}</a>`)
    }
    son = e.index + e[0].length
  }
  parcalar.push(yazi.slice(son))
  return parcalar
}

// --- Kabuk ---------------------------------------------------------------

const rozetSayi = (n) => (n ? h`<span class="sayac">${n > 99 ? '99+' : n}</span>` : '')

/**
 * Masaüstünde üç sütun (menü, akış, yan kutular), telefonda üst çubuk + alt sekme.
 * @param {{ chat, ben, grupAdi, sayac, secili, sag?, cokGrup? }} c
 */
export function sosyalKabuk(baslik, icerik, c) {
  const { chat, ben, grupAdi, sayac, secili = '', sag = '', cokGrup = false, sorgu = '', tema = '', uyeAdlari = [] } = c
  const menu = (adres, anahtar, simge, ad, ek = '') =>
    h`<a href="${adres}"${secili === anahtar ? h` class="secili" aria-current="page"` : ''}><span class="ik">${ikon(simge)}</span><span class="ad">${ad}</span>${ek}</a>`
  return h`<!doctype html>
<html lang="tr"${tema ? h` data-tema="${tema}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${tema ? h`<meta name="theme-color" content="${tema === 'koyu' ? '#1b2433' : '#3b5b98'}">` : h`<meta name="theme-color" content="#3b5b98" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1b2433" media="(prefers-color-scheme: dark)">`}
<meta name="robots" content="noindex">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>${baslik} · ${grupAdi || 'Grup'}</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/ikon-192.png">
<link rel="apple-touch-icon" href="/ikon-192.png">
<link rel="stylesheet" href="/sosyal.css?v=${SOSYAL_SURUMU}">
<script src="/sosyal.js?v=${SOSYAL_SURUMU}" defer></script>
</head>
<body class="sosyal" data-grup="${chat}" data-uyeler="${JSON.stringify(uyeAdlari)}">
<header class="ust-cubuk">
  <a class="marka" href="${sLink(chat)}"><span class="logo" aria-hidden="true">${[...(grupAdi || 'g')][0].toLocaleLowerCase('tr')}</span><span class="marka-ad">${(grupAdi || 'grup').toLocaleLowerCase('tr')}</span></a>
  <form class="ara-kutu" method="get" action="/s/ara" role="search">${gizliGrup(chat)}<input type="search" name="q" value="${secili === 'ara' ? sorgu : ''}" placeholder="Kişi, #etiket ya da gönderi ara" maxlength="80" aria-label="Ara"></form>
  <nav class="ust-ikonlar" aria-label="Kısayollar">
    <a href="${sLink(chat, '/ara')}" aria-label="Ara" class="ust-ik ara-ik${secili === 'ara' ? ' secili' : ''}">${ikon('ara')}</a>
    <a href="${sLink(chat, '/bildirim')}" aria-label="Bildirimler" class="ust-ik${secili === 'bildirim' ? ' secili' : ''}">${ikon('zil')}${rozetSayi(sayac.bildirim)}</a>
    <a href="${sLink(chat, '/mesaj')}" aria-label="Mesajlar" class="ust-ik${secili === 'mesaj' ? ' secili' : ''}">${ikon('mesaj')}${rozetSayi(sayac.dm)}</a>
    <a href="${profilLink(chat, ben.jid)}" aria-label="Profilim" class="ust-ben">${avatar(chat, ben, 'kucuk')}</a>
  </nav>
</header>
<div class="duzen">
  <nav class="sol" aria-label="Ana menü">
    <a class="sol-ben" href="${profilLink(chat, ben.jid)}">${avatar(chat, ben)}<span><strong>${adi(ben)}</strong><small>Profili gör</small></span></a>
    ${menu(sLink(chat), 'akis', 'ev', 'Haber kaynağı')}
    ${menu(sLink(chat, '/ara'), 'ara', 'ara', 'Ara')}
    ${menu(sLink(chat, '/mesaj'), 'mesaj', 'mesaj', 'Mesajlar', rozetSayi(sayac.dm))}
    ${menu(sLink(chat, '/bildirim'), 'bildirim', 'zil', 'Bildirimler', rozetSayi(sayac.bildirim))}
    ${menu(sLink(chat, '/arkadas'), 'arkadas', 'kisiler', 'Arkadaşlar')}
    ${menu(sLink(chat, '/kaydedilen'), 'kaydedilen', 'kayit', 'Kaydedilenler')}
    ${menu(sLink(chat, '/ayar'), 'ayar', 'kalem', 'Profili düzenle')}
    <form method="post" action="/s/tema" class="tema-form"><button name="tema" value="${tema === 'koyu' ? 'acik' : 'koyu'}"><span class="ik">${ikon(tema === 'koyu' ? 'gunes' : 'ay')}</span><span>${tema === 'koyu' ? 'Açık tema' : 'Koyu tema'}</span></button></form>
    <h3>Eğlence</h3>
    ${menu(`/oyun?${q(chat)}`, 'oyun', 'oyun', 'Oyunlar')}
    ${menu(`/oyun/coin?${q(chat)}`, 'coin', 'borsa', 'Coin borsası')}
    ${menu(`/oyun/suly?${q(chat)}`, 'suly', 'borsa', 'Suly borsası')}
    ${menu(`/oyun/sulymarket?${q(chat)}`, 'sulymarket', 'gozluk', 'SulyMarket')}
    ${cokGrup ? menu('/s', 'grup', 'degistir', 'Grubu değiştir') : ''}
    <form method="post" action="/cikis" class="cikis"><button>${ikon('cikis')}<span>Çıkış yap</span></button></form>
  </nav>
  <main id="icerik">${izinSeridi}${icerik}</main>
  <aside class="sag">${sag}</aside>
</div>
<nav class="alt-sekme" aria-label="Alt menü">
  ${menu(sLink(chat), 'akis', 'ev', 'Akış')}
  ${menu(sLink(chat, '/arkadas'), 'arkadas', 'kisiler', 'Arkadaşlar')}
  ${menu(`${sLink(chat)}#paylas`, 'paylas', 'arti', 'Paylaş')}
  ${menu(sLink(chat, '/mesaj'), 'mesaj', 'mesaj', 'Mesajlar', rozetSayi(sayac.dm))}
  ${menu(`/oyun?${q(chat)}`, 'oyun', 'oyun', 'Oyunlar')}
</nav>
</body>
</html>`.metin
}

/** Sağ sütun: gündem, son görülenler, grubun zirvesi. Mesaj içeriği yoktur, yalnızca son görülme. */
export function sagSutun(chat, uyeler, now = Date.now(), gundem = [], etkinlikler = []) {
  // Çevrimiçi olanlar başa: liste WhatsApp'taki son mesaja göre sıralı gelir.
  const aktif = [...uyeler].sort((a, b) => Number(cevrimiciMi(b, now)) - Number(cevrimiciMi(a, now))).slice(0, 8)
  const zirve = [...uyeler].sort((a, b) => b.xp - a.xp).slice(0, 5)
  const durumlar = uyeler.filter((u) => u.durum).slice(0, 6)
  return h`${durumlar.length ? h`<section class="kutu durumlar">
  <h2>Şu an</h2>
  ${durumlar.map((u) => h`<a class="mini" href="${profilLink(chat, u.jid)}">${avatarDurum(chat, u, 'kucuk', now)}<span>${adi(u)}<small class="durum-metin">${u.durum}</small></span></a>`)}
</section>` : ''}
${etkinlikler.length ? h`<section class="kutu yaklasan">
  <h2>Yaklaşan etkinlikler</h2>
  ${etkinlikler.map((e) => h`<a class="mini etkinlik-mini" href="${sLink(chat, '/gonderi', { id: e.id })}">${takvimYapragi(e.zaman)}<span>${e.baslik}<small>${tarih.format(e.zaman)}${e.gelen ? ` · ${e.gelen} kişi geliyor` : ''}</small></span></a>`)}
</section>` : ''}
${gundem.length ? h`<section class="kutu gundem">
  <h2>Gündem</h2>
  ${gundem.map((e) => h`<a class="mini" href="${sLink(chat, '/etiket', { ad: e.ad })}"><span>#${e.ad}</span><small>${e.sayi} kişi</small></a>`)}
</section>` : ''}
<section class="kutu">
  <h2>Son görülenler</h2>
  ${aktif.map((u) => h`<a class="mini" href="${profilLink(chat, u.jid)}">${avatarDurum(chat, u, 'kucuk', now)}<span>${adi(u)}</span><small${cevrimiciMi(u, now) ? h` class="artis"` : ''}>${cevrimiciMi(u, now) ? 'çevrimiçi' : zamanYaz(u.last_seen, now)}</small></a>`)}
</section>
<section class="kutu">
  <h2>Grubun zirvesi</h2>
  ${zirve.map((u, i) => h`<a class="mini" href="${profilLink(chat, u.jid)}"><b class="sira">${i + 1}</b><span>${adi(u)}</span><small>${sayi.format(u.xp)} XP</small></a>`)}
</section>
<p class="dipnot">Yalnızca grup üyelerine açık.</p>`
}

// --- Gönderi ---------------------------------------------------------------

const bul = (uyeler, jid) => uyeler.find((u) => u.jid === jid) ?? { jid, ad: '' }

/** Fotoğraf seçen alan: önizleme betikle gelir. */
const fotoAlani = (ad = 'foto', etiket = 'Fotoğraf') =>
  h`<label class="foto-sec"><input type="file" name="${ad}" accept="image/*"><span>${ikon('foto')}${etiket ? h`<b>${etiket}</b>` : ''}</span></label>`

const gizliGrup = (chat) => h`<input type="hidden" name="grup" value="${chat}">`

export function paylasKutusu(chat, ben, { hedef = null, yer = '' } = {}) {
  const ipucu = hedef ? `${adi(hedef)} için bir şey yaz…` : 'Aklından ne geçiyor?'
  return h`<form class="kart paylas" id="paylas" method="post" action="/s/paylas" enctype="multipart/form-data">
  ${gizliGrup(chat)}
  ${hedef ? h`<input type="hidden" name="hedef" value="${hedef.jid}">` : ''}
  <input type="hidden" name="don" value="${yer}">
  <div class="paylas-ust">${avatar(chat, ben)}<textarea name="metin" rows="2" maxlength="2000" placeholder="${ipucu}"></textarea></div>
  <div class="onizleme" hidden></div>
  <div class="paylas-alt">${fotoAlani()}
  ${hedef ? '' : h`<details class="anket-ac"><summary>${ikon('anket')}<b>Anket</b></summary>
    <div class="anket-girdi">
      ${Array.from({ length: ANKET_AZAMI }, (_, i) => h`<input name="secenek${i + 1}" maxlength="80" placeholder="${i < 2 ? `${i + 1}. seçenek` : `${i + 1}. seçenek (isteğe bağlı)`}" autocomplete="off">`)}
      <label>Süre <select name="sure">${ANKET_GUNLERI.map((g) => h`<option value="${g}">${g} gün</option>`)}</select></label>
      <small class="soluk">Metin kutusuna yazdığın, anketin sorusu olur.</small>
    </div>
  </details>`}
  ${hedef ? '' : h`<details class="anket-ac etkinlik-ac"><summary>${ikon('takvim')}<b>Etkinlik</b></summary>
    <div class="anket-girdi">
      <input name="etkinlik_baslik" maxlength="${ETKINLIK_METIN_AZAMI}" placeholder="Etkinliğin adı (halı saha, doğum günü…)" autocomplete="off">
      <div class="yan-yana"><input type="date" name="etkinlik_tarih" aria-label="Tarih"><input type="time" name="etkinlik_saat" value="20:00" aria-label="Saat"></div>
      <input name="etkinlik_yer" maxlength="${ETKINLIK_METIN_AZAMI}" placeholder="Yer (isteğe bağlı)" autocomplete="off">
      <small class="soluk">"Geliyorum" ya da "Belki" diyenlere başlamadan 1 saat önce bildirim gider.</small>
    </div>
  </details>`}
  <button class="birincil paylas-dugme">Paylaş</button></div>
</form>`
}

const AY_KISA = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', month: 'short' })
const GUN_SAYI = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric' })
const GUN_AD = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'long' })
const takvimYapragi = (ms) => h`<span class="takvim" aria-hidden="true"><small>${AY_KISA.format(ms)}</small><b>${GUN_SAYI.format(ms)}</b></span>`
const KATILIM_DUGME = [['evet', '✓ Geliyorum'], ['belki', '? Belki'], ['hayir', '✕ Gelemem']]
const KATILIM_AD = { evet: 'Geliyor', belki: 'Belki', hayir: 'Gelemiyor' }

/** Etkinlik kartı: takvim yaprağı, katılım düğmeleri, kimin geldiği. Aynı düğme ikinci kez basılınca seçim kalkar. */
export function etkinlikCiz(chat, g, uyeler, now = Date.now()) {
  const e = g.etkinlik
  const sayilar = KATILIM_DUGME.map(([k]) => e.katilim[k].length)
  return h`<form class="etkinlik${e.gecti ? ' gecti' : ''}" method="post" action="/s/etkinlik">${gizliGrup(chat)}<input type="hidden" name="id" value="${g.id}">
  <div class="etkinlik-ust">${takvimYapragi(e.zaman)}
    <div><strong>${e.baslik}</strong>
      <small>${GUN_AD.format(e.zaman)}, ${tarih.format(e.zaman)}${e.yer ? ` · 📍 ${e.yer}` : ''}</small>
      <small class="soluk">${e.gecti ? 'Etkinlik geçti' : kalanYaz(e.zaman - now)}</small></div>
  </div>
  ${e.gecti ? '' : h`<div class="katilim">${KATILIM_DUGME.map(([k, ad], i) => h`<button name="durum" value="${k}" class="${e.benim === k ? 'secili' : ''}">${ad}${sayilar[i] ? h` <b>${sayilar[i]}</b>` : ''}</button>`)}</div>`}
  ${sayilar.some(Boolean) ? h`<details class="anket-kim"><summary>Kim geliyor</summary>
    ${KATILIM_DUGME.filter(([k]) => e.katilim[k].length).map(([k]) => h`<p><strong>${KATILIM_AD[k]}:</strong> ${e.katilim[k].map((j) => adi(bul(uyeler, j))).join(', ')}</p>`)}
  </details>` : ''}
</form>`
}

function kalanYaz(ms) {
  const saat = Math.ceil(ms / 3_600_000)
  return saat >= 24 ? `${Math.ceil(saat / 24)} gün kaldı` : saat > 1 ? `${saat} saat kaldı` : 'son saat'
}

/** Anket: oy verilmeden seçenekler düğmedir; oy verince ya da bitince sonuç ve oy verenler görünür. */
export function anketCiz(chat, g, uyeler, now = Date.now()) {
  const a = g.anket
  const sonucGorunur = a.bitti || a.benim >= 0
  const enCok = Math.max(...a.secenekler.map((x) => x.oy))
  return h`<form class="anket${sonucGorunur ? ' sonuclu' : ''}" method="post" action="/s/anket-oy">${gizliGrup(chat)}<input type="hidden" name="id" value="${g.id}">
  ${a.secenekler.map((x, i) => {
    const yuzde = a.toplam ? Math.round((x.oy / a.toplam) * 100) : 0
    const sinif = `anket-secenek${i === a.benim ? ' benim' : ''}${sonucGorunur && x.oy && x.oy === enCok ? ' onde' : ''}`
    return h`<button name="secim" value="${i}" class="${sinif}"${a.bitti ? ' disabled' : ''}>
      <span class="anket-metin">${x.metin}${i === a.benim ? ' ✓' : ''}</span>
      ${sonucGorunur ? h`<span class="anket-yuzde">%${yuzde}</span><progress max="100" value="${yuzde}"></progress>` : ''}
    </button>`
  })}
  <p class="anket-alt">${a.toplam} oy · ${a.bitti ? 'Sona erdi' : kalanYaz(a.bitis - now)}${!a.bitti && a.benim >= 0 ? ' · oyunu değiştirebilirsin' : ''}</p>
  ${sonucGorunur && a.toplam ? h`<details class="anket-kim"><summary>Kim neye oy verdi</summary>
    ${a.secenekler.filter((x) => x.oy).map((x) => h`<p><strong>${x.metin}:</strong> ${x.verenler.map((j) => adi(bul(uyeler, j))).join(', ')}</p>`)}
  </details>` : ''}
</form>`
}

/** Yorumun altındaki tepki düğmesi ve seçici; gönderi tepkisiyle aynı kural. */
function yorumTepkiFormu(chat, y) {
  return h`<form method="post" action="/s/yorum-tepki" class="yorum-tepki">${gizliGrup(chat)}<input type="hidden" name="id" value="${y.id}">
    <button name="tepki" value="${y.benimTepkim || '❤️'}" class="baglanti${y.benimTepkim ? ' acik' : ''}">${y.benimTepkim ? `${y.benimTepkim} Tepki` : 'Beğen'}</button>
    <details class="tepki-sec"><summary aria-label="Tepki seç">${ikon('gulumse')}</summary>
      <div class="tepki-liste">${TEPKILER.map((t) => h`<button name="tepki" value="${t}"${t === y.benimTepkim ? h` class="secili"` : ''}>${t}</button>`)}</div>
    </details>
  </form>`
}

/** Tek yorum ya da yanıt: balon, tepki özeti, Beğen, Yanıtla, sil. */
function tekYorum(chat, g, y, uyeler, ben, now) {
  const u = bul(uyeler, y.user_jid)
  const silebilir = y.user_jid === ben.jid || g.user_jid === ben.jid
  // Yanıta yanıt verilince yanıtlanan etiketlenir: tek seviyede kime yazıldığı belli olsun.
  const onEk = y.yanit_id && y.user_jid !== ben.jid ? `@${adi(u)} ` : ''
  return h`<div class="yorum" id="c${y.id}">${avatar(chat, u, 'kucuk')}<div class="yorum-govde">
    <div class="balon"><a href="${profilLink(chat, u.jid)}"><strong>${adi(u)}</strong></a> ${metinCiz(chat, y.metin, uyeler)}
      ${y.begeni ? h`<span class="yorum-ozet" title="${y.tepkiler.map((t) => `${t.tepki} ${t.n}`).join('  ')}">${y.tepkiler.slice(0, 3).map((t) => t.tepki).join('')}${y.begeni > 1 ? ` ${y.begeni}` : ''}</span>` : ''}</div>
    <div class="yorum-alt">
      ${yorumTepkiFormu(chat, y)}
      <details class="yanit-ac"><summary class="baglanti">Yanıtla</summary>
        <form class="yanit-yaz" method="post" action="/s/yorum">${gizliGrup(chat)}<input type="hidden" name="id" value="${g.id}"><input type="hidden" name="yanit" value="${y.id}">
          <input name="metin" maxlength="500" value="${onEk}" placeholder="${adi(u)} adlı kişiye yanıt…" autocomplete="off" required><button class="birincil">Gönder</button></form>
      </details>
      <small>${zamanYaz(y.zaman, now)}</small>
      ${silebilir ? h`<form method="post" action="/s/yorum-sil" class="satir-ici">${gizliGrup(chat)}<input type="hidden" name="id" value="${y.id}"><button class="baglanti">Sil</button></form>` : ''}
    </div>
  </div></div>`
}

/** Ana yorum ve yanıtları; betik bu dalı olduğu gibi yeniler. */
export function yorumCiz(chat, g, y, uyeler, ben, now = Date.now()) {
  return h`<li class="yorum-dal" data-ana="${y.id}">${tekYorum(chat, g, y, uyeler, ben, now)}
  ${y.yanitlar.length ? h`<ul class="yanitlar">${y.yanitlar.map((x) => h`<li>${tekYorum(chat, g, x, uyeler, ben, now)}</li>`)}</ul>` : ''}</li>`
}

function yorumlarCiz(chat, g, uyeler, ben, now) {
  return h`<ul class="yorumlar">${g.yorumlar.map((y) => yorumCiz(chat, g, y, uyeler, ben, now))}</ul>
  <form class="yorum-yaz" id="y${g.id}" method="post" action="/s/yorum">
    ${gizliGrup(chat)}<input type="hidden" name="id" value="${g.id}">
    ${avatar(chat, ben, 'kucuk')}<input name="metin" maxlength="500" placeholder="Yorum yaz…" autocomplete="off" required>
  </form>`
}

/** Alıntılanan gönderinin küçük kartı. */
function alintiKarti(chat, a, uyeler, now) {
  if (!a || a.silindi) return h`<div class="alinti silik">Bu gönderi silinmiş.</div>`
  const yazan = a.user_jid ? bul(uyeler, a.user_jid) : BOT
  return h`<a class="alinti" href="${sLink(chat, '/gonderi', { id: a.id })}">
    <span class="alinti-kim">${a.user_jid ? avatar(chat, yazan, 'mini') : ''}<strong>${adi(yazan)}</strong> <small>${zamanYaz(a.zaman, now)}</small></span>
    ${a.metin ? h`<span class="alinti-metin">${a.metin}</span>` : ''}
    ${a.medya ? h`<img src="${medyaLink(chat, a.medya)}" alt="" loading="lazy">` : ''}
  </a>`
}

/** Tepki özeti, tepki seçici, paylaş, alıntıla. Betik bu bölümü olduğu gibi yeniler. */
const KISA = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 })
// "1 B" okunmuyordu: milyonun altı tam yazılır, üstü kısaltılır ("2,5 Mn").
const BAHSIS_YAZ = { format: (n) => (n < 1_000_000 ? sayi.format(n) : KISA.format(n)) }

/** Bahşiş seçici: kendi gönderisine ve bülten gönderisine çıkmaz. Tutarlar kurla ölçeklidir (`ben.tutarlar`). */
function bahsisSecici(chat, g, ben) {
  if (!g.user_jid || !ben?.jid || g.user_jid === ben.jid) return ''
  return h`<details class="bahsis-sec"><summary class="eylem-dugme">${ikon('kahve')}<span class="etk">Bahşiş</span></summary>
    <form method="post" action="/s/bahsis" class="bahsis-form">${gizliGrup(chat)}<input type="hidden" name="id" value="${g.id}">
      <div class="bahsis-hazir">${(ben.tutarlar ?? []).map((t) => h`<button name="miktar" value="${t}">☕ ${BAHSIS_YAZ.format(t)}</button>`)}</div>
      <div class="bahsis-ozel"><input name="ozel" inputmode="numeric" maxlength="20" placeholder="Başka tutar" autocomplete="off"><button class="birincil">Gönder</button></div>
      <small class="soluk">XP cüzdanından gider, .devret kuralları geçerli.</small>
    </form>
  </details>`
}

export function eylemCubugu(chat, g, ben = null) {
  const ozet = g.tepkiler.slice(0, 3).map((t) => t.tepki).join('')
  const ana = g.benimTepkim || '❤️'
  const bahsis = g.bahsis?.adet ? `☕ ${g.bahsis.adet} bahşiş · ${sayi.format(g.bahsis.toplam)} XP` : ''
  const sag = [yorumSayisi(g) ? `${yorumSayisi(g)} yorum` : '', g.paylasim ? `${g.paylasim} paylaşım` : '', bahsis].filter(Boolean).join(' · ')
  return h`<div class="eylem" data-gonderi="${g.id}">
  <div class="sayilar">
    ${g.begeni ? h`<span class="tepki-ozet" title="${g.tepkiler.map((t) => `${t.tepki} ${t.n}`).join('  ')}">${ozet} ${g.begeni}</span>` : h`<span></span>`}
    <span>${sag}</span>
  </div>
  <div class="dugmeler">
    <form method="post" action="/s/begen" class="tepki-form">${gizliGrup(chat)}<input type="hidden" name="id" value="${g.id}">
      <button name="tepki" value="${ana}" class="tepki-ana${g.benimTepkim ? ' acik' : ''}" aria-pressed="${g.benimTepkim ? 'true' : 'false'}">${g.benimTepkim ? h`<span class="emoji">${g.benimTepkim}</span><span class="etk">Tepki</span>` : h`<span class="emoji soluk-emoji">${ikon('kalp')}</span><span class="etk">Beğen</span>`}</button>
      <details class="tepki-sec"><summary aria-label="Tepki seç">${ikon('gulumse')}</summary>
        <div class="tepki-liste">${TEPKILER.map((t) => h`<button name="tepki" value="${t}"${t === g.benimTepkim ? h` class="secili"` : ''}>${t}</button>`)}</div>
      </details>
    </form>
    <a class="eylem-dugme yorum-ac" href="${sLink(chat, '/gonderi', { id: g.id })}#y${g.id}">${ikon('yorum')}<span class="etk">Yorum</span></a>
    <form method="post" action="/s/paylas" class="paylas-form">${gizliGrup(chat)}<input type="hidden" name="alinti" value="${g.id}">
      <button class="eylem-dugme${g.paylastim ? ' acik' : ''}" aria-pressed="${g.paylastim ? 'true' : 'false'}">${ikon('paylas')}<span class="etk">${g.paylastim ? 'Paylaştın' : 'Paylaş'}</span></button></form>
    <a class="eylem-dugme" href="${sLink(chat, '/alinti', { id: g.id })}">${ikon('alinti')}<span class="etk">Alıntıla</span></a>
    ${bahsisSecici(chat, g, ben)}
  </div>
</div>`
}

/** Gönderinin ⋯ menüsü: kaydet, sabitle, düzenle, sil. Betik gerekmez (`<details>`). */
function gonderiMenusu(chat, g, ben, now, silebilir) {
  const kendi = g.user_jid && g.user_jid === ben.jid
  const form = (yol, yazi) => h`<form method="post" action="${yol}">${gizliGrup(chat)}<input type="hidden" name="id" value="${g.id}"><button>${yazi}</button></form>`
  return h`<details class="gonderi-menu"><summary aria-label="Gönderi menüsü">⋯</summary><div class="menu-liste">
    ${form('/s/kaydet', h`${ikon('kayit')}${g.kaydettim ? 'Kaydı kaldır' : 'Kaydet'}`)}
    ${kendi ? form('/s/sabitle', h`${ikon('pin')}${ben.sabit === g.id ? 'Sabitlemeyi kaldır' : 'Profilde sabitle'}`) : ''}
    ${duzenlenebilir(g, ben.jid, now) ? h`<a href="${sLink(chat, '/duzenle', { id: g.id })}">${ikon('kalem')}Düzenle</a>` : ''}
    ${silebilir ? h`<form method="post" action="/s/sil" class="sil">${gizliGrup(chat)}<input type="hidden" name="id" value="${g.id}"><button class="tehlike">${ikon('sil')}Sil</button></form>` : ''}
  </div></details>`
}

/** Kumarhanede paylaşılan büyük kazanç (Faz 72); rakamları sunucu yazdı, sayfadan gelmedi. */
function vurgunKarti(v) {
  return h`<div class="vurgun-kart">
    <span class="vk-oyun">🎰 ${OYUN_ADI[v.oyun] ?? v.oyun}</span>
    <strong class="vk-kat">${String(v.carpan).replace('.', ',')}x</strong>
    <span class="vk-kazanc">+${sayi.format(v.kazanc)} XP</span>
    <small>${sayi.format(v.bahis)} XP bahisle</small>
  </div>`
}

function govde(chat, g, uyeler, ben, now, { ustNot = '', silinebilir = true } = {}) {
  const bot = !g.user_jid
  const yazan = bot ? BOT : bul(uyeler, g.user_jid)
  const hedef = g.hedef_jid ? bul(uyeler, g.hedef_jid) : null
  const silebilir = silinebilir && !bot && (g.user_jid === ben.jid || g.hedef_jid === ben.jid)
  return h`${ustNot}
  ${g.haftanin ? h`<p class="hafta-serit">🏆 Haftanın gönderisi${g.haftanin.xp ? ` · +${sayi.format(g.haftanin.xp)} XP ödül` : ''}</p>` : ''}
  <header>
    ${bot ? botAvatar : h`<a href="${profilLink(chat, yazan.jid)}">${avatar(chat, yazan)}</a>`}
    <div class="kim">
      ${bot ? h`<strong>${BOT.ad}</strong>` : h`<a href="${profilLink(chat, yazan.jid)}"><strong>${adi(yazan)}</strong></a>`}
      ${hedef ? h` <span class="ok">▸</span> <a href="${profilLink(chat, hedef.jid)}"><strong>${adi(hedef)}</strong></a>` : ''}
      <a class="zaman" href="${sLink(chat, '/gonderi', { id: g.id })}">${zamanYaz(g.zaman, now)}</a>${g.duzenlendi ? h`<span class="duzenlendi" title="${tarih.format(g.duzenlendi)}"> · düzenlendi</span>` : ''}
      ${g.kaynak ? h`<span class="kaynak">· WhatsApp'tan${g.kaynak !== g.user_jid ? h` · yazan <a href="${profilLink(chat, g.kaynak)}">${adi(bul(uyeler, g.kaynak))}</a>` : ''}</span>` : ''}
    </div>
    ${gonderiMenusu(chat, g, ben, now, silebilir)}
  </header>
  ${g.metin ? h`<p class="metin">${metinCiz(chat, g.metin, uyeler)}</p>` : ''}
  ${g.medya ? h`<a class="gorsel" href="${medyaLink(chat, g.medya)}"><img src="${medyaLink(chat, g.medya)}" alt="" loading="lazy"></a>` : ''}
  ${g.vurgunVeri ? vurgunKarti(g.vurgunVeri) : ''}
  ${g.anket ? anketCiz(chat, g, uyeler, now) : ''}
  ${g.etkinlik ? etkinlikCiz(chat, g, uyeler, now) : ''}
  ${g.alinti_id ? alintiKarti(chat, g.alinti, uyeler, now) : ''}
  ${eylemCubugu(chat, g, ben)}
  ${yorumlarCiz(chat, g, uyeler, ben, now)}`
}

export function gonderiCiz(chat, g, uyeler, ben, now = Date.now()) {
  const duzPaylasim = g.alinti_id && !g.metin && !g.medya
  if (duzPaylasim && g.alinti && !g.alinti.silindi) {
    const paylasan = bul(uyeler, g.user_jid)
    const not = h`<p class="ust-not">↻ <a href="${profilLink(chat, paylasan.jid)}">${g.user_jid === ben.jid ? 'Sen' : adi(paylasan)}</a> paylaştı · ${zamanYaz(g.zaman, now)}</p>`
    return h`<article class="kart gonderi paylasim" id="g${g.id}" data-id="${g.id}">${govde(chat, g.alinti, uyeler, ben, now, { ustNot: not, silinebilir: false })}</article>`
  }
  return h`<article class="kart gonderi${g.user_jid ? '' : ' bot-gonderi'}" id="g${g.id}" data-id="${g.id}">${govde(chat, g, uyeler, ben, now)}</article>`
}

function hikayeSeridi(chat, ben, hk, uyeler) {
  const kendi = h`<form class="hikaye-ekle" method="post" action="/s/hikaye-yaz" enctype="multipart/form-data">
    ${gizliGrup(chat)}
    <label class="hikaye">${avatar(chat, ben)}<span class="arti">${ikon('arti')}</span><input type="file" name="foto" accept="image/*" class="hemen-gonder"><small>Hikâye ekle</small></label>
    <button class="gizli-gonder">Yükle</button>
  </form>`
  const benimKi = hk.benim.length
    ? h`<a class="hikaye benim" href="${sLink(chat, '/hikaye', { id: hk.benim[0].id })}">${avatar(chat, ben)}<small>Seninki · ${hk.benim.length}</small></a>`
    : ''
  return h`<section class="hikayeler" aria-label="Hikâyeler">${kendi}${benimKi}${hk.kisiler.map((k) => {
    const u = bul(uyeler, k.jid)
    return h`<a class="hikaye yeni" href="${sLink(chat, '/hikaye', { id: k.liste[0].id })}">${avatar(chat, u)}<small>${adi(u)}</small></a>`
  })}</section>`
}

const serit = (bildirim) => (bildirim ? h`<p class="bildirim-serit${bildirim.hata ? ' hata' : ''}" role="status">${bildirim.metin}</p>` : '')

/** Akış listesi ve sonraki sayfanın bağlantısı; betik bağlantıyı kaydırınca kendisi yükler. */
const okunduCizgisi = h`<div class="okundu-cizgi" role="separator"><span>Buraya kadar okudun</span></div>`

/**
 * Akış listesi ve sonraki sayfanın bağlantısı; betik bağlantıyı kaydırınca kendisi yükler.
 * `okunan`: önceki ziyarette görülen en yeni gönderi; çizgi onun üstüne çizilir, en üstteyse çizilmez.
 */
export function gonderiListesi({ chat, ben, gonderiler, uyeler, now = Date.now(), yol = '', ek = {}, okunan = 0, bosMetin = 'Henüz kimse bir şey paylaşmadı. İlk sen yaz.' }) {
  const son = gonderiler.at(-1)
  const cizgi = okunan ? gonderiler.findIndex((g) => g.id <= okunan) : -1
  return h`<div class="akis" data-ilk="${gonderiler[0]?.id ?? 0}">${gonderiler.length ? gonderiler.map((g, i) => h`${i > 0 && i === cizgi ? okunduCizgisi : ''}${gonderiCiz(chat, g, uyeler, ben, now)}`) : h`<p class="kart bos">${bosMetin}</p>`}</div>
${son && gonderiler.length >= 20 ? h`<a class="daha" href="${sLink(chat, yol, { ...ek, once: son.id })}">Daha eski gönderiler</a>` : ''}`
}

export function akisSayfasi({ chat, ben, gonderiler, uyeler, hikayeler: hk, bildirim, okunan = 0, now = Date.now() }) {
  return h`${serit(bildirim)}
${hikayeSeridi(chat, ben, hk, uyeler)}
${paylasKutusu(chat, ben)}
<a class="yeni-gonderi" href="${sLink(chat)}" hidden>Yeni gönderiler var ↑</a>
${gonderiListesi({ chat, ben, gonderiler, uyeler, now, okunan })}`
}

export function kaydedilenSayfasi({ chat, ben, gonderiler, uyeler, bildirim = null, now = Date.now() }) {
  return h`${serit(bildirim)}<section class="kart etiket-bas"><h1>${ikon('kayit')} Kaydedilenler</h1><p class="soluk">Yalnızca sen görürsün. Gönderinin ⋯ menüsünden kaydedilir.</p></section>
${gonderiler.length ? gonderiler.map((g) => gonderiCiz(chat, g, uyeler, ben, now)) : h`<p class="kart bos">Henüz bir şey kaydetmedin.</p>`}`
}

export function duzenleSayfasi({ chat, gonderi, bildirim = null, now = Date.now() }) {
  if (!gonderi) return h`<p class="kart bos">Bu gönderi silinmiş.</p>`
  const kalan = Math.max(0, Math.ceil((gonderi.zaman + DUZENLEME_MS - now) / 60_000))
  return h`${serit(bildirim)}<form class="kart paylas duzenle" method="post" action="/s/duzenle">
  ${gizliGrup(chat)}<input type="hidden" name="id" value="${gonderi.id}">
  <h2>Gönderiyi düzenle <small class="soluk">${kalan} dk kaldı</small></h2>
  <textarea name="metin" rows="5" maxlength="${METIN_AZAMI}">${gonderi.metin}</textarea>
  <p class="soluk">Fotoğraf, anket ve etkinlik değişmez. Gönderide "düzenlendi" yazar.</p>
  <div class="paylas-alt"><a href="${sLink(chat, '/gonderi', { id: gonderi.id })}">Vazgeç</a><button class="birincil">Kaydet</button></div>
</form>`
}

export function etiketSayfasi({ chat, ben, etiket, gonderiler, uyeler, now = Date.now() }) {
  return h`<section class="kart etiket-bas"><h1>#${etiket}</h1><p class="soluk">Bu etiketi kullanan gönderiler</p></section>
${gonderiListesi({ chat, ben, gonderiler, uyeler, now, yol: '/etiket', ek: { ad: etiket }, bosMetin: 'Bu etiketle henüz gönderi yok.' })}`
}

export function alintiSayfasi({ chat, ben, gonderi, uyeler, now = Date.now() }) {
  if (!gonderi) return h`<p class="kart bos">Bu gönderi silinmiş.</p>`
  return h`<form class="kart paylas" method="post" action="/s/paylas" enctype="multipart/form-data">
  ${gizliGrup(chat)}<input type="hidden" name="alinti" value="${gonderi.id}">
  <h2>Alıntıla</h2>
  <div class="paylas-ust">${avatar(chat, ben)}<textarea name="metin" rows="3" maxlength="2000" placeholder="Ne düşünüyorsun?" required></textarea></div>
  ${alintiKarti(chat, gonderi, uyeler, now)}
  <div class="paylas-alt"><a href="${sLink(chat)}">Vazgeç</a><button class="birincil">Paylaş</button></div>
</form>`
}

export function tekGonderiSayfasi({ chat, ben, gonderi, uyeler, now = Date.now() }) {
  return gonderi ? gonderiCiz(chat, gonderi, uyeler, ben, now) : h`<p class="kart bos">Bu gönderi silinmiş.</p>`
}

// --- Profil ----------------------------------------------------------------

const ist = (etiket, deger) => h`<div class="ist"><strong>${deger}</strong><small>${etiket}</small></div>`

const makamAdi = (kod) => MAKAMLAR.find((m) => m.kod === kod)?.ad ?? kod

/** Unvan, makam, meslek, eş, çete, pet: WhatsApp'taki hayatın profildeki vitrini. Boşsa çizilmez. */
function vitrinKarti(chat, v, uyeler) {
  if (!v) return ''
  const satirlar = [
    v.unvan && ['🏷️', 'Unvan', v.unvan],
    v.yildiz && ['⭐', 'Devir zengini', `${v.yildiz}. devirde ilk üçte`],
    v.sampiyon && ['🏆', 'Sezon şampiyonu', `${v.sampiyon} kez`],
    // MAKAMLAR'daki ad emojiyle başlar ("🏛️ Başkan"): emoji simge sütununa geçer.
    ...v.makamlar.map((m) => {
      const [simge, ...ad] = makamAdi(m).split(' ')
      return [simge, 'Makam', ad.join(' ')]
    }),
    v.meslek && ['💼', 'Meslek', v.meslek],
    v.es && ['💍', 'Evli', h`<a href="${profilLink(chat, v.es)}">${adi(bul(uyeler, v.es))}</a>`],
    v.cete && ['🕶️', 'Çete', v.cete],
    v.pet && [v.pet.emoji, v.pet.tur, v.pet.ad],
    v.hapis && ['⛓️', 'Durum', 'Hapiste'],
  ].filter(Boolean)
  const nftler = (v.nftler ?? []).map(nftBul).filter(Boolean)
  if (!satirlar.length && !nftler.length) return ''
  return h`<section class="kart vitrin"><h2>Vitrin <small>WhatsApp'taki hayatı</small></h2>
  <ul>${satirlar.map(([simge, ad, deger]) => h`<li><span class="vt-simge" aria-hidden="true">${simge}</span><span><small>${ad}</small><strong>${deger}</strong></span></li>`)}</ul>
  ${nftler.length ? h`<h3>NFT koleksiyonu <small>${nftler.length} mahluk</small></h3><ul class="nft-vitrin">${nftler.map((n) => h`<li class="n-${n.sinif}"><img src="/nft/${n.no}.png" alt="" width="320" height="320" loading="lazy"><strong>${n.ad}</strong><small>#${n.no} · ${NADIRLIK[n.sinif].ad.slice(2).trim()}</small></li>`)}</ul>` : ''}</section>`
}

export function profilSayfasi({ chat, ben, kisi, profil, stats, seviye, rozetler, wrapped: w, gonderiler, uyeler, bildirim, vitrin = null, sabitGonderi = null, kayitSayisi = 0, now = Date.now() }) {
  const kendim = kisi.jid === ben.jid
  const kim = { ...kisi, avatar: profil.avatar }
  const liste = sabitGonderi ? gonderiler.filter((g) => g.id !== sabitGonderi.id) : gonderiler
  return h`${serit(bildirim)}
<section class="kart profil-bas">
  <div class="kapak r${fnv1a(kisi.jid) % RENK}">${profil.kapak ? h`<img src="${medyaLink(chat, profil.kapak)}" alt="">` : ''}</div>
  <div class="profil-kim">
    ${avatarDurum(chat, kim, 'buyuk', now)}
    <div><h1>${adi(kisi)}</h1>${cevrimiciMi(kisi, now) ? h`<p class="cevrimici-yazi">● Çevrimiçi</p>` : ''}${profil.durum ? h`<p class="durum-satir">${profil.durum}</p>` : ''}${profil.bio ? h`<p class="bio">${profil.bio}</p>` : kendim ? h`<p class="bio soluk">Henüz bir şey yazmadın. <a href="${sLink(chat, '/ayar')}">Biyografi ekle</a></p>` : ''}</div>
  </div>
  <div class="profil-eylem">
    ${kendim
      ? h`<a class="dugme" href="${sLink(chat, '/ayar')}">Profili düzenle</a><a class="dugme" href="${sLink(chat, '/kaydedilen')}">${ikon('kayit')} Kaydedilenler${kayitSayisi ? ` · ${kayitSayisi}` : ''}</a>`
      : h`${kisi.panelde ? h`<a class="dugme birincil" href="${sLink(chat, '/mesaj', { ile: kisi.jid })}">Mesaj gönder</a>` : ''}
        <form method="post" action="/s/durt">${gizliGrup(chat)}<input type="hidden" name="id" value="${kisi.jid}"><button class="dugme">Dürt</button></form>`}
  </div>
</section>
<section class="kart istatistik">
  ${ist('Seviye', seviye)}${ist('XP', sayi.format(stats.xp))}${ist('Mesaj', sayi.format(stats.messages))}${ist('Sticker', sayi.format(stats.stickers))}${ist('Ses', sayi.format(stats.voices))}
</section>
${w ? h`<section class="kart wrapped">
  <h2>Wrapped <small>ilk kayıttan bugüne</small></h2>
  <p class="kisilik"><strong>${w.kisilik.ad}</strong> <span>${w.kisilik.aciklama}</span></p>
  <dl>
    <div><dt>Gruptaki sırası</dt><dd>${w.sira}. / ${w.uyeSayisi}</dd></div>
    <div><dt>Mesaj payı</dt><dd>${yuzde.format(w.grupPayi)}</dd></div>
    <div><dt>Aktif gün</dt><dd>${sayi.format(w.aktifGun)}</dd></div>
    <div><dt>En uzun seri</dt><dd>${w.seri} gün</dd></div>
    ${w.saat !== null ? h`<div><dt>En aktif saat</dt><dd>${String(w.saat).padStart(2, '0')}:00</dd></div>` : ''}
    ${w.kumar.games ? h`<div><dt>Kumar eli</dt><dd>${sayi.format(w.kumar.games)}</dd></div>
      <div><dt>Kumar neti</dt><dd class="${w.kumar.net >= 0 ? 'artis' : 'dusus'}">${sayi.format(w.kumar.net)}</dd></div>` : ''}
    ${w.kumar.favori ? h`<div><dt>Favori oyun</dt><dd>${OYUN_ADI[w.kumar.favori.oyun] ?? w.kumar.favori.oyun}</dd></div>` : ''}
    ${w.sampiyon ? h`<div><dt>Sezon şampiyonluğu</dt><dd>${w.sampiyon}</dd></div>` : ''}
  </dl>
</section>` : ''}
${vitrinKarti(chat, vitrin, uyeler)}
${rozetler.length ? h`<section class="kart rozetler"><h2>Rozetler <small>${rozetler.length}</small></h2><ul>${rozetler.map((r) => h`<li title="${r.aciklama}">${r.ad}</li>`)}</ul></section>` : ''}
${paylasKutusu(chat, ben, { hedef: kendim ? null : kisi, yer: kisi.jid })}
${sabitGonderi ? h`<p class="sabit-not">${ikon('pin')} Sabitlenmiş gönderi</p>${gonderiCiz(chat, sabitGonderi, uyeler, ben, now)}` : ''}
${liste.length ? liste.map((g) => gonderiCiz(chat, g, uyeler, ben, now)) : sabitGonderi ? '' : h`<p class="kart bos">Duvarda henüz bir şey yok.</p>`}`
}

export function ayarSayfasi({ chat, profil, bildirim, tema = '', now = Date.now() }) {
  const kalanSaat = profil.durum ? Math.max(1, Math.ceil((profil.durum_bitis - now) / 3_600_000)) : 0
  return h`${serit(bildirim)}
<form class="kart ayar" method="post" action="/s/profil-yaz" enctype="multipart/form-data">
  <h2>Profili düzenle</h2>
  ${gizliGrup(chat)}
  <label>Şu an ne yapıyorsun? <small>${kalanSaat ? `${kalanSaat} saat sonra silinir` : '24 saat görünür, sonra kendiliğinden silinir'}</small>
    <input name="durum" maxlength="${DURUM_AZAMI}" value="${profil.durum}" placeholder="maçta ⚽, sınavda 📚…" autocomplete="off"></label>
  <label>Biyografi <small>en çok 160 karakter</small>
    <textarea name="bio" maxlength="160" rows="3">${profil.bio}</textarea></label>
  <label>Fotoğraf nereye?
    <select name="tur"><option value="avatar">Profil fotoğrafı</option><option value="kapak">Kapak fotoğrafı</option></select></label>
  ${fotoAlani('foto', 'Fotoğraf seç')}
  <div class="onizleme" hidden></div>
  <button class="birincil">Kaydet</button>
  <p class="soluk">Fotoğraflar sunucuda küçültülür, konum ve cihaz bilgisi silinir.</p>
</form>
<form class="kart ayar" method="post" action="/s/tema">
  <h2>Görünüm</h2>
  <label>Tema <select name="tema">${[['', 'Cihazın ayarı'], ['acik', 'Açık'], ['koyu', 'Koyu']].map(([d, ad]) => h`<option value="${d}"${d === tema ? h` selected` : ''}>${ad}</option>`)}</select></label>
  <button class="birincil">Uygula</button>
</form>`
}

export function arkadasSayfasi({ chat, uyeler, now = Date.now() }) {
  return h`<section class="kart liste-kart">
  <h2>Arkadaşlar <small>${uyeler.length} kişi · gruptaki herkes</small></h2>
  <div class="arkadaslar">${uyeler.map((u) => h`<a class="arkadas" href="${profilLink(chat, u.jid)}">${avatarDurum(chat, u, 'orta', now)}<strong>${adi(u)}</strong><small>${cevrimiciMi(u, now) ? 'Çevrimiçi' : `${u.panelde ? 'Burada' : 'Henüz katılmadı'} · ${zamanYaz(u.last_seen, now)}`}</small>${u.durum ? h`<small class="durum-metin">${u.durum}</small>` : ''}</a>`)}</div>
</section>`
}

// --- Bildirim ----------------------------------------------------------------

/**
 * Bildirim izni ve uygulama kurulumu şeridi. Betik hangisinin görüneceğine karar verir:
 * tarayıcı izin penceresini ancak bir dokunuşla açtığı için düğmelidir. iPhone'da push
 * yalnızca ana ekrana eklenmiş uygulamada çalışır, orada izin yerine kurulum rehberi çıkar.
 */
const izinSeridi = h`<section class="kart izin-serit" hidden>
  <div class="izin-push" hidden>
    <span class="izin-ikon" aria-hidden="true">🔔</span>
    <div class="izin-metin"><strong>Bildirimlere izin ver</strong><small>Beğeni, yorum, yanıt ve mesaj gelince haberin olsun.</small></div>
    <div class="izin-dugmeler"><button type="button" class="birincil izin-ver">İzin ver</button><button type="button" class="baglanti izin-sonra">Sonra</button></div>
  </div>
  <div class="izin-yukle" hidden>
    <span class="izin-ikon" aria-hidden="true">📲</span>
    <div class="izin-metin"><strong>Uygulama olarak yükle</strong><small>Ana ekrandan tek dokunuşla aç, bildirimler uygulama gibi gelsin.</small></div>
    <div class="izin-dugmeler"><button type="button" class="birincil izin-kur">Yükle</button><button type="button" class="baglanti izin-sonra">Sonra</button></div>
  </div>
  <div class="izin-ios" hidden>
    <div class="izin-bas"><span class="izin-ikon" aria-hidden="true">📲</span>
      <div class="izin-metin"><strong>iPhone'da bildirim için uygulamayı ana ekrana ekle</strong><small>Apple, bildirimi yalnızca ana ekrana eklenmiş uygulamaya veriyor.</small></div></div>
    <ol class="izin-adim">
      <li><span>1</span><div>Bu sayfayı <b>Safari</b>'de aç. Chrome ya da başka tarayıcıdaysan adresi kopyalayıp Safari'ye yapıştır.</div></li>
      <li><span>2</span><div>Alttaki <b>Paylaş</b> düğmesine dokun <i class="ios-paylas" aria-label="Paylaş simgesi"></i> (iPad'de sağ üstte).</div></li>
      <li><span>3</span><div>Açılan listeyi aşağı kaydır, <b>Ana Ekrana Ekle</b>'yi seç. Görmüyorsan en altta <b>Eylemleri Düzenle</b>'den ekle.</div></li>
      <li><span>4</span><div>Sağ üstte <b>Ekle</b>'ye dokun.</div></li>
      <li><span>5</span><div>Ana ekrandaki <b>Grup</b> simgesinden aç. Burada <b>İzin ver</b> düğmesi çıkacak.</div></li>
    </ol>
    <small class="soluk">iOS 16.4 ve sonrası gerekir (Ayarlar › Genel › Hakkında).</small>
    <div class="izin-dugmeler"><button type="button" class="baglanti izin-sonra">Sonra</button></div>
  </div>
</section>`

const BILDIRIM_METNI = {
  begeni: 'gönderini beğendi.',
  yorum: 'gönderine yorum yaptı.',
  etiket: 'seni bir gönderide etiketledi.',
  duvar: 'duvarına yazdı.',
  durt: 'seni dürttü.',
  paylasim: 'gönderini paylaştı.',
  alinti: 'gönderini alıntıladı.',
  yanit: 'yorumuna yanıt verdi.',
  anket_oy: 'anketine oy verdi.',
  yorum_tepki: 'yorumuna tepki verdi.',
  etkinlik_katil: 'etkinliğine geliyor.',
  etkinlik_yakin: 'tarafından kurulan etkinlik 1 saat içinde başlıyor. 📅',
  hafta: 'Gönderin haftanın gönderisi seçildi. 🏆',
  bahsis: 'gönderine bahşiş bıraktı. ☕',
}

export function bildirimSayfasi({ chat, liste, uyeler, now = Date.now() }) {
  return h`<section class="kart push-kutu" hidden>
  <div><strong>Telefon bildirimleri</strong><small class="push-durum">Beğeni, yorum ve mesaj gelince telefonun titresin.</small></div>
  <button type="button" class="birincil push-ac">Aç</button>
  <button type="button" class="dugme push-kapat" hidden>Kapat</button>
</section>
<section class="kart liste-kart">
  <h2>Bildirimler</h2>
  ${liste.length ? liste.map((b) => {
    const bot = !b.kimden
    const u = bot ? BOT : bul(uyeler, b.kimden)
    const adres = b.gonderi_id ? sLink(chat, '/gonderi', { id: b.gonderi_id }) : profilLink(chat, u.jid)
    return h`<a class="bildirim${b.okundu ? '' : ' yeni'}" href="${adres}">${bot ? botAvatar : avatar(chat, u)}<span><strong>${bot ? BOT.ad : adi(u)}</strong> ${BILDIRIM_METNI[b.tur] ?? ''}<small>${zamanYaz(b.zaman, now)}</small></span></a>`
  }) : h`<p class="bos">Henüz bildirim yok.</p>`}
</section>`
}

// --- DM ------------------------------------------------------------------

const onizlemeYaz = (m) => (m.medya && !m.metin ? '▣ Fotoğraf' : m.metin)
const grupAvatar = h`<span class="av grup-av" aria-hidden="true">${ikon('kisiler')}</span>`

/** Üye seçme kutuları; ad `uye0…uyeN`, multipart aynı adlı alanların yalnızca ilkini tutar. */
const uyeSecici = (chat, liste) => h`<div class="uye-sec">${liste.map((u, i) => h`<label>${avatar(chat, u, 'kucuk')}<input type="checkbox" name="uye${i}" value="${u.jid}"><span>${adi(u)}</span></label>`)}</div>`

export function mesajListesi({ chat, konusmalar, sohbetler = [], uyeler, ben, bildirim = null, now = Date.now() }) {
  const yazilabilir = uyeler.filter((u) => u.panelde && u.jid !== ben.jid)
  // DM'ler ve grup sohbetleri tek listede, son mesaja göre.
  const satirlar = [
    ...konusmalar.map((k) => ({ tur: 'dm', zaman: k.son.zaman, k })),
    ...sohbetler.map((s) => ({ tur: 'sohbet', zaman: s.son?.zaman ?? s.zaman, s })),
  ].sort((a, b) => b.zaman - a.zaman)
  return h`${serit(bildirim)}<section class="kart liste-kart">
  <h2>Mesajlar</h2>
  ${satirlar.length ? satirlar.map(({ tur, k, s }) => {
    if (tur === 'sohbet') {
      const yazan = s.son?.gonderen ? (s.son.gonderen === ben.jid ? 'Sen: ' : `${adi(bul(uyeler, s.son.gonderen)).split(' ')[0]}: `) : ''
      return h`<a class="konusma${s.okunmamis ? ' yeni' : ''}" href="${sLink(chat, '/sohbet', { id: s.id })}">${grupAvatar}
      <span><strong>${s.ad} <small class="soluk">· ${s.kisi} kişi</small></strong><small>${yazan}${s.son ? onizlemeYaz(s.son) : ''}</small></span>
      <time>${zamanYaz(s.son?.zaman ?? s.zaman, now)}</time>${rozetSayi(s.okunmamis)}</a>`
    }
    const u = bul(uyeler, k.ile)
    const onizleme = k.son.hikaye_id ? `↩ Hikâyeye: ${k.son.metin}` : onizlemeYaz(k.son)
    return h`<a class="konusma${k.okunmamis ? ' yeni' : ''}" href="${sLink(chat, '/mesaj', { ile: k.ile })}">${avatar(chat, u)}
      <span><strong>${adi(u)}</strong><small>${k.son.gonderen === ben.jid ? 'Sen: ' : ''}${onizleme}</small></span>
      <time>${zamanYaz(k.son.zaman, now)}</time>${rozetSayi(k.okunmamis)}</a>`
  }) : h`<p class="bos">Henüz mesajın yok.</p>`}
</section>
<section class="kart liste-kart">
  <h2>Yeni mesaj</h2>
  ${yazilabilir.length ? h`<div class="arkadaslar kucuk">${yazilabilir.map((u) => h`<a class="arkadas" href="${sLink(chat, '/mesaj', { ile: u.jid })}">${avatar(chat, u)}<strong>${adi(u)}</strong></a>`)}</div>`
    : h`<p class="bos">Panelde senden başka kimse yok. Arkadaşların bota özelden <code>.panel kayıt</code> yazınca burada görünür.</p>`}
</section>
${yazilabilir.length >= 2 ? h`<details class="kart liste-kart sohbet-kur">
  <summary>👥 Grup sohbeti kur</summary>
  <form method="post" action="/s/sohbet-kur">${gizliGrup(chat)}
    <input name="ad" maxlength="${SOHBET_AD_AZAMI}" placeholder="Sohbetin adı (isteğe bağlı)" autocomplete="off">
    ${uyeSecici(chat, yazilabilir)}
    <button class="birincil">Sohbeti kur</button>
  </form>
</details>` : ''}`
}

const tepkiMi = (m) => m.hikaye_id && TEPKILER.includes(m.metin)
const balonIci = (chat, m) => h`${m.hikaye_id ? h`<small class="hikaye-not">↩ Hikâyeye ${tepkiMi(m) ? 'tepki' : 'yanıt'}</small>` : ''}
    ${m.medya ? h`<a href="${medyaLink(chat, m.medya)}"><img src="${medyaLink(chat, m.medya)}" alt="" loading="lazy"></a>` : ''}
    ${m.metin ? h`<p${tepkiMi(m) ? h` class="buyuk-emoji"` : ''}>${m.metin}</p>` : ''}<time>${saatBicimi.format(m.zaman)}</time>`

export function dmBalonlari(chat, mesajlar, ben) {
  return mesajlar.map((m) => h`<div class="dm ${m.gonderen === ben.jid ? 'benim' : 'onun'}" data-id="${m.id}">${balonIci(chat, m)}</div>`)
}

/** Grup sohbeti balonları: başkasının mesajında ad yazar, sistem notu ortada durur. */
export function sohbetBalonlari(chat, mesajlar, ben, uyeler) {
  return mesajlar.map((m) => {
    if (!m.gonderen) return h`<p class="sistem-not" data-id="${m.id}">${m.metin}</p>`
    const benim = m.gonderen === ben.jid
    return h`<div class="dm ${benim ? 'benim' : 'onun'}" data-id="${m.id}">${benim ? '' : h`<a class="yazan" href="${profilLink(chat, m.gonderen)}">${adi(bul(uyeler, m.gonderen))}</a>`}${balonIci(chat, m)}</div>`
  })
}

/**
 * Grup sohbetinde benim son mesajımı okuyanlar ("Görüldü: Ali, Ayşe"). Son mesajın benim olup
 * olmadığına bakılmaz: betik metni yalnızca son balon benimken gösterir.
 */
export function gorenlerMetni(sohbet, ben, uyeler) {
  const benimSon = sohbet?.benimSon ?? 0
  if (!benimSon) return ''
  const gorenler = sohbet.uyeler.filter((u) => u.user_jid !== ben.jid && u.son_okunan >= benimSon)
  if (!gorenler.length) return 'Gönderildi'
  return gorenler.length === sohbet.uyeler.length - 1 ? 'Herkes gördü' : `Görüldü: ${gorenler.map((u) => adi(bul(uyeler, u.user_jid)).split(' ')[0]).join(', ')}`
}

const yaziyorSatiri = h`<p class="yaziyor" aria-live="polite"></p>`

export function sohbetSayfasi({ chat, ben, karsi, mesajlar, goruldu = 0 }) {
  const son = mesajlar.at(-1)
  const durum = son?.gonderen === ben.jid ? (goruldu >= son.id ? 'Görüldü' : 'Gönderildi') : ''
  return h`<section class="kart sohbet">
  <header><a class="geri" href="${sLink(chat, '/mesaj')}" aria-label="Mesajlara dön">${ikon('geri')}</a>${avatar(chat, karsi)}<a href="${profilLink(chat, karsi.jid)}"><strong>${adi(karsi)}</strong></a></header>
  <div class="dm-akis" data-ile="${karsi.jid}" data-son="${son?.id ?? 0}">${mesajlar.length ? dmBalonlari(chat, mesajlar, ben) : h`<p class="bos">İlk mesajı sen yaz.</p>`}</div>
  <p class="dm-durum">${durum}</p>${yaziyorSatiri}
  ${karsi.panelde ? h`<form class="dm-yaz" method="post" action="/s/mesaj-yaz" enctype="multipart/form-data">
    ${gizliGrup(chat)}<input type="hidden" name="ile" value="${karsi.jid}">
    ${fotoAlani('foto', '')}
    <input name="metin" maxlength="1000" placeholder="Mesaj yaz…" autocomplete="off">
    <button class="birincil gonder-dugme">${ikon('gonder')}<span>Gönder</span></button>
  </form>` : h`<p class="bos">${adi(karsi)} henüz panele katılmadı, mesajı okuyamaz.</p>`}
</section>`
}

export function grupSohbetSayfasi({ chat, ben, sohbet, mesajlar, uyeler, bildirim = null }) {
  const uyeJidler = sohbet.uyeler.map((u) => u.user_jid)
  const eklenebilir = uyeler.filter((u) => u.panelde && !uyeJidler.includes(u.jid))
  const son = mesajlar.at(-1)
  return h`${serit(bildirim)}<section class="kart sohbet">
  <header><a class="geri" href="${sLink(chat, '/mesaj')}" aria-label="Mesajlara dön">${ikon('geri')}</a>${grupAvatar}
    <span class="sohbet-baslik"><strong>${sohbet.ad}</strong><small>${uyeJidler.map((j) => (j === ben.jid ? 'Sen' : adi(bul(uyeler, j)).split(' ')[0])).join(', ')}</small></span></header>
  <div class="dm-akis grup-akis" data-sohbet="${sohbet.id}" data-son="${son?.id ?? 0}">${sohbetBalonlari(chat, mesajlar, ben, uyeler)}</div>
  <p class="dm-durum">${son?.gonderen === ben.jid ? gorenlerMetni(sohbet, ben, uyeler) : ''}</p>${yaziyorSatiri}
  <form class="dm-yaz" method="post" action="/s/sohbet-yaz" enctype="multipart/form-data">
    ${gizliGrup(chat)}<input type="hidden" name="id" value="${sohbet.id}">
    ${fotoAlani('foto', '')}
    <input name="metin" maxlength="1000" placeholder="Gruba yaz…" autocomplete="off">
    <button class="birincil gonder-dugme">${ikon('gonder')}<span>Gönder</span></button>
  </form>
</section>
<details class="kart liste-kart sohbet-ayar">
  <summary>⚙ Sohbet ayarları</summary>
  ${eklenebilir.length ? h`<form method="post" action="/s/sohbet-ekle">${gizliGrup(chat)}<input type="hidden" name="id" value="${sohbet.id}">
    <h3>Kişi ekle</h3>${uyeSecici(chat, eklenebilir)}<button class="dugme">Ekle</button></form>` : ''}
  <form method="post" action="/s/sohbet-cik">${gizliGrup(chat)}<input type="hidden" name="id" value="${sohbet.id}"><button class="dugme tehlike">Sohbetten ayrıl</button></form>
</details>`
}

// --- Arama -----------------------------------------------------------------

export function araSayfasi({ chat, ben, sorgu, sonuc, uyeler, now = Date.now() }) {
  const temiz = sorgu.trim()
  const bos = !sonuc.kisiler.length && !sonuc.etiketler.length && !sonuc.gonderiler.length
  return h`<form class="kart ara-buyuk" method="get" action="/s/ara" role="search">${gizliGrup(chat)}
  <input type="search" name="q" value="${sorgu}" placeholder="Kişi, #etiket ya da gönderi ara" maxlength="80" autofocus aria-label="Ara"><button class="birincil">Ara</button>
</form>
${temiz.length < 2 ? h`<p class="kart bos">En az iki harf yaz. Türkçe harf farkı önemli değil: "sukru" da Şükrü'yü bulur.</p>`
  : bos ? h`<p class="kart bos">"${temiz}" için bir şey bulunamadı.</p>` : h`
${sonuc.kisiler.length ? h`<section class="kart liste-kart"><h2>Kişiler</h2>
  <div class="arkadaslar kucuk">${sonuc.kisiler.map((u) => h`<a class="arkadas" href="${profilLink(chat, u.jid)}">${avatar(chat, u)}<strong>${adi(u)}</strong></a>`)}</div></section>` : ''}
${sonuc.etiketler.length ? h`<section class="kart liste-kart"><h2>Etiketler</h2>
  ${sonuc.etiketler.map((e) => h`<a class="mini" href="${sLink(chat, '/etiket', { ad: e.ad })}"><span>#${e.ad}</span><small>${e.sayi} gönderi</small></a>`)}</section>` : ''}
${sonuc.gonderiler.length ? h`<h2 class="bolum-baslik">Gönderiler</h2>${sonuc.gonderiler.map((g) => gonderiCiz(chat, g, uyeler, ben, now))}` : ''}`}`
}

// --- Hikâye ----------------------------------------------------------------

export function hikayeSayfasi({ chat, hikaye, sahip, kendim, izleyenler, uyeler, sonraki, bildirim = null, now = Date.now() }) {
  const sonrakiAdres = sonraki ? sLink(chat, '/hikaye', { id: sonraki }) : sLink(chat)
  return h`${serit(bildirim)}<section class="hikaye-goster" data-sonraki="${sonrakiAdres}">
  <div class="hikaye-cubuk"><span></span></div>
  <header>${avatar(chat, sahip, 'kucuk')}<strong>${adi(sahip)}</strong><small>${zamanYaz(hikaye.zaman, now)}</small>
    <a class="kapat" href="${sLink(chat)}" aria-label="Kapat">✕</a></header>
  <img src="${sLink(chat, '/hikaye-medya', { id: hikaye.id })}" alt="">
  ${hikaye.metin ? h`<p class="hikaye-metin">${hikaye.metin}</p>` : ''}
  ${kendim ? h`<details class="izleyenler"><summary>${izleyenler.length} kişi gördü${izleyenler.some((i) => i.tepki) ? ` · ${izleyenler.map((i) => i.tepki).join('')}` : ''}</summary>${izleyenler.map((i) => h`<span>${adi(bul(uyeler, i.user_jid))}${i.tepki ? ` ${i.tepki}` : ''}</span>`)}</details>`
    : h`<p class="tek-sefer">Bu hikâye sana yalnızca bir kez gösterilir.</p>
  <form class="hikaye-yanit" method="post" action="/s/hikaye-yanit">${gizliGrup(chat)}<input type="hidden" name="id" value="${hikaye.id}"><input type="hidden" name="sonraki" value="${sonraki}">
    <div class="hikaye-tepkiler">${TEPKILER.map((t) => h`<button name="tepki" value="${t}" aria-label="${t} tepkisi">${t}</button>`)}</div>
    <div class="hikaye-yaz"><input name="metin" maxlength="1000" placeholder="Yanıt yaz…" autocomplete="off"><button class="birincil gonder-dugme">${ikon('gonder')}<span>Gönder</span></button></div>
  </form>`}
  <a class="sonraki" href="${sonrakiAdres}">${sonraki ? 'Sonraki ›' : 'Akışa dön'}</a>
</section>`
}

export function sosyalGrupSecimi(gruplar) {
  return h`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Grup seç</title><link rel="stylesheet" href="/sosyal.css?v=${SOSYAL_SURUMU}"><link rel="manifest" href="/manifest.webmanifest"></head>
<body class="sosyal tek"><main class="secim"><h1>Hangi gruba giriyorsun?</h1>
${gruplar.map((g, i) => h`<a class="kart secim-satir" href="${sLink(g.chat)}"><strong>${g.ad || `Grup ${i + 1}`}</strong><span>›</span></a>`)}
<form method="post" action="/cikis"><button class="baglanti">Çıkış</button></form></main></body></html>`.metin
}
