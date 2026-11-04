// .banka ve servet vergisi kuralları. Saf; yazma lib/stats.js'tedir.
export const CEKIM_KESINTI_YUZDESI = 5
export const FAIZ_YUZDESI = 1
// Faiz XP basar: yalnızca tavana kadarki bakiye işler, boşta kalan hesap da
// ancak birkaç günlük faiz biriktirir.
export const FAIZ_TAVANI = 10_000
export const FAIZ_AZAMI_GUN = 7
export const VERGI_ESIGI = 10_000
export const VERGI_YUZDESI = 1

/** "2026-11-01" → "2026-11-04" arası gün sayısı. */
export function gunFarki(ilk, son) {
  return Math.round((Date.parse(`${son}T00:00:00Z`) - Date.parse(`${ilk}T00:00:00Z`)) / 86_400_000)
}

export function faizHesapla(bakiye, gun) {
  const islenen = Math.min(bakiye, FAIZ_TAVANI)
  return Math.floor((islenen * FAIZ_YUZDESI * Math.min(gun, FAIZ_AZAMI_GUN)) / 100)
}

/** Yalnızca cüzdandaki XP'nin eşiği aşan kısmı vergilenir, banka muaftır. */
export function vergiHesapla(xp) {
  return Math.floor((Math.max(0, xp - VERGI_ESIGI) * VERGI_YUZDESI) / 100)
}

export function cekimKesintisi(miktar) {
  return Math.ceil((miktar * CEKIM_KESINTI_YUZDESI) / 100)
}
