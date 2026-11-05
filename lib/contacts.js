import { jidNormalizedUser } from '@whiskeysockets/baileys'
import { getDb } from './db.js'
import logger from './logger.js'

// Baileys yanıtlanan mesajın YAZARININ adını vermez; contextInfo yalnızca JID
// taşır. Ama o kişinin mesajı bir noktada bu bottan geçmiştir ve pushName o
// mesajda vardır. Bu yüzden görülen adlar burada tutulur.
//
// Adlar `isimler` tablosuna da yazılır: panel ve yeniden başlatma sonrası
// aramalar oradan okur. Map, her mesajda veritabanına gidilmesin diye durur.
const MAX_ENTRIES = 500

const names = new Map()

function keyOf(jid) {
  if (!jid) return ''
  try {
    return jidNormalizedUser(jid)
  } catch {
    // jidNormalizedUser bozuk JID'de hata atar; ham değer yine de anahtar olur.
    return jid
  }
}

function adKaydet(key, ad) {
  try {
    getDb()?.prepare(`
      INSERT INTO isimler (user_jid, ad, guncelleme) VALUES (?, ?, ?)
      ON CONFLICT (user_jid) DO UPDATE SET ad = excluded.ad, guncelleme = excluded.guncelleme
    `).run(key, ad, Date.now())
  } catch (err) {
    logger.error({ err, key }, 'Ad kaydedilemedi')
  }
}

function adOku(key) {
  try {
    return getDb()?.prepare('SELECT ad FROM isimler WHERE user_jid = ?').get(key)?.ad ?? ''
  } catch (err) {
    logger.error({ err, key }, 'Ad okunamadı')
    return ''
  }
}

/** Gelen mesajdaki pushName'i sonraki aramalar için saklar. */
export function rememberName(jid, name) {
  const key = keyOf(jid)
  const clean = (name || '').trim()
  if (!key || !clean) return

  if (names.get(key) !== clean) adKaydet(key, clean)

  // Yeniden ekleme kaydı Map'in sonuna taşır: en eski kayıt hep ilk sıradadır.
  names.delete(key)
  names.set(key, clean)

  if (names.size > MAX_ENTRIES) {
    names.delete(names.keys().next().value)
  }
}

/** Bilinen adı döner; kişi hiç görülmediyse boş string. */
export function lookupName(jid) {
  const key = keyOf(jid)
  if (!key) return ''
  return names.get(key) || adOku(key)
}
