import { KASALAR } from './kasa.js'

// .market ürünleri. XP'yi ekonomiden çıkaran ana yer burasıdır: çark ve görevler
// her gün XP basar, satın alınan XP ise yanar. Yeni ürün = bu listeye bir satır.
export const KALKAN_SURESI_MS = 24 * 60 * 60 * 1000

// `fiyat` taban değerdir, gerçek fiyat coin kuruyla büyür: 1000 taban 1 coin eder.
const TABAN_COIN_DEGERI = 1000

/** Fiyat ve key'in XP ödülleri bununla çarpılır. */
export function marketCarpani(kur) {
  return Math.max(1, Math.floor(kur / TABAN_COIN_DEGERI))
}

export const URUNLER = [
  { ad: '🛡️ Soygun kalkanı (24 saat)', fiyat: 300, tur: 'kalkan' },
  { ad: '🚀 1 saat oyunlardan 3 kat XP', fiyat: 500, tur: 'bonus', bonus: 200 },
  { ad: '🔥 1 saat oyunlardan 5 kat XP', fiyat: 900, tur: 'bonus', bonus: 400 },
  { ad: '🎲 Unvan: Kumarbaz', fiyat: 1000, tur: 'unvan', unvan: '🎲 Kumarbaz' },
  { ad: '💼 Unvan: Patron', fiyat: 5000, tur: 'unvan', unvan: '💼 Patron' },
  { ad: '👑 Unvan: Kral', fiyat: 25000, tur: 'unvan', unvan: '👑 Kral' },
  ...KASALAR,
]
