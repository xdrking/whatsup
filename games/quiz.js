import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import logger from '../lib/logger.js'
import { addXp } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'
import { endGame, setLastMessage, startGame } from './gameManager.js'

const GAMES_DIR = path.dirname(fileURLToPath(import.meta.url))
const VERI_DOSYASI = path.join(GAMES_DIR, 'quiz.json')

const XP_QUIZ = 5

// Tek soruluk oyun: 1 saat bekletmenin anlamı yok.
const QUIZ_TIMEOUT_MS = 600_000

const HARFLER = ['A', 'B', 'C', 'D']

// Aynı soru arka arkaya çıkmasın (lib/dataset.js'teki geçmiş deseni).
const MAX_GECMIS = 20
const gecmis = new Map()

const veriHatasi = '🧠 Quiz şu an kullanılamıyor.'

let sorular = null

/**
 * `games/quiz.json` bir kez okunur. Cevabı seçenekler arasında olmayan ya da
 * 2-4 seçenekli olmayan kayıtlar atılır.
 */
async function sorulariYukle() {
  if (sorular) return sorular

  const raw = await readFile(VERI_DOSYASI, 'utf8')
  const parsed = JSON.parse(raw)

  if (!Array.isArray(parsed)) throw new Error('games/quiz.json bir JSON dizisi değil')

  const items = parsed.filter(
    (item) =>
      item &&
      typeof item.question === 'string' &&
      item.question.trim() &&
      Array.isArray(item.options) &&
      item.options.length >= 2 &&
      item.options.length <= HARFLER.length &&
      item.options.every((o) => typeof o === 'string' && o.trim()) &&
      item.options.includes(item.answer),
  )

  if (!items.length) throw new Error('games/quiz.json kullanılabilir soru içermiyor')

  if (items.length !== parsed.length) {
    logger.warn({ atlanan: parsed.length - items.length }, 'Quiz havuzunda geçersiz kayıtlar atlandı')
  }

  sorular = items
  return sorular
}

function karistir(dizi) {
  const kopya = [...dizi]
  for (let i = kopya.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[kopya[i], kopya[j]] = [kopya[j], kopya[i]]
  }
  return kopya
}

function soruSec(chatJid) {
  const recent = gecmis.get(chatJid) || []

  const taze = sorular.filter((item) => !recent.includes(item.question))
  const havuz = taze.length ? taze : sorular

  const secim = havuz[Math.floor(Math.random() * havuz.length)]

  recent.push(secim.question)
  while (recent.length > Math.min(MAX_GECMIS, Math.floor(sorular.length / 2))) recent.shift()
  gecmis.set(chatJid, recent)

  // Seçenek sırası her oyunda karışır: doğru cevap hep "A" olmasın.
  return { ...secim, options: karistir(secim.options) }
}

// "3,14" ile "3.14", "Ağrı dağı" ile "ağrı dağı" aynı sayılsın.
function sadele(text) {
  return String(text || '')
    .toLocaleLowerCase('tr')
    .replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * Cevap hangi seçeneği gösteriyor? Harf ("b", "B)"), sıra numarası ("2") ya
 * da seçeneğin kendisi kabul edilir. Anlaşılamazsa -1.
 */
export function secenekIndeksi(body, options) {
  const ham = body.trim()

  const harf = ham.match(/^([a-dA-D1-4])[).:\s]*$/)
  if (harf) {
    const k = harf[1].toUpperCase()
    const i = /\d/.test(k) ? Number(k) - 1 : HARFLER.indexOf(k)
    return i < options.length ? i : -1
  }

  const s = sadele(ham)
  return s ? options.findIndex((o) => sadele(o) === s) : -1
}

function soruMetni(soru) {
  return [
    `❓ *${soru.question}*`,
    '',
    ...soru.options.map((o, i) => `*${HARFLER[i]})* ${o}`),
  ]
}

function dogruSecenek(soru) {
  const i = soru.options.indexOf(soru.answer)
  return `${HARFLER[i]}) ${soru.answer}`
}

async function cevapla(sock, msg, from, content) {
  return sock.sendMessage(from, content, { quoted: msg })
}

async function cevapAl({ sock, msg, parsed, state, body }) {
  const from = state.chatJid

  // İki doğru cevap aynı anda gelirse ikincisi boşa düşsün: bayrak
  // await'lerden önce, senkron olarak konur.
  if (state.finished) return

  const secilen = secenekIndeksi(body, state.soru.options)

  let text
  if (secilen === -1) {
    text = `🤔 ${mentionOf(parsed.sender)} şıklardan birini yaz (A, B, C, D).`
  } else if (state.denediler.has(parsed.sender)) {
    // Kişi başı tek hak: şıkları sırayla deneyerek kazanılmasın.
    text = `🚫 ${mentionOf(parsed.sender)} bu soruda hakkını kullandın.`
  } else if (state.soru.options[secilen] === state.soru.answer) {
    state.finished = true
    endGame(from)

    addXp({ chatJid: from, userJid: parsed.sender, amount: XP_QUIZ })

    await cevapla(sock, msg, from, {
      text: [
        '🎉 *DOĞRU!*',
        '',
        `🏆 ${mentionOf(parsed.sender)} bildi!`,
        `✅ ${dogruSecenek(state.soru)}`,
        `⭐ +${XP_QUIZ} XP`,
      ].join('\n'),
      mentions: [parsed.sender],
    })
    return
  } else {
    state.denediler.add(parsed.sender)
    text = `❌ ${mentionOf(parsed.sender)} yanlış, bu soruda hakkın bitti.`
  }

  const result = await cevapla(sock, msg, from, { text, mentions: [parsed.sender] })
  setLastMessage(from, result?.key?.id)
}

function bitisMetni(state, sebep) {
  return {
    text: ['🧠 *QUIZ BİTTİ*', '', sebep, `✅ Cevap: ${dogruSecenek(state.soru)}`].join('\n'),
  }
}

/** `.quiz` komutunun gövdesi. Oyun başlatılamadıysa false döner. */
export async function start({ sock, msg, from, sender }) {
  try {
    await sorulariYukle()
  } catch (err) {
    logger.error({ err }, 'Quiz veri dosyası okunamadı')
    await cevapla(sock, msg, from, { text: veriHatasi })
    return false
  }

  const state = startGame(from, {
    type: 'quiz',
    starterJid: sender,
    lastMessageId: null,
    timeoutMs: QUIZ_TIMEOUT_MS,
    soru: soruSec(from),
    denediler: new Set(),
    finished: false,
    onAnswer: cevapAl,
    summarize: (s) => bitisMetni(s, '🛑 Oyun elle bitirildi.'),
    onTimeout: async () => {
      await sock.sendMessage(from, bitisMetni(state, '⏱️ 10 dakika içinde kimse bilemedi.'))
    },
  })

  if (!state) return false

  const result = await cevapla(sock, msg, from, {
    text: [
      '🧠 *QUIZ*',
      '',
      ...soruMetni(state.soru),
      '',
      '↩️ Cevap için bu mesaja harfle yanıt ver. Herkesin tek hakkı var.',
      `⭐ İlk bilen +${XP_QUIZ} XP alır.`,
    ].join('\n'),
  })

  const id = result?.key?.id
  if (!id) {
    endGame(from)
    logger.error({ from }, 'Oyun mesajının id\'si alınamadı, quiz iptal edildi')
    await cevapla(sock, msg, from, { text: 'Oyun başlatılamadı, tekrar dener misin?' })
    return false
  }

  setLastMessage(from, id)
  return true
}
