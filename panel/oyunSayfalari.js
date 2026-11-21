// Panel kumarhanesinin HTML'i. Her hamle bir form gönderimidir; oyun.js varsa formu sayfa
// yenilemeden gönderir, ses çalar. Animasyonlar CSS'tedir, betik olmadan da oynar.
// Satır içi `style` CSP'ye takılır: gecikme ve konumlar sınıflarla verilir (d1, d2…).
import { IKILI_CARPAN, KAZI_ODULLERI, PLINKO_RISK, renk, SEMBOLLER } from '../lib/kumar.js'
import { COK_OYUNLAR, TEK_OYUNLAR } from './kumar.js'
import { h, kabuk } from './sayfalar.js'

const sayi = new Intl.NumberFormat('tr-TR')
/** Lobi; `oyun` verilirse o oyunun sayfası. */
export const oyunLink = (chat, oyun = '') => `/oyun?grup=${encodeURIComponent(chat)}${oyun ? `&oyun=${encodeURIComponent(oyun)}` : ''}`
export const hesapLink = (chat, sayfa) => `/oyun/${sayfa}?grup=${encodeURIComponent(chat)}`
const OYUN_ADI = { ...TEK_OYUNLAR, ...COK_OYUNLAR }
const oyunTanimi = (oyun) => (Object.hasOwn(OYUN_ADI, oyun) ? OYUN_ADI[oyun] : null)
const virgul = (x) => String(x).replace('.', ',')
// Makara şeridi: son sembol sonuçtur, öncesi yalnızca dönme görüntüsü.
const SERIT_UZUNLUGU = 15
// Bahsin bu katından fazla kazanç "büyük kazanç" kutlaması alır.
const BUYUK_KAT = 4

export function grupSecimi(gruplar) {
  const satirlar = gruplar.map((g, i) => h`
<a class="satir" href="${oyunLink(g.chat)}">
  <span class="ad"><strong>${g.ad || `Grup ${i + 1}`}</strong><small>${sayi.format(g.xp)} XP</small></span>
  <span class="deger">›</span>
</a>`)
  return kabuk('Kumarhane', h`<section class="kart liste"><h2>Hangi grubun XP'siyle oynayacaksın?</h2>${satirlar}</section>`, { kumarhane: true })
}

const gizli = (chat) => h`<input type="hidden" name="grup" value="${chat}">`

const secenekler = (dugmeler) => h`<div class="secenekler">${dugmeler.map(([deger, etiket, sinif = '']) =>
  h`<button name="secim" value="${deger}" class="${sinif}">${etiket}</button>`)}</div>`

const RULET_SECIMLERI = [['kırmızı', '🔴 Kırmızı · 2x'], ['siyah', '⚫ Siyah · 2x'], ['tek', 'Tek · 2x'], ['çift', 'Çift · 2x'], ['yeşil', '🟢 Yeşil (0) · 36x'],
  ...Array.from({ length: 37 }, (_, n) => [String(n), `Sayı ${n} · 36x`])]

/** Lobideki kutu ve oyun sayfasındaki bahis formu aynı tanımdan çıkar. */
const VITRIN = {
  slot: { aciklama: 'Üçlü 3x-50x, ikili 1,5x', etiket: 'JACKPOT 50x', govde: () => h`<button class="buyuk-dugme">ÇEVİR</button>` },
  kazı: { aciklama: '3 aynı sembol 1x-50x', etiket: '50x', govde: () => h`<button class="buyuk-dugme">KAZI</button>` },
  blackjack: { aciklama: 'Çift, böl, sigorta, teslim', etiket: '2,5x', govde: () => h`<button class="buyuk-dugme">MASAYA OTUR</button>` },
  hilo: { aciklama: 'Yüksek mi düşük mü, 1000x tavan', etiket: '1000x', govde: () => h`<button class="buyuk-dugme">KART AÇ</button>` },
  rulet: {
    aciklama: 'Avrupa ruleti, tek sıfır', etiket: '36x',
    govde: (secim) => h`<label class="alan"><small>Nereye</small><select name="secim">${RULET_SECIMLERI.map(([d, e]) => h`<option value="${d}"${d === secim ? h` selected` : ''}>${e}</option>`)}</select></label><button class="buyuk-dugme">ÇEVİR</button>`,
  },
  bahis: { aciklama: 'Bilirsen 2x', govde: () => secenekler([['yazı', 'Yazı'], ['tura', 'Tura']]) },
  crash: {
    aciklama: 'Hedefe varırsa hedefin katı', etiket: '1000x',
    govde: (secim) => h`<label class="alan"><small>Hedef çarpan</small><input name="secim" value="${secim || '2'}" inputmode="decimal" autocomplete="off" required></label><button class="buyuk-dugme">🚀 UÇUR</button>`,
  },
  plinko: { aciklama: 'Düşük 5x, orta 13x, yüksek 29x tavan', etiket: '29x', govde: () => secenekler([['düşük', 'Düşük'], ['orta', 'Orta'], ['yüksek', 'Yüksek', 'sicak']]) },
  mayın: { aciklama: '12 kutu, 3 mayın, 211x tavan', etiket: '211x', govde: () => h`<button class="buyuk-dugme">TARLAYA GİR</button>` },
  kule: { aciklama: '8 kat, tepe 245x', etiket: '245x', govde: () => secenekler([['kolay', 'Kolay'], ['orta', 'Orta'], ['zor', 'Zor', 'sicak']]) },
}

export const KATEGORILER = [
  { ad: 'Slot ve kazı', ikon: '🎰', oyunlar: ['slot', 'kazı'] },
  { ad: 'Kart ve masa', ikon: '🃏', oyunlar: ['blackjack', 'hilo', 'rulet', 'bahis'] },
  { ad: 'Çarpan oyunları', ikon: '🚀', oyunlar: ['crash', 'plinko', 'mayın', 'kule'] },
]

export const oyunVar = (oyun) => Object.hasOwn(VITRIN, oyun)

/**
 * Yan menü: oyun kategorileri ve hesap bölümü. Telefonda çekmecedir, `kabuk` içindeki
 * onay kutusuyla açılır (betik gerekmez); geniş ekranda hep açıktır.
 */
export function yanMenu({ chat, cokGrup, secili = '' }) {
  const baglanti = (adres, anahtar, ikon, ad) =>
    h`<a href="${adres}"${secili === anahtar ? h` class="secili" aria-current="page"` : ''}><span aria-hidden="true">${ikon}</span>${ad}</a>`
  return h`<nav class="yan" aria-label="Kumarhane menüsü">
  <div class="yan-marka">🎰 KUMARHANE</div>
  <a href="/s?grup=${encodeURIComponent(chat)}"><span aria-hidden="true">‹</span>Akışa dön</a>
  ${baglanti(oyunLink(chat), 'lobi', '🏠', 'Lobi')}
  ${KATEGORILER.map((k) => h`<h3>${k.ikon} ${k.ad}</h3>${k.oyunlar.map((o) => baglanti(oyunLink(chat, o), o, OYUN_ADI[o].ikon, OYUN_ADI[o].ad))}`)}
  <h3>👤 Hesap</h3>
  ${baglanti(hesapLink(chat, 'hesap'), 'hesap', '💎', 'Hesabım')}
  ${baglanti(hesapLink(chat, 'banka'), 'banka', '🏦', 'Banka ve kredi')}
  ${baglanti(hesapLink(chat, 'coin'), 'coin', '🪙', 'Coin ve mülk')}
  ${cokGrup ? h`<h3>Grup</h3><a href="/oyun"><span aria-hidden="true">🔁</span>Grubu değiştir</a>` : ''}
</nav>
<nav class="alt-menu" aria-label="Kısa menü">
  ${baglanti(oyunLink(chat), 'lobi', '🏠', 'Lobi')}
  ${baglanti(oyunLink(chat, 'slot'), 'slot', '🎰', 'Slot')}
  ${baglanti(oyunLink(chat, 'crash'), 'crash', '🚀', 'Crash')}
  ${baglanti(hesapLink(chat, 'banka'), 'banka', '🏦', 'Banka')}
  ${baglanti(hesapLink(chat, 'hesap'), 'hesap', '💎', 'Hesap')}
</nav>`
}

/** Bakiye başlığı. `dar`: oyun ve hesap sayfalarında tek satır. */
export function kasa({ xp, grupAdi, dar = false }) {
  return h`<section class="kasa${dar ? ' dar' : ''}">
  ${dar ? '' : h`<div class="neon">KUMARHANE</div><small>${grupAdi || 'Grup'}</small>`}
  <div class="bakiye"><span class="jeton" aria-hidden="true">🪙</span><span class="bakiye-sayi" data-xp="${xp}">${sayi.format(xp)}</span> <small>XP</small></div>
  ${dar ? '' : h`<span class="durum-cip">${xp < 500 ? '⚠️ Kumar için en az 500 XP' : '🟢 Masalar açık'}</span>`}
  <button type="button" class="ses-dugme" hidden aria-label="Sesi aç ya da kapat">🔊</button>
</section>`
}

/** `tek`: tek düğmeli oyun; bahis alanı ile düğme yan yana durur, telefonda kart kısalır. */
/** `secim`: son oynanan seçim (crash hedefi, rulet); form onunla dolar, her elde yeniden yazılmasın. */
function oyunKarti(chat, oyun, varsayilan, secim = '') {
  const t = OYUN_ADI[oyun]
  const { aciklama, etiket, govde } = VITRIN[oyun]
  const icerik = govde(secim)
  const tek = icerik.metin.startsWith('<button')
  return h`<form class="masa-kart k-${oyun}${tek ? ' tek' : ''}" method="post" action="/oyun/oyna">
  ${gizli(chat)}<input type="hidden" name="oyun" value="${oyun}">
  <div class="masa-ust">
    <span class="masa-ikon" aria-hidden="true">${t.ikon}</span>
    <span class="masa-ad"><strong>${t.ad}</strong><small>${aciklama}</small></span>
    ${etiket ? h`<span class="rozet">${etiket}</span>` : ''}
  </div>
  <label class="alan"><small>Bahis</small>
    <input name="miktar" value="${varsayilan}" placeholder="1000, 5m, hepsi" autocomplete="off" required></label>
  <div class="cipler" hidden>
    <button type="button" data-cip="yari">½</button>
    <button type="button" data-cip="iki">2x</button>
    <button type="button" data-cip="hepsi">Hepsi</button>
  </div>
  ${icerik}
</form>`
}

const oyunKutusu = (chat, oyun) => {
  const t = OYUN_ADI[oyun]
  const { aciklama, etiket } = VITRIN[oyun]
  return h`<a class="oyun-kutu k-${oyun}" href="${oyunLink(chat, oyun)}">
  ${etiket ? h`<span class="rozet">${etiket}</span>` : ''}
  <span class="kutu-ikon" aria-hidden="true">${t.ikon}</span>
  <strong>${t.ad}</strong>
  <small>${aciklama}</small>
  <span class="oyna">OYNA</span>
</a>`
}

const hamleDugmesi = (deger, etiket, sinif = '', kapali = false) =>
  h`<button name="hamle" value="${deger}" class="${sinif}"${kapali ? h` disabled` : ''}>${etiket}</button>`

const MAYIN_HUCRE = { acik: '💎', patlayan: '💥', mayin: '💣' }
const KULE_HUCRE = { acik: '🥚', patlayan: '🔥', mayin: '🐉' }
const kirmiziKart = (k) => /[♥♦]/.test(k)
const kart = (k, i, kapali = false) =>
  h`<span class="oyun-kart d${Math.min(i + 1, 9)}${kapali ? ' kapali' : kirmiziKart(k) ? ' kirmizi' : ''}">${kapali ? '' : k}</span>`

function elCizimi(chat, el, bitti = false) {
  const form = (icerik) => (bitti ? icerik : h`<form method="post" action="/oyun/hamle">${gizli(chat)}<input type="hidden" name="oyun" value="${el.oyun}">${icerik}</form>`)
  const sure = bitti ? '' : h`<p class="not orta">Bahis <strong>${sayi.format(el.bahis)} XP</strong> · ${Math.ceil(el.kalanMs / 60_000)} dk hamle yapmazsan el kendiliğinden kapanır</p>`
  const uyari = el.uyari ? h`<p class="hata">${el.uyari}</p>` : ''
  const cek = () => hamleDugmesi('çek', `💰 ÇEK · ${sayi.format(Math.floor(el.bahis * el.carpan))} XP`, 'cek')
  const carpanRozeti = el.carpan ? h`<p class="canli-carpan">${virgul(el.carpan)}x</p>` : ''

  if (el.oyun === 'blackjack') {
    const cok = el.eller.length > 1
    const elKutusu = (o, i) => h`<div class="el${o.aktif ? ' aktif' : ''}"><small>${cok ? `${i + 1}. el` : 'Sen'} · <strong>${o.deger}</strong>${cok || o.cift ? h` · ${sayi.format(o.bahis)} XP` : ''}${o.cift ? ' · ÇİFT' : ''}${o.teslim ? ' · TESLİM' : ''}</small>
    <p class="kartlar">${o.kartlar.map((k, j) => kart(k, j))}</p></div>`
    const dugmeler = el.sigortaSor
      ? h`<p class="not orta">Krupiyenin açık kartı as. Sigorta ${sayi.format(el.sigortaTutari)} XP tutar, krupiye blackjack yaparsa 2'ye 1 öder.</p>
<div class="secenekler">${hamleDugmesi('sigorta', '☂️ SİGORTA AL')}${hamleDugmesi('devam', 'SİGORTASIZ DEVAM', 'ikincil')}</div>`
      : h`<div class="secenekler">${hamleDugmesi('kart', '🂠 KART')}${hamleDugmesi('dur', '✋ DUR', 'ikincil')}
  ${el.cift ? hamleDugmesi('çift', '✖️2 ÇİFT', 'sicak') : ''}${el.bol ? hamleDugmesi('böl', '✂️ BÖL', 'sicak') : ''}${el.teslim ? hamleDugmesi('teslim', '🏳️ TESLİM', 'ikincil') : ''}</div>`
    return h`${sure}
<div class="kece">
  <div class="el"><small>Krupiye${el.krupiyeDeger !== null ? h` · <strong>${el.krupiyeDeger}</strong>` : ''}</small>
    <p class="kartlar">${el.krupiye.map((k, i) => kart(k, i, k === '🂠'))}</p></div>
  <div class="eller${cok ? ' cift-el' : ''}">${el.eller.map(elKutusu)}</div>
  ${el.sigorta ? h`<p class="not orta">☂️ Sigorta: ${sayi.format(el.sigorta)} XP</p>` : ''}
</div>${uyari}
${bitti ? '' : form(dugmeler)}`
  }

  if (el.oyun === 'mayın') {
    const kutular = el.kutular.map((d, i) => (bitti || d !== 'kapali'
      ? h`<span class="hucre ${d}">${MAYIN_HUCRE[d] ?? ''}</span>`
      : hamleDugmesi(String(i + 1), '', 'hucre')))
    return h`${sure}${carpanRozeti}${form(h`<div class="izgara dort">${kutular}</div>${uyari}
${bitti ? '' : h`<div class="secenekler">${cek()}</div>${el.sonraki ? h`<p class="not orta">Sonraki kutu ${virgul(el.sonraki)}x</p>` : ''}`}`)}`
  }

  if (el.oyun === 'kule') {
    const katlar = el.katlar.map((kat) => h`<div class="kat${kat.aktif ? ' aktif' : ''}">
  <small>${virgul(kat.carpan)}x</small>
  <div class="izgara">${kat.kutular.map((d, i) => (kat.aktif && !bitti
    ? hamleDugmesi(String(i + 1), '', 'hucre')
    : h`<span class="hucre ${d}">${KULE_HUCRE[d] ?? ''}</span>`))}</div>
</div>`)
    return h`${sure}${carpanRozeti}${form(h`<div class="kule">${katlar}</div>${uyari}
${bitti ? '' : h`<div class="secenekler">${cek()}</div>`}`)}`
  }

  return h`${sure}${carpanRozeti}
<p class="kartlar buyuk">${kart(el.kart, 0)}</p>
<p class="gecmis">${el.gecmis.map((k) => h`<span class="${kirmiziKart(k) ? 'kirmizi' : ''}">${k}</span>`)}</p>${uyari}
${bitti ? '' : form(h`<div class="secenekler">
  ${hamleDugmesi('yüksek', el.yuksek ? `⬆️ YÜKSEK · ${virgul(el.yuksek)}x` : '⬆️ YÜKSEK', '', !el.yuksek)}
  ${hamleDugmesi('düşük', el.dusuk ? `⬇️ DÜŞÜK · ${virgul(el.dusuk)}x` : '⬇️ DÜŞÜK', '', !el.dusuk)}
  ${hamleDugmesi('geç', '⏭️ GEÇ', 'ikincil')}
  ${cek()}
</div>`)}`
}

function serit(son) {
  const dolgu = Array.from({ length: SERIT_UZUNLUGU - 1 }, () => SEMBOLLER[Math.floor(Math.random() * SEMBOLLER.length)].s)
  return h`<div class="serit">${[...dolgu, son].map((s) => h`<span>${s}</span>`)}</div>`
}

// Avrupa ruletinin gerçek cep sırası, sıfırdan saat yönünde.
const RULET_SIRASI = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]
const CEP_ACISI = 360 / RULET_SIRASI.length
const RENK_SINIFI = { kırmızı: 'kirmizi', siyah: 'siyah', yeşil: 'yesil' }
const CEP_RENGI = { kırmızı: '#b3202c', siyah: '#16191d', yeşil: '#13824a' }
const f1 = (x) => x.toFixed(2)
const nokta = (r, aci) => `${f1(r * Math.sin(aci * Math.PI / 180))},${f1(-r * Math.cos(aci * Math.PI / 180))}`

/** Dönen kısım: cepler, numaralar, perdeler, koni ve tepe. Cep konumları sabit olduğu için bir kez üretilir. */
const RULET_GOVDE = (() => {
  const cepler = RULET_SIRASI.map((n, i) => {
    const a0 = (i - 0.5) * CEP_ACISI
    const a1 = (i + 0.5) * CEP_ACISI
    const yol = `M${nokta(50, a0)} L${nokta(79, a0)} A79,79 0 0 1 ${nokta(79, a1)} L${nokta(50, a1)} A50,50 0 0 0 ${nokta(50, a0)}Z`
    return h`<path d="${yol}" fill="${CEP_RENGI[renk(n)]}"/>`
  })
  const numaralar = RULET_SIRASI.map((n, i) =>
    h`<text x="0" y="-71.5" transform="rotate(${f1(i * CEP_ACISI)})">${n}</text>`)
  const perdeler = RULET_SIRASI.map((_, i) => {
    const a = (i - 0.5) * CEP_ACISI
    return h`<path d="M${nokta(50, a)} L${nokta(64, a)}"/>`
  })
  const kollar = [0, 90, 180, 270].map((a) => h`<path d="M-2.2,-4 L0,-21 L2.2,-4Z" transform="rotate(${a})"/>`)
  return h`<circle r="79.5" fill="#d9b25a"/>${cepler}
<circle r="64" fill="none" stroke="#e8c874" stroke-width=".9"/><circle r="79" fill="none" stroke="#e8c874" stroke-width=".7"/>
<g stroke="#e8c874" stroke-width=".9">${perdeler}</g>
<circle r="50" fill="url(#rulet-koni)" stroke="#e8c874" stroke-width="1.2"/>
<circle r="38" fill="none" stroke="rgb(0 0 0 / .25)" stroke-width=".6"/>
<g fill="url(#rulet-altin)">${kollar}<circle r="7.5"/></g><circle r="3.2" fill="#fff3c4"/>
<g class="rulet-numara" fill="#fff" font-size="7" font-weight="700" font-family="Georgia, serif" text-anchor="middle" dominant-baseline="central">${numaralar}</g>`
})()

const RULET_TANIM = h`<defs>
<radialGradient id="rulet-ahsap" r=".5"><stop offset=".82" stop-color="#3a1d0c"/><stop offset=".9" stop-color="#7a4520"/><stop offset=".96" stop-color="#4a250f"/><stop offset="1" stop-color="#1e0d04"/></radialGradient>
<radialGradient id="rulet-pist" r=".5"><stop offset=".78" stop-color="#2b170b"/><stop offset=".86" stop-color="#5b371c"/><stop offset=".92" stop-color="#2b170b"/></radialGradient>
<radialGradient id="rulet-koni" r=".5"><stop offset="0" stop-color="#a8692f"/><stop offset=".55" stop-color="#6d3c17"/><stop offset="1" stop-color="#3a1d0b"/></radialGradient>
<linearGradient id="rulet-altin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b3"/><stop offset=".5" stop-color="#d4a640"/><stop offset="1" stop-color="#8a6417"/></linearGradient>
<radialGradient id="rulet-isik" cx=".35" cy=".3" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>`

const RULET_KASE = h`<svg class="rulet-kase" viewBox="-100 -100 200 200" aria-hidden="true">${RULET_TANIM}
<circle r="99" fill="url(#rulet-ahsap)"/><circle r="92" fill="url(#rulet-pist)" stroke="#c9a14a" stroke-width="1"/>
<circle r="81.5" fill="#1a0d05"/>
<g fill="url(#rulet-altin)">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => h`<path d="M0,-88 L1.8,-84.5 L0,-81 L-1.8,-84.5Z" transform="rotate(${a + 22.5})"/>`)}</g></svg>`

/**
 * Gerçekçi rulet çarkı. `sayi` verilirse o cep tepeye döner (dönüş grubu öznitelikle, CSP satır içi stili
 * engellediği için): çark tam turlarla döndüğü için durunca cep yine tepededir, top da tepeye düşer.
 * `sayi` yoksa bekleme çarkıdır, oyun.js şablondan kopyalar.
 */
export function ruletCarki(sayi = null, sinif = '') {
  const aci = sayi === null ? 0 : -RULET_SIRASI.indexOf(sayi) * CEP_ACISI
  return h`<div class="rulet${sinif ? ` ${sinif}` : ''}">${RULET_KASE}
<div class="rulet-cark"><svg viewBox="-100 -100 200 200" aria-hidden="true"><g transform="rotate(${f1(aci)})">${RULET_GOVDE}</g></svg>
<div class="rulet-yorunge"><i class="rulet-top"></i></div></div>
<svg viewBox="-100 -100 200 200" aria-hidden="true"><circle r="92" fill="url(#rulet-isik)"/></svg></div>`
}

/** Tek adımlı oyunun canlandırması; sonuç metni `gecikmeli` ile animasyon bitince görünür. */
function tekCizim(oyun, s) {
  if (oyun === 'slot') {
    return h`<div class="slot-makine"><div class="makaralar">${s.makaralar.map((m, i) => h`<div class="makara m${i + 1}">${serit(m)}</div>`)}</div></div>`
  }
  if (oyun === 'bahis') {
    return h`<div class="para-alan"><div class="para ${s.sonuc === 'Yazı' ? 'yazi' : 'tura'}"><span class="on">YAZI</span><span class="arka">TURA</span></div></div>
<p class="not orta gecikmeli">Sen ${s.secim} dedin · ${s.sonuc} geldi</p>`
  }
  if (oyun === 'rulet') {
    const r = renk(s.sayi)
    return h`${ruletCarki(s.sayi)}<p class="not orta gecikmeli"><span class="rulet-sayi ${RENK_SINIFI[r]}">${s.sayi}</span> ${r}</p>`
  }
  if (oyun === 'kazı') {
    return h`<div class="izgara uc kazi">${s.kutular.map((k, i) => h`<span class="hucre d${i + 1}${s.sembol === k ? ' eslesen' : ''}"><i></i>${k}</span>`)}</div>`
  }
  if (oyun === 'plinko') {
    return h`<div class="plinko-yol">${s.yol.map((y, i) => h`<span class="d${i + 1}">${y ? '↘' : '↙'}</span>`)}</div>
<div class="plinko">${PLINKO_RISK[s.risk].map((c, i) => h`<span class="${i === s.kutu ? 'secili' : ''}">${virgul(c)}x</span>`)}</div>`
  }
  return h`<div class="crash-alan${s.carpan ? ' basarili' : ' patladi'}"><span class="roket">🚀</span><strong class="crash-sayi">${virgul(s.nokta)}x</strong></div>
<p class="not orta gecikmeli">Hedefin ${virgul(s.hedef)}x · ${s.carpan ? 'roket hedefi geçti' : 'roket hedefe varmadan patladı'}</p>`
}

const konfeti = () => h`<div class="konfeti" aria-hidden="true">${Array.from({ length: 24 }, () => h`<i></i>`)}</div>`

function sonucKarti(chat, s) {
  if (!s) return ''
  const t = oyunTanimi(s.oyun)
  const baslik = t ? `${t.ikon} ${t.ad}` : 'Kumarhane'
  if (s.hata) {
    return h`<section id="sonuc" class="sonuc kaybetti" role="alert" data-durum="hata"><h2>${baslik}</h2>${s.el ? elCizimi(chat, s.el, true) : ''}<p class="hata">${s.hata}</p></section>`
  }
  const durum = s.fark > 0 ? 'kazandi' : s.fark < 0 ? 'kaybetti' : 'berabere'
  const buyuk = s.fark > 0 && s.fark >= s.bahis * BUYUK_KAT
  const ozet = s.fark > 0 ? `+${sayi.format(s.fark)} XP` : s.fark < 0 ? `${sayi.format(s.fark)} XP` : 'Paran geri döndü'
  const carpan = s.bahis ? Math.round(((s.bahis + s.fark) / s.bahis) * 100) / 100 : 0
  return h`<section id="sonuc" class="sonuc ${durum}${buyuk ? ' buyuk' : ''}${s.el ? ' adimli' : ''}" role="status"
  data-oyun="${s.oyun}" data-durum="${durum}" data-carpan="${carpan}" data-nokta="${s.sonuc?.nokta ?? ''}">
  ${buyuk ? konfeti() : ''}
  <h2>${baslik}</h2>
  ${s.el ? elCizimi(chat, s.el, true) : tekCizim(s.oyun, s.sonuc)}
  <div class="gecikmeli">
    ${s.sebep ? h`<p class="orta">${s.sebep}</p>` : ''}
    ${buyuk ? h`<p class="pankart">BÜYÜK KAZANÇ</p>` : ''}
    ${s.fark > 0 && !s.el && s.sonuc?.carpan ? h`<p class="kat">${virgul(s.sonuc.carpan)}x</p>` : ''}
    <p class="fark">${ozet}</p>
    <p class="not orta">${sayi.format(s.once)} → ${sayi.format(s.xp)} XP</p>
  </div>
</section>`
}

/** Hangi sembol kaç kat öder; değerler oyunun kendi tablosundan okunur, elle yazılmaz. */
function odemeTablosu(oyun) {
  const satirlar = oyun === 'slot'
    ? [...SEMBOLLER.map((x) => [`${x.s}${x.s}${x.s}`, x.uclu]), ['İkili', IKILI_CARPAN]]
    : oyun === 'kazı' ? KAZI_ODULLERI.map((o) => [`${o.s}${o.s}${o.s}`, o.carpan]) : null
  if (!satirlar) return ''
  return h`<section class="odeme-tablosu"><h3>ÖDEME TABLOSU</h3><ul>${satirlar.map(([ad, c]) => h`<li><span>${ad}</span><strong>${virgul(c)}x</strong></li>`)}</ul></section>`
}

const acikElKarti = (chat, el) => {
  const t = OYUN_ADI[el.oyun]
  return h`<section id="acik-el" class="sonuc acik-el" data-oyun="${el.oyun}"><h2>${t.ikon} ${t.ad}</h2>${elCizimi(chat, el)}</section>`
}

const altNot = h`<p class="not orta alt-not">Panel ile WhatsApp aynı XP'yi kullanır. Gerçek para yoktur.</p>`

/** Kayan şerit dikişsiz dönsün diye liste iki kez yazılır; ikinci kopya ekran okuyucudan gizlidir. */
function vurgunSeridi(vurgunlar) {
  if (!vurgunlar.length) return ''
  const parca = (v) => h`<span>${oyunTanimi(v.oyun)?.ikon ?? '🎲'} ${v.ad} · <strong>+${sayi.format(v.kazanc)} XP</strong></span>`
  return h`<div class="akis" aria-label="Büyük vurgunlar"><div class="akis-serit">${vurgunlar.map(parca)}<span aria-hidden="true">🏆</span>${vurgunlar.map(parca)}<span aria-hidden="true">🏆</span></div></div>`
}

export function lobi({ chat, grupAdi, cokGrup, durum, vurgunlar = [] }) {
  const { xp, el, sonuc } = durum
  const t = el && OYUN_ADI[el.oyun]
  return kabuk('Kumarhane', h`
${kasa({ xp, grupAdi })}
${vurgunSeridi(vurgunlar)}
${sonucKarti(chat, sonuc)}
${el ? h`<a class="devam" href="${oyunLink(chat, el.oyun)}">${t.ikon} Açık ${t.ad} elin var · <strong>devam et ›</strong></a>` : ''}
${KATEGORILER.map((k) => h`<h2 class="bolum">${k.ikon} ${k.ad}</h2>
<section class="vitrin">${k.oyunlar.map((o) => oyunKutusu(chat, o))}</section>`)}
${altNot}`, { ust: '🎰 Kumarhane', kumarhane: true, yan: yanMenu({ chat, cokGrup, secili: 'lobi' }) })
}

/** Tek oyunun sayfası. Başka oyunda açık el varsa bahis formu yerine o ele bağlantı çıkar. */
export function oyunSayfasi({ chat, oyun, cokGrup, durum }) {
  const { xp, el, sonuc } = durum
  const t = OYUN_ADI[oyun]
  const baska = el && el.oyun !== oyun ? OYUN_ADI[el.oyun] : null
  const masa = baska
    ? h`<a class="devam" href="${oyunLink(chat, el.oyun)}">${baska.ikon} Önce açık ${baska.ad} elini bitir · <strong>ele dön ›</strong></a>`
    : el ? acikElKarti(chat, el)
      : h`<section class="oyunlar tekli">${oyunKarti(chat, oyun, String(sonuc?.taban ?? sonuc?.bahis ?? sonuc?.yazilan ?? ''), sonuc?.oyun === oyun ? sonuc.secim ?? '' : '')}</section>`
  return kabuk(t.ad, h`
${kasa({ xp, dar: true })}
${sonucKarti(chat, sonuc)}
${masa}
${odemeTablosu(oyun)}
${oyun === 'rulet' ? h`<template id="rulet-sablon">${ruletCarki(null, 'donuyor')}</template>` : ''}
${altNot}`, { ust: `${t.ikon} ${t.ad}`, kumarhane: true, yan: yanMenu({ chat, cokGrup, secili: oyun }) })
}
