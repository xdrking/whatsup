import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomInt } from 'node:crypto'
import { binlik } from '../lib/sayi.js'
import logger from '../lib/logger.js'
import { oyunOdulu, oyunTutari } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'
import { endGame, setLastMessage, startGame } from './gameManager.js'
import { katla } from './kimim.js'

const VERI_DOSYASI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tabu.json')
const SURE_MS = 3 * 60_000
const PAS_HAKKI = 2
// Anlatan da ödül alır, yoksa iyi anlatmak için sebep olmazdı. Bilenden az: kelimeyi özelden
// arkadaşına söyleyip XP kasmak, ikisine birden büyük ödül verseydi daha cazip olurdu.
const XP_BILEN = 40
const XP_ANLATAN = 20

let kartlar = null

/** `games/tabu.json`: `[{ kelime, yasak[] }]`. Bozuk kayıt atılır. */
async function kartlariYukle() {
  if (kartlar) return kartlar
  const ham = JSON.parse(await readFile(VERI_DOSYASI, 'utf8'))
  if (!Array.isArray(ham)) throw new Error('games/tabu.json bir JSON dizisi değil')
  kartlar = ham.filter((k) => typeof k?.kelime === 'string' && k.kelime.trim()
    && Array.isArray(k.yasak) && k.yasak.length && k.yasak.every((y) => typeof y === 'string' && y.trim()))
  return kartlar
}

// Bundan kısa yasaklılar ("su", "el", "top") yalnızca tam eşleşir: başıyla eşleşseler
// "sunmak", "elma", "toplu" da yakalanırdı.
const EK_ALAN_UZUNLUK = 4

/**
 * İpucunda yasaklı sözcük var mı? Ek alan halleri de yakalanır ("arabayla" → "araba"),
 * bu yüzden sözcük yasaklının başıyla eşleşir. Kelimenin kendisi de yasaktır.
 * @returns {string | null} yakalanan yasaklı sözcük
 */
export function yasakliBul(ipucu, kart) {
  const sozcukler = katla(ipucu).split(' ')
  for (const yasak of [kart.kelime, ...kart.yasak]) {
    const y = katla(yasak)
    if (!y) continue
    if (sozcukler.some((s) => (y.length >= EK_ALAN_UZUNLUK ? s.startsWith(y) : s === y))) return yasak
  }
  return null
}

/** Tahmin cümlenin içinde de olabilir: "araba mı?" */
export const tahminDogru = (tahmin, kelime) => katla(tahmin).split(' ').includes(katla(kelime))

const kartMetni = (kart, baslik) =>
  [baslik, '', `🎯 Kelime: *${kart.kelime.toLocaleUpperCase('tr')}*`, `🚫 Yasak: ${kart.yasak.join(', ')}`,
    '', 'İpuçlarını gruptaki tabu mesajına yanıt olarak yaz. Bu sözcükleri ve eklerini kullanırsan oyun biter.',
    `Kartı geçmek için aynı mesaja \`pas\` yaz (${PAS_HAKKI} hak).`].join('\n')

function yeniKart(state) {
  const kalan = kartlar.filter((k) => !state.kullanilan.has(k.kelime))
  const havuz = kalan.length ? kalan : kartlar
  const kart = havuz[randomInt(havuz.length)]
  state.kullanilan.add(kart.kelime)
  return kart
}

async function cevapAl({ sock, msg, parsed, state, body }) {
  const from = state.chatJid
  if (state.finished) return
  const yaz = (content) => sock.sendMessage(from, content, { quoted: msg })

  if (parsed.sender === state.starterJid) {
    if (katla(body) === 'pas') {
      if (state.pas >= PAS_HAKKI) return yaz({ text: '🙅 Pas hakkın bitti.' })
      state.pas += 1
      state.kart = yeniKart(state)
      await sock.sendMessage(state.dmJid, { text: kartMetni(state.kart, '🔄 *Yeni kart*') })
      return yaz({ text: `🔄 Kart geçildi, yeni kelime özelden gitti (${PAS_HAKKI - state.pas} pas kaldı).` })
    }

    const yakalanan = yasakliBul(body, state.kart)
    if (!yakalanan) return
    state.finished = true
    endGame(from)
    return yaz({
      text: `🚨 *TABU!* ${mentionOf(state.starterJid)} yasaklı sözcüğü kullandı: _${yakalanan}_\nKelime *${state.kart.kelime}* idi.`,
      mentions: [state.starterJid],
    })
  }

  if (!tahminDogru(body, state.kart.kelime)) return

  state.finished = true
  endGame(from)
  const bilen = oyunOdulu({ chatJid: from, userJid: parsed.sender, amount: XP_BILEN })
  const anlatan = oyunOdulu({ chatJid: from, userJid: state.starterJid, amount: XP_ANLATAN })
  await yaz({
    text: [
      '🎉 *BİLDİ!*', '',
      `🏆 ${mentionOf(parsed.sender)} kelimeyi buldu: *${state.kart.kelime}*`,
      `⭐ Bilen +${binlik(bilen)} XP  •  🗣️ ${mentionOf(state.starterJid)} +${binlik(anlatan)} XP`,
    ].join('\n'),
    mentions: [parsed.sender, state.starterJid],
  })
}

/**
 * `.tabu` gövdesi. Çağıran boş oyun yuvasını denetlemiştir. Kart anlatana özelden gider;
 * bot kendiliğinden yazmaz, mesajı anlatanın kendi komutu tetikler. Numaralı JID'e gönderilir:
 * LID'e özel mesaj her zaman ulaşmıyor.
 */
export async function start({ sock, msg, from, sender, senderPn }) {
  try {
    await kartlariYukle()
  } catch (err) {
    logger.error({ err }, 'games/tabu.json okunamadı')
    await sock.sendMessage(from, { text: '❌ Tabu kartları okunamadı.' }, { quoted: msg })
    return
  }
  if (!kartlar.length) {
    await sock.sendMessage(from, { text: '❌ Hiç tabu kartı yok.' }, { quoted: msg })
    return
  }

  const state = startGame(from, {
    type: 'tabu',
    starterJid: sender,
    dmJid: senderPn || sender,
    lastMessageId: null,
    timeoutMs: SURE_MS,
    kullanilan: new Set(),
    pas: 0,
    finished: false,
    onAnswer: cevapAl,
    summarize: (s) => ({ text: `🛑 Tabu elle bitirildi. Kelime *${s.kart.kelime}* idi.` }),
    onTimeout: async () => {
      await sock.sendMessage(from, { text: `⏱️ Süre doldu, kimse bilemedi. Kelime *${state.kart.kelime}* idi.` })
    },
  })
  if (!state) return
  state.kart = yeniKart(state)

  try {
    await sock.sendMessage(state.dmJid, { text: kartMetni(state.kart, '🤫 *Tabu kartın*') })
  } catch (err) {
    logger.error({ err, from }, 'Tabu kartı özelden gönderilemedi')
    endGame(from)
    await sock.sendMessage(from, { text: '❌ Kartı özelden gönderemedim. Bota bir kez özelden yazıp tekrar dene.' }, { quoted: msg })
    return
  }

  const result = await sock.sendMessage(
    from,
    {
      text: [
        '🗣️ *TABU*', '',
        `${mentionOf(sender)} bir kelime anlatacak, kartı özelden gitti.`,
        '↩️ Anlatan ipuçlarını, diğerleri tahminlerini *bu mesaja yanıt olarak* yazar.',
        `⏱️ 3 dakika. İlk bilen +${binlik(oyunTutari(from, XP_BILEN))} XP, anlatan +${binlik(oyunTutari(from, XP_ANLATAN))} XP.`,
      ].join('\n'),
      mentions: [sender],
    },
    { quoted: msg },
  )

  const id = result?.key?.id
  if (!id) {
    logger.error({ from }, 'Tabu mesajının id\'si alınamadı, oyun iptal edildi')
    endGame(from)
    return
  }
  // Yanlış tahminde güncellenmez: herkes aynı mesaja yanıt verir, yoksa aynı anda yazanlar düşerdi.
  setLastMessage(from, id)
}
