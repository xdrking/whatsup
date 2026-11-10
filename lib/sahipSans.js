// Sahibin gizli kumar şansının açık/kapalı durumu (`.şans`). Bütün gruplarda geçerlidir.
// Her kumar çağrısında veritabanına gidilmesin diye bellekte de tutulur.
import logger from './logger.js'
import { getDb } from './db.js'

const ANAHTAR = 'sahip_sans'
let acik = null

export function sansAcikMi() {
  if (acik !== null) return acik
  acik = true
  try {
    const satir = getDb()?.prepare('SELECT deger FROM ayar WHERE anahtar = ?').get(ANAHTAR)
    if (satir) acik = satir.deger === '1'
  } catch (err) {
    logger.error({ err }, 'Şans ayarı okunamadı')
  }
  return acik
}

/** Veritabanı yazılamazsa durum yine bellekte değişir, yalnızca yeniden başlatmada kaybolur. */
export function sansAyarla(deger) {
  acik = Boolean(deger)
  try {
    getDb()?.prepare('INSERT OR REPLACE INTO ayar (anahtar, deger) VALUES (?, ?)').run(ANAHTAR, acik ? '1' : '0')
  } catch (err) {
    logger.error({ err }, 'Şans ayarı kaydedilemedi')
  }
}
