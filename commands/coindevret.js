import { ambargoMesaji } from '../lib/devlet.js'
import { requireGroupMetadata, uyeKimligiBul } from '../lib/group.js'
import { botHesabiMi, coinDevret } from '../lib/stats.js'
import { mentionOf, resolveTargets } from '../lib/target.js'
import logger from '../lib/logger.js'
import { etiketSirasi } from './devret.js'

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

  async execute({ sock, msg, args, text, from, sender, parsed, isOwner }) {
    const yaz = (metin, mentions = []) => sock.sendMessage(from, { text: metin, mentions }, { quoted: msg })

    try {
      const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
      if (!metadata) return

      const adet = Number(args.find((a) => /^\d+$/.test(a)))
      // `args` verilmez: adet 8+ haneliyse elle yazılmış numara sanılırdı.
      const etiketler = etiketSirasi(text, resolveTargets({ ...parsed, quoted: null }, { limit: 3 }))
      if (etiketler.length >= 2 && !isOwner) return await yaz('❌ Yalnızca kendi coinini gönderebilirsin.')

      const [hedefHam] = etiketler.length ? etiketler.slice(-1) : resolveTargets(parsed)
      if (etiketler.length > 2 || !hedefHam || !Number.isSafeInteger(adet) || adet <= 0) return await yaz(KULLANIM)

      // Sahip `.coindevret @a @b <adet>` ile a'nın coinini b'ye taşır (`.devret` gibi), bot da a olabilir.
      const hedef = uyeKimligiBul(metadata, hedefHam)
      const kaynak = etiketler.length === 2 ? uyeKimligiBul(metadata, etiketler[0]) : sender
      if (!hedef || !kaynak) return await yaz('❌ Bu kişi grupta bulunamadı.')
      if (hedef === kaynak) return await yaz('❌ Aynı kişiye coin gönderilemez.')
      // Sonuç mesajı iki bakiyeyi de yazar, botunki gizlidir; sahip görebilir.
      if (botHesabiMi(hedef) && !isOwner) return await yaz('🤖 Bota coin gönderilemez.')

      const s = coinDevret({ chatJid: from, kaynak, hedef, adet, sahipDevri: isOwner && kaynak !== sender })
      if (!s) return await yaz('❌ Coin şu an gönderilemiyor.')
      if (s.ambargo) return await yaz(ambargoMesaji(s.ambargo))
      if (s.borclu) return await yaz('💳 Kredi borcun ya da eksi cüzdanın varken coin gönderilemez.')
      if (s.yetersiz) {
        return await yaz(
          kaynak === sender ? `❌ O kadar coinin yok. Coinin: ${s.bakiye}` : `❌ ${mentionOf(kaynak)} kişisinde o kadar coin yok. Coini: ${s.bakiye}`,
          [kaynak],
        )
      }

      await yaz(
        [
          `🪙 ${mentionOf(kaynak)} → ${mentionOf(hedef)}: *${adet} coin*`,
          `${mentionOf(kaynak)}: ${s.kaynakBakiye} coin`,
          `${mentionOf(hedef)}: ${s.hedefBakiye} coin`,
        ].join('\n'),
        [kaynak, hedef],
      )
    } catch (err) {
      logger.error({ err, from }, '.coindevret başarısız')
      await yaz('❌ Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.coindevret hata mesajı gönderilemedi'),
      )
    }
  },
}
