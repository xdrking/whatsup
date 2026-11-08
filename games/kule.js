import { binlik } from '../lib/sayi.js'
import { randomInt } from 'node:crypto'
import logger from '../lib/logger.js'
import { kumarOde, xpCek } from '../lib/stats.js'
import { sonucSatirlari } from '../lib/kumar.js'
import { trLower } from '../lib/turkishWords.js'
import { endGame, setLastMessage, startGame, touchGame } from './gameManager.js'

const SURE_MS = 3 * 60_000
// Çarpan adil oranın %96'sıdır, .mayın ile aynı.
const DONUS = 0.96
export const KAT = 8

/** Her katta `kutu` kutudan `yumurta` tanesi güvenlidir, kalanında ejderha var. */
export const ZORLUK = {
  kolay: { kutu: 4, yumurta: 3 },
  orta: { kutu: 3, yumurta: 2 },
  zor: { kutu: 2, yumurta: 1 },
}

export function zorlukCoz(arg) {
  const a = trLower(arg || '')
  if (!a || ['orta', 'o'].includes(a)) return 'orta'
  if (['kolay', 'k'].includes(a)) return 'kolay'
  if (['zor', 'z'].includes(a)) return 'zor'
  return null
}

/** `kat` kat çıkıldıktan sonraki çarpan; hiç çıkılmadıysa bahis aynen döner. */
export function kuleCarpani(zorluk, kat) {
  if (!kat) return 1
  const { kutu, yumurta } = ZORLUK[zorluk]
  return Math.floor((DONUS / (yumurta / kutu) ** kat) * 100) / 100
}

/** Her kat için ejderhalı kutuların kümesi (1'den başlar). */
export function kuleKur(zorluk, rnd = randomInt) {
  const { kutu, yumurta } = ZORLUK[zorluk]
  return Array.from({ length: KAT }, () => {
    const ejderha = new Set()
    while (ejderha.size < kutu - yumurta) ejderha.add(rnd(kutu) + 1)
    return ejderha
  })
}

/** Kule yukarıdan aşağı çizilir; çıkılan katta seçilen kutu 🥚, kaybedilen katta 🐉 görünür. */
function cizim(state, acik) {
  const { kutu } = ZORLUK[state.zorluk]
  const satirlar = []
  for (let k = KAT - 1; k >= 0; k -= 1) {
    const hucre = []
    for (let n = 1; n <= kutu; n += 1) {
      const ejder = state.ejderhalar[k].has(n)
      if (state.secimler[k] === n) hucre.push(ejder ? '🔥' : '🥚')
      else if (acik && ejder) hucre.push('🐉')
      else if (k === state.secimler.length && !acik) hucre.push(`${n}️⃣`)
      else hucre.push('⬛')
    }
    satirlar.push(`${hucre.join('')}  ${kuleCarpani(state.zorluk, k + 1)}x`)
  }
  return satirlar.join('\n')
}

function sonuclandir(state, odeme, sebep) {
  state.finished = true
  const s = kumarOde({ oyun: 'kule', chatJid: state.chatJid, userJid: state.starterJid, bahis: state.bahis, odeme })
  const lines = ['🐉 *EJDERHA KULESİ*', '', cizim(state, true), '', sebep]
  if (s) lines.push(...sonucSatirlari({ once: s.xp - s.fark, xp: s.xp, fark: s.fark }))
  else lines.push('❌ Sonuç yazılamadı.')
  return { text: lines.join('\n') }
}

function nakitCek(state, sebep) {
  const carpan = kuleCarpani(state.zorluk, state.secimler.length)
  return sonuclandir(state, Math.floor(state.bahis * carpan), `${sebep} (${carpan}x)`)
}

async function cevapAl({ sock, msg, parsed, state, body }) {
  const from = state.chatJid
  if (state.finished || parsed.sender !== state.starterJid) return

  const yaz = (content) => sock.sendMessage(from, content, { quoted: msg })
  const secim = trLower(body.trim())
  const { kutu } = ZORLUK[state.zorluk]

  if (['çek', 'cek', 'dur', 'al'].includes(secim)) {
    const sonuc = nakitCek(state, '💰 Parayı çektin')
    endGame(from)
    await yaz(sonuc)
    return
  }

  const n = /^\d$/.test(secim) ? Number(secim) : 0
  if (n < 1 || n > kutu) {
    const result = await yaz({ text: `🐉 1-${kutu} arası bir kutu numarası ya da \`çek\` yaz.` })
    setLastMessage(from, result?.key?.id)
    return
  }

  const kat = state.secimler.length
  state.secimler.push(n)

  if (state.ejderhalar[kat].has(n)) {
    const sonuc = sonuclandir(state, 0, `🔥 ${kat + 1}. katta ${n} numarada ejderha vardı!`)
    endGame(from)
    await yaz(sonuc)
    return
  }

  if (state.secimler.length === KAT) {
    const sonuc = nakitCek(state, '🏆 Kulenin tepesine çıktın')
    endGame(from)
    await yaz(sonuc)
    return
  }

  touchGame(from)
  const carpan = kuleCarpani(state.zorluk, state.secimler.length)
  const result = await yaz({
    text: [
      cizim(state, false),
      '',
      `🥚 Şu an: ${carpan}x = ${binlik(Math.floor(state.bahis * carpan))} XP`,
      `➡️ Sonraki kat: ${kuleCarpani(state.zorluk, state.secimler.length + 1)}x`,
      '↩️ Kutu numarası ya da `çek`',
    ].join('\n'),
  })
  setLastMessage(from, result?.key?.id)
}

/** `.kule` gövdesi. Çağıran miktarı, zorluğu ve boş oyun yuvasını denetlemiştir. */
export async function start({ sock, msg, from, sender, miktar, zorluk }) {
  const yaz = (content) => sock.sendMessage(from, content, { quoted: msg })

  const cekim = xpCek({ chatJid: from, userJid: sender, miktar })
  if (!cekim) return yaz({ text: '🐉 Kule şu an kapalı, sonra dene.' })
  if (cekim.yetersiz) return yaz({ text: `🐉 O kadar XP'n yok. Senin XP'n: ${binlik(cekim.xp)}` })

  const state = startGame(from, {
    type: 'kule',
    starterJid: sender,
    lastMessageId: null,
    timeoutMs: SURE_MS,
    bahis: miktar,
    zorluk,
    ejderhalar: kuleKur(zorluk),
    secimler: [],
    finished: false,
    onAnswer: cevapAl,
    summarize: (s) => nakitCek(s, '🛑 Oyun elle bitirildi, kazanç çekildi'),
    onTimeout: async () => {
      if (!state.finished) await sock.sendMessage(from, nakitCek(state, '⏱️ Süre doldu, kazanç çekildi'))
    },
  })

  if (!state) {
    kumarOde({ oyun: 'kule', chatJid: from, userJid: sender, bahis: miktar, odeme: miktar })
    return yaz({ text: '⚠️ Bu grupta zaten aktif bir oyun var.' })
  }

  const { kutu, yumurta } = ZORLUK[zorluk]
  const result = await yaz({
    text: [
      '🐉 *EJDERHA KULESİ*',
      `💸 Bahis: ${binlik(miktar)} XP  •  ${zorluk}: her katta ${kutu} kutudan ${yumurta} tanesi yumurta`,
      '',
      cizim(state, false),
      '',
      '↩️ Bu mesaja kutu numarası yaz, istediğin an `çek`. ⏱️ 3 dk',
    ].join('\n'),
  })

  const id = result?.key?.id
  if (!id) {
    logger.error({ from }, 'Oyun mesajının id\'si alınamadı, kule iade edildi')
    endGame(from)
    kumarOde({ oyun: 'kule', chatJid: from, userJid: sender, bahis: miktar, odeme: miktar })
    return yaz({ text: 'Oyun başlatılamadı, bahsin iade edildi.' })
  }
  setLastMessage(from, id)
}
