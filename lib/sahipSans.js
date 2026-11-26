// Sahibin gizli kumar şansı (`.şans`). Bütün gruplarda, WhatsApp'ta ve panelde geçerlidir.
// Şans kişiye bağlıdır: `.şans aç`'ı yazan sahibin kimlikleri (numara ve LID rakamları) saklanır,
// listede olmayanın şansı kapanır. Oynayan ayrıca şu an da sahip olmalıdır (.env'deki OWNER_NUMBER
// ya da OWNER_LID): sahiplik geri alınan kişi listede kalsa bile şans almaz.
// Bot ve panel ayrı süreçtir, ikisi de veritabanından okur; bellekteki kopya kısa süre geçerlidir.
import logger from './logger.js'
import { getDb } from './db.js'

const ANAHTAR = 'sahip_sans'
const OKUMA_MS = 10_000
let onbellek = null
let okundu = 0

/** "905551112233@s.whatsapp.net", "123:4@lid", "+90 555…" → yalnızca rakamlar. */
export const kimlikRakam = (deger) => String(deger ?? '').split('@')[0].split(':')[0].replace(/\D/g, '')

/** Şu anki sahibin kimlikleri: .env'deki numara ve LID'ler. */
export function sahipKimlikleri() {
  const numara = kimlikRakam(process.env.OWNER_NUMBER)
  const lidler = (process.env.OWNER_LID || '').split(',').map(kimlikRakam)
  return [...new Set([numara, ...lidler].filter(Boolean))]
}

/**
 * Şansı açık kişilerin kimlikleri. Eski sürüm tek bayrak tutuyordu ('1'/'0'): '1' ve hiç kayıt
 * olmaması "şu anki sahip için açık" demekti (varsayılan açık), öyle okunur.
 */
export function sansKisileri() {
  if (onbellek && Date.now() - okundu < OKUMA_MS) return onbellek
  let liste = sahipKimlikleri()
  try {
    const deger = getDb()?.prepare('SELECT deger FROM ayar WHERE anahtar = ?').get(ANAHTAR)?.deger
    if (deger === '0') liste = []
    else if (deger && deger !== '1') liste = JSON.parse(deger).map(kimlikRakam).filter(Boolean)
  } catch (err) {
    logger.error({ err }, 'Şans ayarı okunamadı')
  }
  onbellek = liste
  okundu = Date.now()
  return liste
}

export const sansAcikMi = () => sansKisileri().length > 0

function yaz(liste) {
  onbellek = liste
  okundu = Date.now()
  try {
    getDb()?.prepare('INSERT OR REPLACE INTO ayar (anahtar, deger) VALUES (?, ?)').run(ANAHTAR, liste.length ? JSON.stringify(liste) : '0')
  } catch (err) {
    logger.error({ err }, 'Şans ayarı kaydedilemedi')
  }
}

/**
 * Şansı yazanın kimliklerine ve şu anki sahibe açar; listede başka kim varsa (sahipliği geri
 * alınmış biri) şansı kapanır. @returns {{ kapatilan: string[] }} şansı kapanan kimlikler.
 */
export function sansAc(kimlikler) {
  const yeni = [...new Set([...kimlikler.map(kimlikRakam), ...sahipKimlikleri()].filter(Boolean))]
  const kapatilan = sansKisileri().filter((k) => !yeni.includes(k))
  yaz(yeni)
  return { kapatilan }
}

export const sansKapat = () => yaz([])

/** Bu kimliklerden biri şansı açmış ve şu an da sahip mi? */
export function sansliMi(...kimlikler) {
  const sahip = sahipKimlikleri()
  const liste = sansKisileri()
  return kimlikler.map(kimlikRakam).some((k) => k && liste.includes(k) && sahip.includes(k))
}
