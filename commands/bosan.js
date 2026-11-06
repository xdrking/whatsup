import { requireGroup } from '../lib/group.js'
import { NAFAKA_YUZDESI } from '../lib/evlilik.js'
import { binlik } from '../lib/sayi.js'
import { bosan } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'
import { trLower } from '../lib/turkishWords.js'
import logger from '../lib/logger.js'

export default {
  name: 'boşan',
  aliases: ['bosan', 'boşanma', 'bosanma'],
  description: 'Evliliği bitirir, nafakayı isteyen öder',
  usage: '.boşan  —  .boşan onay',
  details: [
    `Cüzdan ve bankanın toplamının %${NAFAKA_YUZDESI}'si eşine geçer, önce cüzdandan alınır.`,
    '`.boşan` tutarı gösterir, `.boşan onay` uygular. Açık kredi ya da eksi cüzdanla boşanılamaz.',
  ],
  category: 'oyun',
  ownerOnly: false,

  async execute({ sock, msg, args, from, sender, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const s = bosan({ chatJid: from, userJid: sender, onay: trLower(args[0] || '') === 'onay' })
      if (!s) return await yaz('⚖️ Mahkeme şu an kapalı, sonra dene.')
      if (s.bekar) return await yaz('💍 Zaten bekârsın.')
      if (s.borclu) return await yaz('⚖️ Borçluyken boşanamazsın, önce borcunu kapat.')
      if (s.onayGerek) {
        return await yaz(
          `⚖️ ${mentionOf(s.es)} kişisine *${binlik(s.nafaka)} XP* nafaka ödersin.\nEminsen: \`.boşan onay\``,
          [s.es],
        )
      }

      await yaz(
        [
          '💔 *BOŞANDINIZ*',
          `💸 ${mentionOf(s.es)} kişisine ${binlik(s.nafaka)} XP nafaka ödendi.`,
          `💰 Cüzdanın: ${binlik(s.xp)} XP`,
        ].join('\n'),
        [s.es],
      )
    } catch (err) {
      logger.error({ err, from }, '.boşan başarısız')
      await yaz('⚖️ Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.boşan hata mesajı gönderilemedi'),
      )
    }
  },
}
