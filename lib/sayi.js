const bicim = new Intl.NumberFormat('tr-TR')

/** 2000000 → "2.000.000". Mesajlardaki XP tutarları için. */
export const binlik = (n) => bicim.format(n)

// Ayrı yazılabilen birimler. Tek harfliler ("50m", "2k") yalnızca sayıya bitişik kabul edilir,
// ayrı "m" ya da "k" başka bir şey olabilir.
const BIRIMLER = { bin: 1e3, milyon: 1e6, milyar: 1e9, trilyon: 1e12, katrilyon: 1e15 }
const KISA_BIRIMLER = { k: 1e3, m: 1e6 }

const BINLIK_NOKTALI = /^\d{1,3}(?:\.\d{3})+$/
const SAYI_BIRIM = /^(\d+(?:[.,]\d+)?)([a-zçğıöşü]*)$/

/** "1,5" × 1e9 → 1500000000; küsurat aşağı yuvarlanır, kayan nokta hatası olmasın diye elle. */
function carp(sayi, birim) {
  const [tam, kusur = ''] = sayi.replace(',', '.').split('.')
  return Number(tam) * birim + Math.floor((Number(kusur || 0) * birim) / 10 ** kusur.length)
}

const birimOf = (arg) => BIRIMLER[arg?.toLocaleLowerCase('tr')]

/**
 * Komut argümanlarındaki yazılı tutarları düz sayıya çevirir: "50 milyon", "50milyon", "1,5 milyar",
 * "50m", "50.000.000" → "50000000". Komutlar bu sayede yalnızca rakam okur. Birimsiz ondalık
 * ("0,25", "2.5") olduğu gibi kalır: `.faizkararı` ve `.crash` onu kendisi okur.
 */
export function miktarlariCoz(args) {
  const sonuc = []
  for (let i = 0; i < args.length; i++) {
    const ham = args[i]
    const a = ham.toLocaleLowerCase('tr')

    const noktali = BINLIK_NOKTALI.test(a)
    const m = noktali ? [a, a.replaceAll('.', ''), ''] : SAYI_BIRIM.exec(a)
    const bitisik = m?.[2]
    const birim = m && (bitisik ? (BIRIMLER[bitisik] ?? KISA_BIRIMLER[bitisik]) : birimOf(args[i + 1]))
    const n = birim ? carp(m[1], birim) : noktali ? Number(m[1]) : null

    // Tam sayı sınırını aşan tutar çevrilmez, komut onu geçersiz sayar.
    if (!Number.isSafeInteger(n)) {
      sonuc.push(ham)
      continue
    }

    sonuc.push(String(n))
    if (birim && !bitisik) i++
  }
  return sonuc
}
