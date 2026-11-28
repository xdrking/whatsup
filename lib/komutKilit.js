// Komut kilidi (Faz 91): yönetim panelinden bir komut ya da panel oyunu bakıma alınır. `chat_jid` '*' bütün
// gruplar (ve özel sohbet) demektir, grup kimliği yalnızca o grup. Panel oyunları `panel:<oyun>` adıyla durur.
// Bot ve panel ayrı süreç olduğu için liste 10 sn bellekte kalır: kilit en geç 10 sn sonra işler.
import { getDb } from './db.js'
import logger from './logger.js'

const ONBELLEK_MS = 10_000
export const HEPSI = '*'
// Bunlar kilitlenmez: kilitlenince yardım, yönetim ya da susturmayı açma yolu kapanırdı.
export const KILITLENMEZ = new Set(['help', 'yonetim', 'konuş', 'sus', 'panel'])

let onbellek = null
let okunma = 0

function liste(simdi = Date.now()) {
  if (onbellek && simdi - okunma < ONBELLEK_MS) return onbellek
  const yeni = new Set()
  try {
    for (const r of getDb()?.prepare('SELECT chat_jid, komut FROM komut_kilit').all() ?? []) yeni.add(`${r.chat_jid}|${r.komut}`)
  } catch (err) {
    logger.error({ err }, 'Komut kilitleri okunamadı')
  }
  onbellek = yeni
  okunma = simdi
  return yeni
}

/** Komut bu sohbette kapalı mı? `ad` komutun asıl adıdır (alias değil) ya da `panel:<oyun>`. */
export function komutKapali(chatJid, ad, simdi = Date.now()) {
  if (KILITLENMEZ.has(ad)) return false
  const l = liste(simdi)
  return l.has(`${HEPSI}|${ad}`) || l.has(`${chatJid}|${ad}`)
}

/** @returns {{ chat_jid: string, komut: string, zaman: number }[]} */
export function kilitler() {
  try {
    return getDb()?.prepare('SELECT * FROM komut_kilit ORDER BY chat_jid, komut').all() ?? []
  } catch (err) {
    logger.error({ err }, 'Komut kilitleri okunamadı')
    return []
  }
}

/** @returns {boolean} değişti mi */
export function kilitYaz(chatJid, ad, kapali, now = Date.now()) {
  if (!ad || KILITLENMEZ.has(ad)) return false
  try {
    const db = getDb()
    if (!db) return false
    const r = kapali
      ? db.prepare('INSERT OR IGNORE INTO komut_kilit (chat_jid, komut, zaman) VALUES (?, ?, ?)').run(chatJid, ad, now)
      : db.prepare('DELETE FROM komut_kilit WHERE chat_jid = ? AND komut = ?').run(chatJid, ad)
    onbellek = null
    return r.changes > 0
  } catch (err) {
    logger.error({ err, chatJid, ad }, 'Komut kilidi yazılamadı')
    return false
  }
}
