import logger from './logger.js'
import { getDb } from './db.js'

// Her mesajda bakıldığı için susturulan üyeler bellekte de tutulur (chat → user → bitiş ms).
let liste = null

// Susturmaya rağmen yazılıp silinen mesaj sayısı (chat|user → sayı). Yalnızca bellektedir:
// yeniden başlatmada sayım sıfırdan başlar, kişi en kötü ihtimalle bir kez daha uyarılır.
const ihlaller = new Map()

function yukle() {
  if (liste) return liste

  liste = new Map()
  try {
    const db = getDb()
    if (db) {
      for (const { chat_jid, user_jid, bitis } of db.prepare('SELECT * FROM susturulan_uye').all()) {
        if (!liste.has(chat_jid)) liste.set(chat_jid, new Map())
        liste.get(chat_jid).set(user_jid, bitis)
      }
    }
  } catch (err) {
    logger.error({ err }, 'Susturulan üyeler okunamadı')
  }
  return liste
}

/**
 * Kişi susturulmuş mu? Kişi LID ya da numarayla gelebildiği için birden fazla kimlik verilir.
 * @returns {string | null} listede eşleşen kimlik
 */
export function susturulanKimlik(chatJid, kimlikler, now = Date.now()) {
  const grup = yukle().get(chatJid)
  if (!grup) return null

  for (const jid of kimlikler) {
    if (!jid || !grup.has(jid)) continue
    const bitis = grup.get(jid)
    if (!bitis || now < bitis) return jid
    uyeSerbest(chatJid, jid)
  }
  return null
}

export const uyeSusturuldu = (chatJid, kimlikler, now = Date.now()) => Boolean(susturulanKimlik(chatJid, kimlikler, now))

/** Silinen mesajı sayar. @returns {number} bu susturmada silinen mesaj sayısı */
export function ihlalSay(chatJid, userJid) {
  const n = (ihlaller.get(`${chatJid}|${userJid}`) ?? 0) + 1
  ihlaller.set(`${chatJid}|${userJid}`, n)
  return n
}

export function ihlalSifirla(chatJid, userJid) {
  ihlaller.delete(`${chatJid}|${userJid}`)
}

/** `dakika` verilmezse kaldırılana kadar sürer. */
export function uyeSustur(chatJid, userJid, dakika, now = Date.now()) {
  const bitis = dakika ? now + dakika * 60_000 : 0
  ihlalSifirla(chatJid, userJid)
  const l = yukle()
  if (!l.has(chatJid)) l.set(chatJid, new Map())
  l.get(chatJid).set(userJid, bitis)

  try {
    getDb()?.prepare('INSERT OR REPLACE INTO susturulan_uye (chat_jid, user_jid, bitis) VALUES (?, ?, ?)').run(chatJid, userJid, bitis)
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Üye susturma kaydedilemedi')
  }
  return bitis
}

/** @returns {boolean} kişi susturulmuş muydu */
export function uyeSerbest(chatJid, userJid) {
  const grup = yukle().get(chatJid)
  const vardi = Boolean(grup?.delete(userJid))
  ihlalSifirla(chatJid, userJid)

  try {
    getDb()?.prepare('DELETE FROM susturulan_uye WHERE chat_jid = ? AND user_jid = ?').run(chatJid, userJid)
  } catch (err) {
    logger.error({ err, chatJid, userJid }, 'Üye susturması kaldırılamadı')
  }
  return vardi
}

/** @returns {{ jid: string, bitis: number }[]} */
export function susturulanUyeler(chatJid, now = Date.now()) {
  const grup = yukle().get(chatJid)
  if (!grup) return []
  return [...grup].filter(([jid]) => uyeSusturuldu(chatJid, [jid], now)).map(([jid, bitis]) => ({ jid, bitis }))
}
