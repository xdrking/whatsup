// .mülk: coinle alınan, kira getiren varlıklar. Fiyat coindir, kira günün coin kuruna
// bağlıdır: XP enflasyonda erirken kira da onunla büyür. Yeni mülk = bir satır.
import { trLower } from './turkishWords.js'

export const KIRA_AZAMI_SAAT = 24

export const MULKLER = [
  { kod: 'araba', ad: '🚗 Araba', fiyat: 9, kiraYuzde: 0, adlar: ['araba'] },
  { kod: 'ev', ad: '🏠 Ev', fiyat: 15, kiraYuzde: 2, adlar: ['ev'] },
  { kod: 'dukkan', ad: '🏪 Dükkan', fiyat: 45, kiraYuzde: 2.5, adlar: ['dükkan', 'dukkan'] },
  { kod: 'villa', ad: '🏰 Villa', fiyat: 120, kiraYuzde: 3, adlar: ['villa'] },
  { kod: 'genelev', ad: '💋 Genelev', fiyat: 150, kiraYuzde: 4, adlar: ['genelev'] },
  { kod: 'tarla', ad: '🌾 Tarla', fiyat: 200, kiraYuzde: 5, adlar: ['tarla'] },
  { kod: 'otel', ad: '🏨 Otel', fiyat: 250, kiraYuzde: 7, adlar: ['otel'] },
]

export function mulkBul(ad) {
  const a = trLower(ad || '')
  return MULKLER.find((m) => m.adlar.includes(a)) ?? null
}

/** Toplama yapılmazsa kira KIRA_AZAMI_SAAT'te durur. */
export function kiraHesapla(mulk, adet, saat, kur) {
  const gecen = Math.min(Math.max(0, saat), KIRA_AZAMI_SAAT)
  return Math.floor((adet * mulk.fiyat * kur * mulk.kiraYuzde * gecen) / 100)
}
