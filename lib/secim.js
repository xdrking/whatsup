// .seçim kuralları. Saf; yazma lib/stats.js'tedir.
export const OY_UCRETI = 100

/** Coin kurunun yüzde biri: adaylık enflasyonla birlikte pahalanır. */
export function adaylikUcreti(kur) {
  return Math.floor(kur / 100)
}
