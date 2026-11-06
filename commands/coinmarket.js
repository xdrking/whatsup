import { COIN_FIYATI, COIN_URUNLERI } from '../lib/coin.js'
import { requireGroup } from '../lib/group.js'
import { binlik } from '../lib/sayi.js'
import { coinAl, coinDurumu, coinMarketAl, getStats } from '../lib/stats.js'
import { trLower } from '../lib/turkishWords.js'
import logger from '../lib/logger.js'

export default {
  name: 'coinmarket',
  aliases: ['cm', 'coinmarketi'],
  description: 'XP ile coin al, coinle özel ürünler satın al',
  usage: '.coinmarket  —  .coinmarket coin <adet>  —  .coinmarket al <numara>',
  details: [
    `1 coin ${binlik(COIN_FIYATI)} XP'dir. \`.coinmarket coin 2\` cüzdandaki XP ile 2 coin alır.`,
    'Ödenen XP yanar, coin XP\'ye geri çevrilmez. Açık kredin varken coin alamazsın.',
    '`.coinmarket al 1` ürünü coinle alır. Unvan `.market` unvanının yerine geçer.',
    'Toplu soygun hakkı `.soygun herkes` ile kullanılır. Coin her grupta ayrıdır.',
  ],
  category: 'oyun',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const islem = trLower(args[0] || '')

      if (islem === 'coin') {
        const adet = Number(args[1])
        if (!Number.isSafeInteger(adet) || adet < 1) return await yaz('🪙 Kaç coin? `.coinmarket coin 2`')

        const s = coinAl({ chatJid: from, userJid: sender, adet })
        if (!s) return await yaz('🪙 Coin market şu an kapalı, sonra dene.')
        if (s.kredili) return await yaz('🪙 Açık kredin varken coin alamazsın. Önce `.kredi öde`.')
        if (s.yetersiz) return await yaz(`🪙 ${binlik(adet * COIN_FIYATI)} XP gerekiyor. Senin XP'n: ${binlik(s.xp)}`)
        return await yaz(`🪙 *${binlik(adet)} coin* aldın.\n💰 Coin: ${binlik(s.bakiye)}  •  XP'n: ${binlik(s.xp)}`)
      }

      if (['al', 'satınal', 'satinal', 'buy'].includes(islem)) {
        const urun = COIN_URUNLERI[Number(args[1]) - 1]
        if (!urun) return await yaz(`🪙 Ürün numarası yaz: \`.coinmarket al 1\` (1-${COIN_URUNLERI.length})`)

        const s = coinMarketAl({ chatJid: from, userJid: sender, urun })
        if (!s) return await yaz('🪙 Coin market şu an kapalı, sonra dene.')
        if (s.zatenVar) return await yaz('🪙 Bu unvan zaten sende.')
        if (s.yetersiz) return await yaz(`🪙 ${urun.fiyat} coin gerekiyor. Senin coinin: ${binlik(s.bakiye)}`)
        return await yaz(`🪙 *${urun.ad}* satın alındı.\n💰 Kalan coin: ${binlik(s.bakiye)}`)
      }

      const { bakiye, topluHak } = coinDurumu(from, sender)
      await yaz([
        '🪙 *Coin Market*',
        `1 coin = ${binlik(COIN_FIYATI)} XP`,
        '',
        ...COIN_URUNLERI.map((u, i) => `${i + 1}. ${u.ad} — ${u.fiyat} coin`),
        '',
        `💰 Coin: ${binlik(bakiye)}  •  XP'n: ${binlik(getStats(from, sender).xp)}`,
        ...(topluHak ? [`💣 Toplu soygun hakkın: ${topluHak}`] : []),
        '',
        'Coin almak için `.coinmarket coin <adet>`',
        'Ürün almak için `.coinmarket al <numara>`',
      ].join('\n'))
    } catch (err) {
      logger.error({ err, from }, '.coinmarket başarısız')
      await yaz('🪙 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.coinmarket hata mesajı gönderilemedi'),
      )
    }
  },
}
