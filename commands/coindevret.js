import { requireGroupMetadata, uyeKimligiBul } from '../lib/group.js'
import { botHesabiMi, coinDevret } from '../lib/stats.js'
import { mentionOf, resolveTargets } from '../lib/target.js'
import logger from '../lib/logger.js'

const KULLANIM = 'Kullanım: `.coindevret @kişi <adet>`\nÖrnek: `.coindevret @ali 5`'

export default {
  name: 'coindevret',
  aliases: ['coingönder', 'coingonder', 'cointransfer'],
  description: 'Kendi coininden başkasına gönderir',
  usage: '.coindevret @kişi <adet>  —  bir mesajı yanıtlayarak .coindevret <adet>',
  details: [
    'Örnek: `.coindevret @ali 5` — senden 5 coin düşer, Ali\'ye 5 coin geçer.',
    'Kredi borcun ya da eksi cüzdanın varken coin gönderilemez. Bota coin gönderilmez.',
  ],
  category: 'ekonomi',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, args, from, sender, parsed }) {
    const yaz = (metin, mentions = []) => sock.sendMessage(from, { text: metin, mentions }, { quoted: msg })

    try {
      const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
      if (!metadata) return

      const adet = Number(args.find((a) => /^\d+$/.test(a)))
      // `args` verilmez: adet 8+ haneliyse elle yazılmış numara sanılırdı.
      const [hedefHam] = resolveTargets(parsed)
      if (!hedefHam || !Number.isSafeInteger(adet) || adet <= 0) return await yaz(KULLANIM)

      const hedef = uyeKimligiBul(metadata, hedefHam)
      if (!hedef) return await yaz('❌ Bu kişi grupta bulunamadı.')
      if (hedef === sender) return await yaz('❌ Kendine coin gönderemezsin.')
      if (botHesabiMi(hedef)) return await yaz('🤖 Bota coin gönderilemez.')

      const s = coinDevret({ chatJid: from, kaynak: sender, hedef, adet })
      if (!s) return await yaz('❌ Coin şu an gönderilemiyor.')
      if (s.borclu) return await yaz('💳 Kredi borcun ya da eksi cüzdanın varken coin gönderilemez.')
      if (s.yetersiz) return await yaz(`❌ O kadar coinin yok. Coinin: ${s.bakiye}`)

      await yaz(
        [
          `🪙 ${mentionOf(sender)} → ${mentionOf(hedef)}: *${adet} coin*`,
          `${mentionOf(sender)}: ${s.kaynakBakiye} coin`,
          `${mentionOf(hedef)}: ${s.hedefBakiye} coin`,
        ].join('\n'),
        [sender, hedef],
      )
    } catch (err) {
      logger.error({ err, from }, '.coindevret başarısız')
      await yaz('❌ Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.coindevret hata mesajı gönderilemedi'),
      )
    }
  },
}
