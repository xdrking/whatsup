// Panelin şifre, deneme sınırı ve oturum kuralları. Durum yalnızca bellektedir:
// panel yeniden başlarsa oturumlar kapanır, sayaçlar sıfırlanır.
import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb)

// Her deneme ~32 MB bellek ve onlarca ms ister: hash çalınsa bile tahmin pahalıdır.
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const ANAHTAR_UZUNLUGU = 32

const DAKIKA_MS = 60_000
const IP_HAKKI = 5
const ILK_KILIT_MS = 15 * DAKIKA_MS
const AZAMI_KILIT_MS = 24 * 60 * DAKIKA_MS
// Çok IP'den gelen saldırı için. Oturumu açık olan etkilenmez.
const GENEL_HAK = 30
const GENEL_PENCERE_MS = 10 * DAKIKA_MS

const OTURUM_MS = 7 * 24 * 60 * DAKIKA_MS

const SIFRE_UZUNLUGU = 24
const SIFRE_HARFLERI = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Rastgele üretilen şifre ~137 bittir: deneme sınırı olmasa bile tahmin edilemez. */
export function sifreUret() {
  return Array.from({ length: SIFRE_UZUNLUGU }, () => SIFRE_HARFLERI[randomInt(SIFRE_HARFLERI.length)]).join('')
}

export async function sifreHashle(sifre) {
  const tuz = randomBytes(16)
  const anahtar = await scrypt(sifre, tuz, ANAHTAR_UZUNLUGU, SCRYPT)
  return `${tuz.toString('hex')}:${anahtar.toString('hex')}`
}

export async function sifreDogru(sifre, kayit) {
  const [tuz, beklenen] = String(kayit).split(':')
  if (!tuz || !beklenen) return false

  const anahtar = await scrypt(sifre, Buffer.from(tuz, 'hex'), ANAHTAR_UZUNLUGU, SCRYPT)
  const hedef = Buffer.from(beklenen, 'hex')
  return hedef.length === anahtar.length && timingSafeEqual(hedef, anahtar)
}

/**
 * Deneme, şifreye bakılmadan ÖNCE sayılır. Sonuca göre sayılsaydı aynı anda
 * gönderilen yüzlerce istek, hiçbiri bitmeden sınırı geçerdi.
 */
export function denemeSiniri({ saat = Date.now } = {}) {
  const ipler = new Map()
  let genelBaslangic = 0
  let genelSayi = 0

  return {
    /** @returns {{ izin: boolean, bekleMs: number }} */
    dene(ip) {
      const simdi = saat()

      if (simdi - genelBaslangic >= GENEL_PENCERE_MS) {
        genelBaslangic = simdi
        genelSayi = 0
      }
      if (genelSayi >= GENEL_HAK) return { izin: false, bekleMs: genelBaslangic + GENEL_PENCERE_MS - simdi }

      for (const [anahtar, k] of ipler) {
        if (simdi - k.son >= AZAMI_KILIT_MS + k.kilitMs) ipler.delete(anahtar)
      }

      const kayit = ipler.get(ip) ?? { sayi: 0, kilitli: 0, kilitMs: 0, son: simdi }
      if (kayit.kilitli > simdi) return { izin: false, bekleMs: kayit.kilitli - simdi }

      kayit.sayi += 1
      kayit.son = simdi
      if (kayit.sayi >= IP_HAKKI) {
        // Her kilit bir öncekinin iki katı: kilit bitince yine 5 hak değil, süre büyür.
        kayit.kilitMs = Math.min(kayit.kilitMs ? kayit.kilitMs * 2 : ILK_KILIT_MS, AZAMI_KILIT_MS)
        kayit.kilitli = simdi + kayit.kilitMs
        kayit.sayi = 0
      }
      ipler.set(ip, kayit)
      genelSayi += 1
      return { izin: true, bekleMs: 0 }
    },

    basarili(ip) {
      ipler.delete(ip)
    },
  }
}

const ozet = (jeton) => createHash('sha256').update(jeton).digest('hex')

/**
 * Bellekte jetonun kendisi değil özeti durur. `veri` oturumun kime ait olduğudur:
 * `{ tur: 'yonetici' }` ya da `{ tur: 'oyuncu', numara, lid, surum }`.
 */
export function oturumlar({ saat = Date.now } = {}) {
  const acik = new Map()

  const oku = (jeton) => {
    if (!jeton) return null
    const o = acik.get(ozet(jeton))
    return o && o.bitis > saat() ? o : null
  }

  return {
    ac(veri = { tur: 'yonetici' }) {
      const simdi = saat()
      for (const [anahtar, o] of acik) {
        if (o.bitis <= simdi) acik.delete(anahtar)
      }
      const jeton = randomBytes(32).toString('base64url')
      acik.set(ozet(jeton), { bitis: simdi + OTURUM_MS, veri })
      return jeton
    },

    gecerli(jeton) {
      return Boolean(oku(jeton))
    },

    /** @returns {object | null} oturumun sahibi */
    veri(jeton) {
      return oku(jeton)?.veri ?? null
    },

    kapat(jeton) {
      if (jeton) acik.delete(ozet(jeton))
    },
  }
}

export const OTURUM_SANIYE = OTURUM_MS / 1000
