// .mülk: coinle alınan, kira getiren varlıklar. Fiyat coindir, kira günün coin kuruna
// bağlıdır: XP enflasyonda erirken kira da onunla büyür. Yeni mülk = bir satır.
import { trLower } from './turkishWords.js'

export const KIRA_AZAMI_SAAT = 24

const SATILIK = [
  { kod: 'araba', ad: '🚗 Araba', fiyat: 9, kiraYuzde: 0, adlar: ['araba'] },
  { kod: 'ev', ad: '🏠 Ev', fiyat: 15, kiraYuzde: 2, adlar: ['ev'] },
  { kod: 'dukkan', ad: '🏪 Dükkan', fiyat: 45, kiraYuzde: 2.5, adlar: ['dükkan', 'dukkan'] },
  { kod: 'villa', ad: '🏰 Villa', fiyat: 120, kiraYuzde: 3, adlar: ['villa'] },
  { kod: 'genelev', ad: '💋 Genelev', fiyat: 150, kiraYuzde: 4, adlar: ['genelev'] },
  { kod: 'tarla', ad: '🌾 Tarla', fiyat: 200, kiraYuzde: 5, adlar: ['tarla'] },
  { kod: 'otel', ad: '🏨 Otel', fiyat: 250, kiraYuzde: 7, adlar: ['otel'] },
]

// Efsanevi mülk satılmaz, yalnızca yükseltmeyle (`.mülk yükselt`) çıkar (bot sahibinin kararı). YUKSELTME_ADEDI
// tane aynı mülk konursa kesin, daha azı konursa adet / YUKSELTME_ADEDI olasılıkla gelir, gelmezse konanlar yanar.
// Değeri (fiyatı) konan 4 mülke eşittir, kira yüzdesi EFSANE_KIRA_KATI katıdır: dükkanın %2,5'i efsanevide %7,5.
// Böylece yükseltmenin beklenen satış değeri konanlarla aynı kalır, kazancı yalnızca kiradır. Kirasız arabaya
// EFSANE_ARABA_KIRASI verilir, yoksa yükseltmenin anlamı olmazdı.
export const YUKSELTME_ADEDI = 4
export const EFSANE_KIRA_KATI = 3
const EFSANE_ARABA_KIRASI = 1

const efsanevi = (m) => {
  const [emoji, ...ad] = m.ad.split(' ')
  return {
    kod: `${m.kod}_efsane`,
    ad: `${emoji}✨ Efsanevi ${ad.join(' ')}`,
    fiyat: m.fiyat * YUKSELTME_ADEDI,
    kiraYuzde: m.kiraYuzde * EFSANE_KIRA_KATI || EFSANE_ARABA_KIRASI,
    adlar: m.adlar.flatMap((a) => [`efsane${a}`, `efsanevi${a}`]),
    efsane: true,
    taban: m.kod,
  }
}

// `kod` veritabanına yazılır, değiştirilmez. Satılık olanlar önce gelir.
export const MULKLER = [...SATILIK, ...SATILIK.map(efsanevi)]

/** Tabanın efsanevi sürümü. */
export const efsaneviMulk = (taban) => MULKLER.find((m) => m.taban === taban.kod) ?? null

/** Yükseltmenin tutma olasılığı (yüzde). */
export const yukseltmeSansi = (adet) => Math.round((Math.min(adet, YUKSELTME_ADEDI) * 100) / YUKSELTME_ADEDI)

export function mulkBul(ad) {
  const a = trLower(ad || '')
  return MULKLER.find((m) => m.adlar.includes(a)) ?? null
}

/** Kelimelerden mülkü bulur: "efsane dükkan" ya da "efsanedükkan" efsanevi dükkandır. */
export function mulkCoz(kelimeler) {
  const k = kelimeler.map((x) => trLower(x || ''))
  const efsaneIste = k.some((x) => ['efsane', 'efsanevi'].includes(x))
  const mulk = k.map(mulkBul).find(Boolean)
  if (!mulk || !efsaneIste || mulk.efsane) return mulk ?? null
  return efsaneviMulk(mulk)
}

/** Toplama yapılmazsa kira KIRA_AZAMI_SAAT'te durur. */
export function kiraHesapla(mulk, adet, saat, kur) {
  const gecen = Math.min(Math.max(0, saat), KIRA_AZAMI_SAAT)
  return Math.floor((adet * mulk.fiyat * kur * mulk.kiraYuzde * gecen) / 100)
}
