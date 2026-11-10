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

// Dakikada bir kez sorulur. Daha eski fiyatla alım satım yapılmaz: gerçek fiyatı gören kişi
// bayat fiyattan alıp hemen satarak XP basardı. %1 kesinti dakikalık oynamayı karşılar.
const TAZE_MS = 60_000

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
