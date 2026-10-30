import logger from '../lib/logger.js'
import { addXp } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'
import { endGame, setLastMessage, startGame } from './gameManager.js'

const XP_DUELLO = 5

// Hız oyunu: iki kişi bekletilmez.
const DUELLO_TIMEOUT_MS = 120_000

function rastgele(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1))
}

/** Akılda çözülebilir ama düşündüren bir işlem; sonuç her zaman tam sayı. */
export function soruUret() {
  const tur = rastgele(0, 2)

  if (tur === 0) {
    const a = rastgele(12, 99)
    const b = rastgele(12, 99)
    return { metin: `${a} + ${b}`, cevap: a + b }
  }

  if (tur === 1) {
    const a = rastgele(40, 150)
    const b = rastgele(11, a - 1)
    return { metin: `${a} − ${b}`, cevap: a - b }
  }

  const a = rastgele(3, 12)
  const b = rastgele(6, 19)
  return { metin: `${a} × ${b}`, cevap: a * b }
}

async function cevapla(sock, msg, from, content) {
  return sock.sendMessage(from, content, { quoted: msg })
}

async function cevapAl({ sock, msg, parsed, state, body }) {
  const from = state.chatJid
  if (state.finished) return

  // Seyirciler oyun mesajına yanıt verse de düelloya karışamaz.
  if (!state.oyuncular.includes(parsed.sender)) {
    logger.debug({ from, sender: parsed.sender }, 'Düelloda oyuncu olmayan yanıtı yok sayıldı')
    return
  }

  const ham = body.trim().replace(/\s+/g, '')
  if (!/^-?\d+$/.test(ham)) {
    const result = await cevapla(sock, msg, from, {
      text: `🔢 ${mentionOf(parsed.sender)} yalnızca sayı yaz.`,
      mentions: [parsed.sender],
    })
    setLastMessage(from, result?.key?.id)
    return
  }

  if (state.yananlar.has(parsed.sender)) {
    const result = await cevapla(sock, msg, from, {
      text: `🚫 ${mentionOf(parsed.sender)} hakkını kullandın.`,
      mentions: [parsed.sender],
    })
    setLastMessage(from, result?.key?.id)
    return
  }

  if (Number(ham) === state.soru.cevap) {
    state.finished = true
    endGame(from)

    const rakip = state.oyuncular.find((j) => j !== parsed.sender)
    addXp({ chatJid: from, userJid: parsed.sender, amount: XP_DUELLO })

    await cevapla(sock, msg, from, {
      text: [
        '⚔️ *DÜELLO BİTTİ*',
        '',
        `🏆 ${mentionOf(parsed.sender)} kazandı!`,
        `😵 ${mentionOf(rakip)} kaybetti.`,
        `✅ ${state.soru.metin} = ${state.soru.cevap}`,
        `⭐ +${XP_DUELLO} XP`,
      ].join('\n'),
      mentions: state.oyuncular,
    })
    return
  }

  state.yananlar.add(parsed.sender)

  // İkisi de yandıysa oyun berabere biter; beklemenin anlamı yok.
  if (state.yananlar.size === state.oyuncular.length) {
    state.finished = true
    endGame(from)

    await cevapla(sock, msg, from, {
      text: [
        '⚔️ *BERABERE*',
        '',
        'İkiniz de yanlış cevap verdiniz.',
        `✅ ${state.soru.metin} = ${state.soru.cevap}`,
      ].join('\n'),
    })
    return
  }

  const result = await cevapla(sock, msg, from, {
    text: `❌ ${mentionOf(parsed.sender)} yanlış! Sıra rakibinde.`,
    mentions: [parsed.sender],
  })
  setLastMessage(from, result?.key?.id)
}

function bitisMetni(state, sebep) {
  return {
    text: ['⚔️ *DÜELLO BİTTİ*', '', sebep, `✅ ${state.soru.metin} = ${state.soru.cevap}`].join('\n'),
  }
}

/** `.düello` komutunun gövdesi. Oyun başlatılamadıysa false döner. */
export async function start({ sock, msg, from, sender, rakip }) {
  const oyuncular = [sender, rakip]

  const state = startGame(from, {
    type: 'duello',
    starterJid: sender,
    lastMessageId: null,
    timeoutMs: DUELLO_TIMEOUT_MS,
    oyuncular,
    soru: soruUret(),
    yananlar: new Set(),
    finished: false,
    onAnswer: cevapAl,
    summarize: (s) => bitisMetni(s, '🛑 Düello elle bitirildi.'),
    onTimeout: async () => {
      await sock.sendMessage(from, bitisMetni(state, '⏱️ 2 dakikada kimse bilemedi.'))
    },
  })

  if (!state) return false

  const result = await cevapla(sock, msg, from, {
    text: [
      '⚔️ *DÜELLO*',
      '',
      `${mentionOf(sender)}  🆚  ${mentionOf(rakip)}`,
      '',
      `🧮 *${state.soru.metin} = ?*`,
      '',
      '↩️ Bu mesaja sayıyla yanıt verin. İlk doğru cevap kazanır, herkesin tek hakkı var.',
    ].join('\n'),
    mentions: oyuncular,
  })

  const id = result?.key?.id
  if (!id) {
    endGame(from)
    logger.error({ from }, 'Oyun mesajının id\'si alınamadı, düello iptal edildi')
    await cevapla(sock, msg, from, { text: 'Düello başlatılamadı, tekrar dener misin?' })
    return false
  }

  setLastMessage(from, id)
  return true
}
