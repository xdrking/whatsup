import { binlik } from '../lib/sayi.js'
import { randomInt } from 'node:crypto'
import logger from '../lib/logger.js'
import { kumarOde, xpCek } from '../lib/stats.js'
import { sonucSatirlari } from '../lib/kumar.js'
import { trLower } from '../lib/turkishWords.js'
import { endGame, setLastMessage, startGame, touchGame } from './gameManager.js'

const SURE_MS = 3 * 60_000
// Her tahminin çarpanı adil oranın %97'sidir. Tahmin başına uygulandığı için
// uzun seri kasaya daha çok kaldırır; çekmek oyuncunun kararıdır.
const DONUS = 0.97
// Çarpan sınırsız büyüyebilirdi: bu noktada kazanç kendiliğinden çekilir.
export const HILO_TAVAN = 1000

const DEGERLER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const RENKLER = ['♠', '♥', '♦', '♣']

/** Deste sonsuz sayılır: her kart bağımsız çekilir, sayarak avantaj alınamaz. */
export function kartCek(rnd = randomInt) {
  return { sira: rnd(13) + 1, renk: RENKLER[rnd(4)] }
}

export const kartYaz = (k) => `${DEGERLER[k.sira - 1]}${k.renk}`

/**
 * "Yüksek" aynı ya da daha yüksek, "düşük" aynı ya da daha düşük kart demektir.
 * @returns {number} tahminin tutma olasılığı
 */
export function hiloSans(sira, yon) {
  return yon === 'yüksek' ? (14 - sira) / 13 : sira / 13
}

/** Tek tahminin çarpanı; olasılık 1 ise (As'ta yüksek, Papaz'da düşük) tahmin anlamsızdır. */
export function hiloCarpani(sira, yon) {
  const p = hiloSans(sira, yon)
  return p >= 1 ? null : DONUS / p
}

export function hiloTuttu(onceki, yeni, yon) {
  return yon === 'yüksek' ? yeni >= onceki : yeni <= onceki
}

const goster = (c) => Math.floor(c * 100) / 100

function yonCoz(body) {
  const a = trLower(body.trim())
  if (['yüksek', 'yuksek', 'y', 'üst', 'ust', 'h', 'hi', 'high'].includes(a)) return 'yüksek'
  if (['düşük', 'dusuk', 'd', 'alt', 'l', 'lo', 'low'].includes(a)) return 'düşük'
  if (['geç', 'gec', 'pas', 'skip'].includes(a)) return 'geç'
  if (['çek', 'cek', 'dur', 'al'].includes(a)) return 'çek'
  return null
}

function secenekler(state) {
  const s = state.kart.sira
  const satir = []
  for (const [yon, ok] of [['yüksek', '⬆️'], ['düşük', '⬇️']]) {
    const c = hiloCarpani(s, yon)
    if (c) satir.push(`${ok} \`${yon}\`: ${goster(state.carpan * c)}x (%${Math.round(hiloSans(s, yon) * 100)})`)
  }
  return satir
}

function sonuclandir(state, odeme, sebep) {
  state.finished = true
  const s = kumarOde({ oyun: 'hilo', chatJid: state.chatJid, userJid: state.starterJid, bahis: state.bahis, odeme })
  const lines = ['🃏 *HI-LO*', '', `Kartlar: ${state.gecmis.join(' ')}`, '', sebep]
  if (s) lines.push(...sonucSatirlari({ once: s.xp - s.fark, xp: s.xp, fark: s.fark, kesilen: s.kesilen }))
  else lines.push('❌ Sonuç yazılamadı.')
  return { text: lines.join('\n') }
}

function nakitCek(state, sebep) {
  const c = goster(state.carpan)
  return sonuclandir(state, Math.floor(state.bahis * c), `${sebep} (${c}x)`)
}

function durumMesaji(state, ust) {
  return [
    ...ust,
    `🂠 Kart: *${kartYaz(state.kart)}*  •  Şu an: ${goster(state.carpan)}x = ${binlik(Math.floor(state.bahis * goster(state.carpan)))} XP`,
    '',
    ...secenekler(state),
    '⏭️ `geç`: kartı değiştir, çarpan aynı  •  💰 `çek`',
  ].join('\n')
}

async function cevapAl({ sock, msg, parsed, state, body }) {
  const from = state.chatJid
  if (state.finished || parsed.sender !== state.starterJid) return

  const yaz = (content) => sock.sendMessage(from, content, { quoted: msg })
  const bitir = async (sonuc) => {
    endGame(from)
    await yaz(sonuc)
  }
  const devam = async (text) => {
    touchGame(from)
    const result = await yaz({ text })
    setLastMessage(from, result?.key?.id)
  }

  const yon = yonCoz(body)
  if (!yon) return devam('🃏 `yüksek`, `düşük`, `geç` ya da `çek` yaz.')
  if (yon === 'çek') return bitir(nakitCek(state, '💰 Parayı çektin'))

  const yeni = kartCek()
  state.gecmis.push(kartYaz(yeni))

  if (yon === 'geç') {
    state.kart = yeni
    return devam(durumMesaji(state, ['⏭️ Kart değişti.']))
  }

  const c = hiloCarpani(state.kart.sira, yon)
  if (!c) {
    state.gecmis.pop()
    return devam(`🃏 ${kartYaz(state.kart)} üstünde \`${yon}\` her zaman tutar, oynanmaz. Öbürünü ya da \`geç\` yaz.`)
  }

  if (!hiloTuttu(state.kart.sira, yeni.sira, yon)) {
    return bitir(sonuclandir(state, 0, `💥 ${kartYaz(yeni)} geldi, \`${yon}\` tutmadı!`))
  }

  state.carpan *= c
  state.kart = yeni
  if (state.carpan >= HILO_TAVAN) return bitir(nakitCek(state, `🏆 ${HILO_TAVAN}x tavanına ulaştın`))

  await devam(durumMesaji(state, [`✅ ${kartYaz(yeni)} geldi!`]))
}

/** `.hilo` gövdesi. Çağıran miktarı ve boş oyun yuvasını denetlemiştir. */
export async function start({ sock, msg, from, sender, miktar }) {
  const yaz = (content) => sock.sendMessage(from, content, { quoted: msg })

  const cekim = xpCek({ chatJid: from, userJid: sender, miktar })
  if (!cekim) return yaz({ text: '🃏 Masa şu an kapalı, sonra dene.' })
  if (cekim.yetersiz) return yaz({ text: `🃏 O kadar XP'n yok. Senin XP'n: ${binlik(cekim.xp)}` })

  const kart = kartCek()
  const state = startGame(from, {
    type: 'hilo',
    starterJid: sender,
    lastMessageId: null,
    timeoutMs: SURE_MS,
    bahis: miktar,
    kart,
    carpan: 1,
    gecmis: [kartYaz(kart)],
    finished: false,
    onAnswer: cevapAl,
    summarize: (s) => nakitCek(s, '🛑 Oyun elle bitirildi, kazanç çekildi'),
    onTimeout: async () => {
      if (!state.finished) await sock.sendMessage(from, nakitCek(state, '⏱️ Süre doldu, kazanç çekildi'))
    },
  })

  if (!state) {
    kumarOde({ oyun: 'hilo', chatJid: from, userJid: sender, bahis: miktar, odeme: miktar })
    return yaz({ text: '⚠️ Bu grupta zaten aktif bir oyun var.' })
  }

  const result = await yaz({
    text: durumMesaji(state, [
      '🃏 *HI-LO*',
      `💸 Bahis: ${binlik(miktar)} XP`,
      'Sıradaki kart aynı ya da yüksek mi, aynı ya da düşük mü?',
      '',
    ]) + '\n↩️ Bu mesaja yanıt ver. ⏱️ 3 dk',
  })

  const id = result?.key?.id
  if (!id) {
    logger.error({ from }, 'Oyun mesajının id\'si alınamadı, hi-lo iade edildi')
    endGame(from)
    kumarOde({ oyun: 'hilo', chatJid: from, userJid: sender, bahis: miktar, odeme: miktar })
    return yaz({ text: 'Oyun başlatılamadı, bahsin iade edildi.' })
  }
  setLastMessage(from, id)
}
