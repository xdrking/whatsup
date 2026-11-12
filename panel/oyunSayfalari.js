// Panel kumarhanesinin HTML'i. Her hamle bir form gönderimidir; oyun.js varsa formu sayfa
// yenilemeden gönderir, ses çalar. Animasyonlar CSS'tedir, betik olmadan da oynar.
// Satır içi `style` CSP'ye takılır: gecikme ve konumlar sınıflarla verilir (d1, d2…).
import { PLINKO_RISK, renk, SEMBOLLER } from '../lib/kumar.js'
import { COK_OYUNLAR, TEK_OYUNLAR } from './kumar.js'
import { h, kabuk } from './sayfalar.js'

const sayi = new Intl.NumberFormat('tr-TR')
const saatBicimi = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' })
const oyunLink = (chat) => `/oyun?grup=${encodeURIComponent(chat)}`
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

/** `tek`: tek düğmeli oyun; bahis alanı ile düğme yan yana durur, telefonda kart kısalır. */
function oyunKarti(chat, oyun, varsayilan, govde, aciklama, etiket = '') {
  const t = OYUN_ADI[oyun]
  const tek = govde.metin.startsWith('<button')
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
  ${govde}
</form>`
}

const secenekler = (dugmeler) => h`<div class="secenekler">${dugmeler.map(([deger, etiket, sinif = '']) =>
  h`<button name="secim" value="${deger}" class="${sinif}">${etiket}</button>`)}</div>`

function oyunlar(chat, v) {
  const rulet = [['kırmızı', '🔴 Kırmızı · 2x'], ['siyah', '⚫ Siyah · 2x'], ['tek', 'Tek · 2x'], ['çift', 'Çift · 2x'],
    ...Array.from({ length: 37 }, (_, n) => [String(n), `Sayı ${n} · 36x`])]
  return h`<h2 class="bolum">🎰 Hızlı oyunlar</h2>
<section class="oyunlar">
${oyunKarti(chat, 'slot', v, h`<button class="buyuk-dugme">ÇEVİR</button>`, 'Üçlü 3x-50x, ikili 1,5x', 'JACKPOT 50x')}
${oyunKarti(chat, 'rulet', v, h`<label class="alan"><small>Nereye</small><select name="secim">${rulet.map(([d, e]) => h`<option value="${d}">${e}</option>`)}</select></label><button class="buyuk-dugme">ÇEVİR</button>`, 'Avrupa ruleti, tek sıfır')}
${oyunKarti(chat, 'crash', v, h`<label class="alan"><small>Hedef çarpan</small><input name="secim" value="2" inputmode="decimal" autocomplete="off" required></label><button class="buyuk-dugme">🚀 UÇUR</button>`, 'Hedefe varırsa hedefin katı', '1000x')}
${oyunKarti(chat, 'plinko', v, secenekler([['düşük', 'Düşük'], ['orta', 'Orta'], ['yüksek', 'Yüksek', 'sicak']]), 'Düşük 5x, orta 13x, yüksek 29x tavan')}
${oyunKarti(chat, 'kazı', v, h`<button class="buyuk-dugme">KAZI</button>`, '3 aynı sembol 1x-50x')}
${oyunKarti(chat, 'bahis', v, secenekler([['yazı', 'Yazı'], ['tura', 'Tura']]), 'Bilirsen 2x')}
</section>
<h2 class="bolum">🃏 Masa oyunları</h2>
<section class="oyunlar masalar">
${oyunKarti(chat, 'blackjack', v, h`<button class="buyuk-dugme">MASAYA OTUR</button>`, 'Kazanç 2x, blackjack 2,5x')}
${oyunKarti(chat, 'mayın', v, h`<button class="buyuk-dugme">TARLAYA GİR</button>`, '12 kutu, 3 mayın, 211x tavan')}
${oyunKarti(chat, 'kule', v, secenekler([['kolay', 'Kolay'], ['orta', 'Orta'], ['zor', 'Zor', 'sicak']]), '8 kat, tepe 245x', '245x')}
${oyunKarti(chat, 'hilo', v, h`<button class="buyuk-dugme">KART AÇ</button>`, 'Yüksek mi düşük mü, 1000x tavan')}
</section>`
}

const hamleDugmesi = (deger, etiket, sinif = '', kapali = false) =>
  h`<button name="hamle" value="${deger}" class="${sinif}"${kapali ? h` disabled` : ''}>${etiket}</button>`

const MAYIN_HUCRE = { acik: '💎', patlayan: '💥', mayin: '💣' }
const KULE_HUCRE = { acik: '🥚', patlayan: '🔥', mayin: '🐉' }
const kirmiziKart = (k) => /[♥♦]/.test(k)
const kart = (k, i, kapali = false) =>
  h`<span class="oyun-kart d${Math.min(i + 1, 9)}${kapali ? ' kapali' : kirmiziKart(k) ? ' kirmizi' : ''}">${kapali ? '' : k}</span>`

function elCizimi(chat, el, bitti = false) {
  const form = (icerik) => (bitti ? icerik : h`<form method="post" action="/oyun/hamle">${gizli(chat)}${icerik}</form>`)
  const sure = bitti ? '' : h`<p class="not orta">Bahis <strong>${sayi.format(el.bahis)} XP</strong> · ${Math.ceil(el.kalanMs / 60_000)} dk hamle yapmazsan el kendiliğinden kapanır</p>`
  const uyari = el.uyari ? h`<p class="hata">${el.uyari}</p>` : ''
  const cek = () => hamleDugmesi('çek', `💰 ÇEK · ${sayi.format(Math.floor(el.bahis * el.carpan))} XP`, 'cek')
  const carpanRozeti = el.carpan ? h`<p class="canli-carpan">${virgul(el.carpan)}x</p>` : ''

  if (el.oyun === 'blackjack') {
    return h`${sure}
<div class="kece">
  <div class="el"><small>Krupiye${el.krupiyeDeger !== null ? h` · <strong>${el.krupiyeDeger}</strong>` : ''}</small>
    <p class="kartlar">${el.krupiye.map((k, i) => kart(k, i, k === '🂠'))}</p></div>
  <div class="el"><small>Sen · <strong>${el.oyuncuDeger}</strong></small>
    <p class="kartlar">${el.oyuncu.map((k, i) => kart(k, i))}</p></div>
</div>${uyari}
${bitti ? '' : form(h`<div class="secenekler">${hamleDugmesi('kart', '🂠 KART')}${hamleDugmesi('dur', '✋ DUR', 'ikincil')}</div>`)}`
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
    const sinif = r === 'kırmızı' ? 'kirmizi' : r === 'siyah' ? 'siyah' : 'yesil'
    return h`<div class="carkfelek"><div class="cark-dis"></div><span class="top ${sinif}">${s.sayi}</span></div><p class="not orta gecikmeli">${r}</p>`
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
    <p class="fark">${ozet}</p>
    ${s.kesilen ? h`<p class="hata">Günlük kumar tavanı doldu: ${sayi.format(s.kesilen)} XP kasada kaldı. Kumar yarına kadar kapalı.</p>` : ''}
    <p class="not orta">${sayi.format(s.once)} → ${sayi.format(s.xp)} XP</p>
  </div>
</section>`
}

export function kumarhane({ chat, grupAdi, cokGrup, durum }) {
  const { xp, yasakBitis, el, sonuc } = durum
  const varsayilan = sonuc?.bahis ? String(sonuc.bahis) : ''
  const durumMetni = yasakBitis ? '🚫 Kumar yasağı' : xp < 500 ? '⚠️ 500 XP altı' : '🟢 Masalar açık'
  const t = el && OYUN_ADI[el.oyun]

  return kabuk('Kumarhane', h`
<section class="kasa">
  <div class="neon">KUMARHANE</div>
  <small>${grupAdi || 'Grup'}</small>
  <div class="bakiye"><span class="jeton" aria-hidden="true">🪙</span><span class="bakiye-sayi" data-xp="${xp}">${sayi.format(xp)}</span> <small>XP</small></div>
  <span class="durum-cip${yasakBitis ? ' yasakli' : ''}">${durumMetni}${yasakBitis ? ` · ${saatBicimi.format(yasakBitis)}'e kadar` : ''}</span>
  <button type="button" class="ses-dugme" hidden aria-label="Sesi aç ya da kapat">🔊</button>
</section>
${sonucKarti(chat, sonuc)}
${el ? h`<section id="acik-el" class="sonuc acik-el" data-oyun="${el.oyun}"><h2>${t.ikon} ${t.ad}</h2>${elCizimi(chat, el)}</section>` : oyunlar(chat, varsayilan)}
<p class="not orta alt-not">Panel ile WhatsApp aynı XP'yi kullanır. Günlük kazanç tavanı ve yasaklar ortaktır. Gerçek para yoktur.</p>
${cokGrup ? h`<p class="not orta"><a href="/oyun">Grubu değiştir</a></p>` : ''}`, { ust: '🎰 Kumarhane', kumarhane: true })
}
