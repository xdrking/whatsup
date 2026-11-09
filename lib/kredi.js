// .kredi kuralları. Saf; yazma lib/stats.js'tedir.
// Faiz bankanınkinden yüksek olmalı, yoksa kredi çekip bankaya yatıran XP basar.
export const KREDI_FAIZ_YUZDESI = 19
// `.faizkararı` banka faizini değiştirince kredi faizi bu kadar üstünde kalır.
export const KREDI_FAIZ_FARKI = 4

/**
 * Banka faizi ondalıklı olabildiği için toplam yuvarlanır: 0.1 + 4 kayan noktada 4.1000…01 olmasın.
 * Banka faizi eksiyken kredi faizi KREDI_FAIZ_FARKI'nda durur: yoksa kredi bedava ya da kârlı olurdu.
 */
export const krediFaizi = (bankaFaizi) => Math.round((Math.max(0, bankaFaizi) + KREDI_FAIZ_FARKI) * 100) / 100
export const KREDI_VADE_SAATI = 12
export const KREDI_LIMITI = 50_000
export const MIN_KREDI = 100
export const IFLAS_YASAK_SAATI = 12
export const IFLAS_KREDI_YASAK_SAATI = 24

/** Tek kredi kasanın yarısını geçemez: verilen kadar XP kasada kalır. */
export function azamiKredi(kasa) {
  return Math.min(KREDI_LIMITI, Math.floor(kasa / 2))
}

/** `saat` tane saat başının bileşik faizi. Küsurat yukarı yuvarlanır, borç küçülmesin. */
export function borcIslet(borc, saat, oran = KREDI_FAIZ_YUZDESI) {
  return Math.ceil(borc * (1 + oran / 100) ** saat)
}
