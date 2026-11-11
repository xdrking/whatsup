import { binlik } from '../lib/sayi.js'
import { randomInt } from 'node:crypto'
import logger from '../lib/logger.js'
import { kumarOde, xpCek } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'
import { getGame, startGame } from './gameManager.js'

export const BAHIS_SURESI_MS = 60_000
// Oran adil oranın %96'sıdır: kim hangi ata basarsa bassın beklenen dönüş aynı.
const DONUS = 0.96
const PIST = 12

/** `sans` yüzde olarak kazanma olasılığıdır, toplamı 100. Sıra numarası bahiste kullanılır. */
export const ATLAR = [
  { ad: 'Gülbatur', sans: 35 },
  { ad: 'Karayel', sans: 25 },
  { ad: 'Şimşek', sans: 20 },
  { ad: 'Tosun', sans: 12 },
  { ad: 'Kara Kartal', sans: 8 },
]

export const atOrani = (at) => Math.floor((DONUS * 100 * 100) / at.sans) / 100

/** @returns {number} kazanan atın dizindeki yeri. */
export function kazananSec(rnd = randomInt) {
  let r = rnd(100)
  for (let i = 0; i < ATLAR.length; i += 1) {
    if (r < ATLAR[i].sans) return i
    r -= ATLAR[i].sans
  }
  return 0
}

/** Bitiş çizgisi: kazanan sonda, diğerleri ondan geride rastgele yerlerde. */
function pist(kazanan, rnd = randomInt) {
  return ATLAR.map((at, i) => {
    const yer = i === kazanan ? PIST : 2 + rnd(PIST - 3)
    return `${i + 1}. ${'·'.repeat(yer)}🏇${'·'.repeat(PIST - yer)}🏁 ${at.ad}`
  }).join('\n')
}

export function atListesi() {
  return ATLAR.map((at, i) => `${i + 1}. ${at.ad}  •  ${atOrani(at)}x`).join('\n')
}

function bahisOzeti(state) {
  if (!state.bahisler.size) return 'Henüz bahis yok.'
  return [...state.bahisler].map(([jid, b]) => `${mentionOf(jid)}: ${binlik(b.miktar)} XP → ${ATLAR[b.at].ad}`).join('\n')
}

/** Yarışı koşturur ve ödemeleri yapar. Zaman aşımı da .oyunbitir de buraya düşer: iade yoktur. */
function kostur(state) {
  state.finished = true
  const kazanan = kazananSec()
  const oran = atOrani(ATLAR[kazanan])

  const satirlar = []
  for (const [jid, b] of state.bahisler) {
    const odeme = b.at === kazanan ? Math.floor(b.miktar * oran) : 0
    const s = kumarOde({ oyun: 'yarış', chatJid: state.chatJid, userJid: jid, bahis: b.miktar, odeme })
    if (!s) satirlar.push(`${mentionOf(jid)}: ❌ sonuç yazılamadı`)
    else if (s.fark > 0) satirlar.push(`✅ ${mentionOf(jid)}: *+${binlik(s.fark)} XP*${s.kesilen ? ` (günlük tavan, ${binlik(s.kesilen)} XP kasada kaldı)` : ''}`)
    else satirlar.push(`❌ ${mentionOf(jid)}: ${binlik(s.fark)} XP`)
  }

  return {
    text: [
      '🏇 *AT YARIŞI*',
      '',
      pist(kazanan),
      '',
      `🏆 Kazanan: *${kazanan + 1}. ${ATLAR[kazanan].ad}* (${oran}x)`,
      '',
      ...satirlar,
    ].join('\n'),
    mentions: [...state.bahisler.keys()],
  }
}

/**
 * Bahsi yarışa ekler; yarış yoksa açar. Çağıran miktarı, atı ve kumar engelini denetlemiştir.
 * Başka bir oyun açıksa ya da kişi bu yarışa zaten bastıysa XP'ye dokunulmaz.
 */
export async function bahisYap({ sock, msg, from, sender, miktar, at }) {
  const yaz = (content) => sock.sendMessage(from, content, { quoted: msg })

  const mevcut = getGame(from)
  if (mevcut && mevcut.type !== 'yaris') return yaz({ text: '⚠️ Bu grupta zaten aktif bir oyun var.' })
  // Koşu bitti ama sonuç mesajı gönderilirken yuva hâlâ dolu: bu bahis hiç ödenmezdi.
  if (mevcut?.finished) return yaz({ text: '🏇 Atlar koşuyor, sonuç gelince yeni yarış açabilirsin.' })
  if (mevcut?.bahisler.has(sender)) return yaz({ text: '🏇 Bu yarışa zaten bastın.' })

  const cekim = xpCek({ chatJid: from, userJid: sender, miktar })
  if (!cekim) return yaz({ text: '🏇 Hipodrom şu an kapalı, sonra dene.' })
  if (cekim.yetersiz) return yaz({ text: `🏇 O kadar XP'n yok. Senin XP'n: ${binlik(cekim.xp)}` })

  // getGame'den buraya kadar await yok: yarış bu arada bitip başlayamaz.
  let state = mevcut
  const yeni = !state
  if (yeni) {
    state = startGame(from, {
      type: 'yaris',
      starterJid: sender,
      // Yarış yanıtla oynanmaz, bahis komutla verilir: hiçbir yanıt bu oyuna yönlenmez.
      lastMessageId: null,
      timeoutMs: BAHIS_SURESI_MS,
      bahisler: new Map(),
      finished: false,
      onAnswer: async () => {},
      summarize: (s) => kostur(s),
      onTimeout: async () => {
        if (!state.finished) await sock.sendMessage(from, kostur(state))
      },
    })
    if (!state) {
      kumarOde({ oyun: 'yarış', chatJid: from, userJid: sender, bahis: miktar, odeme: miktar })
      return yaz({ text: '⚠️ Bu grupta zaten aktif bir oyun var.' })
    }
  }

  state.bahisler.set(sender, { miktar, at })
  logger.info({ from, at, miktar }, 'Yarış bahsi alındı')

  const kalan = Math.max(0, Math.ceil((state.expiresAt - Date.now()) / 1000))
  await yaz({
    text: [
      yeni ? '🏇 *AT YARIŞI AÇILDI*' : '🏇 *Bahis alındı*',
      '',
      `${mentionOf(sender)}: ${binlik(miktar)} XP → *${ATLAR[at].ad}* (${atOrani(ATLAR[at])}x)`,
      '',
      yeni ? atListesi() : bahisOzeti(state),
      '',
      `⏱️ ${kalan} sn sonra koşu başlıyor. Katılmak için \`.yarış <miktar> <at no>\``,
    ].join('\n'),
    mentions: yeni ? [sender] : [...state.bahisler.keys()],
  })
}

/** Açık yarışın bahisleri; yarış yoksa at listesi. */
export function yarisDurumu(from) {
  const state = getGame(from)
  if (state?.type !== 'yaris') return { text: `🏇 *ATLAR*\n\n${atListesi()}\n\nYarış açmak için \`.yarış <miktar> <at no>\`` }
  const kalan = Math.max(0, Math.ceil((state.expiresAt - Date.now()) / 1000))
  return {
    text: ['🏇 *AÇIK YARIŞ*', '', atListesi(), '', bahisOzeti(state), '', `⏱️ ${kalan} sn kaldı`].join('\n'),
    mentions: [...state.bahisler.keys()],
  }
}
