import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import logger from '../lib/logger.js'
import { addXp } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'
import {
  WordServiceError,
  isValidTurkishWord,
  lastLetter,
  trLower,
  trUpper,
} from '../lib/turkishWords.js'
import { endGame, getGame, setLastMessage, startGame, touchGame } from './gameManager.js'

const GAMES_DIR = path.dirname(fileURLToPath(import.meta.url))
const HAVUZ_DOSYASI = path.join(GAMES_DIR, 'kelimeler.json')

const XP_KELIME = 3

// Türkçe harfler + düzeltme işaretli ünlüler (rüzgâr, hikâye). Rakam, boşluk
// ve noktalama kabul edilmez: cevap tek bir kelime olmalı.
const KELIME_BICIMI = /^[a-zâçğıîöşüû]+$/

const havuzHatasi = 'Kelime havuzu okunamadı; `games/kelimeler.json` eksik, bozuk ya da boş olabilir.'

let havuz = null

/** Elle yazılmış başlangıç kelimeleri; bir kez okunur, kod asla yazmaz. */
async function havuzuYukle() {
  if (havuz) return havuz

  const raw = await readFile(HAVUZ_DOSYASI, 'utf8')
  const parsed = JSON.parse(raw)

  if (!Array.isArray(parsed)) throw new Error('games/kelimeler.json bir JSON dizisi değil')

  const items = parsed.filter((item) => typeof item === 'string' && KELIME_BICIMI.test(trLower(item)))
  if (!items.length) throw new Error('games/kelimeler.json kullanılabilir kelime içermiyor')

  if (items.length !== parsed.length) {
    logger.warn(
      { atlanan: parsed.length - items.length },
      'Kelime havuzunda geçersiz satırlar atlandı',
    )
  }

  havuz = items
  return havuz
}

function enIyiOyuncu(scores) {
  let best = null

  for (const [jid, adet] of scores) {
    if (!best || adet > best.adet) best = { jid, adet }
  }

  return best
}

function bitisMetni(state, sebep, baslik = '😔 Üzgünüm dostum...') {
  const lines = [baslik, '', 'Kelime oyunu durduruldu.', sebep]
  const mentions = []

  lines.push(`🔗 Toplam kelime: ${state.total}`)

  const best = enIyiOyuncu(state.scores)
  if (best) {
    lines.push(`🏆 En çok kelime bulan: ${mentionOf(best.jid)} (${best.adet})`)
    mentions.push(best.jid)
  }

  return { text: lines.join('\n'), mentions }
}

async function cevapla(sock, msg, from, content) {
  return sock.sendMessage(from, content, { quoted: msg })
}

/**
 * Oyun mesajına gelen yanıtı değerlendirir. Geçersiz cevaplarda oyun durumunun
 * hiçbir alanı değişmez: kelime, harf, son mesaj id'si ve süre aynı kalır.
 */
async function cevapAl({ sock, msg, parsed, state, body }) {
  const from = state.chatJid
  const kelime = trLower(body)

  if (!KELIME_BICIMI.test(kelime) || kelime.length < 2) {
    await cevapla(sock, msg, from, { text: '❌ Tek bir kelime yaz.' })
    return
  }

  if (!kelime.startsWith(state.requiredLetter)) {
    await cevapla(sock, msg, from, {
      text: `❌ ${trUpper(kelime)}, ${trUpper(state.requiredLetter)} harfiyle başlamalı.`,
    })
    return
  }

  if (state.used.has(kelime)) {
    await cevapla(sock, msg, from, { text: '❌ Bu kelime daha önce kullanıldı.' })
    return
  }

  // Ağ isteğinden önceki durum: doğrulama sürerken başka biri geçerli bir
  // cevap verirse bu cevap artık geçersizdir (ilk geçerli cevap kazanır).
  const beklenenMesajId = state.lastMessageId
  const beklenenKelime = state.currentWord

  let gecerli
  try {
    gecerli = await isValidTurkishWord(kelime)
  } catch (err) {
    if (!(err instanceof WordServiceError)) throw err

    logger.warn({ err: err.message, kelime }, 'Kelime doğrulanamadı, oyun durumu korunuyor')
    await cevapla(sock, msg, from, {
      text: '⚠️ Kelime doğrulama servisine şu anda ulaşılamıyor. Lütfen tekrar deneyin.',
    })
    return
  }

  if (
    getGame(from) !== state ||
    state.lastMessageId !== beklenenMesajId ||
    state.currentWord !== beklenenKelime
  ) {
    logger.info({ from, kelime }, 'Doğrulama sürerken oyun ilerledi, geç kalan cevap atlandı')
    return
  }

  if (!gecerli) {
    await cevapla(sock, msg, from, { text: `❌ ${trUpper(kelime)} TDK sözlüğünde yok.` })
    return
  }

  state.used.add(kelime)
  state.total += 1
  state.scores.set(parsed.sender, (state.scores.get(parsed.sender) || 0) + 1)
  state.currentWord = kelime
  state.requiredLetter = lastLetter(kelime)

  addXp({ chatJid: from, userJid: parsed.sender, amount: XP_KELIME })

  const result = await cevapla(sock, msg, from, {
    text: [
      `✅ ${mentionOf(parsed.sender)} — ${trUpper(kelime)}`,
      `🔤 Sıradaki harf: ${trUpper(state.requiredLetter)}`,
    ].join('\n'),
    mentions: [parsed.sender],
  })

  // Artık sıradaki cevaplar bu mesaja verilmeli.
  setLastMessage(from, result?.key?.id)
  touchGame(from)
}

/** `.kelime` komutunun gövdesi. Oyun başlatılamadıysa false döner. */
export async function start({ sock, msg, from, sender }) {
  let kelimeler
  try {
    kelimeler = await havuzuYukle()
  } catch (err) {
    logger.error({ err }, 'Kelime havuzu okunamadı')
    await cevapla(sock, msg, from, { text: havuzHatasi })
    return false
  }

  const ilk = trLower(kelimeler[Math.floor(Math.random() * kelimeler.length)])
  const harf = lastLetter(ilk)

  const state = startGame(from, {
    type: 'kelime',
    starterJid: sender,
    lastMessageId: null,
    currentWord: ilk,
    requiredLetter: harf,
    used: new Set([ilk]),
    scores: new Map(),
    total: 0,
    onAnswer: cevapAl,
    summarize: (s) => bitisMetni(s, '🛑 Oyun elle bitirildi.', '🏁 *OYUN BİTTİ*'),
    onTimeout: async () => {
      const bitti = bitisMetni(state, '⏱️ 1 saat boyunca kimse geçerli bir cevap vermedi.')
      await sock.sendMessage(from, bitti)
    },
  })

  if (!state) return false

  const result = await cevapla(sock, msg, from, {
    text: [
      '🔤 *KELİME OYUNU BAŞLADI!*',
      '',
      `İlk kelime: *${trUpper(ilk)}*`,
      '',
      `🔠 Sıradaki kelime ${trUpper(harf)} harfiyle başlamalı.`,
      '',
      '↩️ Cevap vermek için bu mesaja yanıt ver.',
      '⏱️ 1 saat boyunca cevap gelmezse oyun otomatik olarak sona erer.',
    ].join('\n'),
  })

  const id = result?.key?.id
  if (!id) {
    // Mesaj id'si olmadan hangi yanıtın oyuna ait olduğu bilinemez; oyunu
    // yarım bırakmak yerine baştan kapatılır.
    endGame(from)
    logger.error({ from }, 'Oyun mesajının id\'si alınamadı, kelime oyunu iptal edildi')
    await cevapla(sock, msg, from, { text: 'Oyun başlatılamadı, tekrar dener misin?' })
    return false
  }

  setLastMessage(from, id)
  return true
}
