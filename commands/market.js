import { sureYaz } from './cark.js'
import { requireGroup } from '../lib/group.js'
import { URUNLER } from '../lib/market.js'
import { getStats, marketAl, marketDurumu } from '../lib/stats.js'
import { trLower } from '../lib/turkishWords.js'
import logger from '../lib/logger.js'

const sayi = new Intl.NumberFormat('tr-TR')

export default {
  name: 'market',
  aliases: ['mağaza', 'magaza', 'shop'],
  description: 'XP ile kalkan, bonus ve unvan satın al',
  usage: '.market  —  .market al <numara>',
  details: [
    '`.market` ürünleri ve XP\'ni gösterir, `.market al 1` satın alır.',
    'Unvan `.profil`\'de görünür; yeni unvan eskisinin yerine geçer.',
    'Kalkan süresi üst üste eklenir. Bonus varken yenisi alınırsa güçlü olan kalır, süre 1 saate döner.',
    'Satın alınan XP geri gelmez. Market her grupta ayrıdır.',
  ],
  category: 'oyun',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      if (['al', 'satınal', 'satinal', 'buy'].includes(trLower(args[0] || ''))) {
        const urun = URUNLER[Number(args[1]) - 1]
        if (!urun) return await yaz(`🛒 Ürün numarası yaz: \`.market al 1\` (1-${URUNLER.length})`)

        const s = marketAl({ chatJid: from, userJid: sender, urun })
        if (!s) return await yaz('🛒 Market şu an kapalı, sonra dene.')
        if (s.zatenVar) return await yaz('🛒 Bu unvan zaten sende.')
        if (s.yetersiz) return await yaz(`🛒 ${sayi.format(urun.fiyat)} XP gerekiyor. Senin XP'n: ${sayi.format(s.xp)}`)

        return await yaz(`🛒 *${urun.ad}* satın alındı.\n💰 Kalan XP: ${sayi.format(s.xp)}`)
      }

      const { unvan, kalkan } = marketDurumu(from, sender)
      const lines = [
        '🛒 *Market*',
        '',
        ...URUNLER.map((u, i) => `${i + 1}. ${u.ad} — ${sayi.format(u.fiyat)} XP`),
        '',
        `💰 XP'n: ${sayi.format(getStats(from, sender).xp)}`,
      ]
      if (unvan) lines.push(`🏷️ Unvanın: ${unvan}`)
      if (kalkan) lines.push(`🛡️ Kalkan: ${sureYaz(kalkan - Date.now())} kaldı`)
      lines.push('', 'Satın almak için `.market al <numara>`')

      await yaz(lines.join('\n'))
    } catch (err) {
      logger.error({ err, from }, '.market başarısız')
      await yaz('🛒 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.market hata mesajı gönderilemedi'),
      )
    }
  },
}
