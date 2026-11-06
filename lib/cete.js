// .çete kuralları. Saf; yazma lib/stats.js'tedir.
import { trLower } from './turkishWords.js'

export const AZAMI_UYE = 10
export const KASA_KESINTI_YUZDESI = 5
export const CETE_SEZON_ODULU = 5000

/** Coin kurunun yüzde biri, `.seçim` adaylığıyla aynı. */
export function kurulusUcreti(kur) {
  return Math.floor(kur / 100)
}

/** @returns {{ ad: string, anahtar: string } | null} geçersiz adda null */
export function ceteAdi(metin) {
  const ad = (metin || '').trim().replace(/\s+/g, ' ')
  if (ad.length < 2 || ad.length > 20 || !/^[\p{L}\p{N} ]+$/u.test(ad)) return null
  return { ad, anahtar: trLower(ad) }
}
