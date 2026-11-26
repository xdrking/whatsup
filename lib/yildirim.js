// Yıldırım Kalesi: 6x5 tahtada düşen semboller (Şeker Fırtınası'nın kardeşi). Saf; rastgelelik dışarıdan verilir.
// Aynı sembolden tahtanın herhangi bir yerinde 8+ tane varsa öder ve patlar, üsttekiler düşer, boşluğa yenileri yağar.
// Kombo çarpanı yoktur; onun yerine ⚡ yıldırım küreleri düşer: çarpan taşır, patlamaz, dönüş kazandırdıysa
// tahtadaki kürelerin toplamı dönüşün kazancını çarpar. Bedava dönüşlerde küreler toplam çarpanda birikir.
// Beklenen dönüş test/yildirim.test.js'te denetlenir; sembol, ağırlık, ödeme ya da küre değişirse o test geçmeli.
import { randomInt } from 'node:crypto'

export const SUTUN = 6
export const SATIR = 5
export const EN_AZ = 8
export const DAGINIK = '🌩️'
export const DAGINIK_ESIK = 4
export const EK_ESIK = 3
export const EK_DONUS = 5
export const BEDAVA_DONUS = 15
export const AZAMI_KAT = 5000

/** `odeme`: [8-9, 10-11, 12+] adet için bahsin katı. Ucuzdan pahalıya sıralıdır. */
export const SEMBOLLER = [
  { s: '💧', ad: 'Su', agirlik: 190, odeme: [0.25, 0.75, 2] },
  { s: '🔥', ad: 'Ateş', agirlik: 175, odeme: [0.4, 0.9, 4] },
  { s: '🌿', ad: 'Yaprak', agirlik: 160, odeme: [0.5, 1, 5] },
  { s: '🌀', ad: 'Rüzgâr', agirlik: 145, odeme: [0.8, 1.2, 8] },
  { s: '🗝️', ad: 'Anahtar', agirlik: 120, odeme: [1, 1.5, 10] },
  { s: '🛡️', ad: 'Kalkan', agirlik: 100, odeme: [1.5, 2, 12] },
  { s: '⚔️', ad: 'Kılıç', agirlik: 85, odeme: [2, 5, 15] },
  { s: '🦅', ad: 'Kartal', agirlik: 70, odeme: [2.5, 10, 25] },
  { s: '🐉', ad: 'Ejder', agirlik: 55, odeme: [10, 25, 50] },
]
export const DAGINIK_AGIRLIK = 22
// Küre, yeni düşen hücrenin bu on binde olasılıkla çıkar; bedava dönüşte daha sıktır.
export const KURE_ONBINDE = 90
export const KURE_ONBINDE_BEDAVA = 450
/** Kürenin çarpanı ve ağırlığı: küçükler sık, büyükler nadir. */
export const KURELER = [
  { x: 2, a: 300 }, { x: 3, a: 220 }, { x: 4, a: 160 }, { x: 5, a: 120 }, { x: 6, a: 90 }, { x: 8, a: 60 },
  { x: 10, a: 40 }, { x: 12, a: 25 }, { x: 15, a: 18 }, { x: 20, a: 12 }, { x: 25, a: 8 }, { x: 50, a: 4 },
  { x: 100, a: 2 }, { x: 250, a: 0.6 }, { x: 500, a: 0.3 },
]
export const DAGINIK_ODEME = { 4: 3, 5: 5, 6: 100 }
// Bonus satın alma: bahsin bu katına doğrudan bedava dönüş başlar.
export const BONUS_FIYATI = 88

const TOPLAM = SEMBOLLER.reduce((t, x) => t + x.agirlik, 0) + DAGINIK_AGIRLIK
// Ağırlıklar ondalık olabildiği için tam sayıya (x10) çevrilir.
const KURE_TOPLAM = KURELER.reduce((t, k) => t + Math.round(k.a * 10), 0)

export const kureMi = (x) => typeof x === 'number'

function kureSec(rnd) {
  let r = rnd(KURE_TOPLAM)
  for (const k of KURELER) {
    const a = Math.round(k.a * 10)
    if (r < a) return k.x
    r -= a
  }
  return KURELER[0].x
}

/** Bir hücre: sembol, dağınık ya da küre (sayı). */
export function sembolSec(rnd = randomInt, bedava = false) {
  if (rnd(10000) < (bedava ? KURE_ONBINDE_BEDAVA : KURE_ONBINDE)) return kureSec(rnd)
  let r = rnd(TOPLAM)
  for (const x of SEMBOLLER) {
    if (r < x.agirlik) return x.s
    r -= x.agirlik
  }
  return DAGINIK
}

/** Tahta sütun sütun tutulur: `tahta[sutun][satir]`, satır 0 en üsttür. */
export function tahtaKur(rnd = randomInt, bedava = false) {
  return Array.from({ length: SUTUN }, () => Array.from({ length: SATIR }, () => sembolSec(rnd, bedava)))
}

export function odemeKati(sembol, adet) {
  const x = SEMBOLLER.find((k) => k.s === sembol)
  if (!x || adet < EN_AZ) return 0
  return x.odeme[adet >= 12 ? 2 : adet >= 10 ? 1 : 0]
}

/** Patlayanlar: sembol başına adet ve kat; `hucreler` "sutun * SATIR + satir" listesi. Küre ve dağınık patlamaz. */
export function patlayanlar(tahta) {
  const sayac = new Map()
  tahta.forEach((sutun, c) => sutun.forEach((s, r) => {
    if (s === DAGINIK || kureMi(s)) return
    if (!sayac.has(s)) sayac.set(s, [])
    sayac.get(s).push(c * SATIR + r)
  }))
  const odemeler = []
  const hucreler = []
  for (const [s, yerler] of sayac) {
    if (yerler.length < EN_AZ) continue
    odemeler.push({ s, adet: yerler.length, kat: odemeKati(s, yerler.length) })
    hucreler.push(...yerler)
  }
  return { odemeler, hucreler: hucreler.sort((a, b) => a - b) }
}

export function dusur(tahta, hucreler, rnd = randomInt, bedava = false) {
  const sil = new Set(hucreler)
  return tahta.map((sutun, c) => {
    const kalan = sutun.filter((_, r) => !sil.has(c * SATIR + r))
    return [...Array.from({ length: SATIR - kalan.length }, () => sembolSec(rnd, bedava)), ...kalan]
  })
}

export const daginikSay = (tahta) => tahta.flat().filter((s) => s === DAGINIK).length
export const kureToplami = (tahta) => tahta.flat().filter(kureMi).reduce((t, x) => t + x, 0)

/**
 * Tek dönüş: patlama bitene kadar düşme. Küreler düştükleri yerde kalır, son tahtadaki toplamları `kure`'dür.
 * @returns {{ adimlar: object[], kazanc: number, kure: number, daginik: number }}
 *   `kazanc` kürelerden önceki ham kazançtır. `adimlar[i]`: { tahta, patlayan, odemeler, kazanc }.
 */
export function donus(rnd = randomInt, bedava = false, ilkTahta = null) {
  let tahta = ilkTahta ?? tahtaKur(rnd, bedava)
  const adimlar = []
  let kazanc = 0
  for (let n = 0; n < 60; n += 1) {
    const { odemeler, hucreler } = patlayanlar(tahta)
    if (!hucreler.length) break
    const adimKazanci = odemeler.reduce((t, o) => t + o.kat, 0)
    adimlar.push({ tahta, patlayan: hucreler, odemeler, kazanc: adimKazanci })
    kazanc += adimKazanci
    tahta = dusur(tahta, hucreler, rnd, bedava)
  }
  adimlar.push({ tahta, patlayan: [], odemeler: [], kazanc: 0 })
  return { adimlar, kazanc, kure: kureToplami(tahta), daginik: daginikSay(tahta) }
}

const daginikOdemesi = (n) => (n >= DAGINIK_ESIK ? DAGINIK_ODEME[Math.min(n, 6)] : 0)

/**
 * Bedava dönüşler: kazandıran dönüşteki küreler toplam çarpana eklenir, toplam o dönüşün kazancını çarpar.
 * 3 dağınık +5 dönüş verir.
 */
export function bedavaTur(adet, rnd = randomInt) {
  const donusler = []
  let kalan = adet
  let carpan = 0
  let toplam = 0
  while (kalan > 0 && donusler.length < 100) {
    kalan -= 1
    const d = donus(rnd, true)
    if (d.kazanc > 0 && d.kure > 0) carpan += d.kure
    const kazanc = d.kazanc * (d.kazanc > 0 && carpan > 0 ? carpan : 1)
    const ek = d.daginik >= EK_ESIK ? EK_DONUS : 0
    kalan += ek
    toplam += kazanc
    donusler.push({ adimlar: d.adimlar, ham: d.kazanc, kure: d.kure, carpan, kazanc, ek })
  }
  return { donusler, kazanc: toplam }
}

/**
 * Bir el. `bonus`: doğrudan bedava dönüşle başlar (çarpan BONUS_FIYATI'na bölünür). Toplam AZAMI_KAT ile sınırlıdır.
 * Ana dönüşte küreler yalnızca o dönüşün kazancını çarpar.
 */
export function yildirimCevir(rnd = randomInt, { bonus = false } = {}) {
  const ana = donus(rnd, false)
  const anaKazanc = ana.kazanc * (ana.kazanc > 0 && ana.kure > 0 ? ana.kure : 1)
  const daginik = bonus ? Math.max(DAGINIK_ESIK, ana.daginik) : ana.daginik
  const daginikKazanc = daginikOdemesi(daginik)
  const bedava = daginik >= DAGINIK_ESIK ? bedavaTur(BEDAVA_DONUS, rnd) : null
  const ham = anaKazanc + daginikKazanc + (bedava?.kazanc ?? 0)
  const toplam = Math.min(ham, AZAMI_KAT)
  return {
    carpan: Math.floor((bonus ? toplam / BONUS_FIYATI : toplam) * 100) / 100,
    kat: Math.floor(toplam * 100) / 100,
    ana: { adimlar: ana.adimlar, ham: ana.kazanc, kure: ana.kure, kazanc: anaKazanc, daginik: ana.daginik },
    bedava,
    daginikKazanc,
    bonus,
    tavan: ham > AZAMI_KAT,
  }
}
