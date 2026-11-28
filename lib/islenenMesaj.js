// Aynı mesajın iki kez işlenmemesi (Faz 94). Botun kendi telefonundan yazılan mesaj bağlı cihaza (bota) şifreli
// gelir; çözülemezse bot telefondan yeniden ister ve telefon mesajı dakikalar, saatler sonra yeni zaman damgasıyla
// tekrar gönderebilir. Yaş denetimi (index.js, 90 sn) bunu yakalamıyordu: `.panel kayıt` günde 15 kez, `.devret`
// beş dakika sonra yeniden çalışıyordu. Mesaj kimliği (`key.id`, sohbet ve yazanla birlikte) kalıcı yazılır, aynı
// kimlik ikinci kez gelirse yok sayılır. Yeniden başlatmada da hatırlansın diye veritabanındadır.
import { getDb } from './db.js'
import logger from './logger.js'

// Telefon bundan sonra yeniden göndermez; eski kimlikler temizlenir.
const SAKLAMA_MS = 7 * 24 * 60 * 60_000
const TEMIZLIK_MS = 60 * 60_000

let sorgular = null
let sonTemizlik = 0

function hazirla() {
  const db = getDb()
  if (!db) return null
  sorgular ??= {
    ekle: db.prepare('INSERT OR IGNORE INTO islenen_mesaj (anahtar, zaman) VALUES (?, ?)'),
    temizle: db.prepare('DELETE FROM islenen_mesaj WHERE zaman < ?'),
  }
  return sorgular
}

export const mesajAnahtari = (key) => `${key?.remoteJid ?? ''}|${key?.participant ?? ''}|${key?.id ?? ''}`

/**
 * Mesaj ilk kez mi geliyor? İlk kezse kimliği yazar. Kimliksiz mesaj ve veritabanı hatası "ilk kez" sayılır:
 * dedup çalışmasa da bot susmasın.
 */
export function ilkKezMi(key, now = Date.now()) {
  if (!key?.id) return true
  try {
    const q = hazirla()
    if (!q) return true
    if (now - sonTemizlik > TEMIZLIK_MS) {
      sonTemizlik = now
      q.temizle.run(now - SAKLAMA_MS)
    }
    return q.ekle.run(mesajAnahtari(key), now).changes === 1
  } catch (err) {
    logger.error({ err }, 'İşlenen mesaj kaydı yazılamadı')
    return true
  }
}
