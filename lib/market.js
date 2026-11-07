import { KASALAR } from './kasa.js'

// `fiyat` coin kuru 2.300.000 iken geçerlidir, gerçek fiyat kurOlcegi() ile büyür.
// .market ürünleri. XP'yi ekonomiden çıkaran ana yer burasıdır: çark ve görevler
// her gün XP basar, satın alınan XP ise yanar. Yeni ürün = bu listeye bir satır.
export const KALKAN_SURESI_MS = 24 * 60 * 60 * 1000


export const URUNLER = [
  { ad: '🛡️ Soygun kalkanı (24 saat)', fiyat: 5_000_000, tur: 'kalkan' },
  { ad: '🚀 1 saat oyunlardan 3 kat XP', fiyat: 1_150_000, tur: 'bonus', bonus: 200 },
  { ad: '🔥 1 saat oyunlardan 5 kat XP', fiyat: 2_070_000, tur: 'bonus', bonus: 400 },
  { ad: '🎲 Unvan: Kumarbaz', fiyat: 2_300_000, tur: 'unvan', unvan: '🎲 Kumarbaz' },
  { ad: '💼 Unvan: Patron', fiyat: 11_500_000, tur: 'unvan', unvan: '💼 Patron' },
  { ad: '👑 Unvan: Kral', fiyat: 57_500_000, tur: 'unvan', unvan: '👑 Kral' },
  ...KASALAR,
]
