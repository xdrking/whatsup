// .meslek ve .çalış kuralları. Saf; yazma lib/stats.js'tedir.
import { trLower } from './turkishWords.js'

export const CALISMA_DAKIKASI = 30
export const MESLEK_DEGISIM_SAATI = 24
export const EVLI_MAAS_YUZDESI = 20

// `kod` veritabanına yazılır, değiştirilmez. `min` ve `max` maaşın coin kurundaki
// on binde payıdır: kur büyüdükçe maaş da büyür. Sıra ve ortalamalar gerçek hayattaki
// kazanca göredir (bot sahibinin kararı), riskli mesleklerde maaş daha çok oynar.
// `tekSeferlik` meslek bırakılırsa bir daha seçilemez.
export const MESLEKLER = [
  { kod: 'garson', adlar: ['garson'], ad: '🍽️ Garson', min: 450, max: 550, is: 'masalara koştun' },
  { kod: 'kurye', adlar: ['kurye'], ad: '🛵 Kurye', min: 400, max: 700, is: 'paket dağıttın' },
  { kod: 'ciftci', adlar: ['çiftçi', 'ciftci'], ad: '🌾 Çiftçi', min: 300, max: 900, is: 'tarlada çalıştın' },
  { kod: 'berber', adlar: ['berber'], ad: '💈 Berber', min: 500, max: 900, is: 'saç kestin' },
  { kod: 'sofor', adlar: ['şoför', 'sofor'], ad: '🚌 Şoför', min: 650, max: 850, is: 'direksiyon salladın' },
  { kod: 'asci', adlar: ['aşçı', 'asci'], ad: '👨‍🍳 Aşçı', min: 600, max: 1000, is: 'ocak başında terledin' },
  { kod: 'ogretmen', adlar: ['öğretmen', 'ogretmen'], ad: '📚 Öğretmen', min: 900, max: 1100, is: 'ders anlattın' },
  { kod: 'hemsire', adlar: ['hemşire', 'hemsire'], ad: '🩺 Hemşire', min: 1000, max: 1300, is: 'nöbet tuttun' },
  { kod: 'polis', adlar: ['polis'], ad: '👮 Polis', min: 1000, max: 1300, is: 'devriye attın' },
  { kod: 'sanatci', adlar: ['sanatçı', 'sanatci'], ad: '🎸 Sanatçı', min: 0, max: 3000, is: 'sahneye çıktın' },
  { kod: 'muhendis', adlar: ['mühendis', 'muhendis'], ad: '🏗️ Mühendis', min: 1500, max: 2100, is: 'proje çizdin' },
  { kod: 'yazilimci', adlar: ['yazılımcı', 'yazilimci'], ad: '💻 Yazılımcı', min: 1500, max: 3000, is: 'bug kovaladın' },
  { kod: 'avukat', adlar: ['avukat'], ad: '⚖️ Avukat', min: 1000, max: 4000, is: 'dava kazandın' },
  { kod: 'doktor', adlar: ['doktor'], ad: '🥼 Doktor', min: 2500, max: 3500, is: 'hasta baktın' },
  { kod: 'pilot', adlar: ['pilot'], ad: '✈️ Pilot', min: 3500, max: 4500, is: 'uçak indirdin' },
  { kod: 'futbolcu', adlar: ['futbolcu'], ad: '⚽ Futbolcu', min: 0, max: 20000, is: 'maça çıktın', tekSeferlik: true },
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
