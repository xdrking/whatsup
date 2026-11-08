// `.vampir` kuralları: saf fonksiyonlar, rastgelelik dışarıdan verilebilir (test).
import { randomInt } from 'node:crypto'

export const MIN_OYUNCU = 4
export const MAX_OYUNCU = 16

export const ROLLER = {
  vampir: { ad: 'Vampir', emoji: '🧛' },
  doktor: { ad: 'Doktor', emoji: '🩺' },
  kahin: { ad: 'Kahin', emoji: '🔮' },
  koylu: { ad: 'Köylü', emoji: '👨‍🌾' },
}

export const rolAdi = (rol) => `${ROLLER[rol].emoji} ${ROLLER[rol].ad}`

/** Vampir sayısı köyün yaklaşık dörtte biri: daha fazlası ilk gece oyunu bitirirdi. */
export function rolSayilari(n) {
  const vampir = n >= 12 ? 3 : n >= 8 ? 2 : 1
  const doktor = n >= 5 ? 1 : 0
  const kahin = 1
  return { vampir, doktor, kahin, koylu: n - vampir - doktor - kahin }
}

/** n oyuncu için karışık rol dizisi. */
export function rolDagit(n, rng = randomInt) {
  const roller = Object.entries(rolSayilari(n)).flatMap(([rol, adet]) => Array(adet).fill(rol))
  for (let i = roller.length - 1; i > 0; i--) {
    const j = rng(i + 1)
    ;[roller[i], roller[j]] = [roller[j], roller[i]]
  }
  return roller
}

/** Oy sayımı: `oylar` oyveren → hedef no (`null` = pas). */
export function oySay(oylar) {
  const sayim = new Map()
  for (const hedef of oylar.values()) {
    if (hedef != null) sayim.set(hedef, (sayim.get(hedef) || 0) + 1)
  }
  return sayim
}

function enCoklar(sayim) {
  const tepe = Math.max(0, ...sayim.values())
  return tepe ? [...sayim].filter(([, s]) => s === tepe).map(([no]) => no) : []
}

/**
 * Gündüz kararı: tek başına en çok oyu alan asılır, pas oyları ona yetişirse kimse asılmaz.
 * Beraberlikte kimse asılmaz: rastgele asmak, masumu zarla öldürmek olurdu.
 */
export function gunduzKarari(oylar) {
  const sayim = oySay(oylar)
  const tepe = enCoklar(sayim)
  if (tepe.length !== 1) return null
  const pas = [...oylar.values()].filter((h) => h == null).length
  return sayim.get(tepe[0]) > pas ? tepe[0] : null
}

/**
 * Gece sonucu. Vampirler bölünürse kurban berabere kalanlardan çekilir: ayrı yazdıkları
 * için anlaşamamak geceyi boşa geçirmesin.
 * @returns {{ hedef: number | null, kurtarildi: boolean }}
 */
export function geceSonucu({ vampirOylari, korunan }, rng = randomInt) {
  const tepe = enCoklar(oySay(vampirOylari))
  if (!tepe.length) return { hedef: null, kurtarildi: false }
  const hedef = tepe[rng(tepe.length)]
  return hedef === korunan ? { hedef: null, kurtarildi: true } : { hedef, kurtarildi: false }
}

/** 'vampir' | 'koy' | null. Vampirler köylülere yetişince köy oylamayı kazanamaz. */
export function kazanan(oyuncular) {
  const canli = oyuncular.filter((o) => o.canli)
  const vampir = canli.filter((o) => o.rol === 'vampir').length
  if (!vampir) return 'koy'
  if (vampir >= canli.length - vampir) return 'vampir'
  return null
}

export const takimi = (rol) => (rol === 'vampir' ? 'vampir' : 'koy')
