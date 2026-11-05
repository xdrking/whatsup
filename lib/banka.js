// .banka ve servet vergisi kuralları. Saf; yazma lib/stats.js'tedir.
export const CEKIM_KESINTI_YUZDESI = 5
// Saatlik, bileşik, bakiyenin tamamına işler.
export const FAIZ_YUZDESI = 0.1
// Faiz XP basar: boşta kalan hesap ancak bir haftalık faiz biriktirir.
export const FAIZ_AZAMI_SAAT = 7 * 24
export const VERGI_ESIGI = 10_000
export const VERGI_YUZDESI = 1

/**
 * XP tam sayıdır, saatlik faiz küçük bakiyede 1 XP'yi bulmaz. Küsurat atılsaydı
 * her saat `.banka` yazan kişi hiç faiz alamazdı, bu yüzden `artik` devreder.
 */
export function faizHesapla(bakiye, saat, artik = 0) {
  const adim = Math.min(saat, FAIZ_AZAMI_SAAT)
  const tam = bakiye * ((1 + FAIZ_YUZDESI / 100) ** adim - 1) + artik
  // 0,1'in kayan noktadaki hatası tam 1 XP'yi 0,999… yapmasın.
  const faiz = Math.floor(tam + 1e-9)
  return { faiz, artik: Math.max(0, tam - faiz) }
}

/** Yalnızca cüzdandaki XP'nin eşiği aşan kısmı vergilenir, banka muaftır. */
export function vergiHesapla(xp) {
  return Math.floor((Math.max(0, xp - VERGI_ESIGI) * VERGI_YUZDESI) / 100)
}

export function cekimKesintisi(miktar) {
  return Math.ceil((miktar * CEKIM_KESINTI_YUZDESI) / 100)
}
