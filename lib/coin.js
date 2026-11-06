// Coin, XP'nin üstündeki değerli para birimidir: XP TL ise coin altındır.
// Fiyat sabittir, coin XP'ye geri çevrilmez. Yeni ürün = COIN_URUNLERI'ne bir satır.
export const COIN_FIYATI = 1_000_000

const GUN_MS = 24 * 60 * 60 * 1000

// Etki alanları .market key ödülleriyle aynıdır: soygunHakki, kalkanMs, bonus, unvan.
export const COIN_URUNLERI = [
  { ad: '🥷 3 fazladan soygun hakkı', fiyat: 1, soygunHakki: 3 },
  { ad: '💣 Toplu soygun: `.soygun herkes`', fiyat: 2, topluHak: 1 },
  { ad: '🛡️ 7 günlük soygun kalkanı', fiyat: 3, kalkanMs: 7 * GUN_MS },
  { ad: '🌟 1 saat oyunlardan 10 kat XP', fiyat: 5, bonus: 900 },
  { ad: '🪙 Unvan: Altın Babası', fiyat: 10, unvan: '🪙 Altın Babası' },
  { ad: '🏦 Unvan: Merkez Bankası Başkanı', fiyat: 25, unvan: '🏦 Merkez Bankası Başkanı' },
  { ad: '🌌 Unvan: Ekonominin Efendisi', fiyat: 50, unvan: '🌌 Ekonominin Efendisi' },
]
