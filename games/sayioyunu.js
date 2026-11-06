import { binlik } from '../lib/sayi.js'
import { randomInt } from 'node:crypto'
import { calculate, CalcError } from '../lib/calc.js'
import logger from '../lib/logger.js'
import { addXp } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'
import { endGame, setLastMessage, startGame } from './gameManager.js'

const XP_SAYI = 100
const SURE_MS = 5 * 60_000
const KUCUKLER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const BUYUKLER = [25, 50, 75, 100]
const SAYI_ADEDI = 5

/**
 * Sayıları ve hedefi üretir. Hedef, sayıların bir bölümünden gerçekten
 * hesaplanır; yani her bulmacanın en az bir çözümü vardır. Bölme kullanılmaz,
 * çözüm yolu tam sayıda kalsın.
 */
export function bulmacaUret(rnd = randomInt) {
  const sayilar = [BUYUKLER[rnd(BUYUKLER.length)]]
  while (sayilar.length < SAYI_ADEDI) sayilar.push(KUCUKLER[rnd(KUCUKLER.length)])

  for (;;) {
    const sirali = [...sayilar]
    for (let i = sirali.length - 1; i > 0; i -= 1) {
      const j = rnd(i + 1)
      ;[sirali[i], sirali[j]] = [sirali[j], sirali[i]]
    }

    let hedef = sirali[0]
    for (const n of sirali.slice(1, 3 + rnd(3))) {
      const islem = rnd(3)
      if (islem === 0) hedef += n
      else if (islem === 1) hedef *= n
      else hedef = Math.abs(hedef - n)
    }

    // Tek sayının kendisi ya da çok küçük/büyük hedef bulmaca sayılmaz.
    if (hedef >= 50 && hedef <= 999 && !sayilar.includes(hedef)) return { sayilar, hedef }
  }
}

/**
 * Yazılan işlemi denetler. Her sayı en fazla verildiği kadar kullanılabilir;
 * yalnızca + - * / ve parantez kabul edilir (`^`, `%` ve ondalık yok).
 *
 * @returns {{ gecerli: true, sonuc: number } | { gecerli: false, hata: string }}
 */
export function islemDenetle(metin, sayilar) {
  const ifade = metin.trim()
  if (!/^[\d\s+\-−*×xX/÷:()]+$/.test(ifade) || !/[+\-−*×xX/÷:]/.test(ifade)) {
    return { gecerli: false, hata: 'Yalnızca sayı, + - * / ve parantez kullan.' }
  }

  const kalan = [...sayilar]
  for (const s of ifade.match(/\d+/g) || []) {
    const i = kalan.indexOf(Number(s))
    if (i === -1) return { gecerli: false, hata: `${s} sayısını kullanamazsın ya da fazla kullandın.` }
    kalan.splice(i, 1)
  }

  try {
    return { gecerli: true, sonuc: calculate(ifade) }
  } catch (err) {
    if (err instanceof CalcError) return { gecerli: false, hata: 'İşlemi çözemedim.' }
    throw err
  }
}

async function cevapAl({ sock, msg, parsed, state, body }) {
  const from = state.chatJid
  if (state.finished) return

  const yaz = (content) => sock.sendMessage(from, content, { quoted: msg })
  const denetim = islemDenetle(body, state.sayilar)

  if (denetim.gecerli && denetim.sonuc === state.hedef) {
    state.finished = true
    endGame(from)
    const kazanc = addXp({ chatJid: from, userJid: parsed.sender, amount: XP_SAYI })

    await yaz({
      text: [
        '🎉 *DOĞRU!*',
        '',
        `🏆 ${mentionOf(parsed.sender)} buldu: ${body.trim()} = *${state.hedef}*`,
        `⭐ +${binlik(kazanc)} XP`,
      ].join('\n'),
      mentions: [parsed.sender],
    })
    return
  }

  const text = denetim.gecerli
    ? `❌ Sonuç ${denetim.sonuc}, hedef ${state.hedef}.`
    : `❌ ${denetim.hata}`
  const result = await yaz({ text })
  setLastMessage(from, result?.key?.id)
}

/** `.sayıoyunu` gövdesi. Çağıran boş oyun yuvasını denetlemiştir. */
export async function start({ sock, msg, from, sender }) {
  const { sayilar, hedef } = bulmacaUret()

  const state = startGame(from, {
    type: 'sayioyunu',
    starterJid: sender,
    lastMessageId: null,
    timeoutMs: SURE_MS,
    sayilar,
    hedef,
    finished: false,
    onAnswer: cevapAl,
    summarize: () => ({ text: '🛑 Oyun elle bitirildi.' }),
    onTimeout: async () => {
      await sock.sendMessage(from, { text: `⏱️ 5 dakika doldu. Hedef *${hedef}* bulunamadı.` })
    },
  })

  if (!state) return

  const result = await sock.sendMessage(
    from,
    {
      text: [
        '🧮 *SAYI OYUNU*',
        '',
        `🔢 Sayılar: *${sayilar.join('  ')}*`,
        `🎯 Hedef: *${hedef}*`,
        '',
        '↩️ İşlemi botun son mesajına yaz. Örnek: `(25 + 5) * 3`',
        `Her sayı bir kez, hepsini kullanmak şart değil. İlk bulan +${XP_SAYI} XP alır. ⏱️ 5 dk`,
      ].join('\n'),
    },
    { quoted: msg },
  )

  const id = result?.key?.id
  if (!id) {
    logger.error({ from }, 'Oyun mesajının id\'si alınamadı, sayı oyunu iptal edildi')
    endGame(from)
    return
  }
  setLastMessage(from, id)
}
