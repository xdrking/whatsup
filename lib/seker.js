// Şeker Fırtınası: 6x5 tahtada düşen şekerler. Saf; rastgelelik dışarıdan verilir (testte sabit).
// Aynı şekerden tahtanın herhangi bir yerinde 8 ya da daha fazlası varsa öder ve patlar, üstteki
// şekerler aşağı düşer, boşluğa yenileri yağar. Aynı dönüşte her yeni patlama kombo çarpanını büyütür.
// 🌈 dağınıktır: patlamaz, 4+ tane bedava dönüş açar. Bedava dönüşlerde kombo dönüşler arasında sıfırlanmaz.
// Beklenen dönüş ≈ %96; ağırlık, ödeme ya da kombo değişirse test/seker.test.js aralığı denetler.
import { randomInt } from 'node:crypto'

export const SUTUN = 6
export const SATIR = 5
export const EN_AZ = 8
export const DAGINIK = '🌈'
export const DAGINIK_ESIK = 4
// Bedava dönüşte 3 dağınık ek dönüş verir.
export const EK_ESIK = 3
export const EK_DONUS = 5
export const AZAMI_KAT = 5000

/**
 * `odeme`: [8-9, 10-12, 13+] adet için bahsin katı. Ucuzdan pahalıya sıralıdır.
 * Kod veritabanına yazılmaz, sembol değiştirilebilir.
 */
export const SEKERLER = [
  { s: '🍪', ad: 'Kurabiye', agirlik: 200, odeme: [0.15, 0.35, 1] },
  { s: '🍩', ad: 'Halka', agirlik: 180, odeme: [0.2, 0.5, 1.4] },
  { s: '🧁', ad: 'Kek', agirlik: 160, odeme: [0.25, 0.6, 2] },
  { s: '🍮', ad: 'Puding', agirlik: 140, odeme: [0.35, 0.7, 2.75] },
  { s: '🍫', ad: 'Çikolata', agirlik: 110, odeme: [0.5, 1, 4] },
  { s: '🍬', ad: 'Akide', agirlik: 90, odeme: [0.7, 1.4, 7] },
  { s: '🍰', ad: 'Pasta', agirlik: 70, odeme: [1, 3.5, 10] },
  { s: '💖', ad: 'Kalp şeker', agirlik: 50, odeme: [2.75, 7, 27.5] },
]
export const DAGINIK_AGIRLIK = 18
// 4, 5, 6+ dağınığın ödemesi ve verdiği bedava dönüş.
export const DAGINIK_ODEME = { 4: 3, 5: 5, 6: 100 }
export const BEDAVA_DONUS = { 4: 12, 5: 15, 6: 20 }
// Aynı dönüşteki n. patlamanın çarpanı; son basamaktan sonra sabit kalır.
export const KOMBO = [1, 2, 3, 5, 8, 13, 21]
// Bonus satın alma: bahsin bu katına doğrudan bedava dönüş (4 dağınık) başlar.
export const BONUS_FIYATI = 62

const TOPLAM = SEKERLER.reduce((t, x) => t + x.agirlik, 0) + DAGINIK_AGIRLIK

export function sekerSec(rnd = randomInt) {
  let r = rnd(TOPLAM)
  for (const x of SEKERLER) {
    if (r < x.agirlik) return x.s
    r -= x.agirlik
  }
  return DAGINIK
}

export const komboCarpani = (n) => KOMBO[Math.min(n, KOMBO.length - 1)]

/** Tahta sütun sütun tutulur: `tahta[sutun][satir]`, satır 0 en üsttür. */
export function tahtaKur(rnd = randomInt) {
  return Array.from({ length: SUTUN }, () => Array.from({ length: SATIR }, () => sekerSec(rnd)))
}

export function odemeKati(sembol, adet) {
  const x = SEKERLER.find((k) => k.s === sembol)
  if (!x || adet < EN_AZ) return 0
  return x.odeme[adet >= 13 ? 2 : adet >= 10 ? 1 : 0]
}

/** Bu tahtada patlayanlar: sembol başına adet ve kat; `hucreler` "sutun,satir" listesi. */
export function patlayanlar(tahta) {
  const sayac = new Map()
  tahta.forEach((sutun, c) => sutun.forEach((s, r) => {
    if (s === DAGINIK) return
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

/** Patlayanlar silinir, üsttekiler düşer, boşluk yeni şekerle dolar. */
export function dusur(tahta, hucreler, rnd = randomInt) {
  const sil = new Set(hucreler)
  return tahta.map((sutun, c) => {
    const kalan = sutun.filter((_, r) => !sil.has(c * SATIR + r))
    const yeni = Array.from({ length: SATIR - kalan.length }, () => sekerSec(rnd))
    return [...yeni, ...kalan]
  })
}

export const daginikSay = (tahta) => tahta.flat().filter((s) => s === DAGINIK).length

/**
 * Tek dönüş: patlama bitene kadar düşme. `kombo` önceki dönüşlerden süren basamaktır (bedava dönüşte).
 * @returns {{ adimlar: object[], kazanc: number, kombo: number, daginik: number }}
 *   `adimlar[i]`: { tahta, patlayan, odemeler, carpan, kazanc } (son adımda patlayan boş).
 */
export function donus(rnd = randomInt, kombo = 0, ilkTahta = null) {
  let tahta = ilkTahta ?? tahtaKur(rnd)
  const adimlar = []
  let kazanc = 0
  for (;;) {
    const { odemeler, hucreler } = patlayanlar(tahta)
    if (!hucreler.length) {
      adimlar.push({ tahta, patlayan: [], odemeler: [], carpan: 0, kazanc: 0 })
      break
    }
    const carpan = komboCarpani(kombo)
    const adimKazanci = odemeler.reduce((t, o) => t + o.kat, 0) * carpan
    adimlar.push({ tahta, patlayan: hucreler, odemeler, carpan, kazanc: adimKazanci })
    kazanc += adimKazanci
    kombo += 1
    tahta = dusur(tahta, hucreler, rnd)
  }
  return { adimlar, kazanc, kombo, daginik: daginikSay(tahta) }
}

const bedavaSayisi = (n) => BEDAVA_DONUS[Math.min(n, 6)]
const daginikOdemesi = (n) => (n >= DAGINIK_ESIK ? DAGINIK_ODEME[Math.min(n, 6)] : 0)

/** Bedava dönüş turu: kombo dönüşler arasında sürer, 3 dağınık ek dönüş verir. */
export function bedavaTur(adet, rnd = randomInt) {
  const donusler = []
  let kalan = adet
  let kombo = 0
  let toplam = 0
  let ek = 0
  while (kalan > 0 && donusler.length < 100) {
    kalan -= 1
    const d = donus(rnd, kombo)
    kombo = d.kombo
    const ekDonus = d.daginik >= EK_ESIK ? EK_DONUS : 0
    kalan += ekDonus
    ek += ekDonus
    toplam += d.kazanc
    donusler.push({ adimlar: d.adimlar, kazanc: d.kazanc, ek: ekDonus, kombo: d.kombo })
  }
  return { donusler, kazanc: toplam, ek }
}

/**
 * Bir el: ana dönüş, gerekirse bedava dönüşler. `bonus`: doğrudan 4 dağınıkla başlar (satın alınan bonus,
 * çarpan BONUS_FIYATI'na bölünür). Toplam AZAMI_KAT ile sınırlıdır.
 * @returns {{ carpan: number, ana: object, bedava: object | null, daginikKazanc: number, tavan: boolean }}
 */
export function sekerCevir(rnd = randomInt, { bonus = false } = {}) {
  const ana = donus(rnd)
  const daginik = bonus ? Math.max(DAGINIK_ESIK, ana.daginik) : ana.daginik
  const daginikKazanc = daginikOdemesi(daginik)
  const bedava = daginik >= DAGINIK_ESIK ? bedavaTur(bedavaSayisi(daginik), rnd) : null
  const ham = ana.kazanc + daginikKazanc + (bedava?.kazanc ?? 0)
  const toplam = Math.min(ham, AZAMI_KAT)
  const carpan = Math.floor((bonus ? toplam / BONUS_FIYATI : toplam) * 100) / 100
  return {
    carpan,
    kat: Math.floor(toplam * 100) / 100,
    ana: { adimlar: ana.adimlar, kazanc: ana.kazanc, daginik: ana.daginik },
    bedava,
    daginikKazanc,
    bonus,
    tavan: ham > AZAMI_KAT,
  }
}
