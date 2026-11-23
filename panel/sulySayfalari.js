// Suly borsası (canlı fiyat, grafikler, alım satım) ve SulyMarket'in HTML'i. Grafikler sunucuda SVG çizilir:
// betik yoksa da görünür, oyun.js yalnızca canlı yeniler ve üstüne gelinen noktayı okur.
import { BIRIM, GRAFIK_ARALIKLARI, SATIS_KESINTI, sulyDegeri, sulyFiyati, sulySatisDegeri, sulyYaz } from '../lib/kripto.js'
import { NADIRLIK, NFT_GERI_ALIM, NFTLER } from '../lib/nft.js'
import { HACK_GUNLUK, URUNLER, urunKoduyla, urunNotu } from '../lib/sulymarket.js'
import { displayName } from '../lib/target.js'
import { h } from './sayfalar.js'
import { islemFormu, satir, sayfa } from './hesapSayfalari.js'
import { hesapLink } from './oyunSayfalari.js'

const sayi = new Intl.NumberFormat('tr-TR')
const xp = (n) => `${sayi.format(Math.round(n))} XP`
const dolar = (n) => `$${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: n < 100 ? 2 : 0 }).format(n)}`
const kompakt = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 })
// Intl binleri "B" yazar, milyar sanılıyor.
const kisa = (n) => kompakt.format(n).replace(/B$/, 'bin')
const yuzde = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 })
const bicim = (secenek) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', ...secenek })
const saatBicimi = bicim({ hour: '2-digit', minute: '2-digit' })
const saniyeBicimi = bicim({ hour: '2-digit', minute: '2-digit', second: '2-digit' })
const gunBicimi = bicim({ day: 'numeric', month: 'short' })
const tamBicim = bicim({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const gunAnahtari = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' })
const dakika = (ms) => {
  const dk = Math.max(1, Math.ceil(ms / 60_000))
  return dk >= 1440 ? `${Math.floor(dk / 1440)} gün ${Math.floor((dk % 1440) / 60)} sa` : dk >= 60 ? `${Math.floor(dk / 60)} sa ${dk % 60} dk` : `${dk} dk`
}

function eksenAdimlari(enAz, enCok) {
  const aralik = enCok - enAz || enCok * 0.02 || 1
  const us = 10 ** Math.floor(Math.log10(aralik / 3))
  const oran = aralik / 3 / us
  const adim = (oran <= 1 ? 1 : oran <= 2 ? 2 : oran <= 5 ? 5 : 10) * us
  const taban = Math.floor(enAz / adim) * adim
  const tavan = Math.max(Math.ceil(enCok / adim) * adim, taban + adim)
  const cizgiler = []
  for (let f = taban; f <= tavan + adim / 2; f += adim) cizgiler.push(f)
  return { taban, tavan, cizgiler }
}

/** @param {{ zaman: number, deger: number }[]} noktalar eskiden yeniye */
function cizgi(noktalar, { kimlik, sinif, boy, en, yukseklik, eksen, yaz, zaman, ipucu, ad }) {
  const sol = 6
  const sag = en - 58
  const ust = 12
  const alt = yukseklik - 24
  const t0 = noktalar[0].zaman
  const t1 = noktalar.at(-1).zaman
  const degerler = noktalar.map((n) => n.deger)
  const { taban, tavan, cizgiler } = eksenAdimlari(Math.min(...degerler), Math.max(...degerler))
  const x = (t) => sol + ((t - t0) / (t1 - t0 || 1)) * (sag - sol)
  const y = (d) => alt - ((d - taban) / (tavan - taban || 1)) * (alt - ust)
  const yazi = noktalar.map((n) => `${x(n.zaman).toFixed(1)},${y(n.deger).toFixed(1)}`).join(' ')
  const adet = boy === 'dar' ? 3 : 5
  const etiketler = Array.from({ length: adet }, (_, i) => t0 + ((t1 - t0) * (i + 0.5)) / adet)
  const son = noktalar.at(-1)
  const dolgu = `dolgu-${kimlik}-${boy}`
  const ozet = `${ad}: en düşük ${yaz(Math.min(...degerler))}, en yüksek ${yaz(Math.max(...degerler))}, son ${yaz(son.deger)}`

  return h`<svg class="cizgi-grafik ${sinif} ${boy}" viewBox="0 0 ${en} ${yukseklik}" role="img" aria-label="${ozet}">
  <defs><linearGradient id="${dolgu}" x1="0" y1="0" x2="0" y2="1"><stop class="cg-ust" offset="0"/><stop class="cg-alt" offset="1"/></linearGradient></defs>
  ${cizgiler.map((d) => h`<line class="cg-izgara" x1="${sol}" x2="${sag}" y1="${y(d).toFixed(1)}" y2="${y(d).toFixed(1)}"/><text class="cg-eksen" font-size="11" fill="#9b93ad" x="${sag + 8}" y="${(y(d) + 4).toFixed(1)}">${eksen(d)}</text>`)}
  ${etiketler.map((t) => h`<text class="cg-eksen" font-size="11" fill="#9b93ad" text-anchor="middle" x="${x(t).toFixed(1)}" y="${yukseklik - 6}">${zaman(t)}</text>`)}
  <polygon fill="url(#${dolgu})" points="${sol},${alt} ${yazi} ${x(son.zaman).toFixed(1)},${alt}"/>
  <polyline class="cg-hat" fill="none" stroke-width="2" points="${yazi}"/>
  <line class="cg-imlec" x1="0" x2="0" y1="${ust}" y2="${alt}" visibility="hidden"/>
  <circle class="cg-son" r="4.5" cx="${x(son.zaman).toFixed(1)}" cy="${y(son.deger).toFixed(1)}"/>
  ${noktalar.map((n, i) => {
    const px = x(n.zaman)
    const bas = i ? (x(noktalar[i - 1].zaman) + px) / 2 : sol
    const bit = i + 1 < noktalar.length ? (px + x(noktalar[i + 1].zaman)) / 2 : sag
    const metin = `${ipucu(n.zaman)} · ${yaz(n.deger)}`
    return h`<rect class="cg-vuru" fill="transparent" x="${bas.toFixed(1)}" y="0" width="${Math.max(bit - bas, 0.5).toFixed(1)}" height="${yukseklik}" data-x="${px.toFixed(1)}" data-y="${y(n.deger).toFixed(1)}" data-yazi="${metin}"><title>${metin}</title></rect>`
  })}
</svg>`
}

function grafik(noktalar, ayar) {
  if (noktalar.length < 2) return h`<p class="not">${ayar.bos}</p>`
  return h`<div class="grafik-kutu"><p class="okuma" aria-live="off">${ayar.okuma}</p>
  ${cizgi(noktalar, { ...ayar, boy: 'dar', en: 380, yukseklik: ayar.kucuk ? 170 : 230 })}
  ${cizgi(noktalar, { ...ayar, boy: 'genis', en: ayar.kucuk ? 420 : 860, yukseklik: ayar.kucuk ? 200 : 320 })}</div>`
}

const kutucuk = (ad, deger, alt = '', sinif = '') => h`<div class="kutucuk"><small>${ad}</small><strong class="${sinif}">${deger}</strong>${alt ? h`<small>${alt}</small>` : ''}</div>`

/** Günlük kapanış × o günün kuru: 1 Suly'nin XP geçmişi. Kuru bilinmeyen gün çizilmez. */
function xpGecmisi(gunler, kurlar, usd, kur, simdi) {
  const kurHaritasi = new Map(kurlar.map((r) => [r.day, r.kur]))
  const bugun = gunAnahtari.format(simdi)
  const noktalar = gunler
    // Mum süresi sonunu taşır; 1 ms geri alınca kapandığı gün bulunur.
    .map((n) => ({ gun: gunAnahtari.format(n.zaman - 1), zaman: n.zaman, usd: n.usd }))
    .filter((n) => n.gun !== bugun && kurHaritasi.has(n.gun))
    .map((n) => ({ zaman: n.zaman, deger: sulyFiyati(n.usd, kurHaritasi.get(n.gun)) }))
  return usd ? [...noktalar, { zaman: simdi, deger: sulyFiyati(usd, kur) }] : noktalar
}

/** Canlı bölüm: 20 sn'de bir `/oyun/suly-canli` ile yerinde yenilenir. */
export function sulyCanli(v) {
  const { chat, aralik, anlik, noktalar, gunler, simdi, kur, dolasim = 0, kurlar = [], ekonomi, sonFiyat } = v
  const usd = anlik?.usd ?? sonFiyat?.usd ?? 0
  const tanim = GRAFIK_ARALIKLARI[aralik]
  const seri = noktalar.map((n) => ({ zaman: n.zaman, deger: n.usd }))
  if (anlik && seri.length && simdi > seri.at(-1).zaman) seri.push({ zaman: simdi, deger: anlik.usd })
  else if (anlik && seri.length) seri[seri.length - 1] = { zaman: simdi, deger: anlik.usd }
  const ilk = seri[0]?.deger
  const oran = ilk && usd ? ((usd - ilk) / ilk) * 100 : 0
  const gunlukMu = tanim.sn >= 3600
  const kurSerisi = kurlar.map((r) => ({ zaman: Date.parse(`${r.day}T00:00:00+03:00`), deger: r.kur }))
  if (ekonomi) kurSerisi.push({ zaman: simdi, deger: ekonomi.kur })
  const xpSerisi = kur ? xpGecmisi(gunler, kurlar, usd, kur, simdi) : []
  const gunIpucu = (t) => (simdi - t < 1000 ? 'şimdi' : gunBicimi.format(t - 1))

  return h`<div id="suly-canli" data-adres="/oyun/suly-canli?grup=${encodeURIComponent(chat)}&amp;aralik=${aralik}">
<section class="kart suly-kart">
  <div class="suly-bas">
    <div><small>1 🟠 Suly</small><strong class="suly-fiyat">${usd ? dolar(usd) : '—'}</strong></div>
    <div class="suly-yan">
      ${seri.length > 1 ? h`<span class="yon ${oran >= 0 ? 'artis' : 'dusus'}">${oran >= 0 ? '▲' : '▼'} %${yuzde.format(Math.abs(oran))} <small>${tanim.ad}</small></span>` : ''}
      <span class="canli${anlik ? '' : ' kopuk'}">${anlik ? `● Canlı · ${saniyeBicimi.format(simdi)}` : '○ Fiyat alınamıyor, alım satım kapalı'}</span>
    </div>
  </div>
  <nav class="aralik" aria-label="Grafik aralığı">${Object.entries(GRAFIK_ARALIKLARI).map(([ad, a]) => h`<a href="${hesapLink(chat, 'suly')}&amp;aralik=${ad}"${ad === aralik ? h` class="secili" aria-current="true"` : ''}>${a.ad}</a>`)}</nav>
  ${grafik(seri, {
    kimlik: 'usd', sinif: 'usd', ad: 'Suly dolar fiyatı', bos: 'Grafik şu an alınamıyor, birazdan kendiliğinden gelir.', okuma: `Suly / dolar · ${tanim.ad}`,
    eksen: dolar, yaz: dolar, ipucu: (t) => tamBicim.format(t), zaman: (t) => (gunlukMu ? gunBicimi.format(t) : saatBicimi.format(t)),
  })}
  <div class="kutucuklar">
    ${kutucuk('XP karşılığı', usd && kur ? xp(sulyFiyati(usd, kur)) : '—', '1 Suly')}
    ${kutucuk('Coin kuru', ekonomi ? xp(ekonomi.kur) : '—', 'anlık')}
    ${kutucuk('Piyasadaki para', ekonomi ? `${kisa(ekonomi.anlik)} XP` : '—')}
    ${kutucuk('Dolaşımdaki Suly', sulyYaz(dolasim), usd && kur ? `≈ ${kisa(sulyDegeri(dolasim, usd, kur))} XP` : '')}
  </div>
</section>
<div class="suly-ikili">
  <section class="kart suly-kart"><h2>1 Suly kaç XP</h2>${grafik(xpSerisi, {
    kimlik: 'xp', sinif: 'usd', kucuk: true, ad: 'Suly XP fiyatı', bos: 'Veri birikiyor: kur her gün bir kez kaydedilir.', okuma: 'Günlük, son 30 gün',
    eksen: (d) => kisa(d), yaz: xp, ipucu: gunIpucu, zaman: (t) => gunBicimi.format(t),
  })}</section>
  <section class="kart suly-kart"><h2>Coin kuru</h2>${grafik(kurSerisi, {
    kimlik: 'kur', sinif: 'kur', kucuk: true, ad: 'Coin kuru', bos: 'Veri birikiyor: kur her gün bir kez kaydedilir.', okuma: '1 coin kaç XP, günün açılışı',
    eksen: (d) => kisa(d), yaz: xp, ipucu: (t) => (simdi - t < 1000 ? 'şimdi' : gunBicimi.format(t)), zaman: (t) => gunBicimi.format(t),
  })}</section>
</div>
</div>`
}

export function sulySayfasi(veri) {
  const { chat, suly: v, durum } = veri
  const usd = v.anlik?.usd ?? 0
  return sayfa('Suly borsası', '🟠 Suly borsası', 'suly', veri, h`
${sulyCanli(v)}
<section class="kart hesap-kart">
  <h2>Al ve sat</h2>
  ${satir('🟠', 'Sulyn', sulyYaz(v.birim ?? 0))}
  ${usd && v.birim ? satir('💸', 'Satarsan', xp(sulySatisDegeri(v.birim, usd, v.kur))) : ''}
  ${satir('👛', 'Cüzdan', xp(durum.banka?.xp ?? 0), (durum.banka?.xp ?? 0) < 0 ? 'eksi' : '')}
  <div class="islemler">
    ${islemFormu(chat, 'suly', 'suly-al', 'AL', { alan: 'Suly al', yer: '1 ya da 0,25' })}
    ${islemFormu(chat, 'suly', 'suly-sat', 'SAT', { alan: `Suly sat · %${SATIS_KESINTI} kesinti`, yer: '0,25 ya da hepsi', sinif: 'ikincil' })}
  </div>
  <p class="not">İşlem düğmeye bastığın andaki fiyatla yapılır. Suly gerçek Bitcoin'in dolar fiyatına endekslidir, XP karşılığı kurla büyür. Alım, kredi borcun varken kapalıdır.</p>
  <p class="hizli"><a href="${hesapLink(chat, 'sulymarket')}">🕶️ SulyMarket'te harca ›</a></p>
</section>`)
}

// --- SulyMarket ------------------------------------------------------------

const BOLUMLER = [
  ['silah', 'silahlar', 'Cephanelik', 'Çetenin cephaneliğine girer'],
  ['hacker', 'hackerlar', 'Hackerlar', `Tek kullanımlık, WhatsApp'ta bota özelden .hack`],
  ['arac', 'araclar', 'Araçlar', 'Envanterine girer'],
]

function urunKutusu(chat, u, elde) {
  const [emoji, ...ad] = u.ad.split(' ')
  return h`<li class="mal">
  <span class="mal-simge" aria-hidden="true">${emoji}</span>
  <strong>${ad.join(' ')}</strong>
  <small>${urunNotu(u)}</small>
  <span class="mal-alt"><b>${sayi.format(u.fiyat)} Ⓢ</b>${elde ? h`<i>sende ${sayi.format(elde)}</i>` : ''}</span>
  ${islemFormu(chat, 'sulymarket', 'market-al', 'SATIN AL', { urun: u.kod, ...(u.tur === 'kutu' || u.tur === 'duvar' ? {} : { alan: 'Adet', deger: '1' }) })}
</li>`
}

function nftKutusu(chat, n, sahiplik, ben) {
  const senin = sahiplik?.user_jid === ben
  const alinir = !sahiplik || (!senin && sahiplik.fiyat)
  const fiyat = sahiplik?.fiyat ? sahiplik.fiyat : n.fiyat * BIRIM
  return h`<li class="mal nft n-${n.sinif}${sahiplik && !alinir && !senin ? ' dolu' : ''}">
  <img src="/nft/${n.no}.png" alt="" width="320" height="320" loading="lazy">
  <strong>${n.ad}</strong>
  <small>#${n.no} · ${NADIRLIK[n.sinif].ad.slice(2).trim()}</small>
  <span class="mal-alt">${alinir ? h`<b>${sulyYaz(fiyat)} Ⓢ</b>` : ''}${senin ? h`<i>senin${sahiplik.fiyat ? ` · ${sulyYaz(sahiplik.fiyat)} Ⓢ ilanda` : ''}</i>` : sahiplik ? h`<i>${displayName(sahiplik.user_jid)}</i>` : ''}</span>
  ${alinir ? islemFormu(chat, 'sulymarket', 'nft-al', 'SATIN AL', { urun: String(n.no) }) : ''}
  ${senin ? h`<details><summary>Boz</summary>${islemFormu(chat, 'sulymarket', 'nft-boz', `${sulyYaz((n.fiyat * BIRIM * NFT_GERI_ALIM) / 100)} Ⓢ al, boz`, { urun: String(n.no), sinif: 'ikincil' })}</details>` : ''}
</li>`
}

export function sulyMarketSayfasi(veri) {
  const { chat, market: m, ben, durum } = veri
  const d = m.durum
  if (!d) return sayfa('SulyMarket', '🕶️ SulyMarket', 'sulymarket', veri, h`<section class="kart"><p class="not">SulyMarket şu an kapalı.</p></section>`)
  const { simdi } = durum
  const eldeki = new Map([...d.envanter, ...d.silahlar].map((e) => [e.kod, e.adet]))
  const sahipler = new Map(m.nftler.map((r) => [r.no, r]))
  const ozel = [
    eldeki.get('firar') && m.hapis > simdi ? islemFormu(chat, 'sulymarket', 'market-firar', '🪪 Hapisten kaç') : '',
    eldeki.get('kimlik') ? islemFormu(chat, 'sulymarket', 'market-kimlik', '🎭 Sahte kimliği tak') : '',
    m.fidye ? islemFormu(chat, 'sulymarket', 'fidye-ode', `🔓 Fidyeyi öde · ${xp(m.fidye.tutar)}`) : '',
  ].filter(Boolean)

  return sayfa('SulyMarket', '🕶️ SulyMarket', 'sulymarket', veri, h`
<div class="karanlik">
<section class="kart km-bas">
  <p class="km-satir" aria-hidden="true">root@sulymarket:~$ ./vitrin --gizli</p>
  <h2>SULYMARKET</h2>
  <div class="km-bakiye"><strong>${sulyYaz(d.birim)}</strong> Suly <a href="${hesapLink(chat, 'suly')}">Suly al ›</a></div>
  <p class="not">Ödenen Suly yanar, iade yok. Hack, baskın ve vurgun WhatsApp'tan yapılır.</p>
</section>
<section class="kart km-durum">
  <h2>Sende ne var</h2>
  ${d.envanter.length ? satir('🎒', 'Envanter', d.envanter.map((e) => `${urunKoduyla(e.kod)?.ad ?? e.kod} x${sayi.format(e.adet)}`).join(', ')) : satir('🎒', 'Envanter', 'boş')}
  ${d.cete ? satir('🏴', d.cete.ad, d.silahlar.length ? d.silahlar.map((e) => `${urunKoduyla(e.kod)?.ad ?? e.kod} x${sayi.format(e.adet)}`).join(', ') : 'cephanelik boş') : satir('🏴', 'Çete', 'yok, silah alamazsın')}
  ${satir('💻', 'Bugünkü hack hakkın', `${d.hackHakki}/${HACK_GUNLUK}`)}
  ${d.duvar ? satir('🧱', 'Güvenlik duvarı', `${dakika(d.duvar - simdi)} kaldı`) : ''}
  ${m.maske ? satir('🎭', 'Maske', `${dakika(m.maske - simdi)} kaldı`) : ''}
  ${m.hapis > simdi ? satir('🚔', 'Hapis', `${dakika(m.hapis - simdi)} kaldı`, 'eksi') : ''}
  ${m.fidye ? satir('🔒', 'Bankan kilitli', `${dakika(m.fidye.bitis - simdi)} kaldı`, 'eksi') : ''}
  ${ozel.length ? h`<div class="isler">${ozel}</div>` : ''}
</section>
<nav class="km-sekme" aria-label="Bölümler">${[...BOLUMLER, ['', 'nft', 'NFT']].map(([, yer, ad]) => h`<a href="#${yer}">${ad}</a>`)}</nav>
${BOLUMLER.map(([tur, yer, ad, not]) => h`<h2 class="km-baslik" id="${yer}">${ad} <small>${not}</small></h2>
<ul class="mallar">${URUNLER.filter((u) => u.tur === tur || (tur === 'arac' && ['duvar', 'kutu'].includes(u.tur))).map((u) => urunKutusu(chat, u, eldeki.get(u.kod)))}</ul>`)}
<h2 class="km-baslik" id="nft">NFT galerisi <small>Her mahluktan grupta bir tane</small></h2>
<ul class="mallar nftler">${NFTLER.map((n) => nftKutusu(chat, n, sahipler.get(n.no), ben))}</ul>
</div>`)
}
