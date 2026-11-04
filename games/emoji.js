import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import logger from '../lib/logger.js'
import { addXp } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'
import { endGame, setLastMessage, startGame } from './gameManager.js'
import { katla } from './kimim.js'

const GAMES_DIR = path.dirname(fileURLToPath(import.meta.url))
const VERI_DOSYASI = path.join(GAMES_DIR, 'emoji.json')

const XP_EMOJI = 5
const SURE_MS = 10 * 60_000

// Kaç yanlış tahminde bir yeni ipucu açılır: önce harf kalıbı, sonra baş harfler.
const IPUCU_ARALIGI = 3
const SON_IPUCU = 2

const MAX_GECMIS = 20
const gecmis = new Map()

let bulmacalar = null

/**
 * `games/emoji.json` bir kez okunur: `[{ emoji, type, answer, aliases?[] }]`.
 * Bozuk kayıtlar atılır; hiç kayıt kalmazsa hata atılır.
 */
async function bulmacalariYukle() {
  if (bulmacalar) return bulmacalar

  const parsed = JSON.parse(await readFile(VERI_DOSYASI, 'utf8'))
  if (!Array.isArray(parsed)) throw new Error('games/emoji.json bir JSON dizisi değil')

  const items = parsed
    .filter(
      (item) =>
        item &&
        typeof item.emoji === 'string' && item.emoji.trim() &&
        typeof item.type === 'string' && item.type.trim() &&
        typeof item.answer === 'string' && item.answer.trim(),
    )
    .map((item) => ({
      emoji: item.emoji.trim(),
      type: item.type.trim(),
      answer: item.answer.trim(),
      aliases: Array.isArray(item.aliases)
        ? item.aliases.filter((alias) => typeof alias === 'string' && alias.trim())
        : [],
    }))

  if (!items.length) throw new Error('games/emoji.json kullanılabilir kayıt içermiyor')
  if (items.length !== parsed.length) {
    logger.warn({ atlanan: parsed.length - items.length }, 'Emoji havuzunda geçersiz kayıtlar atlandı')
  }

  bulmacalar = items
  return bulmacalar
}

/**
 * Tahmin doğru mu? Cevabın ya da alternatiflerinden birinin **tamamı** yazılmalı;
 * "Kurtlar Vadisi" için "vadisi" kabul edilmez. Türkçe karakter ve noktalama önemsiz.
 */
export function emojiTahminDogruMu(guess, answer, aliases = []) {
  const t = katla(guess)
  if (!t) return false
  return [answer, ...aliases].some((cevap) => katla(cevap) === t)
}

/**
 * Cevabın harf kalıbı: harfler `_`, boşluk ve noktalama olduğu gibi kalır.
 * `basHarf` true ise her kelimenin ilk harfi açılır.
 */
export function kalip(answer, basHarf = false) {
  return answer
    .split(' ')
    .map((kelime) =>
      [...kelime]
        .map((ch, i) => (/\p{L}|\p{N}/u.test(ch) ? (basHarf && i === 0 ? ch.toLocaleUpperCase('tr') : '_') : ch))
        .join(' '),
    )
    .join('   ')
}

function bulmacaSec(chatJid) {
  const recent = gecmis.get(chatJid) || []
  const taze = bulmacalar.filter((item) => !recent.includes(item.answer))
  const havuz = taze.length ? taze : bulmacalar
  const secim = havuz[Math.floor(Math.random() * havuz.length)]

  recent.push(secim.answer)
  while (recent.length > Math.min(MAX_GECMIS, Math.floor(bulmacalar.length / 2))) recent.shift()
  gecmis.set(chatJid, recent)

  return secim
}

function ipucuMetni(state) {
  const { bulmaca, ipucu } = state
  if (ipucu === 1) return `💡 *İPUCU:* \`${kalip(bulmaca.answer)}\``
  return `💡 *İPUCU:* \`${kalip(bulmaca.answer, true)}\``
}

function bitisMetni(state, sebep, baslik = '😔 Bilen çıkmadı...') {
  return {
    text: [baslik, '', sebep, `${state.bulmaca.emoji} → *${state.bulmaca.answer}*`].join('\n'),
  }
}

async function cevapla(sock, msg, from, content) {
  return sock.sendMessage(from, content, { quoted: msg })
}

async function cevapAl({ sock, msg, parsed, state, body }) {
  const from = state.chatJid
  if (state.finished) return

  if (emojiTahminDogruMu(body, state.bulmaca.answer, state.bulmaca.aliases)) {
    // Bayrak await'ten önce: aynı anda gelen ikinci doğru cevap boşa düşsün.
    state.finished = true
    endGame(from)
    const kazanc = addXp({ chatJid: from, userJid: parsed.sender, amount: XP_EMOJI })

    await cevapla(sock, msg, from, {
      text: [
        '🎉 *DOĞRU!*',
        '',
        `🏆 ${mentionOf(parsed.sender)} bildi!`,
        `${state.bulmaca.emoji} → *${state.bulmaca.answer}*`,
        `⭐ +${kazanc} XP`,
      ].join('\n'),
      mentions: [parsed.sender],
    })
    return
  }

  state.wrongCount += 1
  const lines = [`❌ ${mentionOf(parsed.sender)} yanlış.`]

  if (state.wrongCount % IPUCU_ARALIGI === 0 && state.ipucu < SON_IPUCU) {
    state.ipucu += 1
    lines.push('', `${state.bulmaca.emoji}`, ipucuMetni(state))
  }

  const result = await cevapla(sock, msg, from, { text: lines.join('\n'), mentions: [parsed.sender] })
  setLastMessage(from, result?.key?.id)
}

/** `.emoji` komutunun gövdesi. Oyun başlatılamadıysa false döner. */
export async function start({ sock, msg, from, sender }) {
  try {
    await bulmacalariYukle()
  } catch (err) {
    logger.error({ err }, 'Emoji veri dosyası okunamadı')
    await cevapla(sock, msg, from, { text: '🧩 Emoji oyunu şu an kullanılamıyor.' })
    return false
  }

  const bulmaca = bulmacaSec(from)

  const state = startGame(from, {
    type: 'emoji',
    starterJid: sender,
    lastMessageId: null,
    bulmaca,
    ipucu: 0,
    wrongCount: 0,
    finished: false,
    timeoutMs: SURE_MS,
    onAnswer: cevapAl,
    summarize: (s) => bitisMetni(s, '🛑 Oyun elle bitirildi.', '🏁 *OYUN BİTTİ*'),
    onTimeout: async () => {
      await sock.sendMessage(from, bitisMetni(state, '⏱️ 10 dakika doldu.'))
    },
  })

  if (!state) return false

  const result = await cevapla(sock, msg, from, {
    text: [
      '🧩 *EMOJİ BULMACA*',
      '',
      `${bulmaca.emoji}`,
      '',
      `🏷️ Tür: *${bulmaca.type}*`,
      '',
      '↩️ Tahminini bu mesaja yanıt olarak yaz.',
      '💡 Her 3 yanlışta ipucu açılır. ⏱️ Süre 10 dk.',
    ].join('\n'),
  })

  const id = result?.key?.id
  if (!id) {
    endGame(from)
    logger.error({ from }, "Oyun mesajının id'si alınamadı, emoji oyunu iptal edildi")
    await cevapla(sock, msg, from, { text: 'Oyun başlatılamadı, tekrar dener misin?' })
    return false
  }

  setLastMessage(from, id)
  return true
}
