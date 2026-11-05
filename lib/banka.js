// .banka ve servet vergisi kuralları. Saf; yazma lib/stats.js'tedir.
export const CEKIM_KESINTI_YUZDESI = 5
// Saatlik, bileşik, bakiyenin tamamına işler.
export const FAIZ_YUZDESI = 15
// Faiz XP basar: boşta kalan hesap ancak bir haftalık faiz biriktirir.
export const FAIZ_AZAMI_SAAT = 7 * 24
// Faiz bileşik olduğu için bakiye günler içinde tam sayı sınırını aşardı: JS o
// noktadan sonra XP'yi yanlış toplar, sonunda Infinity yazılır. Toplamlar da
// güvenli kalsın diye tavan MAX_SAFE_INTEGER'ın epey altındadır.
export const BANKA_TAVANI = 1_000_000_000_000_000
export const VERGI_ESIGI = 10_000
export const VERGI_YUZDESI = 1

/**
 * XP tam sayıdır, saatlik faiz küçük bakiyede 1 XP'yi bulmaz. Küsurat atılsaydı
 * her saat `.banka` yazan kişi hiç faiz alamazdı, bu yüzden `artik` devreder.
 */
export function faizHesapla(bakiye, saat, artik = 0) {
  const adim = Math.min(saat, FAIZ_AZAMI_SAAT)
  const tam = bakiye * ((1 + FAIZ_YUZDESI / 100) ** adim - 1) + artik
  // Kayan noktadaki hata tam 1 XP'yi 0,999… yapmasın.
  const faiz = Math.floor(tam + 1e-9)
  const kalan = Math.max(0, BANKA_TAVANI - bakiye)
  if (faiz >= kalan) return { faiz: kalan, artik: 0 }
  return { faiz, artik: Math.max(0, tam - faiz) }
}

/**
 * `saat` tane saat başını işler. `bekleyen`, son işlenen saat diliminde yatırılan
 * paradır ve ilk saat başında faiz almaz, sonrakilerde bakiyeye katılır. Yoksa
 * saat başına bir dakika kala yatıran tam saatin faizini alıp çekerdi.
 */
export function faizIslet(bakiye, bekleyen, saat, artik = 0) {
  if (saat <= 0) return { faiz: 0, artik }

  const ilk = faizHesapla(bakiye - bekleyen, 1, artik)
  const sonra = faizHesapla(bakiye + ilk.faiz, Math.min(saat, FAIZ_AZAMI_SAAT) - 1, ilk.artik)
  return { faiz: ilk.faiz + sonra.faiz, artik: sonra.artik }
}

/** Yalnızca cüzdandaki XP'nin eşiği aşan kısmı vergilenir, banka muaftır. */
export function vergiHesapla(xp) {
  return Math.floor((Math.max(0, xp - VERGI_ESIGI) * VERGI_YUZDESI) / 100)
}

export function cekimKesintisi(miktar) {
  return Math.ceil((miktar * CEKIM_KESINTI_YUZDESI) / 100)
}
