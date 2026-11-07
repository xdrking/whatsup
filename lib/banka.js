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
// `.faizkararı` sınırları, varsayılan FAIZ_YUZDESI'dir.
export const AZAMI_FAIZ = 50
// `.teşvik` bu kadar gündür yazmayanlara gitmez.
export const TESVIK_AKTIF_GUN = 7
// Dilim sınırları coin kuru cinsindendir: enflasyonda dilimler de büyür.
// .vergikaçır: yakalanmanın beklentisi ödemekten kötü kalmalı, yoksa herkes her gün kaçardı.
export const KACIS_YUZDESI = 60
export const KACIS_CEZA_KATI = 3

/** `zar` 0-99 arası. Yakalanan ceza öder, servetinden fazlası alınmaz. */
export function kacisSonucu(vergi, servet, zar) {
  if (zar < KACIS_YUZDESI) return { kacti: true, tutar: vergi }
  return { kacti: false, tutar: Math.min(vergi * KACIS_CEZA_KATI, servet) }
}

export const VERGI_DILIMLERI = [
  { ust: 1, yuzde: 0 },
  { ust: 5, yuzde: 2 },
  { ust: 20, yuzde: 5 },
  { ust: 100, yuzde: 10 },
  { ust: Infinity, yuzde: 20 },
]

/**
 * XP tam sayıdır, saatlik faiz küçük bakiyede 1 XP'yi bulmaz. Küsurat atılsaydı
 * her saat `.banka` yazan kişi hiç faiz alamazdı, bu yüzden `artik` devreder.
 */
export function faizHesapla(bakiye, saat, artik = 0, oran = FAIZ_YUZDESI) {
  const adim = Math.min(saat, FAIZ_AZAMI_SAAT)
  const tam = bakiye * ((1 + oran / 100) ** adim - 1) + artik
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
export function faizIslet(bakiye, bekleyen, saat, artik = 0, oran = FAIZ_YUZDESI) {
  if (saat <= 0) return { faiz: 0, artik }

  const ilk = faizHesapla(bakiye - bekleyen, 1, artik, oran)
  const sonra = faizHesapla(bakiye + ilk.faiz, Math.min(saat, FAIZ_AZAMI_SAAT) - 1, ilk.artik, oran)
  return { faiz: ilk.faiz + sonra.faiz, artik: sonra.artik }
}

/** Artan oranlı: her dilim yalnızca kendi aralığındaki servetten alınır. Cüzdan ve banka birlikte sayılır. */
export function servetVergisi(servet, kur) {
  let alt = 0
  let vergi = 0
  for (const { ust, yuzde } of VERGI_DILIMLERI) {
    vergi += (Math.max(0, Math.min(servet, ust * kur) - alt) * yuzde) / 100
    alt = ust * kur
  }
  return Math.floor(vergi)
}

export function cekimKesintisi(miktar) {
  return Math.ceil((miktar * CEKIM_KESINTI_YUZDESI) / 100)
}
