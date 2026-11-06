import { binlik } from '../lib/sayi.js'
import { randomInt } from 'node:crypto'
import logger from '../lib/logger.js'
import { kumarOde, xpCek } from '../lib/stats.js'
import { sonucSatirlari } from '../lib/kumar.js'
import { trLower } from '../lib/turkishWords.js'
import { endGame, setLastMessage, startGame, touchGame } from './gameManager.js'

export const KUTU = 12
export const MAYIN = 3
const SURE_MS = 3 * 60_000
// Çarpan adil oranın %96'sıdır: slot gibi kasa uzun vadede az farkla kazanır.
const DONUS = 0.96

/** `acilan` güvenli kutudan sonraki çarpan; hiç kutu açılmadıysa bahis aynen döner. */
export function mayinCarpani(acilan) {
  if (!acilan) return 1
  let sans = 1
  for (let i = 0; i < acilan; i += 1) sans *= (KUTU - MAYIN - i) / (KUTU - i)
  return Math.floor((DONUS / sans) * 100) / 100
}

export function mayinKur(rnd = randomInt) {
  const mayinlar = new Set()
  while (mayinlar.size < MAYIN) mayinlar.add(rnd(KUTU) + 1)
  return mayinlar
}

function tahta(state, acik) {
  const satirlar = []
  for (let bas = 1; bas <= KUTU; bas += 4) {
    const satir = []
    for (let n = bas; n < bas + 4; n += 1) {
      if (state.acilanlar.has(n)) satir.push('✅')
      else if (acik && state.mayinlar.has(n)) satir.push('💣')
      else satir.push(String(n).padStart(2, '0'))
    }
    satirlar.push(satir.join(' '))
  }
  return satirlar.join('\n')
}

function sonuclandir(state, odeme, sebep) {
  state.finished = true

  const s = kumarOde({ chatJid: state.chatJid, userJid: state.starterJid, bahis: state.bahis, odeme })
  const lines = ['💣 *MAYIN TARLASI*', '', tahta(state, true), '', sebep]
  if (s) lines.push(...sonucSatirlari({ once: s.xp - s.fark, xp: s.xp, fark: s.fark }))
  else lines.push('❌ Sonuç yazılamadı.')
  return { text: lines.join('\n') }
}

function nakitCek(state, sebep) {
  const carpan = mayinCarpani(state.acilanlar.size)
  return sonuclandir(state, Math.floor(state.bahis * carpan), `${sebep} (${carpan}x)`)
}

async function cevapAl({ sock, msg, parsed, state, body }) {
  const from = state.chatJid
  if (state.finished || parsed.sender !== state.starterJid) return

  const yaz = (content) => sock.sendMessage(from, content, { quoted: msg })
  const secim = trLower(body.trim())

  if (['çek', 'cek', 'dur', 'al'].includes(secim)) {
    const sonuc = nakitCek(state, '💰 Parayı çektin')
    endGame(from)
    await yaz(sonuc)
    return
  }

  const kutu = /^\d{1,2}$/.test(secim) ? Number(secim) : 0
  if (kutu < 1 || kutu > KUTU || state.acilanlar.has(kutu)) {
    const result = await yaz({ text: `💣 Açılmamış bir kutu numarası (1-${KUTU}) ya da \`çek\` yaz.` })
    setLastMessage(from, result?.key?.id)
    return
  }

  if (state.mayinlar.has(kutu)) {
    const sonuc = sonuclandir(state, 0, `💥 ${kutu} numara mayındı!`)
    endGame(from)
    await yaz(sonuc)
    return
  }

  state.acilanlar.add(kutu)

  if (state.acilanlar.size === KUTU - MAYIN) {
    const sonuc = nakitCek(state, '🏆 Bütün güvenli kutuları açtın')
    endGame(from)
    await yaz(sonuc)
    return
  }

  touchGame(from)
  const carpan = mayinCarpani(state.acilanlar.size)
  const result = await yaz({
    text: [
      tahta(state, false),
      '',
      `✅ Şu an: ${carpan}x = ${binlik(Math.floor(state.bahis * carpan))} XP`,
      `➡️ Sonraki kutu: ${mayinCarpani(state.acilanlar.size + 1)}x`,
      '↩️ Kutu numarası ya da `çek`',
    ].join('\n'),
  })
  setLastMessage(from, result?.key?.id)
}

/** `.mayın` gövdesi. Çağıran miktarı ve boş oyun yuvasını denetlemiştir. */
export async function start({ sock, msg, from, sender, miktar }) {
  const yaz = (content) => sock.sendMessage(from, content, { quoted: msg })

  const cekim = xpCek({ chatJid: from, userJid: sender, miktar })
  if (!cekim) return yaz({ text: '💣 Tarla şu an kapalı, sonra dene.' })
  if (cekim.yetersiz) return yaz({ text: `💣 O kadar XP'n yok. Senin XP'n: ${binlik(cekim.xp)}` })

  const state = startGame(from, {
    type: 'mayin',
    starterJid: sender,
    lastMessageId: null,
    timeoutMs: SURE_MS,
    bahis: miktar,
    mayinlar: mayinKur(),
    acilanlar: new Set(),
    finished: false,
    onAnswer: cevapAl,
    summarize: (s) => nakitCek(s, '🛑 Oyun elle bitirildi, kazanç çekildi'),
    onTimeout: async () => {
      if (!state.finished) await sock.sendMessage(from, nakitCek(state, '⏱️ Süre doldu, kazanç çekildi'))
    },
  })

  if (!state) {
    kumarOde({ chatJid: from, userJid: sender, bahis: miktar, odeme: miktar })
    return yaz({ text: '⚠️ Bu grupta zaten aktif bir oyun var.' })
  }

  const result = await yaz({
    text: [
      '💣 *MAYIN TARLASI*',
      `💸 Bahis: ${binlik(miktar)} XP  •  ${KUTU} kutuda ${MAYIN} mayın`,
      '',
      tahta(state, false),
      '',
      `➡️ İlk kutu: ${mayinCarpani(1)}x`,
      '↩️ Bu mesaja kutu numarası yaz, istediğin an `çek`. ⏱️ 3 dk',
    ].join('\n'),
  })

  const id = result?.key?.id
  if (!id) {
    logger.error({ from }, 'Oyun mesajının id\'si alınamadı, mayın iade edildi')
    endGame(from)
    kumarOde({ chatJid: from, userJid: sender, bahis: miktar, odeme: miktar })
    return yaz({ text: 'Oyun başlatılamadı, bahsin iade edildi.' })
  }
  setLastMessage(from, id)
}
