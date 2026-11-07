// Coin, XP'nin üstündeki değerli para birimidir: XP TL ise coin altındır.
// Kur üyelerin toplam parasına bağlıdır, XP şişince coin pahalanır.
// Yeni ürün = COIN_URUNLERI'ne bir satır.
export const COIN_TABAN = 1_000_000
export const BOZDURMA_YUZDESI = 90
const COIN_BOLEN = 100
const KUR_ADIMI = 100_000

export const HACIZ_BANKA_YUZDESI = 45
export const HACIZ_CUZDAN_YUZDESI = 50

const GUN_MS = 24 * 60 * 60 * 1000

// Etki alanları .market key ödülleriyle aynıdır: soygunHakki, kalkanMs, bonus, unvan.
export const COIN_URUNLERI = [
  { ad: '🥷 3 fazladan soygun hakkı', fiyat: 3, soygunHakki: 3 },
  { ad: '💣 Toplu soygun: `.soygun herkes`', fiyat: 6, topluHak: 1 },
  { ad: '🛡️ 7 günlük soygun kalkanı', fiyat: 9, kalkanMs: 7 * GUN_MS },
  { ad: '🌟 1 saat oyunlardan 30 kat XP', fiyat: 15, bonus: 2900 },
  { ad: '☂️ 3 günlük haciz sigortası (`.hacizall` işlemez)', fiyat: 30, sigortaMs: 3 * GUN_MS },
  { ad: '🪙 Unvan: Altın Babası', fiyat: 30, unvan: '🪙 Altın Babası' },
  { ad: '🏦 Unvan: Merkez Bankası Başkanı', fiyat: 75, unvan: '🏦 Merkez Bankası Başkanı' },
  { ad: `⚖️ \`.hacizall\`: herkesin bankasının %${HACIZ_BANKA_YUZDESI}'i, cüzdanının %${HACIZ_CUZDAN_YUZDESI}'si`, fiyat: 90, topluHaciz: true },
  { ad: '🌌 Unvan: Ekonominin Efendisi', fiyat: 150, unvan: '🌌 Ekonominin Efendisi' },
]

/** Eksi cüzdandan alınacak bir şey yoktur. */
export function hacizPayi(banka, cuzdan) {
  return {
    banka: Math.floor((banka * HACIZ_BANKA_YUZDESI) / 100),
    cuzdan: Math.floor((Math.max(0, cuzdan) * HACIZ_CUZDAN_YUZDESI) / 100),
  }
}

/** Piyasadaki para 100 coin eder: 100 milyon XP'de 1 coin 1 milyon XP. */
export function coinKuru(arz) {
  return Math.max(COIN_TABAN, Math.ceil(arz / COIN_BOLEN / KUR_ADIMI) * KUR_ADIMI)
}

/** Coin ve mülk geri satışı: alış satış farkı, kuru kovalayıp XP basılmasın. */
export function bozdurmaDegeri(coin, kur) {
  return Math.floor((coin * kur * BOZDURMA_YUZDESI) / 100)
}
