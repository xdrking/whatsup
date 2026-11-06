// Coin, XP'nin üstündeki değerli para birimidir: XP TL ise coin altındır.
// Fiyat sabittir, coin XP'ye geri çevrilmez. Yeni ürün = COIN_URUNLERI'ne bir satır.
export const COIN_FIYATI = 1_000_000

export const HACIZ_BANKA_YUZDESI = 45
export const HACIZ_CUZDAN_YUZDESI = 50

const GUN_MS = 24 * 60 * 60 * 1000

// Etki alanları .market key ödülleriyle aynıdır: soygunHakki, kalkanMs, bonus, unvan.
export const COIN_URUNLERI = [
  { ad: '🥷 3 fazladan soygun hakkı', fiyat: 1, soygunHakki: 3 },
  { ad: '💣 Toplu soygun: `.soygun herkes`', fiyat: 2, topluHak: 1 },
  { ad: '🛡️ 7 günlük soygun kalkanı', fiyat: 3, kalkanMs: 7 * GUN_MS },
  { ad: '🌟 1 saat oyunlardan 30 kat XP', fiyat: 5, bonus: 2900 },
  { ad: '🪙 Unvan: Altın Babası', fiyat: 10, unvan: '🪙 Altın Babası' },
  { ad: '🏦 Unvan: Merkez Bankası Başkanı', fiyat: 25, unvan: '🏦 Merkez Bankası Başkanı' },
  { ad: `⚖️ Toplu haciz: herkesin bankasının %${HACIZ_BANKA_YUZDESI}'i, cüzdanının %${HACIZ_CUZDAN_YUZDESI}'si`, fiyat: 30, topluHaciz: true },
  { ad: '🌌 Unvan: Ekonominin Efendisi', fiyat: 50, unvan: '🌌 Ekonominin Efendisi' },
]

/** Eksi cüzdandan alınacak bir şey yoktur. */
export function hacizPayi(banka, cuzdan) {
  return {
    banka: Math.floor((banka * HACIZ_BANKA_YUZDESI) / 100),
    cuzdan: Math.floor((Math.max(0, cuzdan) * HACIZ_CUZDAN_YUZDESI) / 100),
  }
}
