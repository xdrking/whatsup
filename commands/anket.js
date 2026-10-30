import logger from '../lib/logger.js'

// WhatsApp'ın anket sınırları: en az 2, en fazla 12 seçenek.
const MIN_SECENEK = 2
const MAX_SECENEK = 12

const KULLANIM = [
  '📊 Kullanım: `.anket Soru | seçenek 1 | seçenek 2 | ...`',
  `En az ${MIN_SECENEK}, en fazla ${MAX_SECENEK} seçenek.`,
].join('\n')

export default {
  name: 'anket',
  aliases: ['oylama', 'poll'],
  description: 'Tek seçimli WhatsApp anketi açar',
  usage: '.anket Soru | seçenek 1 | seçenek 2',
  details: [
    '`.anket Akşam ne yiyelim? | pizza | döner | lahmacun`',
    'İlk parça soru, `|` ile ayrılan diğerleri seçenek.',
    '2-12 seçenek, herkes tek seçim yapar. Oylar WhatsApp\'ın kendi anketinde sayılır.',
  ],
  ownerOnly: false,
  cooldown: 10,

  async execute({ sock, msg, text, from }) {
    const [soru, ...secenekler] = text
      .split('|')
      .map((parca) => parca.trim())
      .filter(Boolean)

    if (!soru || secenekler.length < MIN_SECENEK || secenekler.length > MAX_SECENEK) {
      await sock.sendMessage(from, { text: KULLANIM }, { quoted: msg })
      return
    }

    // Aynı seçenek iki kez yazılırsa oylar ikiye bölünür, anlamsız olur.
    const tekil = new Set(secenekler.map((s) => s.toLocaleLowerCase('tr')))
    if (tekil.size !== secenekler.length) {
      await sock.sendMessage(from, { text: '📊 Aynı seçenek birden fazla yazılmış.' }, { quoted: msg })
      return
    }

    try {
      await sock.sendMessage(from, {
        poll: { name: soru, values: secenekler, selectableCount: 1 },
      })
    } catch (err) {
      logger.error({ err, from }, 'Anket gönderilemedi')
      await sock.sendMessage(from, { text: '📊 Anket açılamadı.' }, { quoted: msg })
    }
  },
}
