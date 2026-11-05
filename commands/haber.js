import { pickRandom } from '../lib/dataset.js'
import logger from '../lib/logger.js'
import { trUpper } from '../lib/turkishWords.js'

// WhatsApp'ta küçük yazı yok, en yakını üst simge harfler.
const PARODI_ETIKETI = 'ᵖᵃʳᵒᵈⁱʰᵃᵇᵉʳ'

export function haberMetni(haber) {
  return `*${trUpper(haber)}*\n\n${PARODI_ETIKETI}`
}

export default {
  name: 'haber',
  aliases: ['news'],
  description: 'Rastgele bir parodi haber verir',
  usage: '.haber',
  category: 'eğlence',
  ownerOnly: false,

  async execute({ sock, msg, from }) {
    try {
      const haber = await pickRandom('haberler.json', from)
      if (!haber) {
        await sock.sendMessage(from, { text: '📰 Haber havuzu şu an boş.' }, { quoted: msg })
        return
      }
      await sock.sendMessage(from, { text: haberMetni(haber) }, { quoted: msg })
    } catch (err) {
      logger.error({ err }, '.haber gönderilemedi')
      await sock.sendMessage(from, { text: '📰 Haber servisi şu an çalışmıyor.' }, { quoted: msg })
    }
  },
}
