import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import logger from '../lib/logger.js'
import { addXp } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'
import { endGame, setLastMessage, startGame } from './gameManager.js'

const GAMES_DIR = path.dirname(fileURLToPath(import.meta.url))
const VERI_DOSYASI = path.join(GAMES_DIR, 'kimim.json')

const XP_KIMIM = 10

// Kaç yanlış tahminde bir yeni ipucu açılır.
const IPUCU_ARALIGI = 3

// Aynı karakter arka arkaya çıkmasın (lib/dataset.js'teki geçmiş deseni).
const MAX_GECMIS = 20
const gecmis = new Map()

const veriHatasi = '🎭 Kimim oyunu şu an kullanılamıyor.'

let karakterler = null

/**
 * `games/kimim.json` bir kez okunur. Bozuk kayıtlar atılır; hiç kullanılabilir
 * kayıt kalmazsa hata atılır ve çağıran taraf kullanıcıya kısa bir mesaj yazar.
 */
async function karakterleriYukle() {
  if (karakterler) return karakterler

  const raw = await readFile(VERI_DOSYASI, 'utf8')
  const parsed = JSON.parse(raw)

  if (!Array.isArray(parsed)) throw new Error('games/kimim.json bir JSON dizisi değil')

  const items = parsed
    .filter(
      (item) => item && typeof item.name === 'string' && item.name.trim() && Array.isArray(item.hints),
    )
    .map((item) => ({
      name: item.name.trim(),
      hints: item.hints.filter((hint) => typeof hint === 'string' && hint.trim()),
    }))
    .filter((item) => item.hints.length)

  if (!items.length) throw new Error('games/kimim.json kullanılabilir karakter içermiyor')

  if (items.length !== parsed.length) {
    logger.warn({ atlanan: parsed.length - items.length }, 'Kimim havuzunda geçersiz kayıtlar atlandı')
  }

  karakterler = items
  return karakterler
}

// Tahmin karşılaştırması tamamen yerel: Türkçe harfler ASCII'ye katlanır ki
// "Erdoğan" ile "erdogan" aynı sayılsın, noktalama ve fazla boşluk atılır.
const KATLAMA = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  İ: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  â: 'a',
  î: 'i',
  û: 'u',
}

function katla(text) {
  return String(text || '')
    .toLocaleLowerCase('tr')
    .split('')
    .map((ch) => KATLAMA[ch] || ch)
    .join('')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Tahmin doğru mu? Tam ad, soyad (en az 4 harf) ve "ad + soyad" kabul edilir;
 * "Erdo" gibi kısaltmalar edilmez.
 */
export function tahminDogruMu(guess, name) {
  const t = katla(guess)
  if (!t) return false

  const tam = katla(name)
  if (t === tam) return true

  const parcalar = tam.split(' ')
  if (parcalar.length < 2) return false

  const son = parcalar[parcalar.length - 1]
  if (son.length >= 4 && t === son) return true

  return t === `${parcalar[0]} ${son}`
}

function karakterSec(chatJid) {
  const recent = gecmis.get(chatJid) || []

  const taze = karakterler.filter((item) => !recent.includes(item.name))
  const havuz = taze.length ? taze : karakterler

  const secim = havuz[Math.floor(Math.random() * havuz.length)]

  recent.push(secim.name)
  while (recent.length > Math.min(MAX_GECMIS, Math.floor(karakterler.length / 2))) recent.shift()
  gecmis.set(chatJid, recent)

  return secim
}

function ipucuSatirlari(state) {
  return [`💡 *İPUCU ${state.hintIndex + 1}:*`, `"${state.character.hints[state.hintIndex]}"`]
}

function bitisMetni(state, sebep, baslik = '😔 Üzgünüm dostum...') {
  return {
    text: [
      baslik,
      '',
      'Kimim oyunu durduruldu.',
      sebep,
      `🎭 Cevap: ${state.character.name}`,
    ].join('\n'),
  }
}

async function cevapla(sock, msg, from, content) {
  return sock.sendMessage(from, content, { quoted: msg })
}

async function cevapAl({ sock, msg, parsed, state, body }) {
  const from = state.chatJid

  // İki doğru tahmin aynı anda gelirse ikincisi boşa düşsün: bayrak
  // await'lerden önce, senkron olarak konur.
  if (state.finished) return

  if (tahminDogruMu(body, state.character.name)) {
    state.finished = true
    endGame(from)

    addXp({ chatJid: from, userJid: parsed.sender, amount: XP_KIMIM })

    await cevapla(sock, msg, from, {
      text: [
        '🎉 *DOĞRU!*',
        '',
        `🏆 ${mentionOf(parsed.sender)} doğru bildi!`,
        `🎭 Cevap: ${state.character.name}`,
        `⭐ +${XP_KIMIM} XP`,
      ].join('\n'),
      mentions: [parsed.sender],
    })
    return
  }

  state.wrongCount += 1

  const lines = [`❌ ${mentionOf(parsed.sender)} yanlış tahmin.`]

  const yeniIpucu =
    state.wrongCount % IPUCU_ARALIGI === 0 && state.hintIndex < state.character.hints.length - 1

  if (yeniIpucu) {
    state.hintIndex += 1
    lines.push('', ...ipucuSatirlari(state))
  }

  const result = await cevapla(sock, msg, from, {
    text: lines.join('\n'),
    mentions: [parsed.sender],
  })

  // Yanlış tahmin süreyi uzatmaz (touchGame yok): 1 saat, doğru cevap
  // gelmediği sürece işlemeye devam eder.
  setLastMessage(from, result?.key?.id)
}

/** `.kimim` komutunun gövdesi. Oyun başlatılamadıysa false döner. */
export async function start({ sock, msg, from, sender }) {
  try {
    await karakterleriYukle()
  } catch (err) {
    logger.error({ err }, 'Kimim veri dosyası okunamadı')
    await cevapla(sock, msg, from, { text: veriHatasi })
    return false
  }

  const character = karakterSec(from)

  const state = startGame(from, {
    type: 'kimim',
    starterJid: sender,
    lastMessageId: null,
    character,
    hintIndex: 0,
    wrongCount: 0,
    finished: false,
    onAnswer: cevapAl,
    summarize: (s) => bitisMetni(s, '🛑 Oyun elle bitirildi.', '🏁 *OYUN BİTTİ*'),
    onTimeout: async () => {
      await sock.sendMessage(from, bitisMetni(state, '⏱️ 1 saat boyunca kimse doğru cevabı bulamadı.'))
    },
  })

  if (!state) return false

  const result = await cevapla(sock, msg, from, {
    text: [
      '🎭 *KİMİM?*',
      '',
      'Bir karakter seçtim.',
      '',
      ...ipucuSatirlari(state),
      '',
      '↩️ Tahmin yapmak için bu mesaja yanıt ver.',
      '⏱️ 1 saat boyunca doğru cevap gelmezse oyun sona erer.',
    ].join('\n'),
  })

  const id = result?.key?.id
  if (!id) {
    endGame(from)
    logger.error({ from }, 'Oyun mesajının id\'si alınamadı, kimim oyunu iptal edildi')
    await cevapla(sock, msg, from, { text: 'Oyun başlatılamadı, tekrar dener misin?' })
    return false
  }

  setLastMessage(from, id)
  return true
}
