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
  { ad: '🌟 1 saat oyunlardan 30 kat XP', fiyat: 30, bonus: 2900 },
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

// .market fiyatları ve key ödülleri bu kurdaki XP olarak yazılır, kurla birlikte büyür.
const REFERANS_KUR = 2_300_000

/** `tutar`ın `kur`daki karşılığı; bin XP'ye yuvarlanır, liste okunur kalsın. */
export function kurOlcegi(tutar, kur) {
  return Math.round((tutar * kur) / REFERANS_KUR / 1000) * 1000
}

// Oyun ödülleri küçük taban sayılardır, kurun karekökü kadar büyür: kur 2.300.000 iken 50 taban
// 230.000 XP eder, kur 4 katına çıkınca ödül 2 katına çıkar (bot sahibinin kararı). Doğrusal
// olsaydı ödül arzı, arz kuru, kur ödülü büyütür, enflasyon kendini besleyip hızlanırdı.
const OYUN_CARPANI = 4600

export function oyunOlcegi(tutar, kur) {
  return Math.round((tutar * OYUN_CARPANI * Math.sqrt(kur / REFERANS_KUR)) / 1000) * 1000
}

/** Coin ve mülk geri satışı: alış satış farkı, kuru kovalayıp XP basılmasın. */
export function bozdurmaDegeri(coin, kur) {
  return Math.floor((coin * kur * BOZDURMA_YUZDESI) / 100)
}
