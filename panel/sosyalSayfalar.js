// Sosyal bölümün HTML'i (Faz 66). Değerler `h` ile kaçırılır: gönderi, yorum ve DM
// metnini üyeler yazar, hiçbiri ham HTML olarak sayfaya düşmemeli. Betik yalnızca
// /sosyal.js dosyasıdır; o yoksa da her form normal gönderilir.
import { readFileSync } from 'node:fs'
import { fnv1a } from '../lib/hash.js'
import { TEPKILER } from '../lib/sosyal.js'
import { OYUN_ADI } from '../lib/wrapped.js'
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
  const { chat, ben, grupAdi, sayac, secili = '', sag = '', cokGrup = false } = c
  const menu = (adres, anahtar, ikon, ad, ek = '') =>
    h`<a href="${adres}"${secili === anahtar ? h` class="secili" aria-current="page"` : ''}><span class="ik" aria-hidden="true">${ikon}</span><span class="ad">${ad}</span>${ek}</a>`
  return h`<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f3f1ec" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#16181b" media="(prefers-color-scheme: dark)">
<meta name="robots" content="noindex">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>${baslik} · ${grupAdi || 'Grup'}</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/ikon-192.png">
<link rel="apple-touch-icon" href="/ikon-192.png">
<link rel="stylesheet" href="/sosyal.css?v=${SOSYAL_SURUMU}">
<script src="/sosyal.js?v=${SOSYAL_SURUMU}" defer></script>
</head>
<body class="sosyal" data-grup="${chat}">
<header class="ust-cubuk">
  <a class="marka" href="${sLink(chat)}">${(grupAdi || 'grup').toLocaleLowerCase('tr')}</a>
  <nav class="ust-ikonlar" aria-label="Kısayollar">
    <a href="${sLink(chat, '/bildirim')}" aria-label="Bildirimler" class="ust-ik${secili === 'bildirim' ? ' secili' : ''}">◔${rozetSayi(sayac.bildirim)}</a>
    <a href="${sLink(chat, '/mesaj')}" aria-label="Mesajlar" class="ust-ik${secili === 'mesaj' ? ' secili' : ''}">✉${rozetSayi(sayac.dm)}</a>
    <a href="${profilLink(chat, ben.jid)}" aria-label="Profilim" class="ust-ben">${avatar(chat, ben, 'kucuk')}</a>
  </nav>
</header>
<div class="duzen">
  <nav class="sol" aria-label="Ana menü">
    <a class="sol-ben" href="${profilLink(chat, ben.jid)}">${avatar(chat, ben)}<span><strong>${adi(ben)}</strong><small>Profili gör</small></span></a>
    ${menu(sLink(chat), 'akis', '▤', 'Haber kaynağı')}
    ${menu(sLink(chat, '/mesaj'), 'mesaj', '✉', 'Mesajlar', rozetSayi(sayac.dm))}
    ${menu(sLink(chat, '/bildirim'), 'bildirim', '◔', 'Bildirimler', rozetSayi(sayac.bildirim))}
    ${menu(sLink(chat, '/arkadas'), 'arkadas', '☺', 'Arkadaşlar')}
    ${menu(sLink(chat, '/ayar'), 'ayar', '✎', 'Profili düzenle')}
    <h3>Eğlence</h3>
    ${menu(`/oyun?${q(chat)}`, 'oyun', '♠', 'Oyunlar')}
    ${cokGrup ? menu('/s', 'grup', '⇄', 'Grubu değiştir') : ''}
    <form method="post" action="/cikis" class="cikis"><button>Çıkış yap</button></form>
  </nav>
  <main id="icerik">${icerik}</main>
  <aside class="sag">${sag}</aside>
</div>
<nav class="alt-sekme" aria-label="Alt menü">
  ${menu(sLink(chat), 'akis', '▤', 'Akış')}
  ${menu(sLink(chat, '/arkadas'), 'arkadas', '☺', 'Arkadaşlar')}
  ${menu(`${sLink(chat)}#paylas`, 'paylas', '+', 'Paylaş')}
  ${menu(sLink(chat, '/mesaj'), 'mesaj', '✉', 'Mesajlar', rozetSayi(sayac.dm))}
  ${menu(`/oyun?${q(chat)}`, 'oyun', '♠', 'Oyunlar')}
</nav>
</body>
</html>`.metin
}

/** Sağ sütun: gündem, son görülenler, grubun zirvesi. Mesaj içeriği yoktur, yalnızca son görülme. */
export function sagSutun(chat, uyeler, now = Date.now(), gundem = []) {
  const aktif = uyeler.slice(0, 8)
  const zirve = [...uyeler].sort((a, b) => b.xp - a.xp).slice(0, 5)
  return h`${gundem.length ? h`<section class="kutu gundem">
  <h2>Gündem</h2>
  ${gundem.map((e) => h`<a class="mini" href="${sLink(chat, '/etiket', { ad: e.ad })}"><span>#${e.ad}</span><small>${e.sayi} kişi</small></a>`)}
</section>` : ''}
<section class="kutu">
  <h2>Son görülenler</h2>
  ${aktif.map((u) => h`<a class="mini" href="${profilLink(chat, u.jid)}">${avatar(chat, u, 'kucuk')}<span>${adi(u)}</span><small>${zamanYaz(u.last_seen, now)}</small></a>`)}
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
  h`<label class="foto-sec"><input type="file" name="${ad}" accept="image/*"><span>▣${etiket ? ` ${etiket}` : ''}</span></label>`

const gizliGrup = (chat) => h`<input type="hidden" name="grup" value="${chat}">`

export function paylasKutusu(chat, ben, { hedef = null, yer = '' } = {}) {
  const ipucu = hedef ? `${adi(hedef)} için bir şey yaz…` : 'Aklından ne geçiyor?'
  return h`<form class="kart paylas" id="paylas" method="post" action="/s/paylas" enctype="multipart/form-data">
  ${gizliGrup(chat)}
  ${hedef ? h`<input type="hidden" name="hedef" value="${hedef.jid}">` : ''}
  <input type="hidden" name="don" value="${yer}">
  <div class="paylas-ust">${avatar(chat, ben)}<textarea name="metin" rows="2" maxlength="2000" placeholder="${ipucu}"></textarea></div>
  <div class="onizleme" hidden></div>
  <div class="paylas-alt">${fotoAlani()}<button class="birincil">Paylaş</button></div>
</form>`
}

export function yorumCiz(chat, g, y, uyeler, ben, now = Date.now()) {
  const u = bul(uyeler, y.user_jid)
  const silebilir = y.user_jid === ben.jid || g.user_jid === ben.jid
  return h`<li>${avatar(chat, u, 'kucuk')}<div class="balon"><a href="${profilLink(chat, u.jid)}"><strong>${adi(u)}</strong></a> ${metinCiz(chat, y.metin, uyeler)}
    <small>${zamanYaz(y.zaman, now)}${silebilir ? h` · <form method="post" action="/s/yorum-sil" class="satir-ici">${gizliGrup(chat)}<input type="hidden" name="id" value="${y.id}"><button class="baglanti">sil</button></form>` : ''}</small></div></li>`
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
export function eylemCubugu(chat, g) {
  const ozet = g.tepkiler.slice(0, 3).map((t) => t.tepki).join('')
  const ana = g.benimTepkim || '❤️'
  return h`<div class="eylem" data-gonderi="${g.id}">
  <div class="sayilar">
    ${g.begeni ? h`<span class="tepki-ozet" title="${g.tepkiler.map((t) => `${t.tepki} ${t.n}`).join('  ')}">${ozet} ${g.begeni}</span>` : h`<span></span>`}
    <span>${g.yorumlar.length ? `${g.yorumlar.length} yorum` : ''}${g.yorumlar.length && g.paylasim ? ' · ' : ''}${g.paylasim ? `${g.paylasim} paylaşım` : ''}</span>
  </div>
  <div class="dugmeler">
    <form method="post" action="/s/begen" class="tepki-form">${gizliGrup(chat)}<input type="hidden" name="id" value="${g.id}">
      <button name="tepki" value="${ana}" class="tepki-ana${g.benimTepkim ? ' acik' : ''}" aria-pressed="${g.benimTepkim ? 'true' : 'false'}">${g.benimTepkim ? h`<span class="emoji">${g.benimTepkim}</span><span class="etk">Tepki</span>` : h`<span class="emoji soluk-emoji">♡</span><span class="etk">Beğen</span>`}</button>
      <details class="tepki-sec"><summary aria-label="Tepki seç">☺</summary>
        <div class="tepki-liste">${TEPKILER.map((t) => h`<button name="tepki" value="${t}"${t === g.benimTepkim ? h` class="secili"` : ''}>${t}</button>`)}</div>
      </details>
    </form>
    <a class="eylem-dugme yorum-ac" href="${sLink(chat, '/gonderi', { id: g.id })}#y${g.id}">💬<span class="etk">Yorum</span></a>
    <form method="post" action="/s/paylas" class="paylas-form">${gizliGrup(chat)}<input type="hidden" name="alinti" value="${g.id}">
      <button class="eylem-dugme${g.paylastim ? ' acik' : ''}" aria-pressed="${g.paylastim ? 'true' : 'false'}">↻<span class="etk">${g.paylastim ? 'Paylaştın' : 'Paylaş'}</span></button></form>
    <a class="eylem-dugme" href="${sLink(chat, '/alinti', { id: g.id })}">❝<span class="etk">Alıntıla</span></a>
  </div>
</div>`
}

function govde(chat, g, uyeler, ben, now, { ustNot = '', silinebilir = true } = {}) {
  const bot = !g.user_jid
  const yazan = bot ? BOT : bul(uyeler, g.user_jid)
  const hedef = g.hedef_jid ? bul(uyeler, g.hedef_jid) : null
  const silebilir = silinebilir && !bot && (g.user_jid === ben.jid || g.hedef_jid === ben.jid)
  return h`${ustNot}
  <header>
    ${bot ? botAvatar : h`<a href="${profilLink(chat, yazan.jid)}">${avatar(chat, yazan)}</a>`}
    <div class="kim">
      ${bot ? h`<strong>${BOT.ad}</strong>` : h`<a href="${profilLink(chat, yazan.jid)}"><strong>${adi(yazan)}</strong></a>`}
      ${hedef ? h` <span class="ok">▸</span> <a href="${profilLink(chat, hedef.jid)}"><strong>${adi(hedef)}</strong></a>` : ''}
      <a class="zaman" href="${sLink(chat, '/gonderi', { id: g.id })}">${zamanYaz(g.zaman, now)}</a>
    </div>
    ${silebilir ? h`<form method="post" action="/s/sil" class="sil">${gizliGrup(chat)}<input type="hidden" name="id" value="${g.id}"><button class="baglanti" aria-label="Gönderiyi sil">Sil</button></form>` : ''}
  </header>
  ${g.metin ? h`<p class="metin">${metinCiz(chat, g.metin, uyeler)}</p>` : ''}
  ${g.medya ? h`<a class="gorsel" href="${medyaLink(chat, g.medya)}"><img src="${medyaLink(chat, g.medya)}" alt="" loading="lazy"></a>` : ''}
  ${g.alinti_id ? alintiKarti(chat, g.alinti, uyeler, now) : ''}
  ${eylemCubugu(chat, g)}
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
    <label class="hikaye">${avatar(chat, ben)}<span class="arti" aria-hidden="true">+</span><input type="file" name="foto" accept="image/*" class="hemen-gonder"><small>Hikâye ekle</small></label>
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
export function gonderiListesi({ chat, ben, gonderiler, uyeler, now = Date.now(), yol = '', ek = {}, bosMetin = 'Henüz kimse bir şey paylaşmadı. İlk sen yaz.' }) {
  const son = gonderiler.at(-1)
  return h`<div class="akis" data-ilk="${gonderiler[0]?.id ?? 0}">${gonderiler.length ? gonderiler.map((g) => gonderiCiz(chat, g, uyeler, ben, now)) : h`<p class="kart bos">${bosMetin}</p>`}</div>
${son && gonderiler.length >= 20 ? h`<a class="daha" href="${sLink(chat, yol, { ...ek, once: son.id })}">Daha eski gönderiler</a>` : ''}`
}

export function akisSayfasi({ chat, ben, gonderiler, uyeler, hikayeler: hk, bildirim, now = Date.now() }) {
  return h`${serit(bildirim)}
${hikayeSeridi(chat, ben, hk, uyeler)}
${paylasKutusu(chat, ben)}
<a class="yeni-gonderi" href="${sLink(chat)}" hidden>Yeni gönderiler var ↑</a>
${gonderiListesi({ chat, ben, gonderiler, uyeler, now })}`
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

export function profilSayfasi({ chat, ben, kisi, profil, stats, seviye, rozetler, wrapped: w, gonderiler, uyeler, bildirim, now = Date.now() }) {
  const kendim = kisi.jid === ben.jid
  const kim = { ...kisi, avatar: profil.avatar }
  return h`${serit(bildirim)}
<section class="kart profil-bas">
  <div class="kapak r${fnv1a(kisi.jid) % RENK}">${profil.kapak ? h`<img src="${medyaLink(chat, profil.kapak)}" alt="">` : ''}</div>
  <div class="profil-kim">
    ${avatar(chat, kim, 'buyuk')}
    <div><h1>${adi(kisi)}</h1>${profil.bio ? h`<p class="bio">${profil.bio}</p>` : kendim ? h`<p class="bio soluk">Henüz bir şey yazmadın. <a href="${sLink(chat, '/ayar')}">Biyografi ekle</a></p>` : ''}</div>
  </div>
  <div class="profil-eylem">
    ${kendim
      ? h`<a class="dugme" href="${sLink(chat, '/ayar')}">Profili düzenle</a>`
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
${rozetler.length ? h`<section class="kart rozetler"><h2>Rozetler <small>${rozetler.length}</small></h2><ul>${rozetler.map((r) => h`<li title="${r.aciklama}">${r.ad}</li>`)}</ul></section>` : ''}
${paylasKutusu(chat, ben, { hedef: kendim ? null : kisi, yer: kisi.jid })}
${gonderiler.length ? gonderiler.map((g) => gonderiCiz(chat, g, uyeler, ben, now)) : h`<p class="kart bos">Duvarda henüz bir şey yok.</p>`}`
}

export function ayarSayfasi({ chat, profil, bildirim }) {
  return h`${serit(bildirim)}
<form class="kart ayar" method="post" action="/s/profil-yaz" enctype="multipart/form-data">
  <h2>Profili düzenle</h2>
  ${gizliGrup(chat)}
  <label>Biyografi <small>en çok 160 karakter</small>
    <textarea name="bio" maxlength="160" rows="3">${profil.bio}</textarea></label>
  <label>Fotoğraf nereye?
    <select name="tur"><option value="avatar">Profil fotoğrafı</option><option value="kapak">Kapak fotoğrafı</option></select></label>
  ${fotoAlani('foto', 'Fotoğraf seç')}
  <div class="onizleme" hidden></div>
  <button class="birincil">Kaydet</button>
  <p class="soluk">Fotoğraflar sunucuda küçültülür, konum ve cihaz bilgisi silinir.</p>
</form>`
}

export function arkadasSayfasi({ chat, uyeler, now = Date.now() }) {
  return h`<section class="kart liste-kart">
  <h2>Arkadaşlar <small>${uyeler.length} kişi · gruptaki herkes</small></h2>
  <div class="arkadaslar">${uyeler.map((u) => h`<a class="arkadas" href="${profilLink(chat, u.jid)}">${avatar(chat, u, 'orta')}<strong>${adi(u)}</strong><small>${u.panelde ? 'Burada' : 'Henüz katılmadı'} · ${zamanYaz(u.last_seen, now)}</small></a>`)}</div>
</section>`
}

// --- Bildirim ----------------------------------------------------------------

const BILDIRIM_METNI = {
  begeni: 'gönderini beğendi.',
  yorum: 'gönderine yorum yaptı.',
  etiket: 'seni bir gönderide etiketledi.',
  duvar: 'duvarına yazdı.',
  durt: 'seni dürttü.',
  paylasim: 'gönderini paylaştı.',
  alinti: 'gönderini alıntıladı.',
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
    const u = bul(uyeler, b.kimden)
    const adres = b.gonderi_id ? sLink(chat, '/gonderi', { id: b.gonderi_id }) : profilLink(chat, u.jid)
    return h`<a class="bildirim${b.okundu ? '' : ' yeni'}" href="${adres}">${avatar(chat, u)}<span><strong>${adi(u)}</strong> ${BILDIRIM_METNI[b.tur] ?? ''}<small>${zamanYaz(b.zaman, now)}</small></span></a>`
  }) : h`<p class="bos">Henüz bildirim yok.</p>`}
</section>`
}

// --- DM ------------------------------------------------------------------

export function mesajListesi({ chat, konusmalar, uyeler, ben, now = Date.now() }) {
  const yazilabilir = uyeler.filter((u) => u.panelde && u.jid !== ben.jid)
  return h`<section class="kart liste-kart">
  <h2>Mesajlar</h2>
  ${konusmalar.length ? konusmalar.map((k) => {
    const u = bul(uyeler, k.ile)
    const onizleme = k.son.medya && !k.son.metin ? '▣ Fotoğraf' : k.son.metin
    return h`<a class="konusma${k.okunmamis ? ' yeni' : ''}" href="${sLink(chat, '/mesaj', { ile: k.ile })}">${avatar(chat, u)}
      <span><strong>${adi(u)}</strong><small>${k.son.gonderen === ben.jid ? 'Sen: ' : ''}${onizleme}</small></span>
      <time>${zamanYaz(k.son.zaman, now)}</time>${rozetSayi(k.okunmamis)}</a>`
  }) : h`<p class="bos">Henüz mesajın yok.</p>`}
</section>
<section class="kart liste-kart">
  <h2>Yeni mesaj</h2>
  ${yazilabilir.length ? h`<div class="arkadaslar kucuk">${yazilabilir.map((u) => h`<a class="arkadas" href="${sLink(chat, '/mesaj', { ile: u.jid })}">${avatar(chat, u)}<strong>${adi(u)}</strong></a>`)}</div>`
    : h`<p class="bos">Panelde senden başka kimse yok. Arkadaşların bota özelden <code>.panel kayıt</code> yazınca burada görünür.</p>`}
</section>`
}

export function dmBalonlari(chat, mesajlar, ben) {
  return mesajlar.map((m) => h`<div class="dm ${m.gonderen === ben.jid ? 'benim' : 'onun'}" data-id="${m.id}">
    ${m.medya ? h`<a href="${medyaLink(chat, m.medya)}"><img src="${medyaLink(chat, m.medya)}" alt="" loading="lazy"></a>` : ''}
    ${m.metin ? h`<p>${m.metin}</p>` : ''}<time>${saatBicimi.format(m.zaman)}</time></div>`)
}

export function sohbetSayfasi({ chat, ben, karsi, mesajlar }) {
  return h`<section class="kart sohbet">
  <header><a class="geri" href="${sLink(chat, '/mesaj')}" aria-label="Mesajlara dön">‹</a>${avatar(chat, karsi)}<a href="${profilLink(chat, karsi.jid)}"><strong>${adi(karsi)}</strong></a></header>
  <div class="dm-akis" data-ile="${karsi.jid}" data-son="${mesajlar.at(-1)?.id ?? 0}">${mesajlar.length ? dmBalonlari(chat, mesajlar, ben) : h`<p class="bos">İlk mesajı sen yaz.</p>`}</div>
  ${karsi.panelde ? h`<form class="dm-yaz" method="post" action="/s/mesaj-yaz" enctype="multipart/form-data">
    ${gizliGrup(chat)}<input type="hidden" name="ile" value="${karsi.jid}">
    ${fotoAlani('foto', '')}
    <input name="metin" maxlength="1000" placeholder="Mesaj yaz…" autocomplete="off">
    <button class="birincil">Gönder</button>
  </form>` : h`<p class="bos">${adi(karsi)} henüz panele katılmadı, mesajı okuyamaz.</p>`}
</section>`
}

// --- Hikâye ----------------------------------------------------------------

export function hikayeSayfasi({ chat, hikaye, sahip, kendim, izleyenler, uyeler, sonraki, now = Date.now() }) {
  const sonrakiAdres = sonraki ? sLink(chat, '/hikaye', { id: sonraki }) : sLink(chat)
  return h`<section class="hikaye-goster" data-sonraki="${sonrakiAdres}">
  <div class="hikaye-cubuk"><span></span></div>
  <header>${avatar(chat, sahip, 'kucuk')}<strong>${adi(sahip)}</strong><small>${zamanYaz(hikaye.zaman, now)}</small>
    <a class="kapat" href="${sLink(chat)}" aria-label="Kapat">✕</a></header>
  <img src="${sLink(chat, '/hikaye-medya', { id: hikaye.id })}" alt="">
  ${hikaye.metin ? h`<p class="hikaye-metin">${hikaye.metin}</p>` : ''}
  ${kendim ? h`<details class="izleyenler"><summary>${izleyenler.length} kişi gördü</summary>${izleyenler.map((i) => h`<span>${adi(bul(uyeler, i.user_jid))}</span>`)}</details>`
    : h`<p class="tek-sefer">Bu hikâye sana yalnızca bir kez gösterilir.</p>`}
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
