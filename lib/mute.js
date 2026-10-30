import logger from './logger.js'
import { getDb } from './db.js'

// Her mesajda veritabanına sorulmasın diye susturulan gruplar bellekte de
// tutulur; ilk erişimde veritabanından bir kez yüklenir.
let susturulan = null

function yukle() {
  if (susturulan) return susturulan

  susturulan = new Set()
  try {
    const db = getDb()
    if (db) {
      for (const { chat_jid } of db.prepare('SELECT chat_jid FROM muted_chats').all()) {
        susturulan.add(chat_jid)
      }
    }
  } catch (err) {
    logger.error({ err }, 'Susturulan gruplar okunamadı')
  }

  return susturulan
}

export function isMuted(chatJid) {
  return yukle().has(chatJid)
}

/**
 * Grubu susturur ya da açar. Veritabanı yazılamazsa durum yine bellekte
 * değişir: komut çalışmış görünür, yalnızca yeniden başlatmada kaybolur.
 */
export function setMuted(chatJid, muted) {
  const set = yukle()
  if (muted) set.add(chatJid)
  else set.delete(chatJid)

  try {
    const db = getDb()
    if (!db) return

    if (muted) {
      db.prepare('INSERT OR REPLACE INTO muted_chats (chat_jid, muted_at) VALUES (?, ?)').run(chatJid, Date.now())
    } else {
      db.prepare('DELETE FROM muted_chats WHERE chat_jid = ?').run(chatJid)
    }
  } catch (err) {
    logger.error({ err, chatJid }, 'Susturma durumu kaydedilemedi')
  }
}
