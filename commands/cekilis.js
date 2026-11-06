import { binlik } from '../lib/sayi.js'
import { requireGroup, senderIsAdmin } from '../lib/group.js'
import { piyangoCek } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'
import logger from '../lib/logger.js'
import { agirlikliSec } from './piyango.js'

export default {
  name: 'çekiliş',
  aliases: ['cekilis', 'draw'],
  description: 'Piyango çekilişini yapar (grup admini veya bot sahibi)',
  usage: '.çekiliş',
  category: 'oyun',
  ownerOnly: false,

  async execute({ sock, msg, from, sender, parsed, isOwner }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      // Herkes çekebilseydi havuzun çoğunu yatıran kişi tam o anda çekerdi.
      if (!isOwner && !(await senderIsAdmin(sock, from, sender))) {
        return await yaz('🎫 Çekilişi yalnızca grup admini ya da bot sahibi yapabilir.')
      }

      const s = piyangoCek({ chatJid: from, sec: agirlikliSec })
      if (!s) return await yaz('🎫 Piyango şu an kapalı, sonra dene.')
      if (s.yetersiz) return await yaz('🎫 Çekiliş için en az 2 kişi bilet almalı.')

      await yaz(
        ['🎉 *ÇEKİLİŞ*', '', `🏆 ${mentionOf(s.kazanan)} kazandı: *+${binlik(s.havuz)} XP*`, `👥 ${s.kisi} kişi katıldı.`].join('\n'),
        [s.kazanan],
      )
    } catch (err) {
      logger.error({ err, from }, '.çekiliş başarısız')
      await yaz('🎫 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.çekiliş hata mesajı gönderilemedi'),
      )
    }
  },
}
