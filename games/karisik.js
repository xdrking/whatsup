import { binlik } from '../lib/sayi.js'
import { randomInt } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import logger from '../lib/logger.js'
import { oyunOdulu, oyunTutari } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'
import { trUpper } from '../lib/turkishWords.js'
import { endGame, setLastMessage, startGame } from './gameManager.js'
import { katla } from './kimim.js'

const XP_KARISIK = 50
const SURE_MS = 5 * 60_000
const IPUCU_ARALIGI = 3
const MIN_HARF = 4

const VERI = new URL('./kelimeler.json', import.meta.url)

/** Harfleri karıştırır; kelimenin kendisi çıkmaz (tüm harfleri aynı kelime hariç). */
export function harfleriKaristir(kelime, rnd = randomInt) {
  const harfler = [...kelime]
  for (let deneme = 0; deneme < 20; deneme += 1) {
    for (let i = harfler.length - 1; i > 0; i -= 1) {
      const j = rnd(i + 1)
      ;[harfler[i], harfler[j]] = [harfler[j], harfler[i]]
    }
    if (harfler.join('') !== kelime) break
  }
  return harfler.join('')
}

async function cevapAl({ sock, msg, parsed, state, body }) {
  const from = state.chatJid
  if (state.finished) return

  const yaz = (content) => sock.sendMessage(from, content, { quoted: msg })

  if (katla(body) === katla(state.kelime)) {
    state.finished = true
    endGame(from)
    const kazanc = oyunOdulu({ chatJid: from, userJid: parsed.sender, amount: XP_KARISIK })

    await yaz({
      text: [
        '🎉 *DOĞRU!*',
        '',
        `🏆 ${mentionOf(parsed.sender)} bildi: *${trUpper(state.kelime)}*`,
        `⭐ +${binlik(kazanc)} XP`,
      ].join('\n'),
      mentions: [parsed.sender],
    })
    return
  }

  state.yanlis += 1
  const lines = [`❌ ${mentionOf(parsed.sender)} yanlış.`]
  const acik = Math.min(Math.floor(state.yanlis / IPUCU_ARALIGI), state.kelime.length - 1)
  if (state.yanlis % IPUCU_ARALIGI === 0) {
    lines.push(`💡 Başlangıç: *${trUpper(state.kelime.slice(0, acik))}…*`)
  }

  const result = await yaz({ text: lines.join('\n'), mentions: [parsed.sender] })
  setLastMessage(from, result?.key?.id)
}

/** `.karışık` gövdesi. Çağıran boş oyun yuvasını denetlemiştir. */
export async function start({ sock, msg, from, sender }) {
  const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

  let havuz
  try {
    havuz = JSON.parse(await readFile(VERI, 'utf8')).filter((k) => [...k].length >= MIN_HARF)
  } catch (err) {
    logger.error({ err }, 'games/kelimeler.json okunamadı')
    return yaz('🔀 Oyun şu an kullanılamıyor.')
  }

  const kelime = havuz[randomInt(havuz.length)]

  const state = startGame(from, {
    type: 'karisik',
    starterJid: sender,
    lastMessageId: null,
    timeoutMs: SURE_MS,
    kelime,
    yanlis: 0,
    finished: false,
    onAnswer: cevapAl,
    summarize: (s) => ({ text: `🛑 Oyun elle bitirildi. Kelime: *${trUpper(s.kelime)}*` }),
    onTimeout: async () => {
      await sock.sendMessage(from, { text: `⏱️ 5 dakika doldu. Kelime: *${trUpper(state.kelime)}*` })
    },
  })

  // Dosya okuma bir await noktası: bu arada başka oyun başlamış olabilir.
  if (!state) return yaz('⚠️ Bu grupta zaten aktif bir oyun var.')

  const result = await yaz([
    '🔀 *KARIŞIK KELİME*',
    '',
    `*${trUpper(harfleriKaristir(kelime)).split('').join(' ')}*`,
    '',
    `↩️ Doğru kelimeyi botun son mesajına yaz. İlk bilen +${binlik(oyunTutari(from, XP_KARISIK))} XP alır. ⏱️ 5 dk`,
  ].join('\n'))

  const id = result?.key?.id
  if (!id) {
    logger.error({ from }, 'Oyun mesajının id\'si alınamadı, karışık iptal edildi')
    endGame(from)
    return
  }
  setLastMessage(from, id)
}
