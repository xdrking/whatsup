// Panelin hesap bölümünün HTML'i: servet dökümü, banka ve kredi, coin ve mülk.
// Tutar alanının adı `tutar`'dır, `miktar` değil: oyun.js bahis alanlarını (`miktar`) birbirine eşitler.
import { CEKIM_KESINTI_YUZDESI, oranYaz } from '../lib/banka.js'
import { BANKALAR, KUR_LIMIT_ORANI, KREDI_LIMITI, krediBankasi, krediUrunu, MIN_KREDI, tahsisUcreti, vadeBorcu } from '../lib/kredi.js'
import { h, kabuk } from './sayfalar.js'
import { hesapLink, kasa, yanMenu } from './oyunSayfalari.js'

const sayi = new Intl.NumberFormat('tr-TR')
const xp = (n) => `${sayi.format(n)} XP`
const dakika = (ms) => {
  const dk = Math.max(1, Math.ceil(ms / 60_000))
  return dk >= 60 ? `${Math.floor(dk / 60)} sa ${dk % 60} dk` : `${dk} dk`
}

export const HESAP_SAYFALARI = ['hesap', 'banka', 'coin', 'suly', 'sulymarket']

const bildirim = (b) => (b
  ? h`<p id="bildirim" class="bildirim ${b.hata ? 'olmadi' : 'oldu'}" role="status">${b.hata ? '⚠️' : '✅'} ${b.hata ?? b.tamam}</p>`
  : '')

/** `alan` verilirse tutar kutusu çıkar; `hepsi` hızlı düğmesi oyun.js ile açılır. */
export function islemFormu(chat, sayfa, islem, etiket, { alan = '', yer = '', sinif = '', urun = '', deger = '' } = {}) {
  return h`<form class="islem${alan ? '' : ' duz'}" method="post" action="/oyun/islem">
  <input type="hidden" name="grup" value="${chat}"><input type="hidden" name="sayfa" value="${sayfa}"><input type="hidden" name="islem" value="${islem}">${urun ? h`<input type="hidden" name="urun" value="${urun}">` : ''}
  ${alan ? h`<label class="alan"><small>${alan}</small><input name="tutar" placeholder="${yer}" value="${deger}" autocomplete="off" required></label>` : ''}
  <button class="${sinif}">${etiket}</button>
</form>`
}

export const satir = (ikon, ad, deger, sinif = '') => h`<div class="satir"><span class="ad"><span aria-hidden="true">${ikon}</span> ${ad}</span><span class="deger ${sinif}">${deger}</span></div>`
const varsa = (ikon, ad, n, sinif = '') => (n ? satir(ikon, ad, xp(n), sinif) : '')

export function sayfa(baslik, ust, secili, { chat, cokGrup, durum }, icerik) {
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
  ${varsa('🖼️', 'NFT', s.nft)}
  ${varsa('🏝️', 'Offshore (gizli, nete girmez)', s.offshore)}
  ${varsa('🏠', 'Mülk ve kira', s.mulk)}
  ${varsa('📈', 'Hisse', s.borsa)}
  ${varsa('💼', 'Yatırım', s.yatirim)}
  ${varsa('🤝', 'Tefeci alacağı', s.alacak)}
  ${varsa('💳', 'Kredi borcu', s.kredi, 'eksi')}
  ${varsa('🦈', 'Tefeci borcu', s.tefeci, 'eksi')}
  <div class="satir net"><span class="ad">🧾 Net servet</span><span class="deger">${xp(s.net)}</span></div>` : h`<p class="not">Servet şu an hesaplanamıyor.</p>`}
  <p class="hizli"><a href="${hesapLink(chat, 'banka')}">🏦 Banka ve kredi ›</a><a href="${hesapLink(chat, 'coin')}">🪙 Coin borsası ›</a><a href="${hesapLink(chat, 'suly')}">🟠 Suly borsası ›</a><a href="${hesapLink(chat, 'sulymarket')}">🕶️ SulyMarket ›</a></p>
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
${krediBolumu(chat, kredi, simdi)}`)
}

const kat = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 })
const saatYaz = (ms) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ms)

/** Kredi ürününün vade seçenekleri ve limitin tamamı çekilirse vadedeki borç. */
function vadeTablosu(u) {
  const [en, boy] = u.vade
  const vadeler = [...new Set([en, Math.round((en + boy) / 2), boy])]
  const miktar = Math.max(u.limit, MIN_KREDI)
  return h`<table class="kredi-tablo"><caption>Limitin tamamı çekilirse (${xp(miktar)})</caption><thead><tr><th>Vade</th><th>Vadede borç</th><th>Faiz</th><th>Kat</th></tr></thead><tbody>
    ${vadeler.map((v) => {
      const borc = vadeBorcu(miktar, v, u.faiz)
      return h`<tr><td>${v} saat</td><td>${sayi.format(borc)}</td><td>${sayi.format(borc - miktar)}</td><td>${kat.format(borc / miktar)}x</td></tr>`
    })}
  </tbody></table>`
}

function krediFormu(chat, u) {
  const vadeler = Array.from({ length: u.vade[1] - u.vade[0] + 1 }, (_, i) => u.vade[0] + i)
  return h`<form class="islem kredi-form" method="post" action="/oyun/islem">
  <input type="hidden" name="grup" value="${chat}"><input type="hidden" name="sayfa" value="banka"><input type="hidden" name="islem" value="kredi-cek"><input type="hidden" name="urun" value="${u.no}">
  <label class="alan"><small>Tutar · en az ${MIN_KREDI} XP</small><input name="tutar" placeholder="1000, 5m, max" autocomplete="off" required></label>
  <label class="alan vade"><small>Vade</small><select name="vade">${vadeler.map((v) => h`<option value="${v}"${v === u.vade[1] ? ' selected' : ''}>${v} saat</option>`)}</select></label>
  <button>KREDİ ÇEK</button>
</form>`
}

function urunKarti(chat, u, borcVar) {
  return h`<div class="kredi-urun">
  <h4>${u.no}. ${u.ad}</h4>
  ${satir('🏷️', 'Limit', xp(u.limit))}
  ${satir('📈', 'Saatlik faiz', `%${oranYaz(u.faiz)} (banka +${oranYaz(u.fark)})`)}
  ${satir('⏰', 'Vade', `${u.vade[0]}-${u.vade[1]} saat, sen seçersin`)}
  ${satir('🧾', 'Tahsis ücreti', u.ucret ? `%${oranYaz(u.ucret)} · limitte ${xp(tahsisUcreti(u, u.limit))}` : 'yok')}
  ${satir('📊', 'Limit katı', `taban × ${u.limitKat}`)}
  ${vadeTablosu(u)}
  ${borcVar ? '' : krediFormu(chat, u)}
</div>`
}

function krediBolumu(chat, kredi, simdi) {
  if (!kredi) return h`<section class="kart hesap-kart"><h2>Kredi</h2><p class="not">Kredi servisi şu an kapalı.</p></section>`
  const k = kredi.kredi
  const u = k ? krediUrunu(k.urun) : null
  const b = u ? krediBankasi(u.banka) : null
  const kalanSaat = k ? Math.max(0, Math.ceil((k.vade - simdi) / 3_600_000)) : 0
  return h`<section class="kart hesap-kart">
  <h2>Kredi</h2>
  ${k ? h`
  ${satir('🏦', 'Banka', b ? `${b.simge} ${b.ad} · ${u.ad}` : 'Eski kredi')}
  ${k.anapara ? satir('💰', 'Çekilen', xp(k.anapara)) : ''}
  ${satir('📉', 'Şu anki borç', xp(k.borc), 'eksi')}
  ${satir('📈', 'Saatlik faiz', `%${oranYaz(k.faiz)}`)}
  ${k.baslangic ? satir('🕐', 'Çekildi', saatYaz(k.baslangic)) : ''}
  ${satir('⏰', 'Vade', k.vade > simdi ? `${saatYaz(k.vade)} · ${dakika(k.vade - simdi)} kaldı` : 'doldu')}
  ${satir('🔮', 'Hiç ödemezsen vadede', xp(vadeBorcu(k.borc, kalanSaat, k.faiz)), 'eksi')}
  <div class="islemler">${islemFormu(chat, 'banka', 'kredi-ode', 'ÖDE', { alan: 'Borç öde', yer: '1000, hepsi' })}</div>
  <p class="not">Vade dolunca borç cüzdandan, sonra bankadan alınır, kalanı cüzdana eksi yazılır. Borç varken yatırılan para önce borcu keser. Yeni kredi için önce bunu kapat.</p>`
  : satir('✅', 'Borç', 'yok')}
  ${satir('📊', 'Taban limit', xp(kredi.tabanLimit))}
  ${satir('🪙', 'Coin kuru (anlık)', xp(kredi.kur))}
  ${satir('🏛️', 'Merkez hazine', xp(kredi.kasa))}
  ${satir('📈', 'Banka faizi', `%${oranYaz(kredi.bankaFaizi)}/saat`)}
  <p class="not">Bütün bankalar merkez hazineden verir, ödemeler hazineye döner. Taban limit anlık coin kurunun %${KUR_LIMIT_ORANI * 100}'idir, en az ${xp(KREDI_LIMITI)}: enflasyon arttıkça limitler büyür. Tek kredi hazinenin yarısını geçemez. Faiz saat başlarında bileşik işler, tahsis ücreti peşin kesilir.</p>
</section>
${BANKALAR.map((bk) => h`<section class="kart hesap-kart kredi-banka">
  <h2>${bk.simge} ${bk.ad}</h2>
  <p class="not">${bk.not}</p>
  ${kredi.urunler.filter((x) => x.banka === bk.kod).map((x) => urunKarti(chat, x, Boolean(k)))}
</section>`)}`
}
