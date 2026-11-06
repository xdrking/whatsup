import { DAVA_SURE_DK, davaKarari, MIN_OY } from '../lib/dava.js'
import logger from '../lib/logger.js'
import { binlik } from '../lib/sayi.js'
import { davaOde } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'
import { trLower } from '../lib/turkishWords.js'
import { endGame, setLastMessage, startGame } from './gameManager.js'

const HAKLI = new Set(['haklı', 'hakli', 'evet'])
const HAKSIZ = new Set(['haksız', 'haksiz', 'hayır', 'hayir'])

function sayim(state) {
  const oylar = [...state.oylar.values()]
  return { hakli: oylar.filter(Boolean).length, haksiz: oylar.filter((o) => !o).length }
}

function kararMetni(state) {
  const { starterJid: davaci, sanik, miktar } = state
  const { hakli, haksiz } = sayim(state)
  const taraflar = [davaci, sanik]
  const baslik = `⚖️ *KARAR*  •  ${hakli} haklı, ${haksiz} haksız`

  const karar = davaKarari(hakli, haksiz)
  if (!karar) {
    const neden = hakli + haksiz < MIN_OY ? `en az ${MIN_OY} oy gerekiyordu` : 'oylar eşit'
    return { text: `${baslik}\n\nDava düştü, ${neden}. Harç iade edilmez.`, mentions: taraflar }
  }

  const [kazanan, kaybeden] = karar === 'davaci' ? taraflar : [sanik, davaci]
  const s = davaOde({ chatJid: state.chatJid, kazanan, kaybeden, miktar })
  if (!s) return { text: `${baslik}\n\nKarar yazılamadı, XP'ye dokunulmadı.`, mentions: taraflar }
  if (s.borclu) return { text: `${baslik}\n\n${mentionOf(kaybeden)} borçlu çıktı, ödeme yapılmadı.`, mentions: taraflar }

  return {
    text: [
      baslik,
      '',
      `🏆 ${mentionOf(kazanan)} kazandı: *+${binlik(s.odenen)} XP* (${binlik(s.kazananXp)})`,
      `💀 ${mentionOf(kaybeden)} ödedi: *-${binlik(s.odenen)} XP* (${binlik(s.kaybedenXp)})`,
    ].join('\n'),
    mentions: taraflar,
  }
}

async function cevapAl({ sock, msg, parsed, state, body }) {
  if (state.finished) return

  const yaz = (text) => sock.sendMessage(state.chatJid, { text }, { quoted: msg })
  const oy = trLower(body.trim())

  if (parsed.sender === state.starterJid || parsed.sender === state.sanik) {
    await yaz('⚖️ Taraflar oy veremez.')
    return
  }
  if (!HAKLI.has(oy) && !HAKSIZ.has(oy)) {
    await yaz('⚖️ `haklı` ya da `haksız` yaz.')
    return
  }
  if (state.oylar.has(parsed.sender)) {
    await yaz('⚖️ Oyunu kullandın.')
    return
  }

  state.oylar.set(parsed.sender, HAKLI.has(oy))
  // setLastMessage çağrılmaz: herkes baştaki mesaja yanıt versin, `.açıkartırma` gibi.
  const { hakli, haksiz } = sayim(state)
  await yaz(`⚖️ Oy sayıldı: ${hakli} haklı, ${haksiz} haksız`)
}

/** `.dava` gövdesi. Çağıran tarafları denetlemiş, harcı almıştır. */
export async function start({ sock, msg, from, sender, sanik, miktar, harc, sebep }) {
  const state = startGame(from, {
    type: 'dava',
    starterJid: sender,
    sanik,
    miktar,
    oylar: new Map(),
    lastMessageId: null,
    timeoutMs: DAVA_SURE_DK * 60_000,
    finished: false,
    onAnswer: cevapAl,
    summarize: () => ({ text: '🛑 Dava düşürüldü, XP\'ye dokunulmadı. Harç iade edilmez.' }),
    onTimeout: async () => {
      state.finished = true
      await sock.sendMessage(from, kararMetni(state))
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
        '⚖️ *DAVA AÇILDI*',
        '',
        `👤 Davacı: ${mentionOf(sender)}`,
        `🧍 Sanık: ${mentionOf(sanik)}`,
        `💰 Tutar: *${binlik(miktar)} XP*  •  Harç: ${binlik(harc)} XP`,
        ...(sebep ? [`📜 Sebep: ${sebep}`] : []),
        '',
        `↩️ Bu mesaja \`haklı\` ya da \`haksız\` yaz. ⏱️ ${DAVA_SURE_DK} dk`,
      ].join('\n'),
      mentions: [sender, sanik],
    },
    { quoted: msg },
  )

  const id = result?.key?.id
  if (!id) {
    logger.error({ from }, 'Oyun mesajının id\'si alınamadı, .dava iptal edildi')
    endGame(from)
    return
  }
  setLastMessage(from, id)
}
