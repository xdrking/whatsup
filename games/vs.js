import { randomInt } from 'node:crypto'
import logger from '../lib/logger.js'
import { vsOyna } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'
import { trLower } from '../lib/turkishWords.js'
import { endGame, setLastMessage, startGame } from './gameManager.js'

const SURE_MS = 60_000

async function cevapAl({ sock, msg, parsed, state, body }) {
  const from = state.chatJid
  // Yalnızca meydan okunan kişi karar verir.
  if (state.finished || parsed.sender !== state.rakip) return

  const yaz = (content) => sock.sendMessage(from, content, { quoted: msg })
  const secim = trLower(body.trim())
  const oyuncular = [state.starterJid, state.rakip]

  if (['red', 'hayır', 'hayir', 'yok'].includes(secim)) {
    state.finished = true
    endGame(from)
    await yaz({ text: `🙅 ${mentionOf(state.rakip)} reddetti.`, mentions: [state.rakip] })
    return
  }

  if (!['kabul', 'evet', 'tamam'].includes(secim)) {
    const result = await yaz({ text: '⚔️ `kabul` ya da `red` yaz.' })
    setLastMessage(from, result?.key?.id)
    return
  }

  state.finished = true
  endGame(from)

  const s = vsOyna({
    chatJid: from,
    a: state.starterJid,
    b: state.rakip,
    miktar: state.miktar,
    sec: () => oyuncular[randomInt(2)],
  })

  if (!s) {
    await yaz({ text: '❌ Bahis yazılamadı.' })
    return
  }

  if (s.yetersiz) {
    await yaz({
      text: `❌ ${mentionOf(s.yetersiz)} kişisinin XP'si yetmiyor (${s.xp}). Bahis iptal.`,
      mentions: [s.yetersiz],
    })
    return
  }

  await yaz({
    text: [
      '⚔️ *VS BİTTİ*',
      '',
      `🏆 ${mentionOf(s.kazanan)} kazandı: *+${state.miktar} XP* (${s.kazananXp})`,
      `💀 ${mentionOf(s.kaybeden)} kaybetti: *-${state.miktar} XP* (${s.kaybedenXp})`,
    ].join('\n'),
    mentions: oyuncular,
  })
}

/** `.vs` gövdesi. Çağıran rakibi, miktarı ve boş oyun yuvasını denetlemiştir. */
export async function start({ sock, msg, from, sender, rakip, miktar }) {
  const state = startGame(from, {
    type: 'vs',
    starterJid: sender,
    rakip,
    miktar,
    lastMessageId: null,
    timeoutMs: SURE_MS,
    finished: false,
    onAnswer: cevapAl,
    summarize: () => ({ text: '🛑 Meydan okuma iptal edildi.' }),
    onTimeout: async () => {
      await sock.sendMessage(from, { text: '⏱️ Meydan okuma cevapsız kaldı, XP\'ye dokunulmadı.' })
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
        '⚔️ *MEYDAN OKUMA*',
        '',
        `${mentionOf(sender)}  🆚  ${mentionOf(rakip)}`,
        `💰 Ortaya: *${miktar} XP*, kazanan rakibinkini alır.`,
        '',
        `↩️ ${mentionOf(rakip)} bu mesaja \`kabul\` ya da \`red\` yaz. ⏱️ 60 sn`,
      ].join('\n'),
      mentions: [sender, rakip],
    },
    { quoted: msg },
  )

  const id = result?.key?.id
  if (!id) {
    logger.error({ from }, 'Oyun mesajının id\'si alınamadı, .vs iptal edildi')
    endGame(from)
    return
  }
  setLastMessage(from, id)
}
