import logger from '../lib/logger.js'
import { evlen } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'
import { trLower } from '../lib/turkishWords.js'
import { endGame, setLastMessage, startGame } from './gameManager.js'

const SURE_MS = 120_000

async function cevapAl({ sock, msg, parsed, state, body }) {
  const from = state.chatJid
  // Yalnızca teklif edilen kişi karar verir.
  if (state.finished || parsed.sender !== state.es) return

  const yaz = (content) => sock.sendMessage(from, content, { quoted: msg })
  const secim = trLower(body.trim())
  const cift = [state.starterJid, state.es]

  if (['hayır', 'hayir', 'red', 'yok'].includes(secim)) {
    state.finished = true
    endGame(from)
    await yaz({ text: `💔 ${mentionOf(state.es)} reddetti.`, mentions: cift })
    return
  }

  if (!['evet', 'kabul', 'tamam'].includes(secim)) {
    const result = await yaz({ text: '💍 `evet` ya da `hayır` yaz.' })
    setLastMessage(from, result?.key?.id)
    return
  }

  state.finished = true
  endGame(from)

  const s = evlen({ chatJid: from, a: state.starterJid, b: state.es })
  if (!s) {
    await yaz({ text: '💍 Nikâh memuru gelmedi, sonra dene.' })
    return
  }
  if (s.evli) {
    await yaz({ text: `💍 ${mentionOf(s.evli)} bu arada evlenmiş.`, mentions: [s.evli] })
    return
  }

  await yaz({
    text: `💒 *ERDİ MURADINA*\n\n${mentionOf(state.starterJid)} 💍 ${mentionOf(state.es)}\nÖmür boyu mutluluklar!`,
    mentions: cift,
  })
}

/** `.evlen` gövdesi. Çağıran hedefi ve boş oyun yuvasını denetlemiştir. */
export async function start({ sock, msg, from, sender, es, uyum }) {
  const state = startGame(from, {
    type: 'evlilik',
    starterJid: sender,
    es,
    lastMessageId: null,
    timeoutMs: SURE_MS,
    finished: false,
    onAnswer: cevapAl,
    summarize: () => ({ text: '🛑 Teklif geri çekildi.' }),
    onTimeout: async () => {
      await sock.sendMessage(from, { text: '⏱️ Teklif cevapsız kaldı 💔' })
    },
  })

  if (!state) {
    await sock.sendMessage(from, { text: '⚠️ Bu grupta zaten aktif bir oyun var.' }, { quoted: msg })
    return
  }

  const result = await sock.sendMessage(
    from,
    {
      text: [
        '💍 *EVLENME TEKLİFİ*',
        '',
        `${mentionOf(sender)} ❤️ ${mentionOf(es)}`,
        `💘 Uyum: %${uyum}`,
        '',
        `↩️ ${mentionOf(es)} bu mesaja \`evet\` ya da \`hayır\` yaz. ⏱️ 2 dk`,
      ].join('\n'),
      mentions: [sender, es],
    },
    { quoted: msg },
  )

  const id = result?.key?.id
  if (!id) {
    logger.error({ from }, 'Oyun mesajının id\'si alınamadı, .evlen iptal edildi')
    endGame(from)
    return
  }
  setLastMessage(from, id)
}
