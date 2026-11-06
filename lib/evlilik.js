// .evlen ve .boşan kuralları. Saf; yazma lib/stats.js'tedir.
export const NAFAKA_YUZDESI = 20

/** Boşanmayı başlatan öder, cüzdan ve banka birlikte sayılır. */
export function nafakaTutari(servet) {
  return Math.floor((Math.max(0, servet) * NAFAKA_YUZDESI) / 100)
}
