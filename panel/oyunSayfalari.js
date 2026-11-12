// Panel kumarhanesinin HTML'i. JavaScript yok: her hamle bir form gönderimi, sonuç
// yönlendirmeden sonra sayfada bir kez görünür.
import { PLINKO_RISK, renk } from '../lib/kumar.js'
import { COK_OYUNLAR, TEK_OYUNLAR } from './kumar.js'
import { h, kabuk } from './sayfalar.js'

const sayi = new Intl.NumberFormat('tr-TR')
const saatBicimi = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' })
const oyunLink = (chat) => `/oyun?grup=${encodeURIComponent(chat)}`
const OYUN_ADI = { ...TEK_OYUNLAR, ...COK_OYUNLAR }
const oyunTanimi = (oyun) => (Object.hasOwn(OYUN_ADI, oyun) ? OYUN_ADI[oyun] : null)
const virgul = (x) => String(x).replace('.', ',')

export function grupSecimi(gruplar) {
  const satirlar = gruplar.map((g, i) => h`
<a class="satir" href="${oyunLink(g.chat)}">
  <span class="ad"><strong>${g.ad || `Grup ${i + 1}`}</strong><small>${sayi.format(g.xp)} XP</small></span>
  <span class="deger">›</span>
</a>`)
  return kabuk('Kumarhane', h`<section class="kart liste"><h2>Hangi grubun XP'siyle oynayacaksın?</h2>${satirlar}</section>`)
}

const gizli = (chat) => h`<input type="hidden" name="grup" value="${chat}">`

function oyunKarti(chat, oyun, varsayilan, govde, aciklama) {
  const t = OYUN_ADI[oyun]
  return h`<form class="kart oyun" method="post" action="/oyun/oyna">
  ${gizli(chat)}<input type="hidden" name="oyun" value="${oyun}">
  <h2><span aria-hidden="true">${t.ikon}</span> ${t.ad}${COK_OYUNLAR[oyun] ? h` <small>adım adım</small>` : ''}</h2>
  <p class="not">${aciklama}</p>
  <label class="alan"><small>Bahis</small>
    <input name="miktar" value="${varsayilan}" placeholder="1000, 5m, hepsi" autocomplete="off" required></label>
  ${govde}
</form>`
}

const secenekler = (dugmeler) => h`<div class="secenekler">${dugmeler.map(([deger, etiket]) =>
  h`<button name="secim" value="${deger}">${etiket}</button>`)}</div>`

function oyunlar(chat, v) {
  const rulet = [['kırmızı', 'Kırmızı'], ['siyah', 'Siyah'], ['tek', 'Tek'], ['çift', 'Çift'],
    ...Array.from({ length: 37 }, (_, n) => [String(n), `Sayı ${n}`])]
  return h`<section class="oyunlar">
${oyunKarti(chat, 'bahis', v, secenekler([['yazı', 'Yazı'], ['tura', 'Tura']]), 'Bilirsen 2x.')}
${oyunKarti(chat, 'slot', v, h`<button>Çevir</button>`, 'Üçlü 3x-50x, ikili 1,5x.')}
${oyunKarti(chat, 'rulet', v, h`<label class="alan"><small>Nereye</small><select name="secim">${rulet.map(([d, e]) => h`<option value="${d}">${e}</option>`)}</select></label><button>Çevir</button>`, 'Renk ve tek/çift 2x, sayı 36x. Sıfır renge kaybettirir.')}
${oyunKarti(chat, 'kazı', v, h`<button>Kazı</button>`, '3 aynı sembol 1x-50x.')}
${oyunKarti(chat, 'plinko', v, secenekler([['düşük', 'Düşük'], ['orta', 'Orta'], ['yüksek', 'Yüksek']]), 'Risk seç: düşük 0,6x-5x, orta 0,4x-13x, yüksek 0,2x-29x.')}
${oyunKarti(chat, 'crash', v, h`<label class="alan"><small>Hedef çarpan</small><input name="secim" value="2" inputmode="decimal" autocomplete="off" required></label><button>Uç</button>`, 'Roket hedefe varırsa hedefin katını alırsın.')}
${oyunKarti(chat, 'blackjack', v, h`<button>Masaya otur</button>`, 'Krupiye 17\'de durur. Kazanç 2x, blackjack 2,5x.')}
${oyunKarti(chat, 'mayın', v, h`<button>Tarlaya gir</button>`, '12 kutuda 3 mayın. Her kutu çarpanı artırır.')}
${oyunKarti(chat, 'kule', v, secenekler([['kolay', 'Kolay'], ['orta', 'Orta'], ['zor', 'Zor']]), '8 kat, her katta yumurtayı bul. Tepe 9,58x / 24,6x / 245,76x.')}
${oyunKarti(chat, 'hilo', v, h`<button>Kart aç</button>`, 'Sıradaki kart yüksek mi düşük mü? Bildikçe çarpan katlanır.')}
</section>`
}

const hamleDugmesi = (deger, etiket, sinif = '', kapali = false) =>
  h`<button name="hamle" value="${deger}" class="${sinif}"${kapali ? h` disabled` : ''}>${etiket}</button>`

const MAYIN_HUCRE = { acik: '✅', patlayan: '💥', mayin: '💣' }
const KULE_HUCRE = { acik: '🥚', patlayan: '🔥', mayin: '🐉' }

function elCizimi(chat, el, bitti = false) {
  const form = (icerik) => (bitti ? icerik : h`<form method="post" action="/oyun/hamle">${gizli(chat)}${icerik}</form>`)
  const sure = bitti ? '' : h`<p class="not">Bahis ${sayi.format(el.bahis)} XP · ${Math.ceil(el.kalanMs / 60_000)} dk hamle yapmazsan el kendiliğinden kapanır</p>`
  const uyari = el.uyari ? h`<p class="hata">${el.uyari}</p>` : ''
  const cek = () => hamleDugmesi('çek', `💰 Çek · ${virgul(el.carpan)}x = ${sayi.format(Math.floor(el.bahis * el.carpan))} XP`)

  if (el.oyun === 'blackjack') {
    return h`${sure}
<div class="masa">
  <div><small>Krupiye${el.krupiyeDeger !== null ? ` · ${el.krupiyeDeger}` : ''}</small><p class="kartlar">${el.krupiye.map((k) => h`<span>${k}</span>`)}</p></div>
  <div><small>Sen · ${el.oyuncuDeger}</small><p class="kartlar">${el.oyuncu.map((k) => h`<span>${k}</span>`)}</p></div>
</div>${uyari}
${bitti ? '' : form(h`<div class="secenekler">${hamleDugmesi('kart', 'Kart çek')}${hamleDugmesi('dur', 'Dur', 'ikincil')}</div>`)}`
  }

  if (el.oyun === 'mayın') {
    const kutular = el.kutular.map((d, i) => (bitti || d !== 'kapali'
      ? h`<span class="hucre ${d}">${MAYIN_HUCRE[d] ?? i + 1}</span>`
      : hamleDugmesi(String(i + 1), String(i + 1), 'hucre')))
    return h`${sure}${form(h`<div class="izgara dort">${kutular}</div>${uyari}
${bitti ? '' : h`<div class="secenekler">${cek()}</div>${el.sonraki ? h`<p class="not">Sonraki kutu ${virgul(el.sonraki)}x</p>` : ''}`}`)}`
  }

  if (el.oyun === 'kule') {
    const katlar = el.katlar.map((kat) => h`<div class="kat${kat.aktif ? ' aktif' : ''}">
  <small>${virgul(kat.carpan)}x</small>
  <div class="izgara">${kat.kutular.map((d, i) => (kat.aktif && !bitti
    ? hamleDugmesi(String(i + 1), '?', 'hucre')
    : h`<span class="hucre ${d}">${KULE_HUCRE[d] ?? ''}</span>`))}</div>
</div>`)
    return h`${sure}${form(h`<div class="kule">${katlar}</div>${uyari}
${bitti ? '' : h`<div class="secenekler">${cek()}</div>`}`)}`
  }

  return h`${sure}
<p class="kartlar buyuk"><span>${el.kart}</span></p>
<p class="not">Geçmiş: ${el.gecmis.join(' · ')}</p>${uyari}
${bitti ? '' : form(h`<div class="secenekler">
  ${hamleDugmesi('yüksek', el.yuksek ? `⬆️ Yüksek · ${virgul(el.yuksek)}x` : '⬆️ Yüksek', '', !el.yuksek)}
  ${hamleDugmesi('düşük', el.dusuk ? `⬇️ Düşük · ${virgul(el.dusuk)}x` : '⬇️ Düşük', '', !el.dusuk)}
  ${hamleDugmesi('geç', '⏭️ Kartı geç', 'ikincil')}
  ${cek()}
</div>`)}`
}

/** Tek adımlı oyunun çıktısı. */
function tekCizim(oyun, s) {
  if (oyun === 'bahis') return h`<p class="dev">🪙 ${s.sonuc}</p><p class="not orta">Sen ${s.secim} dedin</p>`
  if (oyun === 'slot') return h`<p class="dev makara">${s.makaralar.map((m) => h`<span>${m}</span>`)}</p>`
  if (oyun === 'rulet') {
    const r = renk(s.sayi)
    return h`<p class="dev"><span class="top ${r === 'kırmızı' ? 'kirmizi' : r === 'siyah' ? 'siyah' : 'yesil'}">${s.sayi}</span></p><p class="not orta">${r}</p>`
  }
  if (oyun === 'kazı') return h`<div class="izgara uc">${s.kutular.map((k) => h`<span class="hucre${s.sembol === k ? ' acik' : ''}">${k}</span>`)}</div>`
  if (oyun === 'plinko') {
    return h`<div class="plinko">${PLINKO_RISK[s.risk].map((c, i) => h`<span class="${i === s.kutu ? 'secili' : ''}">${virgul(c)}x</span>`)}</div>
<p class="not orta">Yol: ${s.yol.map((y) => (y ? '↘' : '↙')).join(' ')} · risk ${s.risk}</p>`
  }
  return h`<p class="dev">🚀 ${virgul(s.nokta)}x</p><p class="not orta">Hedefin ${virgul(s.hedef)}x · ${s.carpan ? 'roket hedefi geçti' : 'roket hedefe varmadan patladı'}</p>`
}

function sonucKarti(chat, s) {
  if (!s) return ''
  const t = oyunTanimi(s.oyun)
  const baslik = t ? `${t.ikon} ${t.ad}` : 'Kumarhane'
  if (s.hata) {
    return h`<section class="kart sonuc kaybetti" role="alert"><h2>${baslik}</h2>${s.el ? elCizimi(chat, s.el, true) : ''}<p class="hata">${s.hata}</p></section>`
  }
  const durum = s.fark > 0 ? 'kazandi' : s.fark < 0 ? 'kaybetti' : 'berabere'
  const ozet = s.fark > 0 ? `+${sayi.format(s.fark)} XP kazandın` : s.fark < 0 ? `${sayi.format(s.fark)} XP kaybettin` : 'Paran geri döndü'
  return h`<section class="kart sonuc ${durum}" role="status">
  <h2>${baslik}</h2>
  ${s.el ? elCizimi(chat, s.el, true) : tekCizim(s.oyun, s.sonuc)}
  ${s.sebep ? h`<p class="orta">${s.sebep}</p>` : ''}
  <p class="fark">${ozet}</p>
  ${s.kesilen ? h`<p class="hata">Günlük kumar tavanı doldu: ${sayi.format(s.kesilen)} XP kasada kaldı. Kumar yarına kadar kapalı.</p>` : ''}
  <p class="not orta">${sayi.format(s.once)} → ${sayi.format(s.xp)} XP</p>
</section>`
}

export function kumarhane({ chat, grupAdi, cokGrup, durum }) {
  const { xp, yasakBitis, el, sonuc } = durum
  const varsayilan = sonuc?.bahis ? String(sonuc.bahis) : ''
  const durumMetni = yasakBitis ? '🚫 Kumar yasağı' : xp < 500 ? '⚠️ 500 XP altı' : '✅ Masalar açık'
  const t = el && OYUN_ADI[el.oyun]

  return kabuk('Kumarhane', h`
<div class="kutular">
  <div class="kutu"><small>Cüzdan</small><strong>${sayi.format(xp)} XP</strong></div>
  <div class="kutu"><small>Durum</small><strong>${durumMetni}</strong>${yasakBitis ? h`<small>${saatBicimi.format(yasakBitis)}'e kadar</small>` : ''}</div>
</div>
${sonucKarti(chat, sonuc)}
${el ? h`<section class="kart sonuc"><h2>${t.ikon} ${t.ad}</h2>${elCizimi(chat, el)}</section>` : oyunlar(chat, varsayilan)}
<p class="not orta">Panel ile WhatsApp aynı XP'yi kullanır. Günlük kazanç tavanı ve yasaklar ortaktır.</p>
${cokGrup ? h`<p class="not orta"><a href="/oyun">Grubu değiştir</a></p>` : ''}`, { ust: grupAdi || 'Kumarhane' })
}
