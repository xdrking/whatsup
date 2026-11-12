// Web panelinde kumar oynayan üyelerin hesapları (`panel_hesap`). Bot kayıt eder ve
// gruptan çıkanı siler; panel yalnızca girişte okur.
import { getDb } from './db.js'
import logger from './logger.js'

export const SIFRE_EN_AZ = 8

/** Girişte yazılan numara ya da LID: yalnızca rakamlar kalır (+90 555 … da olur). */
export const kimlikRakam = (metin) => String(metin ?? '').replace(/\D/g, '')

function panelSilSorgu(db, numara, lid) {
  if (numara) db.prepare('DELETE FROM panel_hesap WHERE numara = ?').run(numara)
  if (lid) db.prepare('DELETE FROM panel_hesap WHERE lid = ?').run(lid)
}

/**
 * Kişinin bütün grup satırlarını bu şifreyle yeniden yazar. Eski satırlar silinir:
 * artık üye olmadığı grupta hesap kalmasın.
 * @param {{ chatJid: string, userJid: string }[]} uyelikler
 */
export function panelKaydet({ uyelikler, numara, lid, sifre, now = Date.now() }) {
  const db = getDb()
  if (!db) return false
  try {
    db.transaction(() => {
      panelSilSorgu(db, numara, lid)
      const ekle = db.prepare('INSERT OR REPLACE INTO panel_hesap (chat_jid, user_jid, numara, lid, sifre, surum) VALUES (?, ?, ?, ?, ?, ?)')
      for (const u of uyelikler) ekle.run(u.chatJid, u.userJid, numara, lid, sifre, now)
    })()
    return true
  } catch (err) {
    logger.error({ err }, 'Panel hesabı yazılamadı')
    return false
  }
}

/** @returns {number} silinen satır sayısı; veritabanı yoksa -1 */
export function panelSil({ numara, lid }) {
  const db = getDb()
  if (!db) return -1
  try {
    const once = panelHesaplari({ numara, lid }).length
    panelSilSorgu(db, numara, lid)
    return once
  } catch (err) {
    logger.error({ err }, 'Panel hesabı silinemedi')
    return -1
  }
}

/** Gruptan çıkan ya da atılan üyelerin o gruptaki hesabı kapanır. Kimlik LID ya da numara gelebilir. */
export function panelUyeCikar(chatJid, jidler) {
  const db = getDb()
  if (!db || !jidler.length) return
  try {
    const sil = db.prepare(`
      DELETE FROM panel_hesap WHERE chat_jid = ?
        AND (user_jid = ? OR (numara <> '' AND numara = ?) OR (lid <> '' AND lid = ?))
    `)
    for (const jid of jidler) {
      const rakam = kimlikRakam(jid.split('@')[0])
      sil.run(chatJid, jid, jid.endsWith('@s.whatsapp.net') ? rakam : '', jid.endsWith('@lid') ? rakam : '')
    }
  } catch (err) {
    logger.error({ err, chatJid }, 'Gruptan çıkanın panel hesabı silinemedi')
  }
}

/** Bot gruptan çıkarılınca o grubun bütün hesapları kapanır. */
export function panelGrupKapat(chatJid) {
  try {
    getDb()?.prepare('DELETE FROM panel_hesap WHERE chat_jid = ?').run(chatJid)
  } catch (err) {
    logger.error({ err, chatJid }, 'Grubun panel hesapları silinemedi')
  }
}

/** Kişinin bütün grup satırları; numara ya da LID'den biri yeter. */
export function panelHesaplari({ numara = '', lid = '' }) {
  const db = getDb()
  if (!db || (!numara && !lid)) return []
  return db.prepare(`
    SELECT chat_jid, user_jid, numara, lid, sifre, surum FROM panel_hesap
    WHERE (? <> '' AND numara = ?) OR (? <> '' AND lid = ?)
    ORDER BY chat_jid
  `).all(numara, numara, lid, lid)
}

/** Girişte yazılan tek kimlik numara da LID de olabilir. */
export function girisHesaplari(kimlik) {
  const rakam = kimlikRakam(kimlik)
  if (!rakam) return []
  return panelHesaplari({ numara: rakam, lid: rakam })
}
