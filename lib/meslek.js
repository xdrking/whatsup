// .meslek ve .çalış kuralları. Saf; yazma lib/stats.js'tedir.
import { trLower } from './turkishWords.js'

export const CALISMA_DAKIKASI = 30
export const MESLEK_DEGISIM_SAATI = 24
export const EVLI_MAAS_YUZDESI = 20

// `kod` veritabanına yazılır, değiştirilmez. `min` ve `max` maaşın coin kurundaki
// on binde payıdır: kur büyüdükçe maaş da büyür. Sıra ve ortalamalar gerçek hayattaki
// kazanca göredir (bot sahibinin kararı), riskli mesleklerde maaş daha çok oynar.
export const MESLEKLER = [
  { kod: 'garson', adlar: ['garson'], ad: '🍽️ Garson', min: 45, max: 55, is: 'masalara koştun' },
  { kod: 'kurye', adlar: ['kurye'], ad: '🛵 Kurye', min: 40, max: 70, is: 'paket dağıttın' },
  { kod: 'ciftci', adlar: ['çiftçi', 'ciftci'], ad: '🌾 Çiftçi', min: 30, max: 90, is: 'tarlada çalıştın' },
  { kod: 'berber', adlar: ['berber'], ad: '💈 Berber', min: 50, max: 90, is: 'saç kestin' },
  { kod: 'sofor', adlar: ['şoför', 'sofor'], ad: '🚌 Şoför', min: 65, max: 85, is: 'direksiyon salladın' },
  { kod: 'asci', adlar: ['aşçı', 'asci'], ad: '👨‍🍳 Aşçı', min: 60, max: 100, is: 'ocak başında terledin' },
  { kod: 'ogretmen', adlar: ['öğretmen', 'ogretmen'], ad: '📚 Öğretmen', min: 90, max: 110, is: 'ders anlattın' },
  { kod: 'hemsire', adlar: ['hemşire', 'hemsire'], ad: '🩺 Hemşire', min: 100, max: 130, is: 'nöbet tuttun' },
  { kod: 'polis', adlar: ['polis'], ad: '👮 Polis', min: 100, max: 130, is: 'devriye attın' },
  { kod: 'sanatci', adlar: ['sanatçı', 'sanatci'], ad: '🎸 Sanatçı', min: 0, max: 300, is: 'sahneye çıktın' },
  { kod: 'muhendis', adlar: ['mühendis', 'muhendis'], ad: '🏗️ Mühendis', min: 150, max: 210, is: 'proje çizdin' },
  { kod: 'yazilimci', adlar: ['yazılımcı', 'yazilimci'], ad: '💻 Yazılımcı', min: 150, max: 300, is: 'bug kovaladın' },
  { kod: 'avukat', adlar: ['avukat'], ad: '⚖️ Avukat', min: 100, max: 400, is: 'dava kazandın' },
  { kod: 'doktor', adlar: ['doktor'], ad: '🥼 Doktor', min: 250, max: 350, is: 'hasta baktın' },
  { kod: 'pilot', adlar: ['pilot'], ad: '✈️ Pilot', min: 350, max: 450, is: 'uçak indirdin' },
  { kod: 'futbolcu', adlar: ['futbolcu'], ad: '⚽ Futbolcu', min: 0, max: 800, is: 'maça çıktın' },
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
