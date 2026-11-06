import { requireGroupMetadata, uyeKimligiBul } from '../lib/group.js'
import { binlik } from '../lib/sayi.js'
import { kefaletOde } from '../lib/stats.js'
import { mentionOf, resolveTargets } from '../lib/target.js'
import logger from '../lib/logger.js'

export default {
  name: 'kefalet',
  aliases: ['bail'],
  description: 'Kendini ya da bir arkadaşını hapisten çıkarır',
  usage: '.kefalet  —  .kefalet @kişi',
  details: [
    'Tutar yakalanma anındaki cüzdanın %20\'sidir, en az 100 XP. Ödenen XP yanar.',
    'Eşin kefaletini yarı fiyata ödersin.',
  ],
  category: 'oyun',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
      if (!metadata) return

      const [hedef] = resolveTargets(parsed, { includeSender: true })
      const mahkum = hedef === sender ? sender : uyeKimligiBul(metadata, hedef)
      if (!mahkum) return await yaz('❌ Bu kişi grupta bulunamadı.')

      const s = kefaletOde({ chatJid: from, odeyen: sender, mahkum })
      if (!s) return await yaz('🚔 Adliye şu an kapalı, sonra dene.')
      if (s.yok) return await yaz(`🚔 ${mentionOf(mahkum)} hapiste değil.`, [mahkum])
      if (s.yetersiz) return await yaz(`🚔 Kefalet ${binlik(s.ucret)} XP, cüzdanında ${binlik(s.xp)} XP var.`)

      await yaz(
        [
          `🔓 ${mentionOf(mahkum)} serbest!`,
          `💸 Kefalet: ${binlik(s.ucret)} XP${s.es ? ' (eş indirimi)' : ''}  •  💰 ${binlik(s.xp)} XP`,
        ].join('\n'),
        [mahkum],
      )
    } catch (err) {
      logger.error({ err, from }, '.kefalet başarısız')
      await yaz('🚔 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.kefalet hata mesajı gönderilemedi'),
      )
    }
  },
}
