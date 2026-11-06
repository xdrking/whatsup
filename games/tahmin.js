import { binlik } from '../lib/sayi.js'
import { randomInt } from 'node:crypto'
import logger from '../lib/logger.js'
import { addXp } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'
import { endGame, setLastMessage, startGame, touchGame } from './gameManager.js'

const XP_TAHMIN = 50
const SURE_MS = 10 * 60_000
const UST_SINIR = 100

async function cevapAl({ sock, msg, parsed, state, body }) {
  const from = state.chatJid
  if (state.finished) return

  const yaz = (content) => sock.sendMessage(from, content, { quoted: msg })
  const ham = body.trim()

  if (!/^\d+$/.test(ham) || Number(ham) < 1 || Number(ham) > UST_SINIR) {
    const result = await yaz({ text: `🔢 1 ile ${UST_SINIR} arasında bir sayı yaz.` })
    setLastMessage(from, result?.key?.id)
    return
  }

  const tahmin = Number(ham)
  state.deneme += 1

  if (tahmin === state.sayi) {
    state.finished = true
    endGame(from)
    const kazanc = addXp({ chatJid: from, userJid: parsed.sender, amount: XP_TAHMIN })

    await yaz({
      text: [
        '🎉 *DOĞRU!*',
        '',
        `🏆 ${mentionOf(parsed.sender)} bildi: *${state.sayi}*`,
        `🎯 ${state.deneme} tahminde bulundu.`,
        `⭐ +${binlik(kazanc)} XP`,
      ].join('\n'),
      mentions: [parsed.sender],
    })
    return
  }

  touchGame(from)
  const result = await yaz({ text: tahmin < state.sayi ? `⬆️ ${tahmin}'den yukarı` : `⬇️ ${tahmin}'den aşağı` })
  setLastMessage(from, result?.key?.id)
}

/** `.tahmin` gövdesi. Çağıran boş oyun yuvasını denetlemiştir. */
export async function start({ sock, msg, from, sender }) {
  const state = startGame(from, {
    type: 'tahmin',
    starterJid: sender,
    lastMessageId: null,
    timeoutMs: SURE_MS,
    sayi: randomInt(1, UST_SINIR + 1),
    deneme: 0,
    finished: false,
    onAnswer: cevapAl,
    summarize: (s) => ({ text: `🛑 Oyun elle bitirildi. Sayı *${s.sayi}* idi.` }),
    onTimeout: async () => {
      await sock.sendMessage(from, { text: `⏱️ 10 dakikadır tahmin gelmedi. Sayı *${state.sayi}* idi.` })
    },
  })

  if (!state) return

  const result = await sock.sendMessage(
    from,
    {
      text: [
        '🔢 *SAYI TAHMİNİ*',
        '',
        `1 ile ${UST_SINIR} arasında bir sayı tuttum.`,
        `↩️ Botun son mesajına sayı yaz. İlk bilen +${XP_TAHMIN} XP alır.`,
      ].join('\n'),
    },
    { quoted: msg },
  )

  const id = result?.key?.id
  if (!id) {
    logger.error({ from }, 'Oyun mesajının id\'si alınamadı, tahmin iptal edildi')
    endGame(from)
    return
  }
  setLastMessage(from, id)
}
