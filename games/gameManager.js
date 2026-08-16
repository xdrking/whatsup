import logger from '../lib/logger.js'

// Oyun durumu bilerek yalnızca bellekte: bot yeniden başlarsa yarım kalan
// oyunlar düşer, bu kabul edilen davranıştır (bkz. CLAUDE.md, durum tablosu).
const activeGames = new Map()

const VARSAYILAN_TIMEOUT_MS = 3_600_000

/** Testlerde kısaltılabilsin diye ortamdan okunur; normalde 1 saat. */
export function timeoutMs() {
  const ham = Number.parseInt(process.env.OYUN_TIMEOUT_MS || '', 10)
  return Number.isFinite(ham) && ham > 0 ? ham : VARSAYILAN_TIMEOUT_MS
}

export function getGame(chatJid) {
  return activeGames.get(chatJid) || null
}

function zamanlayiciKur(state) {
  const sure = timeoutMs()
  state.expiresAt = Date.now() + sure

  // unref: bekleyen bir oyun zamanlayıcısı süreç kapanışını geciktirmesin.
  state.timer = setTimeout(() => {
    // Zaman aşımı mesajı gönderilemese bile oyun mutlaka temizlenir, yoksa
    // grup kalıcı olarak "zaten aktif bir oyun var" durumunda kilitlenir.
    Promise.resolve()
      .then(() => state.onTimeout?.())
      .catch((err) => logger.error({ err, chatJid: state.chatJid }, 'Oyun zaman aşımı mesajı gönderilemedi'))
      .finally(() => endGame(state.chatJid))
  }, sure)

  state.timer.unref?.()
}

/**
 * Yeni oyun kaydeder. Grupta zaten oyun varsa `null` döner — çağıran komut
 * kullanıcıya "zaten aktif bir oyun var" yazar.
 */
export function startGame(chatJid, state) {
  if (activeGames.has(chatJid)) return null

  const oyun = { ...state, chatJid, startedAt: Date.now(), timer: null, expiresAt: 0 }
  activeGames.set(chatJid, oyun)
  zamanlayiciKur(oyun)

  logger.info({ chatJid, tip: oyun.type }, 'Oyun başladı')
  return oyun
}

export function endGame(chatJid) {
  const state = activeGames.get(chatJid)
  if (!state) return null

  clearTimeout(state.timer)
  activeGames.delete(chatJid)

  logger.info({ chatJid, tip: state.type }, 'Oyun bitti')
  return state
}

/**
 * Botun en son oyun mesajının id'si. Yalnızca bu mesaja verilen yanıtlar
 * işlenir; eski mesajlara yanıt verenler görmezden gelinir.
 */
export function setLastMessage(chatJid, id) {
  const state = activeGames.get(chatJid)
  if (!state || !id) return

  state.lastMessageId = id
}

/** Zaman aşımı sayacını sıfırlar: süre son geçerli cevaptan itibaren işler. */
export function touchGame(chatJid) {
  const state = activeGames.get(chatJid)
  if (!state) return

  clearTimeout(state.timer)
  zamanlayiciKur(state)
}

/**
 * Oyun mesajına verilen yanıtları ilgili oyuna iletir.
 *
 * @returns {Promise<boolean>} true ise mesaj oyun tarafından tüketildi,
 *   handler komut çözümlemesine devam etmemeli.
 */
export async function handleGameReply({ sock, msg, parsed }) {
  // Oyunlar yalnızca grupta oynanır.
  if (!parsed.isGroup) return false

  const state = activeGames.get(parsed.from)
  if (!state) return false

  const quotedId = parsed.quoted?.key?.id
  // Yanıt değilse ya da güncel oyun mesajına değilse oyun hiç haberdar olmaz:
  // normal grup sohbeti oyundan etkilenmez.
  if (!quotedId || quotedId !== state.lastMessageId) return false

  const body = parsed.body?.trim()
  if (!body) return false

  // Oyun mesajını yanıtlayarak komut yazılabilsin (ör. .oyunbitir, .help).
  const prefix = process.env.PREFIX || '.'
  if (body.startsWith(prefix)) return false

  try {
    await state.onAnswer({ sock, msg, parsed, state, body })
  } catch (err) {
    logger.error({ err, chatJid: parsed.from, tip: state.type }, 'Oyun cevabı işlenemedi')
  }

  // Hata olsa bile mesaj tüketilmiş sayılır: oyun cevabı komut olarak
  // yorumlanmaya çalışılmamalı.
  return true
}
