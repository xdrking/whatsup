import { TESVIK_AKTIF_GUN } from '../lib/banka.js'
import { digerUyeler, requireGroupMetadata } from '../lib/group.js'
import { binlik } from '../lib/sayi.js'
import { tesvikDagit } from '../lib/stats.js'
import logger from '../lib/logger.js'

const KAPALI = '🎁 Teşvik şu an dağıtılamıyor.'

export default {
  name: 'teşvik',
  aliases: ['tesvik'],
  description: 'Bot sahibi: kasadan aktif üyelere eşit XP dağıtır',
  usage: '.teşvik <miktar>',
  details: [`Son ${TESVIK_AKTIF_GUN} günde yazan üyelere eşit bölünür, bot hariç. Eksi cüzdana giden pay önce eksiyi kapatır.`],
  category: 'ekonomi',
  ownerOnly: true,

  async execute({ sock, msg, args, from, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
      if (!metadata) return

      const miktar = Number(args[0])
      if (!Number.isSafeInteger(miktar) || miktar < 1) return await yaz('Kullanım: `.teşvik <miktar>`')

      const s = tesvikDagit({ chatJid: from, uyeler: digerUyeler(metadata, ''), miktar })
      if (!s || s.kapali) return await yaz(KAPALI)
      if (s.yetersiz) return await yaz(`🎁 Kasada o kadar yok: ${binlik(s.kasa)} XP`)
      if (s.kimseYok) return await yaz('🎁 Dağıtılacak aktif üye yok ya da tutar kişi başına 1 XP etmiyor.')

      await yaz([
        '🎁 *DEVLET TEŞVİĞİ*',
        '',
        `👥 ${binlik(s.kisi)} aktif üyeye kişi başı *${binlik(s.pay)} XP*`,
        `💰 Toplam: ${binlik(s.toplam)} XP`,
      ].join('\n'))
    } catch (err) {
      logger.error({ err, from }, '.teşvik başarısız')
      await yaz('🎁 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.teşvik hata mesajı gönderilemedi'),
      )
    }
  },
}
