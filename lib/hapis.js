// .hapis ve .kefalet kuralları. Saf; yazma lib/stats.js'tedir.
export const HAPIS_SAATI = 2
export const MIN_KEFALET = 100
const KEFALET_YUZDESI = 20

/** Yakalanma anındaki cüzdan ve banka toplamından hesaplanır, sonradan harcamak düşürmez. */
export function kefaletTutari(servet) {
  return Math.max(MIN_KEFALET, Math.floor((servet * KEFALET_YUZDESI) / 100))
}

/** Evlilik kıyağı: eşin kefaleti yarı fiyatınadır. */
export function esKefaleti(tutar) {
  return Math.ceil(tutar / 2)
}
