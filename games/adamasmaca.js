import { binlik } from '../lib/sayi.js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import logger from '../lib/logger.js'
import { addXp } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'
import { trLower, trUpper } from '../lib/turkishWords.js'
import { endGame, setLastMessage, startGame, touchGame } from './gameManager.js'

const GAMES_DIR = path.dirname(fileURLToPath(import.meta.url))
// Ayrı havuz yok: .kelime'nin başlangıç kelimeleri kullanılır.
const VERI_DOSYASI = path.join(GAMES_DIR, 'kelimeler.json')

const XP_ADAMASMACA = 50
const MAX_YANLIS = 6
// Her tahminde sayaç sıfırlanır (touchGame): süre son tahminden itibaren işler.
const SURE_MS = 10 * 60_000

const HARF = /^[abcçdefgğhıijklmnoöprsştuüvyz]$/
const KELIME = /^[abcçdefgğhıijklmnoöprsştuüvyz]{4,10}$/

const ADAM = [
  ['  +---+', '  |   |', '      |', '      |', '      |', '=======' ],
  ['  +---+', '  |   |', '  O   |', '      |', '      |', '=======' ],
  ['  +---+', '  |   |', '  O   |', '  |   |', '      |', '=======' ],
  ['  +---+', '  |   |', '  O   |', ' /|   |', '      |', '=======' ],
  ['  +---+', '  |   |', '  O   |', ' /|\\  |', '      |', '=======' ],
  ['  +---+', '  |   |', '  O   |', ' /|\\  |', ' /    |', '=======' ],
  ['  +---+', '  |   |', '  O   |', ' /|\\  |', ' / \\  |', '=======' ],
].map((satirlar) => satirlar.join('\n'))

let kelimeler = null

async function kelimeleriYukle() {
  if (kelimeler) return kelimeler

  const parsed = JSON.parse(await readFile(VERI_DOSYASI, 'utf8'))
  if (!Array.isArray(parsed)) throw new Error('games/kelimeler.json bir JSON dizisi değil')

  const items = parsed.map((w) => trLower(w)).filter((w) => KELIME.test(w))
  if (!items.length) throw new Error('games/kelimeler.json adam asmacaya uygun kelime içermiyor')

  kelimeler = items
  return kelimeler
}

/** Kelimenin açılmış hali: "k _ l _ m" (büyük harfle). */
export function maske(kelime, tahminler) {
  return [...kelime].map((ch) => (tahminler.has(ch) ? trUpper(ch) : '_')).join(' ')
}

/**
 * Tahmini değerlendirir; durumu (tahminler, yanlış sayısı) değiştirir.
 *
 * @returns {'gecersiz'|'tekrar'|'dogru'|'yanlis'|'kazandi'|'kaybetti'}
 */
export function tahminEt(state, body) {
  const t = trLower(body)

  if (HARF.test(t)) {
    if (state.tahminler.has(t)) return 'tekrar'
    state.tahminler.add(t)

    if (!state.kelime.includes(t)) {
      state.yanlis += 1
      return state.yanlis >= MAX_YANLIS ? 'kaybetti' : 'yanlis'
    }
    return [...state.kelime].every((ch) => state.tahminler.has(ch)) ? 'kazandi' : 'dogru'
  }

  // Tek kelime, yalnız harf: kelimenin tamamı tahmin ediliyor.
  if (/^\p{L}{2,}$/u.test(t)) {
    if (t === state.kelime) {
      for (const ch of t) state.tahminler.add(ch)
      return 'kazandi'
    }
    state.yanlis += 1
    return state.yanlis >= MAX_YANLIS ? 'kaybetti' : 'yanlis'
  }

  return 'gecersiz'
}

function tahta(state) {
  const yanlislar = [...state.tahminler].filter((ch) => !state.kelime.includes(ch)).map(trUpper)
  return [
    '```',
    ADAM[Math.min(state.yanlis, MAX_YANLIS)],
    '```',
    `🔤 \`${maske(state.kelime, state.tahminler)}\``,
    `❌ Yanlış: ${yanlislar.length ? yanlislar.join(', ') : '-'} (${state.yanlis}/${MAX_YANLIS})`,
  ]
}

function bitisMetni(state, sebep, baslik = '💀 *ADAM ASILDI*') {
  return { text: [baslik, '', sebep, `🔤 Kelime: *${trUpper(state.kelime)}*`].join('\n') }
}

async function cevapla(sock, msg, from, content) {
  return sock.sendMessage(from, content, { quoted: msg })
}

async function cevapAl({ sock, msg, parsed, state, body }) {
  const from = state.chatJid
  if (state.finished) return

  // Değerlendirme senkron: iki tahmin aynı anda gelse de sırayla işlenir.
  const sonuc = tahminEt(state, body)

  if (sonuc === 'gecersiz') {
    const result = await cevapla(sock, msg, from, {
      text: `🤔 ${mentionOf(parsed.sender)} tek bir harf ya da kelimenin tamamını yaz.`,
      mentions: [parsed.sender],
    })
    setLastMessage(from, result?.key?.id)
    return
  }

  if (sonuc === 'kazandi' || sonuc === 'kaybetti') {
    state.finished = true
    endGame(from)

    if (sonuc === 'kazandi') {
      const kazanc = addXp({ chatJid: from, userJid: parsed.sender, amount: XP_ADAMASMACA })
      await cevapla(sock, msg, from, {
        text: [
          '🎉 *KURTARILDI!*',
          '',
          `🏆 ${mentionOf(parsed.sender)} kelimeyi buldu: *${trUpper(state.kelime)}*`,
          `⭐ +${binlik(kazanc)} XP`,
        ].join('\n'),
        mentions: [parsed.sender],
      })
    } else {
      await cevapla(sock, msg, from, {
        text: [...tahta(state), '', bitisMetni(state, `☠️ Son tahmin ${mentionOf(parsed.sender)}'den geldi.`).text].join('\n'),
        mentions: [parsed.sender],
      })
    }
    return
  }

  touchGame(from)

  const ust = {
    tekrar: `🔁 ${mentionOf(parsed.sender)} o harf zaten denendi.`,
    dogru: `✅ ${mentionOf(parsed.sender)} doğru harf!`,
    yanlis: `❌ ${mentionOf(parsed.sender)} yanlış.`,
  }[sonuc]

  const result = await cevapla(sock, msg, from, {
    text: [ust, ...tahta(state)].join('\n'),
    mentions: [parsed.sender],
  })
  setLastMessage(from, result?.key?.id)
}

/** `.adamasmaca` komutunun gövdesi. Oyun başlatılamadıysa false döner. */
export async function start({ sock, msg, from, sender }) {
  try {
    await kelimeleriYukle()
  } catch (err) {
    logger.error({ err }, 'Adam asmaca kelime dosyası okunamadı')
    await cevapla(sock, msg, from, { text: '🪢 Adam asmaca şu an kullanılamıyor.' })
    return false
  }

  const state = startGame(from, {
    type: 'adamasmaca',
    starterJid: sender,
    lastMessageId: null,
    kelime: kelimeler[Math.floor(Math.random() * kelimeler.length)],
    tahminler: new Set(),
    yanlis: 0,
    finished: false,
    timeoutMs: SURE_MS,
    onAnswer: cevapAl,
    summarize: (s) => bitisMetni(s, '🛑 Oyun elle bitirildi.', '🏁 *OYUN BİTTİ*'),
    onTimeout: async () => {
      await sock.sendMessage(from, bitisMetni(state, '⏱️ 10 dakika tahmin gelmedi.', '⌛ *SÜRE DOLDU*'))
    },
  })

  if (!state) return false

  const result = await cevapla(sock, msg, from, {
    text: [
      '🪢 *ADAM ASMACA*',
      ...tahta(state),
      '',
      `↩️ Bu mesaja yanıt olarak bir harf ya da kelimenin tamamını yaz. ${state.kelime.length} harfli.`,
      `💀 ${MAX_YANLIS} yanlışta adam asılır.`,
    ].join('\n'),
  })

  const id = result?.key?.id
  if (!id) {
    endGame(from)
    logger.error({ from }, "Oyun mesajının id'si alınamadı, adam asmaca iptal edildi")
    await cevapla(sock, msg, from, { text: 'Oyun başlatılamadı, tekrar dener misin?' })
    return false
  }

  setLastMessage(from, id)
  return true
}
