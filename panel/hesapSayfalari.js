// Panelin hesap bölümünün HTML'i: servet dökümü, banka ve kredi, coin ve mülk.
// Tutar alanının adı `tutar`'dır, `miktar` değil: oyun.js bahis alanlarını (`miktar`) birbirine eşitler.
import { CEKIM_KESINTI_YUZDESI, oranYaz } from '../lib/banka.js'
import { BOZDURMA_YUZDESI, bozdurmaDegeri } from '../lib/coin.js'
import { KREDI_VADE_SAATI, MIN_KREDI } from '../lib/kredi.js'
import { h, kabuk } from './sayfalar.js'
import { hesapLink, kasa, yanMenu } from './oyunSayfalari.js'

const sayi = new Intl.NumberFormat('tr-TR')
const xp = (n) => `${sayi.format(n)} XP`
const dakika = (ms) => {
  const dk = Math.max(1, Math.ceil(ms / 60_000))
  return dk >= 60 ? `${Math.floor(dk / 60)} sa ${dk % 60} dk` : `${dk} dk`
}

export const HESAP_SAYFALARI = ['hesap', 'banka', 'coin']

const bildirim = (b) => (b
  ? h`<p id="bildirim" class="bildirim ${b.hata ? 'olmadi' : 'oldu'}" role="status">${b.hata ? '⚠️' : '✅'} ${b.hata ?? b.tamam}</p>`
  : '')

/** `alan` verilirse tutar kutusu çıkar; `hepsi` hızlı düğmesi oyun.js ile açılır. */
function islemFormu(chat, sayfa, islem, etiket, { alan = '', yer = '', sinif = '' } = {}) {
  return h`<form class="islem${alan ? '' : ' duz'}" method="post" action="/oyun/islem">
  <input type="hidden" name="grup" value="${chat}"><input type="hidden" name="sayfa" value="${sayfa}"><input type="hidden" name="islem" value="${islem}">
  ${alan ? h`<label class="alan"><small>${alan}</small><input name="tutar" placeholder="${yer}" autocomplete="off" required></label>` : ''}
  <button class="${sinif}">${etiket}</button>
</form>`
}

const satir = (ikon, ad, deger, sinif = '') => h`<div class="satir"><span class="ad"><span aria-hidden="true">${ikon}</span> ${ad}</span><span class="deger ${sinif}">${deger}</span></div>`
const varsa = (ikon, ad, n, sinif = '') => (n ? satir(ikon, ad, xp(n), sinif) : '')

function sayfa(baslik, ust, secili, { chat, cokGrup, durum }, icerik) {
  return kabuk(baslik, h`
${kasa({ xp: durum.banka?.xp ?? durum.servet?.cuzdan ?? 0, dar: true })}
${bildirim(durum.bildirim)}
${icerik}`, { ust, kumarhane: true, yan: yanMenu({ chat, cokGrup, secili }) })
}

export function hesapSayfasi(veri) {
  const { chat, durum } = veri
  const { servet: s, meslek, mulkler, simdi } = durum
  const kira = mulkler.reduce((t, m) => t + m.kira, 0)
  const bekleme = meslek?.sonraki > simdi ? ` · ${dakika(meslek.sonraki - simdi)} sonra` : ''

  return sayfa('Hesabım', '💎 Hesabım', 'hesap', veri, h`
<section class="kart hesap-kart">
  <h2>Servet dökümü</h2>
  ${s ? h`
  ${satir('👛', 'Cüzdan', xp(s.cuzdan), s.cuzdan < 0 ? 'eksi' : '')}
  ${satir('🏦', 'Banka', xp(s.banka))}
  ${s.coinAdet ? satir('🪙', `Coin · ${sayi.format(s.coinAdet)} adet`, `≈ ${xp(s.coin)}`) : ''}
  ${varsa('🟠', 'Suly', s.kripto)}
  ${varsa('🏠', 'Mülk ve kira', s.mulk)}
  ${varsa('📈', 'Hisse', s.borsa)}
  ${varsa('💼', 'Yatırım', s.yatirim)}
  ${varsa('🤝', 'Tefeci alacağı', s.alacak)}
  ${varsa('💳', 'Kredi borcu', s.kredi, 'eksi')}
  ${varsa('🦈', 'Tefeci borcu', s.tefeci, 'eksi')}
  <div class="satir net"><span class="ad">🧾 Net servet</span><span class="deger">${xp(s.net)}</span></div>` : h`<p class="not">Servet şu an hesaplanamıyor.</p>`}
  <p class="hizli"><a href="${hesapLink(chat, 'banka')}">🏦 Banka ve kredi ›</a><a href="${hesapLink(chat, 'coin')}">🪙 Coin ve mülk ›</a></p>
</section>
<section class="kart hesap-kart">
  <h2>Günlük işler</h2>
  <div class="isler">
    ${islemFormu(chat, 'hesap', 'gunluk', '🎁 Günlük ödülü al')}
    ${islemFormu(chat, 'hesap', 'calis', `💼 Çalış${meslek?.meslek?.ad ? ` · ${meslek.meslek.ad}` : ''}${bekleme}`)}
    ${islemFormu(chat, 'hesap', 'kira', `🏠 Kira topla${kira ? ` · ${xp(kira)}` : ''}`)}
  </div>
  <p class="not">Meslek seçimi, market, soygun ve grup oyunları WhatsApp'ta kalır: onlar grupta herkesin gördüğü komutlardır.</p>
</section>`)
}

export function bankaSayfasi(veri) {
  const { chat, durum } = veri
  const { banka, kredi, faiz, simdi } = durum
  if (!banka) return sayfa('Banka', '🏦 Banka ve kredi', 'banka', veri, h`<section class="kart"><p class="not">Banka şu an kapalı.</p></section>`)

  return sayfa('Banka', '🏦 Banka ve kredi', 'banka', veri, h`
<section class="kart hesap-kart">
  <h2>Banka</h2>
  ${satir('💰', 'Hesap', xp(banka.bakiye))}
  ${satir('👛', 'Cüzdan', xp(banka.xp), banka.xp < 0 ? 'eksi' : '')}
  ${satir(faiz.banka < 0 ? '📉' : '📈', 'Saatlik faiz', `%${oranYaz(faiz.banka)}`)}
  ${banka.faiz ? satir('✨', 'Yeni işlenen faiz', `${banka.faiz > 0 ? '+' : ''}${xp(banka.faiz)}`) : ''}
  ${varsa('💸', 'Son vergi', banka.sonVergi)}
  <div class="islemler">
    ${islemFormu(chat, 'banka', 'banka-yatir', 'YATIR', { alan: 'Yatır', yer: '1000, 5m, hepsi' })}
    ${islemFormu(chat, 'banka', 'banka-cek', 'ÇEK', { alan: `Çek · %${CEKIM_KESINTI_YUZDESI} kesinti`, yer: '1000, 5m, hepsi', sinif: 'ikincil' })}
  </div>
  <p class="not">Bankadaki XP soyulamaz, kumarda kullanılmaz. Yeni yatırılan para tam bir saat durmadan faiz almaz.</p>
</section>
<section class="kart hesap-kart">
  <h2>Kredi</h2>
  ${kredi ? h`
  ${kredi.borc
    ? h`${satir('📉', 'Borç', xp(kredi.borc), 'eksi')}${satir('⏰', 'Vadeye', kredi.vade > simdi ? dakika(kredi.vade - simdi) : 'doldu')}`
    : satir('✅', 'Borç', 'yok')}
  ${satir('🏷️', 'Limit', xp(kredi.limit))}
  ${satir('📈', 'Saatlik faiz', `%${oranYaz(faiz.kredi)}`)}
  <div class="islemler">
    ${kredi.borc
      ? islemFormu(chat, 'banka', 'kredi-ode', 'ÖDE', { alan: 'Borç öde', yer: '1000, hepsi' })
      : islemFormu(chat, 'banka', 'kredi-cek', 'KREDİ ÇEK', { alan: `Tutar · en az ${MIN_KREDI} XP`, yer: '1000' })}
  </div>
  <p class="not">Vade ${KREDI_VADE_SAATI} saat. Dolunca borç cüzdandan, sonra bankadan alınır, kalanı cüzdana eksi yazılır. Borç varken yatırılan para önce borcu keser.</p>` : h`<p class="not">Kredi servisi şu an kapalı.</p>`}
</section>`)
}

export function coinSayfasi(veri) {
  const { chat, durum } = veri
  const { coin, ekonomi, mulkler } = durum
  const kira = mulkler.reduce((t, m) => t + m.kira, 0)

  return sayfa('Coin', '🪙 Coin ve mülk', 'coin', veri, h`
<section class="kart hesap-kart">
  <h2>Coin</h2>
  ${satir('🪙', 'Coinin', sayi.format(coin.bakiye))}
  ${ekonomi ? h`
  ${satir('💱', 'Anlık kur', xp(ekonomi.kur))}
  ${satir('↩️', `Bozdurma · %${BOZDURMA_YUZDESI}`, xp(bozdurmaDegeri(1, ekonomi.bozdurmaKur)))}
  <div class="islemler">
    ${islemFormu(chat, 'coin', 'coin-al', 'AL', { alan: 'Coin al', yer: 'adet' })}
    ${islemFormu(chat, 'coin', 'coin-sat', 'BOZDUR', { alan: 'Coin bozdur', yer: 'adet', sinif: 'ikincil' })}
  </div>
  <p class="not">Kur gün içinde çıktıysa bozdurma günün ilk kuruyla yapılır. Açık kredin varken coin alamazsın.</p>` : h`<p class="not">Coin market şu an kapalı.</p>`}
</section>
<section class="kart hesap-kart">
  <h2>Mülkler</h2>
  ${mulkler.length
    ? h`${mulkler.map((m) => satir('🏠', `${m.mulk.ad} · ${m.adet} adet`, m.kira ? `kira ${xp(m.kira)}` : 'kira yok'))}
  <div class="isler">${islemFormu(chat, 'coin', 'kira', `🏠 Kira topla${kira ? ` · ${xp(kira)}` : ''}`)}</div>`
    : h`<p class="not">Mülkün yok.</p>`}
  <p class="not">Mülk alım satımı WhatsApp'ta: <code>.mülk</code></p>
</section>`)
}
