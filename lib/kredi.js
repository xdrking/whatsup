// .kredi kuralları. Saf; yazma lib/stats.js'tedir.
// Faiz bankanınkinden yüksek olmalı, yoksa kredi çekip bankaya yatıran XP basar.
export const KREDI_FAIZ_YUZDESI = 19
export const KREDI_VADE_SAATI = 24
export const SEVIYE_BASINA_LIMIT = 1000
export const MIN_KREDI = 100

export function krediLimiti(level) {
  return level * SEVIYE_BASINA_LIMIT
}

/** `saat` tane saat başının bileşik faizi. Küsurat yukarı yuvarlanır, borç küçülmesin. */
export function borcIslet(borc, saat) {
  return Math.ceil(borc * (1 + KREDI_FAIZ_YUZDESI / 100) ** saat)
}
