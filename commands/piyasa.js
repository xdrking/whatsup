import { requireGroup } from '../lib/group.js'
import { OLAY_SAATI, OLAYLAR, piyasaOlayi } from '../lib/olay.js'
import { sureYaz } from './cark.js'
import logger from '../lib/logger.js'

export default {
  name: 'piyasa',
  aliases: ['olay', 'piyasaolayı', 'piyasaolayi'],
  description: `Şu anki piyasa olayını gösterir, ${OLAY_SAATI} saatte bir değişir`,
  usage: '.piyasa',
  details: [
    `Olay her grupta ${OLAY_SAATI} saatte bir değişir (00, 06, 12, 18). Maaş, kira, market, oyun ödülü ve yatırımı etkiler.`,
    `Olaylar: ${OLAYLAR.map((o) => o.ad).join(', ')}.`,
    'Coin kuru ve key fiyatları olaydan etkilenmez.',
  ],
  category: 'ekonomi',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const now = Date.now()
      const olay = piyasaOlayi(from, now)
      const sonraki = piyasaOlayi(from, olay.bitis)
      await yaz([
        `🌐 *Piyasa olayı:* ${olay.ad}`,
        olay.aciklama,
        '',
        `⏳ Bitişine ${sureYaz(olay.bitis - now)} var.`,
        sonraki.kod === olay.kod ? '' : '🔮 Sıradaki olay sürpriz.',
      ].filter(Boolean).join('\n'))
    } catch (err) {
      logger.error({ err, from }, '.piyasa başarısız')
      await yaz('🌐 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.piyasa hata mesajı gönderilemedi'),
      )
    }
  },
}
