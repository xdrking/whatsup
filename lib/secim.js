// .seçim kuralları. Saf; yazma lib/stats.js'tedir.
export const OY_UCRETI = 100

/** Coin kurunun yüzde biri: adaylık enflasyonla birlikte pahalanır. */
export function adaylikUcreti(kur) {
  return Math.floor(kur / 100)
}

// Bir makamın seçimi o makama ilk aday olunca başlar, bu kadar sonra kapanır (bot sahibinin kararı:
// haftalık seçimde grup bekleyemiyordu).
export const SECIM_SURE_MS = 30 * 60 * 1000
