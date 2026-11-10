import logger from '../lib/logger.js'
import { requireGroup } from '../lib/group.js'
import { IFLAS_KREDI_YASAK_SAATI, IFLAS_YASAK_SAATI } from '../lib/kredi.js'
import { iflasEt } from '../lib/stats.js'

const sayi = new Intl.NumberFormat('tr-TR')

export default {
  name: 'iflas',
  aliases: ['konkordato', 'bankruptcy'],
  description: 'Eksi bakiyeni siler, karşılığında kumar yasağı alırsın',
  usage: '.iflas',
  details: [
    `Cüzdanın eksideyse sıfırlanır, ${IFLAS_YASAK_SAATI} saat kumar oynayamazsın, ${IFLAS_KREDI_YASAK_SAATI} saat kredi çekemezsin.`,
    'Açık kredi silinmez, önce vade dolmalı. Elinde hisse varsa önce satmalısın.',
  ],
  category: 'ekonomi',
  cooldown: 10,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const s = iflasEt({ chatJid: from, userJid: sender })
      if (!s) return await yaz('⚖️ Mahkeme şu an kapalı, sonra dene.')
      if (s.kredili) return await yaz(`⚖️ Açık kredi iflasla silinmez: ${sayi.format(s.borc)} XP. Öde ya da vadeyi bekle.`)
      if (s.borcYok) return await yaz('⚖️ Cüzdanın ekside değil, iflas edemezsin.')
      if (s.portfoy) return await yaz('⚖️ Önce hisselerini sat: `.borsa sat <hisse> hepsi`')
      if (s.coin) return await yaz('⚖️ Önce coinlerini boz: `.coinmarket sat <adet>`')
      if (s.kripto) return await yaz('⚖️ Önce Suly\'lerini sat: `.kripto sat suly hepsi`')
      if (s.mulk) return await yaz('⚖️ Önce mülklerini sat: `.mülk sat <mülk>`')
      if (s.cete) return await yaz('⚖️ Önce çete kasasını boşalt: `.çete çek <miktar>`')
      if (s.yatirim) return await yaz('⚖️ Önce yatırımının sonuçlanmasını bekle: `.yatırım`')

      await yaz([
        `⚖️ *İflas* — ${sayi.format(s.silinen)} XP borç silindi.`,
        '👛 Cüzdan: 0 XP',
        `🚫 ${IFLAS_YASAK_SAATI} saat kumar, ${IFLAS_KREDI_YASAK_SAATI} saat kredi yasağı başladı.`,
      ].join('\n'))
    } catch (err) {
      logger.error({ err, from }, '.iflas başarısız')
      await yaz('⚖️ Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.iflas hata mesajı gönderilemedi'),
      )
    }
  },
}
