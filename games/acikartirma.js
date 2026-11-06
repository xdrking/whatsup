import { binlik } from '../lib/sayi.js'
import logger from '../lib/logger.js'
import { mentionOf } from '../lib/target.js'
import { endGame, setLastMessage, startGame } from './gameManager.js'

// Tek mesajda çok fazla etiket WhatsApp tarafından kırpılabiliyor (bkz. .etiket).
const ETIKET_PER_MESAJ = 100

function sonucMetni(state, baslik) {
  const { starterJid: satici, miktar, enYuksek } = state

  if (!enYuksek) {
    return { text: [baslik, '', `Teklif gelmedi, ${binlik(miktar)} XP satılmadı.`].join('\n') }
  }

  return {
    text: [
      baslik,
      '',
      `🏆 ${mentionOf(enYuksek.jid)} kazandı. Teklif: *${binlik(enYuksek.teklif)}*`,
      '',
      `➡️ ${mentionOf(satici)}, ${binlik(miktar)} XP'yi \`.devret @kişi ${miktar}\` ile göndermelisin.`,
      'Bot XP aktarmaz, devri satıcı kendisi yapar.',
    ].join('\n'),
    mentions: [enYuksek.jid, satici],
  }
}

async function cevapAl({ sock, msg, parsed, state, body }) {
  const from = state.chatJid
  if (state.finished) return

  const yaz = (content) => sock.sendMessage(from, content, { quoted: msg })

  if (parsed.sender === state.starterJid) {
    await yaz({ text: '🔨 Kendi açık artırmana teklif veremezsin.' })
    return
  }

  const teklif = /^\d+$/.test(body.trim()) ? Number(body.trim()) : 0
  if (!Number.isSafeInteger(teklif) || teklif <= 0) {
    await yaz({ text: '🔨 Teklifini sayıyla yaz.' })
    return
  }

  if (state.enYuksek && teklif <= state.enYuksek.teklif) {
    await yaz({ text: `🔨 En yüksek teklif ${binlik(state.enYuksek.teklif)}, daha fazlasını yaz.` })
    return
  }

  state.enYuksek = { jid: parsed.sender, teklif }
  // setLastMessage çağrılmaz: herkes baştaki mesaja yanıt vermeye devam edebilsin,
  // yoksa aynı anda teklif yazanların mesajı eski id'ye gittiği için düşerdi.
  await yaz({
    text: `🔨 En yüksek teklif: *${binlik(teklif)}* — ${mentionOf(parsed.sender)}`,
    mentions: [parsed.sender],
  })
}

/** `.açıkartırma` gövdesi. Çağıran miktarı, süreyi ve boş oyun yuvasını denetlemiştir. */
export async function start({ sock, msg, from, sender, miktar, sureSn, uyeler }) {
  const state = startGame(from, {
    type: 'acikartirma',
    starterJid: sender,
    lastMessageId: null,
    timeoutMs: sureSn * 1000,
    miktar,
    enYuksek: null,
    finished: false,
    onAnswer: cevapAl,
    summarize: (s) => sonucMetni(s, '🛑 *AÇIK ARTIRMA ERKEN BİTTİ*'),
    onTimeout: async () => {
      state.finished = true
      await sock.sendMessage(from, sonucMetni(state, '🔨 *AÇIK ARTIRMA BİTTİ*'))
    },
  })

  if (!state) {
    await sock.sendMessage(from, { text: '⚠️ Bu grupta zaten aktif bir oyun var.' }, { quoted: msg })
    return
  }

  const ilk = uyeler.slice(0, ETIKET_PER_MESAJ)
  const result = await sock.sendMessage(
    from,
    {
      text: [
        '🔨 *AÇIK ARTIRMA*',
        '',
        `💰 Satılık: *${binlik(miktar)} XP*  •  Satıcı: ${mentionOf(sender)}`,
        `⏱️ Süre: *${sureSn} sn*`,
        '',
        '↩️ Teklifini sayıyla bu mesaja yanıt olarak yaz. En yüksek sayı kazanır.',
        '',
        ...ilk.map(mentionOf),
      ].join('\n'),
      mentions: [...new Set([sender, ...ilk])],
    },
    { quoted: msg },
  )

  const id = result?.key?.id
  if (!id) {
    logger.error({ from }, 'Oyun mesajının id\'si alınamadı, açık artırma iptal edildi')
    endGame(from)
    return
  }
  setLastMessage(from, id)

  for (let i = ETIKET_PER_MESAJ; i < uyeler.length; i += ETIKET_PER_MESAJ) {
    const parca = uyeler.slice(i, i + ETIKET_PER_MESAJ)
    await sock.sendMessage(from, { text: parca.map(mentionOf).join('\n'), mentions: parca })
  }
}
