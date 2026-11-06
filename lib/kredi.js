// .kredi kuralları. Saf; yazma lib/stats.js'tedir.
// Faiz bankanınkinden yüksek olmalı, yoksa kredi çekip bankaya yatıran XP basar.
export const KREDI_FAIZ_YUZDESI = 19
export const KREDI_VADE_SAATI = 24
export const KREDI_LIMITI = 400_000
export const MIN_KREDI = 100
export const IFLAS_YASAK_SAATI = 12
export const IFLAS_KREDI_YASAK_SAATI = 24

/** Tek kredi kasanın yarısını geçemez: verilen kadar XP kasada kalır. */
export function azamiKredi(kasa) {
  return Math.min(KREDI_LIMITI, Math.floor(kasa / 2))
}

/** `saat` tane saat başının bileşik faizi. Küsurat yukarı yuvarlanır, borç küçülmesin. */
export function borcIslet(borc, saat) {
  return Math.ceil(borc * (1 + KREDI_FAIZ_YUZDESI / 100) ** saat)
}
