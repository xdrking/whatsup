import { sureYaz } from './cark.js'
import { BOZDURMA_YUZDESI, bozdurmaDegeri, COIN_TABAN, COIN_URUNLERI } from '../lib/coin.js'
import { requireGroup } from '../lib/group.js'
import { binlik } from '../lib/sayi.js'
import { coinAl, coinDurumu, coinMarketAl, coinSat, ekonomiDurumu, getStats, sigortaBitisi } from '../lib/stats.js'
import { trLower } from '../lib/turkishWords.js'
import logger from '../lib/logger.js'

export default {
  name: 'coinmarket',
  aliases: ['cm', 'coinmarketi'],
  description: 'XP ile coin al, coinle özel ürünler satın al',
  usage: '.coinmarket  —  .coinmarket coin <adet>  —  .coinmarket sat <adet>  —  .coinmarket al <numara>',
  details: [
    `Kur her gün piyasadaki paraya göre yenilenir, en az ${binlik(COIN_TABAN)} XP. \`.coinmarket coin 2\` cüzdandaki XP ile 2 coin alır.`,
    `\`.coinmarket sat 2\` coini kurun %${BOZDURMA_YUZDESI}'ine bozdurur. Ödenen XP yanar. Açık kredin varken coin alamazsın.`,
    '`.coinmarket al 1` ürünü coinle alır. Unvan `.market` unvanının yerine geçer.',
    'Toplu soygun hakkı `.soygun herkes` ile kullanılır. Coin her grupta ayrıdır.',
    'Toplu haciz `.hacizall` ile kullanılır, coin o an düşer.',
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
        if (s.yetersiz) return await yaz(`🪙 ${binlik(s.ucret)} XP gerekiyor. Senin XP'n: ${binlik(s.xp)}`)
        return await yaz(`🪙 *${binlik(adet)} coin* aldın, ${binlik(s.ucret)} XP ödedin.\n💰 Coin: ${binlik(s.bakiye)}  •  XP'n: ${binlik(s.xp)}`)
      }

      if (['sat', 'boz', 'bozdur'].includes(islem)) {
        const adet = Number(args[1])
        if (!Number.isSafeInteger(adet) || adet < 1) return await yaz('🪙 Kaç coin? `.coinmarket sat 2`')

        const s = coinSat({ chatJid: from, userJid: sender, adet })
        if (!s) return await yaz('🪙 Coin market şu an kapalı, sonra dene.')
        if (s.yetersiz) return await yaz(`🪙 O kadar coinin yok: ${binlik(s.bakiye)}`)
        return await yaz(`🪙 *${binlik(adet)} coin* bozdurdun: +${binlik(s.kazanc)} XP\n💰 Coin: ${binlik(s.bakiye)}  •  XP'n: ${binlik(s.xp)}`)
      }

      if (['al', 'satınal', 'satinal', 'buy'].includes(islem)) {
        const urun = COIN_URUNLERI[Number(args[1]) - 1]
        if (!urun) return await yaz(`🪙 Ürün numarası yaz: \`.coinmarket al 1\` (1-${COIN_URUNLERI.length})`)

        if (urun.topluHaciz) return await yaz(`⚖️ Bu ürün satın alınmaz, \`.hacizall\` yazınca ${urun.fiyat} coin düşer ve hemen işler.`)

        const s = coinMarketAl({ chatJid: from, userJid: sender, urun })
        if (!s) return await yaz('🪙 Coin market şu an kapalı, sonra dene.')
        if (s.zatenVar) return await yaz('🪙 Bu unvan zaten sende.')
        if (s.yetersiz) return await yaz(`🪙 ${urun.fiyat} coin gerekiyor. Senin coinin: ${binlik(s.bakiye)}`)
        return await yaz(`🪙 *${urun.ad}* satın alındı.\n💰 Kalan coin: ${binlik(s.bakiye)}`)
      }

      const { bakiye, topluHak } = coinDurumu(from, sender)
      const ekonomi = ekonomiDurumu({ chatJid: from })
      if (!ekonomi) return await yaz('🪙 Coin market şu an kapalı, sonra dene.')
      const sigorta = sigortaBitisi(from, sender)
      await yaz([
        '🪙 *Coin Market*',
        `Bugünkü kur: 1 coin = ${binlik(ekonomi.kur)} XP  •  Bozdurma: ${binlik(bozdurmaDegeri(1, ekonomi.kur))} XP`,
        '',
        ...COIN_URUNLERI.map((u, i) => `${i + 1}. ${u.ad} — ${u.fiyat} coin`),
        '',
        `💰 Coin: ${binlik(bakiye)}  •  XP'n: ${binlik(getStats(from, sender).xp)}`,
        ...(topluHak ? [`💣 Toplu soygun hakkın: ${topluHak}`] : []),
        ...(sigorta ? [`☂️ Haciz sigortası: ${sureYaz(sigorta - Date.now())} kaldı`] : []),
        '',
        'Coin almak için `.coinmarket coin <adet>`',
        'Bozdurmak için `.coinmarket sat <adet>`',
        'Ürün almak için `.coinmarket al <numara>`',
        'Mülkler için `.mülk`',
      ].join('\n'))
    } catch (err) {
      logger.error({ err, from }, '.coinmarket başarısız')
      await yaz('🪙 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.coinmarket hata mesajı gönderilemedi'),
      )
    }
  },
}
