// .market ürünleri. XP'yi ekonomiden çıkaran ana yer burasıdır: çark ve görevler
// her gün XP basar, satın alınan XP ise yanar. Yeni ürün = bu listeye bir satır.
export const KALKAN_SURESI_MS = 24 * 60 * 60 * 1000

export const URUNLER = [
  { ad: '🛡️ Soygun kalkanı (24 saat)', fiyat: 300, tur: 'kalkan' },
  { ad: '🚀 1 saat oyunlardan 3 kat XP', fiyat: 500, tur: 'bonus', bonus: 200 },
  { ad: '🔥 1 saat oyunlardan 5 kat XP', fiyat: 900, tur: 'bonus', bonus: 400 },
  { ad: '🎲 Unvan: Kumarbaz', fiyat: 1000, tur: 'unvan', unvan: '🎲 Kumarbaz' },
  { ad: '💼 Unvan: Patron', fiyat: 5000, tur: 'unvan', unvan: '💼 Patron' },
  { ad: '👑 Unvan: Kral', fiyat: 25000, tur: 'unvan', unvan: '👑 Kral' },
]
