import { COIN_URUNLERI, HACIZ_BANKA_YUZDESI, HACIZ_CUZDAN_YUZDESI } from '../lib/coin.js'
import { digerUyeler, requireGroupMetadata } from '../lib/group.js'
import { binlik } from '../lib/sayi.js'
import { botHesabiMi, topluHaciz } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'
import logger from '../lib/logger.js'

const urun = COIN_URUNLERI.find((u) => u.topluHaciz)

export default {
  name: 'hacizall',
  aliases: [],
  description: `${urun.fiyat} coin karşılığı herkesin parasına haciz koyar`,
  usage: '.hacizall',
  details: [
    `Herkesin bankasının %${HACIZ_BANKA_YUZDESI}'i ve cüzdanının %${HACIZ_CUZDAN_YUZDESI}'si senin cüzdanına geçer, ${urun.fiyat} coin düşer.`,
    'Soygun kalkanı korumaz, haciz sigortası korur. Botun kasasına dokunmaz. Alınacak para yoksa coin düşmez.',
  ],
  category: 'oyun',
  cooldown: 30,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
      if (!metadata) return

      const kurbanlar = digerUyeler(metadata, sender).filter((jid) => !botHesabiMi(jid))
      const s = topluHaciz({ chatJid: from, userJid: sender, kurbanlar, urun })
      if (!s) return await yaz('⚖️ İcra dairesi kapalı, sonra dene.')
      if (s.yetersiz) return await yaz(`⚖️ ${urun.fiyat} coin gerekiyor. Senin coinin: ${binlik(s.bakiye)}`)
      if (s.hedefYok) return await yaz('⚖️ Haczedilecek para yok. Coinin harcanmadı.')

      await yaz(
        [
          `⚖️ *TOPLU HACİZ*  •  ${mentionOf(sender)}`,
          '',
          ...s.kurbanlar.map((k) => `💸 ${mentionOf(k.jid)} — ${binlik(k.miktar)} XP`),
          ...s.sigortalilar.map((jid) => `☂️ ${mentionOf(jid)} sigortalı`),
          '',
          `💰 Toplam *${binlik(s.toplam)} XP*  •  XP'n: ${binlik(s.xp)}`,
          `🪙 Kalan coin: ${binlik(s.bakiye)}`,
        ].join('\n'),
        [sender, ...s.kurbanlar.map((k) => k.jid), ...s.sigortalilar],
      )
    } catch (err) {
      logger.error({ err, from }, '.hacizall başarısız')
      await yaz('⚖️ Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.hacizall hata mesajı gönderilemedi'),
      )
    }
  },
}
