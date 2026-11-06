// .dava kuralları. Saf; yazma lib/stats.js'tedir.
export const MIN_DAVA = 100
export const MIN_OY = 2
export const DAVA_SURE_DK = 5
export const AZAMI_DAVA_YUZDESI = 25
const HARC_YUZDESI = 5

export function davaHarci(miktar) {
  return Math.ceil((miktar * HARC_YUZDESI) / 100)
}

/** Sanığın cüzdanının çeyreği: çoğunluk tek oylamayla birini sıfırlayamasın. */
export function azamiDava(xp) {
  return Math.floor((Math.max(0, xp) * AZAMI_DAVA_YUZDESI) / 100)
}

/** @returns {'davaci' | 'sanik' | null} null: oy az ya da berabere, dava düşer. */
export function davaKarari(hakli, haksiz) {
  if (hakli + haksiz < MIN_OY || hakli === haksiz) return null
  return hakli > haksiz ? 'davaci' : 'sanik'
}
