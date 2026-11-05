// .soygun kuralları. Gerçek XP kaybı arkadaşlar arasında tatsızlık çıkarmasın
// diye pay yüzdeyle, sıklık günlük hakla sınırlıdır.
export const GUNLUK_DENEME = 2
export const BASARI_YUZDESI = 40
export const MIN_KURBAN_XP = 100
export const MIN_HIRSIZ_XP = 50
export const KORUNMA_MS = 6 * 60 * 60 * 1000
export const MIN_ODUL = 50
export const ODUL_KESINTI_YUZDESI = 10
const PAY_YUZDESI = 10

/** Çalınan ya da ceza olarak ödenen miktar. */
export function soygunPayi(xp) {
  return Math.floor((xp * PAY_YUZDESI) / 100)
}
