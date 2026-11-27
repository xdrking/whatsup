// Panelin Emlak sayfası: mülk alma, satma, devretme ve efsaneviye yükseltme. Kurallar `lib/stats.js`'tedir
// (mulkAl, mulkSat, mulkDevret, mulkYukselt), burada yalnızca HTML çizilir. Yükseltmenin sonucu işlem anında
// belli olur; sayfa onu sandık kartı olarak çizer, panel/emlak.js açılışı oynatır. Betik yoksa sonuç düz görünür.
import { bozdurmaDegeri } from '../lib/coin.js'
import { MULKLER, YUKSELTME_ADEDI, yukseltmeSansi } from '../lib/mulk.js'
import { h } from './sayfalar.js'
import { satir, sayfa } from './hesapSayfalari.js'
import { hesapLink } from './oyunSayfalari.js'

const sayi = new Intl.NumberFormat('tr-TR')
const kompakt = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 })
// Intl binleri "B" yazar, milyar sanılıyor.
const kisa = (n) => kompakt.format(n).replace(/B$/, 'bin')
const xp = (n) => `${sayi.format(Math.round(n))} XP`
const yuzde = (n) => `%${String(n).replace('.', ',')}`
const emoji = (ad) => ad.split(' ')[0].replace('✨', '')

const SATILIK = MULKLER.filter((m) => !m.efsane)
const EFSANE = MULKLER.filter((m) => m.efsane)

/** Formun ortak gizli alanları. Tutar alanının adı `tutar`'dır (oyun.js `miktar` alanlarını eşitler). */
const gizli = (chat, islem, kod) =>
  h`<input type="hidden" name="grup" value="${chat}"><input type="hidden" name="sayfa" value="emlak"><input type="hidden" name="islem" value="${islem}"><input type="hidden" name="urun" value="${kod}">`

/** Bir mülkün saatlik kirası (günün kuruyla). */
const saatlikKira = (mulk, adet, kur) => Math.floor((adet * mulk.fiyat * kur * mulk.kiraYuzde) / 100)

/** Yükseltme sonucu: sandık açılışı. `kazandi`/`yandi` sınıfı betiksiz son hali çizer. */
function sandik(y, metin) {
  const konan = Array.from({ length: y.adet }, () => h`<span class="konan">${emoji(y.taban)}</span>`)
  return h`<section id="sandik" class="kart sandik-kart ${y.basarili ? 'kazandi' : 'yandi'}" data-basarili="${y.basarili ? '1' : '0'}" data-sans="${y.sans}" data-adet="${y.adet}" aria-live="polite">
  <h2>✨ Efsanevi yükseltme</h2>
  <div class="sandik-sahne">
    <div class="sandik-isin" aria-hidden="true"></div>
    <div class="sandik-konan" aria-hidden="true">${konan}</div>
    <div class="sandik" aria-hidden="true"><div class="sandik-kapak"></div><div class="sandik-govde"><span class="sandik-kilit"></span></div></div>
    <div class="odul" aria-hidden="true"><div class="odul-ic">
      <div class="odul-yuz on"><b>${emoji(y.efsane)}</b><span>EFSANEVİ</span><small>${y.efsane.replace(/^\S+\s/, '')}</small></div>
      <div class="odul-yuz arka"><b>💨</b><span>YANDI</span><small>${y.adet} ${y.taban.replace(/^\S+\s/, '')}</small></div>
    </div></div>
  </div>
  <div class="sandik-sans">${y.adet} ${y.taban} · şans <b>%${y.sans}</b></div>
  <p class="sandik-sonuc">${y.basarili ? '✨ TUTTU! ' : '💥 '}${metin}</p>
  ${y.kira ? h`<p class="not">Konanların birikmiş kirası ödendi: +${xp(y.kira)}</p>` : ''}
  <button type="button" class="sandik-gec ikincil" hidden>Geç ⏩</button>
</section>`
}

function sahipKarti(chat, m, kur, uyeler) {
  const { mulk, adet } = m
  const azami = Math.min(adet, YUKSELTME_ADEDI)
  const secenekler = Array.from({ length: azami }, (_, i) => azami - i)
  return h`<article class="mulk-kart${mulk.efsane ? ' efsane' : ''}">
  <div class="mulk-ust">
    <span class="mulk-ikon" aria-hidden="true">${emoji(mulk.ad)}</span>
    <span class="mulk-ad"><strong>${mulk.ad.replace(/^\S+\s/, '')}</strong><small>${sayi.format(adet)} tane · ${mulk.kiraYuzde ? `saatlik ${yuzde(mulk.kiraYuzde)}` : 'kira yok'}${kur && mulk.kiraYuzde ? ` · ${xp(saatlikKira(mulk, adet, kur))}/sa` : ''}</small></span>
    ${m.kira ? h`<span class="rozet">kira ${kisa(m.kira)}</span>` : ''}
  </div>
  <div class="mulk-isler">
    ${mulk.efsane ? '' : h`<form class="islem mulk-yukselt" method="post" action="/oyun/islem">${gizli(chat, 'mulk-yukselt', mulk.kod)}
      <label class="alan"><small>✨ Efsaneviye yükselt</small><select name="tutar">${secenekler.map((n) => h`<option value="${n}">${n} tane · %${yukseltmeSansi(n)}</option>`)}</select></label>
      <button class="yukselt-dugme">✨ YÜKSELT</button>
    </form>`}
    <form class="islem" method="post" action="/oyun/islem">${gizli(chat, 'mulk-sat', mulk.kod)}
      <label class="alan"><small>Sat · tanesi ${kur ? xp(bozdurmaDegeri(mulk.fiyat, kur)) : '—'}</small><input name="tutar" value="1" inputmode="numeric" autocomplete="off" required></label>
      <button class="ikincil">SAT</button>
    </form>
    ${uyeler.length ? h`<form class="islem" method="post" action="/oyun/islem">${gizli(chat, 'mulk-devret', mulk.kod)}
      <label class="alan"><small>Devret · kime</small><select name="hedef" required><option value="">Seç…</option>${uyeler.map((u) => h`<option value="${u.jid}">${u.ad}</option>`)}</select></label>
      <label class="alan adet"><small>Adet</small><input name="tutar" value="1" inputmode="numeric" autocomplete="off" required></label>
      <button class="ikincil">DEVRET</button>
    </form>` : ''}
  </div>
</article>`
}

export function emlakSayfasi(veri) {
  const { chat, durum, emlak } = veri
  const e = durum.ekonomi
  const coin = durum.coin?.bakiye ?? 0
  const kira = durum.mulkler.reduce((t, m) => t + m.kira, 0)
  const y = durum.bildirim?.yukselt
  const gosterilen = y ? { ...veri, durum: { ...durum, bildirim: null } } : veri

  return sayfa('Emlak', '🏘️ Emlak', 'emlak', gosterilen, h`
${y ? sandik(y, durum.bildirim.tamam) : ''}
<section class="kart hesap-kart">
  <h2>Tapun</h2>
  ${satir('🪙', 'Coinin', sayi.format(coin))}
  ${e ? satir('⏱️', 'Saatlik kira', xp(durum.mulkler.reduce((t, m) => t + saatlikKira(m.mulk, m.adet, e.gunKur), 0))) : ''}
  ${durum.mulkler.length
    ? h`<div class="isler"><form class="islem duz" method="post" action="/oyun/islem">${gizli(chat, 'kira', '')}<button>🏠 Kira topla${kira ? ` · ${xp(kira)}` : ''}</button></form></div>
  <div class="mulk-liste">${durum.mulkler.map((m) => sahipKarti(chat, m, e?.gunKur, emlak.uyeler))}</div>`
    : h`<p class="not">Henüz mülkün yok. Aşağıdan coinle alabilirsin.</p>`}
  <p class="not">Kira saat başı birikir, toplanmazsa 24 saatte durur. Satınca ya da devredince birikmiş kira sana ödenir. Borçluyken ya da ambargodayken devredilemez.</p>
</section>
<section class="kart hesap-kart">
  <h2>Emlak piyasası</h2>
  <div class="mulk-pazar">
  ${SATILIK.map((m) => h`<form class="pazar-kart" method="post" action="/oyun/islem">${gizli(chat, 'mulk-al', m.kod)}
    <span class="mulk-ikon" aria-hidden="true">${emoji(m.ad)}</span>
    <strong>${m.ad.replace(/^\S+\s/, '')}</strong>
    <small>${m.kiraYuzde ? `saatlik ${yuzde(m.kiraYuzde)}` : 'kira yok'}${e && m.kiraYuzde ? ` · ${kisa(saatlikKira(m, 1, e.gunKur))} XP/sa` : ''}</small>
    <button${coin < m.fiyat ? ' class="ikincil"' : ''}>🪙 ${m.fiyat} coin${e ? h`<small>≈ ${kisa(m.fiyat * e.alisKur)} XP</small>` : ''}</button>
  </form>`)}
  </div>
  <p class="not">Mülk coinle alınır. Coinin yoksa <a href="${hesapLink(chat, 'coin')}">🪙 Coin borsası</a>ndan al. Satış coin gibi günün kurunun %90'ıdır.</p>
</section>
<section class="kart hesap-kart">
  <h2>✨ Efsanevi mülkler</h2>
  <div class="mulk-pazar">
  ${EFSANE.map((m) => h`<div class="pazar-kart efsane">
    <span class="mulk-ikon" aria-hidden="true">${emoji(m.ad)}</span>
    <strong>${m.ad.replace(/^\S+\s/, '')}</strong>
    <small>saatlik ${yuzde(m.kiraYuzde)} · ${m.fiyat} coin değerinde</small>
  </div>`)}
  </div>
  <p class="not">Satın alınmaz. Aynı mülkten ${YUKSELTME_ADEDI} tane koyarsan kesin çıkar, daha azında tanesi %${yukseltmeSansi(1)} şanstır; tutmazsa konanlar yanar. Efsanevinin değeri konan ${YUKSELTME_ADEDI} mülke eşittir, kira yüzdesi 3 katıdır.</p>
</section>`)
}
