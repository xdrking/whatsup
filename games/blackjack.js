import { binlik } from '../lib/sayi.js'
import { randomInt } from 'node:crypto'
import logger from '../lib/logger.js'
import { kumarOde, xpCek } from '../lib/stats.js'
import { sonucSatirlari } from '../lib/kumar.js'
import { trLower } from '../lib/turkishWords.js'
import { endGame, setLastMessage, startGame, touchGame } from './gameManager.js'

const SURE_MS = 3 * 60_000
const DEGERLER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const RENKLER = ['♠', '♥', '♦', '♣']

export function desteKur(rnd = randomInt) {
  const deste = RENKLER.flatMap((renk) => DEGERLER.map((deger) => ({ deger, renk })))
  for (let i = deste.length - 1; i > 0; i -= 1) {
    const j = rnd(i + 1)
    ;[deste[i], deste[j]] = [deste[j], deste[i]]
  }
  return deste
}

/** As 11 sayılır, el 21'i geçerse 1'e iner. */
export function elDegeri(el) {
  let toplam = 0
  let aslar = 0
  for (const { deger } of el) {
    if (deger === 'A') {
      toplam += 11
      aslar += 1
    } else {
      toplam += ['J', 'Q', 'K'].includes(deger) ? 10 : Number(deger)
    }
  }
  while (toplam > 21 && aslar) {
    toplam -= 10
    aslar -= 1
  }
  return toplam
}

const dogalMi = (el) => el.length === 2 && elDegeri(el) === 21

/** Bahsin kaç katı geri döner: doğal blackjack 2.5, kazanç 2, beraberlik 1. */
export function odemeCarpani(oyuncu, krupiye) {
  const o = elDegeri(oyuncu)
  const k = elDegeri(krupiye)
  if (o > 21) return 0
  if (dogalMi(oyuncu)) return dogalMi(krupiye) ? 1 : 2.5
  if (dogalMi(krupiye)) return 0
  if (k > 21 || o > k) return 2
  return o === k ? 1 : 0
}

const kartlar = (el) => el.map((k) => `${k.deger}${k.renk}`).join(' ')

function masa(state, gizli) {
  const krupiye = gizli
    ? `${kartlar(state.krupiye.slice(0, 1))} 🂠`
    : `${kartlar(state.krupiye)} (${elDegeri(state.krupiye)})`
  return [`🃏 Sen: ${kartlar(state.oyuncu)} (${elDegeri(state.oyuncu)})`, `🤵 Krupiye: ${krupiye}`]
}

/** Eli kapatır ve öder. Oyuncu patladıysa krupiye kart çekmez. */
function sonuclandir(state, sebep) {
  state.finished = true

  if (elDegeri(state.oyuncu) <= 21 && !dogalMi(state.oyuncu)) {
    while (elDegeri(state.krupiye) < 17) state.krupiye.push(state.deste.pop())
  }

  const odeme = Math.floor(state.bahis * odemeCarpani(state.oyuncu, state.krupiye))
  const s = kumarOde({ chatJid: state.chatJid, userJid: state.starterJid, bahis: state.bahis, odeme })

  const lines = ['🃏 *BLACKJACK*', '', ...masa(state, false), '']
  if (sebep) lines.push(sebep)
  if (s) lines.push(...sonucSatirlari({ once: s.xp - s.fark, xp: s.xp, fark: s.fark }))
  else lines.push('❌ Sonuç yazılamadı.')
  return { text: lines.join('\n') }
}

async function cevapAl({ sock, msg, parsed, state, body }) {
  const from = state.chatJid
  if (state.finished || parsed.sender !== state.starterJid) return

  const secim = trLower(body.trim())
  const yaz = (content) => sock.sendMessage(from, content, { quoted: msg })

  if (['dur', 'd', 'kal'].includes(secim)) {
    const sonuc = sonuclandir(state)
    endGame(from)
    await yaz(sonuc)
    return
  }

  if (!['kart', 'k', 'çek', 'cek'].includes(secim)) {
    const result = await yaz({ text: '🃏 `kart` ya da `dur` yaz.' })
    setLastMessage(from, result?.key?.id)
    return
  }

  state.oyuncu.push(state.deste.pop())

  if (elDegeri(state.oyuncu) >= 21) {
    const sonuc = sonuclandir(state, elDegeri(state.oyuncu) > 21 ? '💥 21\'i geçtin!' : undefined)
    endGame(from)
    await yaz(sonuc)
    return
  }

  touchGame(from)
  const result = await yaz({ text: [...masa(state, true), '', '↩️ `kart` ya da `dur`'].join('\n') })
  setLastMessage(from, result?.key?.id)
}

/** `.blackjack` gövdesi. Çağıran miktarı ve boş oyun yuvasını denetlemiştir. */
export async function start({ sock, msg, from, sender, miktar }) {
  const yaz = (content) => sock.sendMessage(from, content, { quoted: msg })

  const cekim = xpCek({ chatJid: from, userJid: sender, miktar })
  if (!cekim) return yaz({ text: '🃏 Masa şu an kapalı, sonra dene.' })
  if (cekim.yetersiz) return yaz({ text: `🃏 O kadar XP'n yok. Senin XP'n: ${binlik(cekim.xp)}` })

  const deste = desteKur()
  const state = startGame(from, {
    type: 'blackjack',
    starterJid: sender,
    lastMessageId: null,
    timeoutMs: SURE_MS,
    bahis: miktar,
    deste,
    oyuncu: [deste.pop(), deste.pop()],
    krupiye: [deste.pop(), deste.pop()],
    finished: false,
    onAnswer: cevapAl,
    // Elle bitirme iade değildir: kötü eli gören oyuncu kaçamasın, el `dur` sayılır.
    summarize: (s) => sonuclandir(s, '🛑 Oyun elle bitirildi, el `dur` sayıldı.'),
    onTimeout: async () => {
      if (!state.finished) await sock.sendMessage(from, sonuclandir(state, '⏱️ Süre doldu, el `dur` sayıldı.'))
    },
  })

  if (!state) {
    kumarOde({ chatJid: from, userJid: sender, bahis: miktar, odeme: miktar })
    return yaz({ text: '⚠️ Bu grupta zaten aktif bir oyun var.' })
  }

  if (dogalMi(state.oyuncu)) {
    const sonuc = sonuclandir(state)
    endGame(from)
    return yaz(sonuc)
  }

  const result = await yaz({
    text: ['🃏 *BLACKJACK*', `💸 Bahis: ${binlik(miktar)} XP`, '', ...masa(state, true), '', '↩️ Bu mesaja `kart` ya da `dur` yaz. ⏱️ 3 dk'].join('\n'),
  })

  const id = result?.key?.id
  if (!id) {
    logger.error({ from }, 'Oyun mesajının id\'si alınamadı, blackjack iade edildi')
    endGame(from)
    kumarOde({ chatJid: from, userJid: sender, bahis: miktar, odeme: miktar })
    return yaz({ text: 'Oyun başlatılamadı, bahsin iade edildi.' })
  }
  setLastMessage(from, id)
}
