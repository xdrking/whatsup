// .meslek ve .çalış kuralları. Saf; yazma lib/stats.js'tedir.
import { trLower } from './turkishWords.js'

export const CALISMA_SAATI = 4
export const MESLEK_DEGISIM_SAATI = 24
export const EVLI_MAAS_YUZDESI = 20

// `kod` veritabanına yazılır, değiştirilmez. `min` ve `max` maaşın coin kurundaki
// on binde payıdır: kur büyüdükçe maaş da büyür. Ortalama hepsinde yakındır, fark risktedir.
export const MESLEKLER = [
  { kod: 'garson', adlar: ['garson'], ad: '🍽️ Garson', min: 45, max: 55, is: 'masalara koştun' },
  { kod: 'kurye', adlar: ['kurye'], ad: '🛵 Kurye', min: 30, max: 75, is: 'paket dağıttın' },
  { kod: 'ciftci', adlar: ['çiftçi', 'ciftci'], ad: '🌾 Çiftçi', min: 15, max: 90, is: 'tarlada çalıştın' },
  { kod: 'yazilimci', adlar: ['yazılımcı', 'yazilimci'], ad: '💻 Yazılımcı', min: 0, max: 110, is: 'bug kovaladın' },
  { kod: 'sanatci', adlar: ['sanatçı', 'sanatci'], ad: '🎸 Sanatçı', min: 0, max: 120, is: 'sahneye çıktın' },
]

export function meslekBul(metin) {
  const aranan = trLower(metin || '')
  return MESLEKLER.find((m) => m.adlar.includes(aranan)) ?? null
}

export function meslekKoduyla(kod) {
  return MESLEKLER.find((m) => m.kod === kod) ?? null
}

/** `rnd(min, max)` üst sınır hariç tam sayı verir; testte dışarıdan gelir. */
export function maasHesapla(kur, meslek, rnd) {
  return Math.floor((kur * rnd(meslek.min, meslek.max + 1)) / 10_000)
}
