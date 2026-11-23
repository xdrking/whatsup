// .kripto: Suly, gerçek Bitcoin'in dolar fiyatına endeksli kripto para. Ondalıklı alınır,
// 1 Suly = BIRIM tam sayı birim olarak saklanır (Bitcoin'in satoshi'si gibi): kayan nokta
// bakiyesi toplandıkça kuruş kaybederdi. XP fiyatı dolar fiyatının kurla büyümüş halidir
// (market fiyatları gibi), enflasyonda Suly değerini korusun diye.
import { getJson } from './http.js'
import { REFERANS_KUR } from './coin.js'
import logger from './logger.js'

export const BIRIM = 100_000_000
export const ONDALIK = 8
export const SATIS_KESINTI = 1
export const SULY = { kod: 'suly', ad: '🟠 Suly', sembol: 'BTC', adlar: ['suly', 'sully'] }

// 20 saniyede bir kez sorulur. Daha eski fiyatla alım satım yapılmaz: gerçek fiyatı gören kişi
// bayat fiyattan alıp hemen satarak XP basardı. %1 kesinti aradaki oynamayı karşılar.
const TAZE_MS = 20_000

let sonFiyat = null

/** "12,46", "0.001", "5" → birim; 8 basamaktan fazla ondalık ya da sıfır → null. */
export function sulyCoz(metin) {
  const m = /^(\d+)(?:[.,](\d+))?$/.exec(String(metin || '').trim())
  if (!m || (m[2]?.length ?? 0) > ONDALIK) return null
  const birim = Number(m[1]) * BIRIM + Number((m[2] || '').padEnd(ONDALIK, '0'))
  return Number.isSafeInteger(birim) && birim > 0 ? birim : null
}

/** 1246000000 → "12,46"; sondaki sıfırlar yazılmaz. */
export function sulyYaz(birim) {
  const tam = Math.floor(birim / BIRIM)
  const kusur = String(birim % BIRIM).padStart(ONDALIK, '0').replace(/0+$/, '')
  return `${new Intl.NumberFormat('tr-TR').format(tam)}${kusur ? `,${kusur}` : ''}`
}

/** 1 Suly'nin XP fiyatı; ondalıklı kalır, tutar `sulyDegeri` ile yuvarlanır. */
export function sulyFiyati(usd, kur) {
  return (usd * kur) / REFERANS_KUR
}

export function sulyDegeri(birim, usd, kur) {
  return Math.floor((birim / BIRIM) * sulyFiyati(usd, kur))
}

/** Satışta eline geçen: değerin %99'u. */
export function sulySatisDegeri(birim, usd, kur) {
  return Math.floor((sulyDegeri(birim, usd, kur) * (100 - SATIS_KESINTI)) / 100)
}

async function coinbase() {
  const veri = await getJson('https://api.coinbase.com/v2/prices/BTC-USD/spot')
  return Number(veri?.data?.amount)
}

async function binance() {
  const veri = await getJson('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT')
  return Number(veri?.price)
}

/**
 * Bitcoin'in anlık dolar fiyatı. Önce Coinbase, olmazsa Binance (USDT). İkisi de düşerse null:
 * alım satım o an yapılmaz. @returns {Promise<{ usd: number, zaman: number } | null>}
 */
export async function btcFiyati(now = Date.now()) {
  if (sonFiyat && now - sonFiyat.zaman < TAZE_MS) return sonFiyat

  for (const kaynak of [coinbase, binance]) {
    try {
      const usd = await kaynak()
      if (Number.isFinite(usd) && usd > 0) {
        sonFiyat = { usd, zaman: now }
        return sonFiyat
      }
      logger.warn({ kaynak: kaynak.name, usd }, 'BTC fiyatı anlaşılmadı')
    } catch (err) {
      logger.warn({ err, kaynak: kaynak.name }, 'BTC fiyatı alınamadı')
    }
  }
  return null
}

// Panelin grafiği: hazır mum verisi çekilir, saklanmaz. `sn` mum süresi, `adet` gösterilen mum sayısı.
export const GRAFIK_ARALIKLARI = {
  '1s': { ad: '1 saat', sn: 60, binance: '1m', adet: 60 },
  '24s': { ad: '24 saat', sn: 900, binance: '15m', adet: 96 },
  '7g': { ad: '7 gün', sn: 3600, binance: '1h', adet: 168 },
  '30g': { ad: '30 gün', sn: 86_400, binance: '1d', adet: 30 },
}
const GECMIS_TAZE_MS = 30_000
const GECMIS_ZAMAN_ASIMI = { timeoutMs: 4000 }
const gecmisOnbellegi = new Map()

async function coinbaseGecmisi({ sn }) {
  const veri = await getJson(`https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=${sn}`, GECMIS_ZAMAN_ASIMI)
  // [zaman, düşük, yüksek, açılış, kapanış, hacim], en yeni önce.
  return veri.map((m) => ({ zaman: (m[0] + sn) * 1000, usd: Number(m[4]) })).reverse()
}

async function binanceGecmisi({ sn, binance: dilim, adet }) {
  const veri = await getJson(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${dilim}&limit=${adet}`, GECMIS_ZAMAN_ASIMI)
  return veri.map((m) => ({ zaman: m[0] + sn * 1000, usd: Number(m[4]) }))
}

async function gecmisCek(aralik, now) {
  for (const kaynak of [coinbaseGecmisi, binanceGecmisi]) {
    try {
      const noktalar = (await kaynak(aralik)).filter((n) => Number.isFinite(n.usd) && n.usd > 0).slice(-aralik.adet)
      // Süren mumun kapanışı gelecekte görünmesin.
      if (noktalar.length > 1) return noktalar.map((n) => ({ ...n, zaman: Math.min(n.zaman, now) }))
      logger.warn({ kaynak: kaynak.name }, 'BTC geçmişi boş geldi')
    } catch (err) {
      logger.warn({ err, kaynak: kaynak.name }, 'BTC geçmişi alınamadı')
    }
  }
  return null
}

/**
 * Bitcoin'in dolar geçmişi, eskiden yeniye. Yalnızca çizim içindir, alım satım `btcFiyati` ile yapılır.
 * Servisler düşükse elde ne varsa o, yoksa boş dizi. Aynı anda açılan sayfalar tek isteği paylaşır.
 */
export async function btcGecmisi(ad, now = Date.now()) {
  const aralik = GRAFIK_ARALIKLARI[ad]
  if (!aralik) return []
  const eski = gecmisOnbellegi.get(ad)
  if (eski && now - eski.zaman < GECMIS_TAZE_MS) return eski.noktalar
  const noktalar = gecmisCek(aralik, now).then(async (yeni) => yeni ?? (await eski?.noktalar) ?? [])
  gecmisOnbellegi.set(ad, { zaman: now, noktalar })
  return noktalar
}
