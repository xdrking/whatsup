// Panelin ödül bölümü (Faz 89): Kasalar, Çark ve Coin Market. Kurallar lib/stats.js'tedir, burada yalnızca HTML çizilir.
// Kasa açılışı ve çark sonucu işlem anında sunucuda belli olur; sayfa onları kart olarak çizer, panel/kasa.js oynatır.
// Betik yoksa sonuç düz görünür.
import { EKSTRA_GUNLUK, ODULLER as CARK_ODULLERI, UCRETSIZ_HAK } from '../lib/cark.js'
import { COIN_URUNLERI } from '../lib/coin.js'
import { KASALAR, RENKLER } from '../lib/sandik.js'
import { anahtarFiyati, ayarDeger, kasaFiyati } from '../lib/ayarlar.js'
import { h, nftAdresi } from './sayfalar.js'
import { satir, sayfa } from './hesapSayfalari.js'
import { hesapLink } from './oyunSayfalari.js'

const sayi = new Intl.NumberFormat('tr-TR')
const yuzde = (n) => `%${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(n)}`
const dakika = (ms) => {
  const dk = Math.max(1, Math.ceil(ms / 60_000))
  return dk >= 60 ? `${Math.floor(dk / 60)} sa ${dk % 60} dk` : `${dk} dk`
}

/** Formun ortak gizli alanları. Tutar alanının adı `tutar`'dır (oyun.js `miktar` alanlarını eşitler). */
const gizli = (chat, sayfaAdi, islem, urun = '') =>
  h`<input type="hidden" name="grup" value="${chat}"><input type="hidden" name="sayfa" value="${sayfaAdi}"><input type="hidden" name="islem" value="${islem}"><input type="hidden" name="urun" value="${urun}">`

/** Bildirimde animasyon varsa sayfanın üstündeki düz bildirim çizilmez, sonucu kart gösterir. */
const bildirimsiz = (veri) => ({ ...veri, durum: { ...veri.durum, bildirim: null } })

// --- Kasalar -----------------------------------------------------------------------------

/** Şeritteki kutunun simgesi ve kısa yazısı. */
function kutu(odul) {
  if (odul.tur === 'coin') return { ikon: '🪙', yazi: `${odul.adet} coin` }
  if (odul.tur === 'kart') return { ikon: '🃏', yazi: 'Kart' }
  if (odul.tur === 'unvan') return { ikon: '🏷️', yazi: 'Unvan' }
  if (odul.no) return { ikon: '👑', yazi: 'Suly NFT' }
  return { ikon: '🖼️', yazi: 'NFT' }
}

function acilisKarti(a) {
  return h`<section id="kasa-acilis" class="kart kasa-acilis r-${a.renk}" data-renk="${a.renk}" data-kazanan="38" aria-live="polite">
  <h2>🎁 ${a.ad}</h2>
  <div class="serit-pencere" aria-hidden="true">
    <span class="serit-isaret"></span>
    <ol class="serit">${a.serit.map((o) => {
      const k = kutu(o)
      return h`<li class="r-${o.renk}"><b>${k.ikon}</b><small>${k.yazi}</small></li>`
    })}</ol>
  </div>
  <div class="kasa-sonuc">
    ${a.nft ? h`<img src="${nftAdresi(a.nft)}" alt="" width="120" height="120" loading="lazy">` : ''}
    <p><span class="rozet r-${a.renk}">${RENKLER[a.renk].ad}</span> ${a.metin}</p>
  </div>
  <button type="button" class="kasa-gec ikincil" hidden>Geç ⏩</button>
</section>`
}

function tierKarti(chat, k, d) {
  const kasa = d.kasa[k.tier] ?? 0
  const anahtar = d.anahtar[k.tier] ?? 0
  const acilir = kasa > 0 && anahtar > 0
  const toplam = k.oduller.reduce((t, o) => t + o.agirlik, 0)
  return h`<article class="tier-kart t${k.tier}">
  <div class="tier-ust">
    <span class="tier-ikon" aria-hidden="true">${k.ad.split(' ')[0]}</span>
    <span class="tier-ad"><strong>${k.ad.replace(/^\S+\s/, '')}</strong><small>Tier ${k.tier}</small></span>
    <span class="tier-sayi"><b>${kasa}</b> kasa · <b>${anahtar}</b> 🔑</span>
  </div>
  <form class="islem duz" method="post" action="/oyun/islem">${gizli(chat, 'kasa', 'kasa-ac', k.tier)}
    <button class="${acilir ? 'kasa-ac-dugme' : 'ikincil'}"${acilir ? '' : ' disabled'}>${acilir ? '🎁 AÇ' : kasa ? '🔑 Anahtar gerekli' : 'Kasa yok'}</button>
  </form>
  <div class="tier-al">
    <form class="islem" method="post" action="/oyun/islem">${gizli(chat, 'kasa', 'kasa-al', k.tier)}
      <label class="alan"><small>Kasa · ${kasaFiyati(k.tier)} coin</small><input name="tutar" value="1" inputmode="numeric" autocomplete="off" required></label>
      <button class="ikincil">AL</button>
    </form>
    <form class="islem" method="post" action="/oyun/islem">${gizli(chat, 'kasa', 'anahtar-al', k.tier)}
      <label class="alan"><small>Anahtar · ${anahtarFiyati(k.tier)} coin</small><input name="tutar" value="1" inputmode="numeric" autocomplete="off" required></label>
      <button class="ikincil">AL</button>
    </form>
  </div>
  <details class="tier-icerik"><summary>İçinden neler çıkar?</summary>
    <ul>${k.oduller.map((o) => h`<li class="r-${o.renk}"><span>${o.etiket}</span><b>${yuzde((o.agirlik * 100) / toplam)}</b></li>`)}</ul>
  </details>
</article>`
}

export function kasaSayfasi(veri) {
  const { chat, durum, kasalar } = veri
  const d = kasalar.sandik
  const a = durum.bildirim?.kasaAc
  if (!d) return sayfa('Kasalar', '🎁 Kasalar', 'kasa', veri, h`<p class="not">Kasa deposu şu an kapalı.</p>`)
  const sahip = KASALAR.flatMap((k) => [
    ...((d.kasa[k.tier] ?? 0) > 0 ? [{ deger: `kasa:${k.tier}`, ad: `${k.ad} (${d.kasa[k.tier]})` }] : []),
    ...((d.anahtar[k.tier] ?? 0) > 0 ? [{ deger: `anahtar:${k.tier}`, ad: `T${k.tier} anahtar (${d.anahtar[k.tier]})` }] : []),
  ])
  return sayfa('Kasalar', '🎁 Kasalar', 'kasa', a ? bildirimsiz(veri) : veri, h`
${a ? acilisKarti(a) : ''}
${d.yeniAnahtar.length ? h`<p class="bildirim oldu">🔑 Gece anahtarın geldi: ${d.yeniAnahtar.map((t) => `T${t}`).join(', ')}</p>` : ''}
<section class="kart hesap-kart">
  <h2>Deponda</h2>
  ${satir('🪙', 'Coinin', sayi.format(d.coin))}
  ${satir('🎰', 'Bu hafta kumardan düşen', `${d.hafta.kumar}/${ayarDeger('kasaHaftalikKumar')}`)}
  ${satir('🥷', 'Bu hafta soygundan düşen', `${d.hafta.soygun}/${ayarDeger('kasaHaftalikSoygun')}`)}
  ${satir('🛒', 'Bu hafta coinle alınan kasa', `${d.hafta.alim}/${ayarDeger('kasaHaftalikAlim')}`)}
  <div class="tier-liste">${KASALAR.map((k) => tierKarti(chat, k, d))}</div>
  <p class="not">Kasa aynı tier'den bir anahtarla açılır. Her gece herkese 1 rastgele anahtar gelir, buraya girince verilir. Kasa WhatsApp'taki kumarda kazanınca ve başarılı soygunda düşük olasılıkla düşer; panel kumarında düşmez.</p>
</section>
${sahip.length ? h`<section class="kart hesap-kart">
  <h2>Devret</h2>
  <form class="islem kasa-devret" method="post" action="/oyun/islem"><input type="hidden" name="grup" value="${chat}"><input type="hidden" name="sayfa" value="kasa"><input type="hidden" name="islem" value="kasa-devret">
    <label class="alan"><small>Ne</small><select name="urun" required>${sahip.map((s) => h`<option value="${s.deger}">${s.ad}</option>`)}</select></label>
    <label class="alan"><small>Kime</small><select name="hedef" required><option value="">Seç…</option>${kasalar.uyeler.map((u) => h`<option value="${u.jid}">${u.ad}</option>`)}</select></label>
    <label class="alan adet"><small>Adet</small><input name="tutar" value="1" inputmode="numeric" autocomplete="off" required></label>
    <button class="ikincil">DEVRET</button>
  </form>
  <p class="not">Borçluyken ve ambargodayken devredilemez.</p>
</section>` : ''}`)
}

// --- Çark --------------------------------------------------------------------------------

const DILIM = 360 / CARK_ODULLERI.length
const RENK = ['#7c3aed', '#1d4ed8', '#0f766e', '#b45309', '#be123c', '#4338ca', '#047857', '#a21caf', '#c2410c']

function carkSvg(donus) {
  const r = 140
  const nokta = (aci) => {
    const t = (aci * Math.PI) / 180
    return `${(150 + r * Math.sin(t)).toFixed(2)} ${(150 - r * Math.cos(t)).toFixed(2)}`
  }
  const dilimler = CARK_ODULLERI.map((o, i) => {
    const bas = i * DILIM
    const orta = bas + DILIM / 2
    const [ikon, ...yazi] = o.etiket.split(' ')
    return h`<path d="M150 150 L${nokta(bas)} A${r} ${r} 0 0 1 ${nokta(bas + DILIM)} Z" fill="${RENK[i % RENK.length]}" stroke="#0d0d14" stroke-width="2"/>
    <g transform="rotate(${orta} 150 150)"><text x="150" y="44" font-size="22" text-anchor="middle">${ikon}</text>
    <text x="150" y="66" font-size="10" font-weight="bold" fill="#ffffff" text-anchor="middle">${yazi.join(' ').replace(/1 saat oyunlardan /, '').slice(0, 12)}</text></g>`
  })
  return h`<svg class="cark-svg" viewBox="0 0 300 300" width="300" height="300" role="img" aria-label="Şans çarkı">
  <g class="cark-teker" transform="rotate(${donus} 150 150)">${dilimler}<circle cx="150" cy="150" r="26" fill="#0d0d14" stroke="#f5c542" stroke-width="4"/></g>
  <circle cx="150" cy="150" r="144" fill="none" stroke="#f5c542" stroke-width="6"/>
</svg>`
}

export function carkSayfasi(veri) {
  const { chat, durum, cark } = veri
  const sonuc = durum.bildirim?.cark
  // Kazanan dilimin ortası tepedeki oka gelir; küçük sapma her dönüşü ayrı gösterir, dilimin dışına taşmaz.
  const donus = sonuc ? (360 - (sonuc.dilim * DILIM + DILIM / 2) + (Math.random() - 0.5) * DILIM * 0.6 + 360) % 360 : 0
  const simdi = Date.now()
  return sayfa('Çark', '🎡 Şans çarkı', 'cark', sonuc ? bildirimsiz(veri) : veri, h`
<section id="cark-kutu" class="kart cark-kart${sonuc ? ' sonuclu' : ''}"${sonuc ? h` data-donus="${donus.toFixed(2)}"` : ''} aria-live="polite">
  <div class="cark-sahne"><span class="cark-ok" aria-hidden="true"></span><div class="cark-don">${carkSvg(donus)}</div></div>
  ${sonuc ? h`<p class="cark-sonuc">🎉 ${durum.bildirim.tamam}</p>` : ''}
  <div class="isler">
    <form class="islem duz" method="post" action="/oyun/islem">${gizli(chat, 'cark', 'cark')}
      <button class="buyuk-dugme"${cark?.kalan > 0 ? '' : ' disabled'}>🎡 ÇEVİR${cark ? ` (${Math.max(0, cark.kalan)}/${UCRETSIZ_HAK})` : ''}</button></form>
    ${cark && cark.kalan <= 0 ? h`<form class="islem duz" method="post" action="/oyun/islem">${gizli(chat, 'cark', 'cark', 'ekstra')}
      <button class="sicak"${cark.ekstraKalan > 0 ? '' : ' disabled'}>💸 EKSTRA · ${sayi.format(cark.ekstraFiyat)} XP (${Math.max(0, cark.ekstraKalan)}/${EKSTRA_GUNLUK})</button></form>` : ''}
  </div>
  ${cark?.yenilenme ? h`<p class="not">Ücretsiz hakların ${dakika(cark.yenilenme - simdi)} sonra yenilenir.</p>` : ''}
  ${cark?.bonus ? h`<p class="not">🚀 Aktif bonus: oyunlardan ${(100 + cark.bonus.yuzde) / 100} kat XP, ${dakika(cark.bonus.bitis - simdi)} kaldı.</p>` : ''}
  <p class="not">24 saatte ${UCRETSIZ_HAK} ücretsiz hak, WhatsApp'taki <code>.çark</code> ile aynıdır.</p>
</section>`)
}

// --- Coin Market -------------------------------------------------------------------------

export function coinMarketSayfasi(veri) {
  const { chat, durum } = veri
  const coin = durum.coin?.bakiye ?? 0
  return sayfa('Coin Market', '🛒 Coin Market', 'coinmarket', veri, h`
<section class="kart hesap-kart">
  <h2>Ürünler</h2>
  ${satir('🪙', 'Coinin', sayi.format(coin))}
  <div class="market-liste">${COIN_URUNLERI.map((u, i) => h`<form class="market-urun" method="post" action="/oyun/islem">${gizli(chat, 'coinmarket', 'coinmarket-al', i + 1)}
    <span>${u.ad.replace(/`/g, '')}</span>
    ${u.topluHaciz ? h`<small>WhatsApp'ta .hacizall</small>` : h`<button class="${coin >= u.fiyat ? '' : 'ikincil'}">🪙 ${u.fiyat}</button>`}
  </form>`)}</div>
  <p class="not">Coinin yoksa <a href="${hesapLink(chat, 'coin')}">🪙 Coin borsası</a>ndan al.</p>
</section>
<section class="kart hesap-kart">
  <h2>🎁 Kasalar ve anahtarlar</h2>
  <div class="market-liste">${KASALAR.map((k) => h`<div class="market-urun kasa-urun">
    <span>${k.ad} <small>T${k.tier}</small></span>
    <form method="post" action="/oyun/islem">${gizli(chat, 'coinmarket', 'kasa-al', k.tier)}<button class="${coin >= kasaFiyati(k.tier) ? '' : 'ikincil'}">🎁 ${kasaFiyati(k.tier)}</button></form>
    <form method="post" action="/oyun/islem">${gizli(chat, 'coinmarket', 'anahtar-al', k.tier)}<button class="${coin >= anahtarFiyati(k.tier) ? '' : 'ikincil'}">🔑 ${anahtarFiyati(k.tier)}</button></form>
  </div>`)}</div>
  <p class="not">Coinle haftada en çok ${ayarDeger('kasaHaftalikAlim')} kasa alınır, anahtar sınırsız. Açmak için <a href="${hesapLink(chat, 'kasa')}">🎁 Kasalar</a>.</p>
</section>`)
}
